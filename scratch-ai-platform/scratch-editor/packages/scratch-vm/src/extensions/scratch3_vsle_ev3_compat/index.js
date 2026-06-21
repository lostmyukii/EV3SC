const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');

const globalObject = typeof globalThis === 'undefined' ? {} : globalThis;
const LEGO_RED = '#E6001F';
const DEFAULT_LINK_URL = 'ws://127.0.0.1:20111/scratch/bt';
const DEFAULT_PERIPHERAL_ID = 'vsle-ev3-wifi';
const DEFAULT_PERIPHERAL_NAME = 'VSLE EV3 WiFi';
const COMMAND_TIMEOUT_MS = 5000;
const MOTOR_PORTS = ['A', 'B', 'C', 'D'];
const SENSOR_PORTS = ['S1', 'S2', 'S3', 'S4'];
const DEFAULT_MOTOR_POWER = 50;
const DEFAULT_VOLUME = 100;
const SENSOR_STREAMING_STATUS = 'sensor_streaming';
const SENSOR_STALE_STATUS = 'sensor_stale';

const deepMerge = (target, source) => {
    for (const [key, value] of Object.entries(source)) {
        if (value &&
            typeof value === 'object' &&
            !Array.isArray(value)) {
            target[key] = deepMerge(target[key] || {}, value);
        } else {
            target[key] = value;
        }
    }
    return target;
};

const decodeBase64 = value => {
    if (typeof globalObject.atob === 'function') {
        return globalObject.atob(value);
    }
    if (globalObject.Buffer) {
        return globalObject.Buffer.from(value, 'base64').toString('utf8');
    }
    return value;
};

const clamp = (value, min, max) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return min;
    }
    return Math.min(max, Math.max(min, number));
};

const roundTwoPlaces = value => Math.round(value * 100) / 100;

const normalizeDiscoveredPeripheral = peripheral => {
    const source = peripheral && typeof peripheral === 'object' ? peripheral : {};
    const peripheralId = source.peripheralId ||
        source.peripheral_id ||
        source.id ||
        source.deviceId ||
        DEFAULT_PERIPHERAL_ID;
    const name = source.name ||
        source.peripheralName ||
        source.peripheral_name ||
        source.deviceName ||
        DEFAULT_PERIPHERAL_NAME;
    const rssi = Number.isFinite(Number(source.rssi)) ? Number(source.rssi) : 0;
    return Object.assign({}, source, {
        peripheralId,
        name,
        rssi
    });
};

class SensorCache {
    constructor () {
        this.data = {
            sensors: {},
            motors: {},
            system: {},
            timestamp: 0
        };
    }

    update (payload) {
        if (payload && typeof payload === 'object') {
            deepMerge(this.data, payload);
        }
    }

    get (cachePath) {
        if (!cachePath) {
            return this.data;
        }
        return cachePath.split('.').reduce((current, key) => (
            current === null || typeof current === 'undefined' ? void 0 : current[key]
        ), this.data);
    }
}

class WeisileLinkClient {
    constructor (options = {}) {
        this.url = options.url || DEFAULT_LINK_URL;
        this.WebSocket = options.WebSocket || globalObject.WebSocket;
        this.sensorCache = options.sensorCache || new SensorCache();
        this.timeoutMs = options.timeoutMs || COMMAND_TIMEOUT_MS;
        this._clock = options.clock || (() => Date.now());
        this._onSensorUpdate = options.onSensorUpdate || null;
        this._ws = null;
        this._nextId = 1;
        this._pending = new Map();
        this._discoveryPending = null;
        this.lastSensorUpdateMs = 0;
        this.lastDiscoveredPeripheral = null;
    }

    async connect () {
        if (this._ws && this._ws.readyState === this.WebSocket.OPEN) {
            return;
        }
        if (!this.WebSocket) {
            throw new Error('WebSocket is unavailable');
        }
        await new Promise((resolve, reject) => {
            const ws = new this.WebSocket(this.url);
            const cleanup = () => {
                ws.onopen = null;
                ws.onerror = null;
            };
            ws.onopen = () => {
                cleanup();
                this._ws = ws;
                this._installHandlers(ws);
                resolve();
            };
            ws.onerror = event => {
                cleanup();
                reject(event);
            };
        });
    }

    async sendCommand (command) {
        await this.connect();
        const id = command.id || `vsle-${this._nextId++}`;
        const request = {
            jsonrpc: '2.0',
            id,
            method: command.method,
            params: command.params || {}
        };

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error('WeisileLink command timeout'));
            }, this.timeoutMs);
            this._pending.set(id, {resolve, reject, timer});
            this._ws.send(JSON.stringify(request));
        });
    }

    async probeDiscovery () {
        const version = await this.sendCommand({method: 'getVersion'});
        if (!version || version.implementation !== 'WeisileLink') {
            throw new Error('端口被其他程序占用，或不是当前 VSLE WeisileLink runtime。');
        }

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._discoveryPending = null;
                reject(new Error('没有发现 EV3 主机。'));
            }, this.timeoutMs);
            this._discoveryPending = {resolve, reject, timer};
            this.sendCommand({method: 'discover'})
                .then(result => this._resolveDiscoveryResult(result))
                .catch(error => {
                    if (this._discoveryPending) {
                        clearTimeout(this._discoveryPending.timer);
                        this._discoveryPending = null;
                    }
                    reject(error);
                });
        });
    }

    _resolveDiscoveryResult (result) {
        const peripheral = this._peripheralFromDiscoveryResult(result);
        if (!peripheral || !this._discoveryPending) {
            return;
        }
        clearTimeout(this._discoveryPending.timer);
        this._discoveryPending.resolve(peripheral);
        this._discoveryPending = null;
    }

    _peripheralFromDiscoveryResult (result) {
        if (!result || typeof result !== 'object') {
            return null;
        }
        if (Array.isArray(result)) {
            return result[0] || null;
        }
        if (Array.isArray(result.peripherals)) {
            return result.peripherals[0] || null;
        }
        if (Array.isArray(result.devices)) {
            return result.devices[0] || null;
        }
        if (result.peripheral && typeof result.peripheral === 'object') {
            return result.peripheral;
        }
        if (result.name ||
            result.peripheralName ||
            result.peripheralId ||
            result.id ||
            result.deviceId) {
            return result;
        }
        return null;
    }

    close () {
        if (this._ws && this._ws.readyState === this.WebSocket.OPEN) {
            this._ws.close();
        }
        this._ws = null;
    }

    _installHandlers (ws) {
        ws.onmessage = event => this._handleMessage(event.data);
        ws.onclose = () => {
            for (const [id, pending] of this._pending) {
                clearTimeout(pending.timer);
                pending.reject(new Error('WeisileLink disconnected'));
                this._pending.delete(id);
            }
        };
    }

    _handleMessage (raw) {
        const message = JSON.parse(raw);
        if (message.method === 'notifyDeviceDidReceiveMessage' ||
            message.method === 'didReceiveMessage') {
            this._handleSensorNotification(message.params || {});
            return;
        }
        if (message.method === 'didDiscoverPeripheral') {
            this._handleDiscoveryNotification(message.params || {});
            return;
        }

        const pending = this._pending.get(message.id);
        if (!pending) {
            return;
        }
        clearTimeout(pending.timer);
        this._pending.delete(message.id);
        if (message.error) {
            pending.reject(message.error);
        } else {
            pending.resolve(message.result);
        }
    }

    _handleSensorNotification (params) {
        if (!params.message) {
            return;
        }
        const decoded = params.encoding === 'base64' ?
            decodeBase64(params.message) :
            params.message;
        this.sensorCache.update(JSON.parse(decoded));
        this.lastSensorUpdateMs = this._clock();
        if (this._onSensorUpdate) {
            this._onSensorUpdate(this.lastSensorUpdateMs);
        }
    }

    _handleDiscoveryNotification (params) {
        this.lastDiscoveredPeripheral = params;
        if (!this._discoveryPending) {
            return;
        }
        clearTimeout(this._discoveryPending.timer);
        this._discoveryPending.resolve(params);
        this._discoveryPending = null;
    }
}

/**
 * Compatibility wrapper for legacy Scratch official EV3 projects.
 *
 * The official block names, menu values, timing clamps, and MIDI-to-frequency
 * formula are adapted from the EV3SC-owned Scratch VM official EV3 source:
 * `src/extensions/scratch3_ev3/index.js`. Commands and sensor notifications use
 * the same VSLE-EV3 JSON-RPC methods and cache keys as `vsle-ev3-extension`.
 */
class Scratch3VSLEEV3Compat {
    constructor (runtime, extensionId = 'ev3', options = {}) {
        if (typeof extensionId === 'object') {
            options = extensionId;
            extensionId = 'ev3';
        }

        this.runtime = runtime || {};
        this._extensionId = extensionId || 'ev3';
        const Scratch = options.Scratch || {};
        this.ArgumentType = Scratch.ArgumentType || ArgumentType;
        this.BlockType = Scratch.BlockType || BlockType;
        this.Cast = Scratch.Cast || Cast;
        this.sensorCache = options.sensorCache || new SensorCache();
        this._clock = options.clock || (() => Date.now());
        this._lastSensorUpdateMs = 0;
        this.link = options.link || new WeisileLinkClient({
            sensorCache: this.sensorCache,
            WebSocket: options.WebSocket,
            url: options.linkURL,
            timeoutMs: options.timeoutMs,
            clock: this._clock,
            onSensorUpdate: timestamp => {
                this._lastSensorUpdateMs = timestamp;
            }
        });
        this._sleep = options.sleep || (ms => new Promise(resolve => {
            setTimeout(resolve, ms);
        }));
        this._legacyMotorPower = MOTOR_PORTS.reduce((powers, port) => {
            powers[port] = DEFAULT_MOTOR_POWER;
            return powers;
        }, {});
        this._connected = false;
        this._discoveredPeripheral = null;
        this._diagnostic = {
            status: 'not_connected',
            message: 'Link 未连接。',
            hint: '这是内部 WebSocket 地址，不能直接在浏览器地址栏打开；请在同一台 Windows 电脑打开 ScratchAI 页面。'
        };

        if (this.runtime.registerPeripheralExtension) {
            this.runtime.registerPeripheralExtension(this._extensionId, this);
        }
    }

    getInfo () {
        return {
            id: this._extensionId,
            name: 'EV3',
            color1: LEGO_RED,
            color2: '#CC001B',
            color3: '#990014',
            showStatusButton: true,
            blocks: [
                {
                    opcode: 'motorTurnClockwise',
                    text: 'motor [PORT] turn this way for [TIME] seconds',
                    blockType: this.BlockType.COMMAND,
                    arguments: this._legacyMotorTimeArgs()
                },
                {
                    opcode: 'motorTurnCounterClockwise',
                    text: 'motor [PORT] turn that way for [TIME] seconds',
                    blockType: this.BlockType.COMMAND,
                    arguments: this._legacyMotorTimeArgs()
                },
                {
                    opcode: 'motorSetPower',
                    text: 'motor [PORT] set power [POWER] %',
                    blockType: this.BlockType.COMMAND,
                    arguments: {
                        PORT: {
                            type: this.ArgumentType.STRING,
                            menu: 'motorPorts',
                            defaultValue: 0
                        },
                        POWER: {
                            type: this.ArgumentType.NUMBER,
                            defaultValue: 100
                        }
                    }
                },
                {
                    opcode: 'getMotorPosition',
                    text: 'motor [PORT] position',
                    blockType: this.BlockType.REPORTER,
                    arguments: {
                        PORT: {
                            type: this.ArgumentType.STRING,
                            menu: 'motorPorts',
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'whenButtonPressed',
                    text: 'when button [PORT] pressed',
                    blockType: this.BlockType.HAT,
                    arguments: this._legacySensorArgs()
                },
                {
                    opcode: 'whenDistanceLessThan',
                    text: 'when distance < [DISTANCE]',
                    blockType: this.BlockType.HAT,
                    arguments: this._legacyDistanceArgs(5)
                },
                {
                    opcode: 'whenBrightnessLessThan',
                    text: 'when brightness < [DISTANCE]',
                    blockType: this.BlockType.HAT,
                    arguments: this._legacyDistanceArgs(50)
                },
                {
                    opcode: 'buttonPressed',
                    text: 'button [PORT] pressed?',
                    blockType: this.BlockType.BOOLEAN,
                    arguments: this._legacySensorArgs()
                },
                {
                    opcode: 'getDistance',
                    text: 'distance',
                    blockType: this.BlockType.REPORTER
                },
                {
                    opcode: 'getBrightness',
                    text: 'brightness',
                    blockType: this.BlockType.REPORTER
                },
                {
                    opcode: 'beep',
                    text: 'beep note [NOTE] for [TIME] secs',
                    blockType: this.BlockType.COMMAND,
                    arguments: {
                        NOTE: {
                            type: this.ArgumentType.NOTE,
                            defaultValue: 60
                        },
                        TIME: {
                            type: this.ArgumentType.NUMBER,
                            defaultValue: 0.5
                        }
                    }
                }
            ],
            menus: {
                motorPorts: {
                    acceptReporters: true,
                    items: this._legacyMenu(['A', 'B', 'C', 'D'])
                },
                sensorPorts: {
                    acceptReporters: true,
                    items: this._legacyMenu(['1', '2', '3', '4'])
                }
            }
        };
    }

    motorSetPower (args) {
        const port = this._legacyMotorPort(args.PORT);
        if (!port) {
            return;
        }
        this._legacyMotorPower[port] = clamp(
            this.Cast.toNumber(args.POWER),
            0,
            100
        );
    }

    async motorTurnClockwise (args) {
        await this._legacyTimedMotor(args, 1);
    }

    async motorTurnCounterClockwise (args) {
        await this._legacyTimedMotor(args, -1);
    }

    getMotorPosition (args) {
        const port = this._legacyMotorPort(args.PORT);
        if (!port) {
            return 0;
        }
        return this._wrapDegrees(this._cacheNumber(`motors.${port}.position`));
    }

    whenButtonPressed (args) {
        return this.buttonPressed(args);
    }

    whenDistanceLessThan (args) {
        const distance = clamp(this.Cast.toNumber(args.DISTANCE), 0, 100);
        return this.getDistance() < distance;
    }

    whenBrightnessLessThan (args) {
        const brightness = clamp(this.Cast.toNumber(args.DISTANCE), 0, 100);
        return this.getBrightness() < brightness;
    }

    buttonPressed (args) {
        const port = this._legacySensorPort(args.PORT);
        return port ? this._cacheBoolean(`sensors.${port}.pressed`) : false;
    }

    getDistance () {
        return roundTwoPlaces(clamp(
            this._firstSensorNumber('distance_cm', 0),
            0,
            100
        ));
    }

    getBrightness () {
        const ambient = this._firstSensorNumber('ambient', null);
        const value = ambient === null ?
            this._firstSensorNumber('reflected', 0) :
            ambient;
        return clamp(value, 0, 100);
    }

    async beep (args) {
        const note = clamp(this.Cast.toNumber(args.NOTE), 47, 99);
        const duration = clamp(this.Cast.toNumber(args.TIME), 0, 3);
        if (duration === 0) {
            return;
        }
        const freq = Math.pow(2, ((note - 69 + 12) / 12)) * 440;
        await this._sendSoundCommand('sound.playToneWait', {
            freq,
            duration,
            volume: DEFAULT_VOLUME
        });
    }

    scan () {
        this._recordSearchStarted();
        if (typeof this.link.probeDiscovery !== 'function') {
            return;
        }
        this.link.probeDiscovery()
            .then(peripheral => {
                const normalizedPeripheral =
                    normalizeDiscoveredPeripheral(peripheral);
                this._recordPeripheralDiscovered(normalizedPeripheral);
                this._emitPeripheralListUpdate(normalizedPeripheral);
            })
            .catch(error => {
                this._recordConnectionError(error);
                this._emitRuntimeEvent('PERIPHERAL_SCAN_TIMEOUT');
            });
    }

    connect (peripheralId) {
        this._diagnostic = {
            status: 'connecting',
            message: '正在连接 EV3 主机。',
            hint: '如果长时间停留在这里，请确认 EV3 已开机、蓝牙已配对，并且 WeisileLink 在同一台 Windows 电脑上运行。'
        };
        this.link.sendCommand({
            method: 'connect',
            params: {peripheralId: peripheralId || this._defaultPeripheralId()}
        })
            .then(() => this.link.sendCommand({method: 'startNotifications'}))
            .then(() => {
                this._recordConnected();
                this._emitRuntimeEvent('PERIPHERAL_CONNECTED');
            })
            .catch(error => {
                this._recordConnectionError(error);
                this._emitRuntimeEvent('PERIPHERAL_REQUEST_ERROR');
            });
    }

    disconnect () {
        this._connected = false;
        if (this.link && typeof this.link.close === 'function') {
            this.link.close();
        }
        this._diagnostic = {
            status: 'not_connected',
            message: 'Link 未连接。',
            hint: '这是内部 WebSocket 地址，不能直接在浏览器地址栏打开；请在同一台 Windows 电脑打开 ScratchAI 页面。'
        };
        this._emitRuntimeEvent('PERIPHERAL_DISCONNECTED');
    }

    isConnected () {
        return this._connected;
    }

    getConnectionDiagnostic () {
        if (this._connected) {
            return this._connectedDiagnostic();
        }
        const diagnostic = Object.assign({}, this._diagnostic);
        return Object.assign(diagnostic, {
            linkUrl: DEFAULT_LINK_URL,
            peripheralName: this._discoveredPeripheral ?
                this._discoveredPeripheral.name :
                '',
            freshnessSeconds: null
        });
    }

    async _legacyTimedMotor (args, direction) {
        const port = this._legacyMotorPort(args.PORT);
        const time = clamp(this.Cast.toNumber(args.TIME), 0, 15);
        if (!port) {
            return;
        }

        try {
            await this._sendMotorCommand('motor.runTimed', {
                port,
                speed: this._legacyMotorPower[port] * direction,
                time
            });
        } catch {
            // Official Scratch EV3 blocks resolve harmlessly when disconnected.
        }

        if (time > 0) {
            await this._sleep(time * 1000);
        }
    }

    _sendMotorCommand (method, params) {
        if (!params ||
            Object.keys(params).some(key => params[key] === null ||
                typeof params[key] === 'undefined')) {
            return;
        }
        return this.link.sendCommand({method, params});
    }

    _sendSoundCommand (method, params) {
        return this._sendMotorCommand(method, params);
    }

    _recordSearchStarted () {
        this._connected = false;
        this._diagnostic = {
            status: 'searching',
            message: '正在连接本机 Link，并搜索 EV3 主机。',
            hint: 'Link 地址是 ws://127.0.0.1:20111/scratch/bt。它是内部 WebSocket 地址，不能直接在浏览器地址栏打开。'
        };
    }

    _recordPeripheralDiscovered (peripheral) {
        this._discoveredPeripheral = normalizeDiscoveredPeripheral(peripheral);
        this._diagnostic = {
            status: 'discovered',
            message: '已发现 EV3 主机，请点击连接。',
            hint: '如果点击连接后失败，请确认 EV3 服务和蓝牙配对状态。',
            peripheralName: this._discoveredPeripheral.name || ''
        };
    }

    _recordConnected () {
        this._connected = true;
        this._diagnostic = {
            status: 'connected',
            message: 'EV3 已连接，等待传感器实时数据。',
            hint: '运行 EV3 积木或观察传感器 reporter，确认数据会更新。'
        };
    }

    _recordConnectionError (error) {
        this._connected = false;
        const reason = `${error && (error.reason || error.message || error.type || error)}`;
        if (reason.indexOf('没有发现 EV3 主机') !== -1) {
            this._recordSearchTimeout();
            return;
        }
        if (reason.indexOf('origin not allowed') !== -1 || error.code === 1008) {
            this._diagnostic = {
                status: 'origin_rejected',
                message: '网页来源未被 WeisileLink 允许。',
                hint: '请用 http://101.42.92.6:18612 打开 ScratchAI，并确认 WeisileLink 由 VSLE 向导启动。'
            };
            return;
        }
        this._diagnostic = {
            status: 'link_unavailable',
            message: 'Link 未启动 / 20111 不可达。',
            hint: '请回到 VSLE 安装向导的“启动并检查本地桥接”步骤，确认 20111 和 8766 都通过。'
        };
    }

    _recordSearchTimeout () {
        this._connected = false;
        this._diagnostic = {
            status: 'not_found',
            message: '没有发现 EV3 主机。',
            hint: '请确认选择 Bluetooth Full VSLE、EV3 已开机、Windows 已配对 EV3，且 EV3 Server 已安装通过。'
        };
    }

    _connectedDiagnostic () {
        const freshnessSeconds = this._sensorFreshnessSeconds();
        const stale = freshnessSeconds === null || freshnessSeconds > 5;
        return {
            linkUrl: DEFAULT_LINK_URL,
            status: stale ? SENSOR_STALE_STATUS : SENSOR_STREAMING_STATUS,
            message: stale ?
                '传感器数据已停止更新。' :
                `正在接收传感器实时数据，距上次传感器数据 ${freshnessSeconds} 秒。`,
            hint: stale ?
                '请确认 EV3 服务仍在运行，蓝牙连接没有断开。' :
                '连接正常，可以继续运行 EV3 积木。',
            peripheralName: this._discoveredPeripheral ?
                this._discoveredPeripheral.name :
                '',
            freshnessSeconds
        };
    }

    _sensorFreshnessSeconds () {
        const timestamp = this._safeNumber(this.sensorCache.get('timestamp'), 0) ||
            this._lastSensorUpdateMs ||
            0;
        if (timestamp <= 0) {
            return null;
        }
        return Math.max(0, roundTwoPlaces((this._clock() - timestamp) / 1000));
    }

    _defaultPeripheralId () {
        return this._discoveredPeripheral && this._discoveredPeripheral.peripheralId ?
            this._discoveredPeripheral.peripheralId :
            DEFAULT_PERIPHERAL_ID;
    }

    _emitPeripheralListUpdate (peripheral) {
        const normalizedPeripheral = normalizeDiscoveredPeripheral(peripheral);
        this._emitRuntimeEvent('PERIPHERAL_LIST_UPDATE', {
            [normalizedPeripheral.peripheralId]: normalizedPeripheral
        });
    }

    _emitPeripheralScanTimeout () {
        this._recordSearchTimeout();
        this._emitRuntimeEvent('PERIPHERAL_SCAN_TIMEOUT');
    }

    _emitRuntimeEvent (eventName, payload) {
        if (!this.runtime || !this.runtime.constructor || !this.runtime.emit) {
            return;
        }
        const event = this.runtime.constructor[eventName];
        if (!event) {
            return;
        }
        if (typeof payload === 'undefined') {
            this.runtime.emit(event);
        } else {
            this.runtime.emit(event, payload);
        }
    }

    _legacyMotorPort (value) {
        const index = Math.trunc(this.Cast.toNumber(value));
        return MOTOR_PORTS[index] || null;
    }

    _legacySensorPort (value) {
        const index = Math.trunc(this.Cast.toNumber(value));
        return SENSOR_PORTS[index] || null;
    }

    _legacyMotorTimeArgs () {
        return {
            PORT: {
                type: this.ArgumentType.STRING,
                menu: 'motorPorts',
                defaultValue: 0
            },
            TIME: {
                type: this.ArgumentType.NUMBER,
                defaultValue: 1
            }
        };
    }

    _legacySensorArgs () {
        return {
            PORT: {
                type: this.ArgumentType.STRING,
                menu: 'sensorPorts',
                defaultValue: 0
            }
        };
    }

    _legacyDistanceArgs (defaultValue) {
        return {
            DISTANCE: {
                type: this.ArgumentType.NUMBER,
                defaultValue
            }
        };
    }

    _legacyMenu (items) {
        return items.map((text, index) => ({
            text,
            value: index.toString()
        }));
    }

    _firstSensorNumber (key, defaultValue) {
        for (const port of SENSOR_PORTS) {
            const value = this.sensorCache.get(`sensors.${port}.${key}`);
            if (Number.isFinite(Number(value))) {
                return Number(value);
            }
        }
        return defaultValue;
    }

    _cacheNumber (cachePath, defaultValue = 0) {
        return this._safeNumber(this.sensorCache.get(cachePath), defaultValue);
    }

    _safeNumber (value, defaultValue = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : defaultValue;
    }

    _cacheBoolean (cachePath) {
        return this.sensorCache.get(cachePath) === true;
    }

    _wrapDegrees (value) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return 0;
        }
        return ((number % 360) + 360) % 360;
    }
}

module.exports = Scratch3VSLEEV3Compat;

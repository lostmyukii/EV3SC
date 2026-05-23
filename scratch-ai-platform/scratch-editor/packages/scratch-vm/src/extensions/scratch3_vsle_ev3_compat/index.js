const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');

const globalObject = typeof globalThis === 'undefined' ? {} : globalThis;
const LEGO_RED = '#E6001F';
const DEFAULT_LINK_URL = 'ws://127.0.0.1:20111/scratch/bt';
const COMMAND_TIMEOUT_MS = 5000;
const MOTOR_PORTS = ['A', 'B', 'C', 'D'];
const SENSOR_PORTS = ['S1', 'S2', 'S3', 'S4'];
const DEFAULT_MOTOR_POWER = 50;
const DEFAULT_VOLUME = 100;

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
        this._ws = null;
        this._nextId = 1;
        this._pending = new Map();
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
        this.link = options.link || new WeisileLinkClient({
            sensorCache: this.sensorCache,
            WebSocket: options.WebSocket,
            url: options.linkURL,
            timeoutMs: options.timeoutMs
        });
        this._sleep = options.sleep || (ms => new Promise(resolve => {
            setTimeout(resolve, ms);
        }));
        this._legacyMotorPower = MOTOR_PORTS.reduce((powers, port) => {
            powers[port] = DEFAULT_MOTOR_POWER;
            return powers;
        }, {});

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

    scan () {}

    connect () {}

    disconnect () {}

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

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        factory(root.Scratch);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Scratch) {
    'use strict';

    const globalObject = typeof globalThis !== 'undefined' ? globalThis : {};
    const LEGO_RED = '#E6001F';
    const DEFAULT_LINK_URL = 'ws://127.0.0.1:20111/scratch/bt';
    const COMMAND_TIMEOUT_MS = 5000;
    const MOTOR_PORTS = ['A', 'B', 'C', 'D'];
    const WAIT_POLL_MS = 20;
    const WAIT_TIMEOUT_MS = 60000;

    const FALLBACK_BLOCK_TYPE = {
        COMMAND: 'command',
        REPORTER: 'reporter',
        BOOLEAN: 'Boolean'
    };

    const FALLBACK_ARGUMENT_TYPE = {
        STRING: 'string',
        NUMBER: 'number'
    };

    const FALLBACK_CAST = {
        toString: value => String(value),
        toNumber: value => {
            const number = Number(value);
            return Number.isNaN(number) ? 0 : number;
        }
    };

    const MOTOR_BLOCK_OPCODES = [
        'motorRunForever',
        'motorRunTimed',
        'motorRunToAbsPos',
        'motorRunToRelPos',
        'motorStop',
        'motorStopAll',
        'motorSetSpeed',
        'motorSyncRun',
        'motorSyncTurn',
        'motorResetPosition',
        'getMotorPosition',
        'getMotorSpeed',
        'waitMotorStopped',
        'isMotorRunning'
    ];

    class SensorCache {
        constructor () {
            this._values = new Map();
        }

        update (payload) {
            this._recordNested('', payload || {});
        }

        get (path) {
            return this._values.get(path);
        }

        _recordNested (prefix, value) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                if (prefix) {
                    this._values.set(prefix, value);
                }
                return;
            }
            Object.keys(value).forEach(key => {
                const path = prefix ? `${prefix}.${key}` : key;
                this._recordNested(path, value[key]);
            });
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
            let decoded;
            if (params.encoding === 'base64') {
                decoded = decodeBase64(params.message);
            } else {
                decoded = params.message;
            }
            this.sensorCache.update(JSON.parse(decoded));
        }
    }

    class VSLEEV3Extension {
        constructor (options = {}) {
            this.Scratch = options.Scratch || Scratch || {};
            this.BlockType = this.Scratch.BlockType || FALLBACK_BLOCK_TYPE;
            this.ArgumentType = this.Scratch.ArgumentType || FALLBACK_ARGUMENT_TYPE;
            this.Cast = this.Scratch.Cast || FALLBACK_CAST;
            this.sensorCache = options.sensorCache || new SensorCache();
            this.link = options.link || new WeisileLinkClient({
                sensorCache: this.sensorCache
            });
        }

        getInfo () {
            return {
                id: 'vsleev3',
                name: 'VSLE EV3',
                color1: LEGO_RED,
                color2: '#CC001B',
                color3: '#990014',
                showStatusButton: true,
                blocks: this._motorBlocks(),
                menus: {
                    motorPorts: {
                        acceptReporters: true,
                        items: MOTOR_PORTS
                    }
                }
            };
        }

        async motorRunForever (args) {
            return this._sendMotorCommand('motor.runForever', {
                port: this._motorPort(args.PORT),
                speed: this._speed(args.SPEED)
            });
        }

        async motorRunTimed (args) {
            return this._sendMotorCommand('motor.runTimed', {
                port: this._motorPort(args.PORT),
                speed: this._speed(args.SPEED),
                time: this._duration(args.TIME)
            });
        }

        async motorRunToAbsPos (args) {
            return this._sendMotorCommand('motor.runToAbsPos', {
                port: this._motorPort(args.PORT),
                degrees: this._number(args.DEGREES),
                speed: this._speed(args.SPEED, 50)
            });
        }

        async motorRunToRelPos (args) {
            return this._sendMotorCommand('motor.runToRelPos', {
                port: this._motorPort(args.PORT),
                degrees: this._number(args.DEGREES),
                speed: this._speed(args.SPEED, 50)
            });
        }

        async motorStop (args) {
            return this._sendMotorCommand('motor.stop', {
                port: this._motorPort(args.PORT)
            });
        }

        async motorStopAll () {
            return this._sendMotorCommand('motor.stopAll', {});
        }

        async motorSetSpeed (args) {
            return this._sendMotorCommand('motor.runForever', {
                port: this._motorPort(args.PORT),
                speed: this._speed(args.SPEED)
            });
        }

        async motorSyncRun (args) {
            return this._sendMotorCommand('motor.syncRun', {
                port_l: this._motorPort(args.PORT_L),
                port_r: this._motorPort(args.PORT_R),
                speed: this._speed(args.SPEED),
                time: this._duration(args.TIME)
            });
        }

        async motorSyncTurn (args) {
            return this._sendMotorCommand('motor.syncTurn', {
                port_l: this._motorPort(args.PORT_L),
                port_r: this._motorPort(args.PORT_R),
                speed: this._speed(args.SPEED),
                turn: this._speed(args.TURN)
            });
        }

        async motorResetPosition (args) {
            return this._sendMotorCommand('motor.resetPosition', {
                port: this._motorPort(args.PORT)
            });
        }

        getMotorPosition (args) {
            const port = this._motorPort(args.PORT);
            return this.sensorCache.get(`motors.${port}.position`) || 0;
        }

        getMotorSpeed (args) {
            const port = this._motorPort(args.PORT);
            return this.sensorCache.get(`motors.${port}.speed`) || 0;
        }

        async waitMotorStopped (args) {
            const port = this._motorPort(args.PORT);
            const start = Date.now();
            while (this.sensorCache.get(`motors.${port}.running`) === true) {
                if (Date.now() - start >= WAIT_TIMEOUT_MS) {
                    return;
                }
                await sleep(WAIT_POLL_MS);
            }
        }

        isMotorRunning (args) {
            const port = this._motorPort(args.PORT);
            return this.sensorCache.get(`motors.${port}.running`) === true;
        }

        async _sendMotorCommand (method, params) {
            if (!params ||
                Object.keys(params).some(key => params[key] === null ||
                    params[key] === undefined)) {
                return;
            }
            await this.link.sendCommand({method, params});
        }

        _motorPort (value) {
            const port = this.Cast.toString(value).toUpperCase();
            if (!MOTOR_PORTS.includes(port)) {
                return null;
            }
            return port;
        }

        _number (value, defaultValue = 0) {
            const number = this.Cast.toNumber(
                value === undefined || value === null ? defaultValue : value
            );
            return Number.isFinite(number) ? number : defaultValue;
        }

        _speed (value, defaultValue = 0) {
            return clamp(this._number(value, defaultValue), -100, 100);
        }

        _duration (value) {
            return clamp(this._number(value), 0, 60);
        }

        _motorBlocks () {
            const command = this.BlockType.COMMAND;
            const reporter = this.BlockType.REPORTER;
            const bool = this.BlockType.BOOLEAN;
            const string = this.ArgumentType.STRING;
            const number = this.ArgumentType.NUMBER;
            return [
                {
                    opcode: 'motorRunForever',
                    blockType: command,
                    text: '电机 [PORT] 以 [SPEED] % 速度持续运行',
                    arguments: {
                        PORT: motorPortArg(string),
                        SPEED: numberArg(number, 50)
                    }
                },
                {
                    opcode: 'motorRunTimed',
                    blockType: command,
                    text: '电机 [PORT] 以 [SPEED] % 速度运行 [TIME] 秒',
                    arguments: {
                        PORT: motorPortArg(string),
                        SPEED: numberArg(number, 50),
                        TIME: numberArg(number, 1)
                    }
                },
                {
                    opcode: 'motorRunToAbsPos',
                    blockType: command,
                    text: '电机 [PORT] 运行到绝对位置 [DEGREES] 度 速度 [SPEED] %',
                    arguments: {
                        PORT: motorPortArg(string),
                        DEGREES: numberArg(number, 360),
                        SPEED: numberArg(number, 50)
                    }
                },
                {
                    opcode: 'motorRunToRelPos',
                    blockType: command,
                    text: '电机 [PORT] 旋转 [DEGREES] 度 速度 [SPEED] %',
                    arguments: {
                        PORT: motorPortArg(string),
                        DEGREES: numberArg(number, 360),
                        SPEED: numberArg(number, 50)
                    }
                },
                {
                    opcode: 'motorStop',
                    blockType: command,
                    text: '停止电机 [PORT]',
                    arguments: {PORT: motorPortArg(string)}
                },
                {
                    opcode: 'motorStopAll',
                    blockType: command,
                    text: '停止所有电机'
                },
                {
                    opcode: 'motorSetSpeed',
                    blockType: command,
                    text: '设置电机 [PORT] 速度为 [SPEED] %',
                    arguments: {
                        PORT: motorPortArg(string),
                        SPEED: numberArg(number, 50)
                    }
                },
                {
                    opcode: 'motorSyncRun',
                    blockType: command,
                    text: '同步运行电机 [PORT_L] 和 [PORT_R] 速度 [SPEED] 时间 [TIME] 秒',
                    arguments: {
                        PORT_L: motorPortArg(string, 'A'),
                        PORT_R: motorPortArg(string, 'B'),
                        SPEED: numberArg(number, 50),
                        TIME: numberArg(number, 1)
                    }
                },
                {
                    opcode: 'motorSyncTurn',
                    blockType: command,
                    text: '同步电机 [PORT_L] [PORT_R] 转向 [TURN] 速度 [SPEED]',
                    arguments: {
                        PORT_L: motorPortArg(string, 'A'),
                        PORT_R: motorPortArg(string, 'B'),
                        TURN: numberArg(number, 0),
                        SPEED: numberArg(number, 50)
                    }
                },
                {
                    opcode: 'motorResetPosition',
                    blockType: command,
                    text: '重置电机 [PORT] 位置计数',
                    arguments: {PORT: motorPortArg(string)}
                },
                {
                    opcode: 'getMotorPosition',
                    blockType: reporter,
                    text: '电机 [PORT] 当前位置 (度)',
                    arguments: {PORT: motorPortArg(string)}
                },
                {
                    opcode: 'getMotorSpeed',
                    blockType: reporter,
                    text: '电机 [PORT] 当前速度 (%)',
                    arguments: {PORT: motorPortArg(string)}
                },
                {
                    opcode: 'waitMotorStopped',
                    blockType: command,
                    text: '等待电机 [PORT] 停止',
                    arguments: {PORT: motorPortArg(string)}
                },
                {
                    opcode: 'isMotorRunning',
                    blockType: bool,
                    text: '电机 [PORT] 正在运行?',
                    arguments: {PORT: motorPortArg(string)}
                }
            ];
        }
    }

    const register = scratchApi => {
        if (!scratchApi || !scratchApi.extensions) {
            throw new Error('Scratch API is required');
        }
        if (!scratchApi.extensions.unsandboxed) {
            throw new Error('VSLE EV3 extension must run unsandboxed');
        }
        const extension = new VSLEEV3Extension({Scratch: scratchApi});
        scratchApi.extensions.register(extension);
        return extension;
    };

    const motorPortArg = (type, defaultValue = 'A') => ({
        type,
        menu: 'motorPorts',
        defaultValue
    });

    const numberArg = (type, defaultValue) => ({
        type,
        defaultValue
    });

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const decodeBase64 = value => {
        if (typeof atob === 'function') {
            return atob(value);
        }
        return Buffer.from(value, 'base64').toString('utf8');
    };

    if (Scratch && Scratch.extensions) {
        register(Scratch);
    }

    return {
        LEGO_RED,
        MOTOR_BLOCK_OPCODES,
        SensorCache,
        VSLEEV3Extension,
        WeisileLinkClient,
        register
    };
});

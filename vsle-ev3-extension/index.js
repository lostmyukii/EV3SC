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
    const SENSOR_PORTS = ['S1', 'S2', 'S3', 'S4'];
    const RGB_CHANNELS = ['R', 'G', 'B'];
    const IR_CHANNELS = ['1', '2', '3', '4'];
    const BRICK_BUTTONS = ['up', 'down', 'left', 'right', 'center'];
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

    const SENSOR_BLOCK_OPCODES = [
        'getColorSensorColor',
        'getColorSensorReflected',
        'getColorSensorAmbient',
        'getColorSensorRGB',
        'isColor',
        'getUltrasonicDistance',
        'getUltrasonicDistanceInch',
        'isUltrasonicNear',
        'getGyroAngle',
        'getGyroRate',
        'resetGyro',
        'getTouchPressed',
        'waitTouchPress',
        'waitTouchRelease',
        'getIRDistance',
        'getIRBeaconHeading',
        'getIRBeaconDistance',
        'getIRRemoteButton',
        'isBrickButtonPressed',
        'getBatteryLevel'
    ];

    const DEFAULT_SENSOR_DATA = {
        sensors: {
            S1: {
                color: 0,
                reflected: 0,
                ambient: 0,
                rgb: [0, 0, 0]
            },
            S2: {distance_cm: 0, distance_inch: 0},
            S3: {angle: 0, rate: 0},
            S4: {pressed: false}
        },
        motors: {
            A: {position: 0, speed: 0, running: false},
            B: {position: 0, speed: 0, running: false},
            C: {position: 0, speed: 0, running: false},
            D: {position: 0, speed: 0, running: false}
        },
        system: {
            battery_pct: 100,
            battery_v: 7.5,
            buttons: {
                up: false,
                down: false,
                left: false,
                right: false,
                center: false
            }
        },
        timestamp: 0
    };

    class SensorCache {
        constructor (options = {}) {
            this.data = deepClone(DEFAULT_SENSOR_DATA);
            this.updateRate = 0;
            this._clock = options.clock || (() => Date.now());
            this._windowStartMs = null;
            this._windowCount = 0;
        }

        update (payload) {
            if (!payload || typeof payload !== 'object') {
                return;
            }
            const now = this._clock();
            this.data = deepMerge(this.data, payload);
            if (payload.timestamp === undefined) {
                this.data.timestamp = now;
            }
            this._trackUpdateRate(now);
        }

        get (path) {
            if (!path) {
                return this.data;
            }
            return path.split('.').reduce((obj, key) => (
                obj === undefined || obj === null ? undefined : obj[key]
            ), this.data);
        }

        _trackUpdateRate (now) {
            if (this._windowStartMs === null) {
                this._windowStartMs = now;
                this._windowCount = 1;
                return;
            }
            this._windowCount++;
            const elapsed = now - this._windowStartMs;
            if (elapsed >= 1000) {
                this.updateRate = Math.round((this._windowCount * 1000) / elapsed);
                this._windowStartMs = now;
                this._windowCount = 0;
            }
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
                blocks: this._motorBlocks().concat(this._sensorBlocks()),
                menus: {
                    motorPorts: {
                        acceptReporters: true,
                        items: MOTOR_PORTS
                    },
                    sensorPorts: {
                        acceptReporters: true,
                        items: SENSOR_PORTS
                    },
                    rgbChannels: {
                        acceptReporters: true,
                        items: RGB_CHANNELS
                    },
                    colors: {
                        acceptReporters: true,
                        items: ['0', '1', '2', '3', '4', '5', '6', '7']
                    },
                    irChannels: {
                        acceptReporters: true,
                        items: IR_CHANNELS
                    },
                    brickButtons: {
                        acceptReporters: true,
                        items: BRICK_BUTTONS
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

        getColorSensorColor (args) {
            return this._cacheNumber(
                `sensors.${this._sensorPort(args.PORT)}.color`
            );
        }

        getColorSensorReflected (args) {
            return this._cacheNumber(
                `sensors.${this._sensorPort(args.PORT)}.reflected`
            );
        }

        getColorSensorAmbient (args) {
            return this._cacheNumber(
                `sensors.${this._sensorPort(args.PORT)}.ambient`
            );
        }

        getColorSensorRGB (args) {
            const port = this._sensorPort(args.PORT);
            const channel = this._rgbChannel(args.CHANNEL);
            const rgb = this.sensorCache.get(`sensors.${port}.rgb`);
            if (!Array.isArray(rgb)) {
                return 0;
            }
            return this._safeNumber(rgb[channel], 0);
        }

        isColor (args) {
            return this.getColorSensorColor(args) === this._number(args.COLOR);
        }

        getUltrasonicDistance (args) {
            return this._cacheNumber(
                `sensors.${this._sensorPort(args.PORT)}.distance_cm`
            );
        }

        getUltrasonicDistanceInch (args) {
            return this._cacheNumber(
                `sensors.${this._sensorPort(args.PORT)}.distance_inch`
            );
        }

        isUltrasonicNear (args) {
            const distance = this.getUltrasonicDistance(args);
            const threshold = clamp(this._number(args.DISTANCE), 0, 255);
            return distance < threshold;
        }

        getGyroAngle (args) {
            return this._cacheNumber(
                `sensors.${this._sensorPort(args.PORT)}.angle`
            );
        }

        getGyroRate (args) {
            return this._cacheNumber(
                `sensors.${this._sensorPort(args.PORT)}.rate`
            );
        }

        async resetGyro (args) {
            return this._sendSensorCommand('gyro.reset', {
                port: this._sensorPort(args.PORT)
            });
        }

        getTouchPressed (args) {
            return this._cacheBoolean(
                `sensors.${this._sensorPort(args.PORT)}.pressed`
            );
        }

        async waitTouchPress (args) {
            const port = this._sensorPort(args.PORT);
            if (!port) {
                return;
            }
            await this._waitForCache(
                `sensors.${port}.pressed`,
                value => value === true
            );
        }

        async waitTouchRelease (args) {
            const port = this._sensorPort(args.PORT);
            if (!port) {
                return;
            }
            await this._waitForCache(
                `sensors.${port}.pressed`,
                value => value !== true
            );
        }

        getIRDistance (args) {
            const port = this._sensorPort(args.PORT);
            const distance = this.sensorCache.get(`sensors.${port}.distance`);
            if (distance !== undefined) {
                return this._safeNumber(distance, 0);
            }
            return this._cacheNumber(`sensors.${port}.proximity`);
        }

        getIRBeaconHeading (args) {
            const port = this._sensorPort(args.PORT);
            const channel = this._irChannel(args.CHANNEL);
            return this._cacheNumber(
                `sensors.${port}.beacon.${channel}.heading`
            );
        }

        getIRBeaconDistance (args) {
            const port = this._sensorPort(args.PORT);
            const channel = this._irChannel(args.CHANNEL);
            return this._cacheNumber(
                `sensors.${port}.beacon.${channel}.distance`
            );
        }

        getIRRemoteButton (args) {
            const port = this._sensorPort(args.PORT);
            const channel = this._irChannel(args.CHANNEL);
            const buttons = this.sensorCache.get(
                `sensors.${port}.remote.${channel}.buttons`
            );
            if (Array.isArray(buttons)) {
                return buttons.join(',');
            }
            if (typeof buttons === 'string') {
                return buttons;
            }
            return '';
        }

        isBrickButtonPressed (args) {
            const button = this._brickButton(args.BUTTON);
            return this._cacheBoolean(`system.buttons.${button}`);
        }

        getBatteryLevel () {
            return this._cacheNumber('system.battery_pct', 100);
        }

        async _sendMotorCommand (method, params) {
            if (!params ||
                Object.keys(params).some(key => params[key] === null ||
                    params[key] === undefined)) {
                return;
            }
            await this.link.sendCommand({method, params});
        }

        async _sendSensorCommand (method, params) {
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

        _sensorPort (value) {
            const port = this.Cast.toString(value).toUpperCase();
            if (!SENSOR_PORTS.includes(port)) {
                return null;
            }
            return port;
        }

        _rgbChannel (value) {
            const channel = this.Cast.toString(value).toUpperCase();
            const index = RGB_CHANNELS.indexOf(channel);
            return index === -1 ? 0 : index;
        }

        _irChannel (value) {
            const channel = this.Cast.toString(value);
            return IR_CHANNELS.includes(channel) ? channel : '1';
        }

        _brickButton (value) {
            const button = this.Cast.toString(value).toLowerCase();
            return BRICK_BUTTONS.includes(button) ? button : 'center';
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

        _cacheNumber (path, defaultValue = 0) {
            return this._safeNumber(this.sensorCache.get(path), defaultValue);
        }

        _safeNumber (value, defaultValue = 0) {
            const number = Number(value);
            return Number.isFinite(number) ? number : defaultValue;
        }

        _cacheBoolean (path) {
            return this.sensorCache.get(path) === true;
        }

        async _waitForCache (path, predicate) {
            const start = Date.now();
            while (!predicate(this.sensorCache.get(path))) {
                if (Date.now() - start >= WAIT_TIMEOUT_MS) {
                    return;
                }
                await sleep(WAIT_POLL_MS);
            }
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

        _sensorBlocks () {
            const command = this.BlockType.COMMAND;
            const reporter = this.BlockType.REPORTER;
            const bool = this.BlockType.BOOLEAN;
            const string = this.ArgumentType.STRING;
            const number = this.ArgumentType.NUMBER;
            return [
                {
                    opcode: 'getColorSensorColor',
                    blockType: reporter,
                    text: '颜色传感器 [PORT] 识别颜色',
                    arguments: {PORT: sensorPortArg(string, 'S1')}
                },
                {
                    opcode: 'getColorSensorReflected',
                    blockType: reporter,
                    text: '颜色传感器 [PORT] 反射光强度',
                    arguments: {PORT: sensorPortArg(string, 'S1')}
                },
                {
                    opcode: 'getColorSensorAmbient',
                    blockType: reporter,
                    text: '颜色传感器 [PORT] 环境光强度',
                    arguments: {PORT: sensorPortArg(string, 'S1')}
                },
                {
                    opcode: 'getColorSensorRGB',
                    blockType: reporter,
                    text: '颜色传感器 [PORT] RGB值 [CHANNEL]',
                    arguments: {
                        PORT: sensorPortArg(string, 'S1'),
                        CHANNEL: menuArg(string, 'rgbChannels', 'R')
                    }
                },
                {
                    opcode: 'isColor',
                    blockType: bool,
                    text: '颜色传感器 [PORT] 检测到 [COLOR]?',
                    arguments: {
                        PORT: sensorPortArg(string, 'S1'),
                        COLOR: menuArg(string, 'colors', '5')
                    }
                },
                {
                    opcode: 'getUltrasonicDistance',
                    blockType: reporter,
                    text: '超声波传感器 [PORT] 距离 (厘米)',
                    arguments: {PORT: sensorPortArg(string, 'S2')}
                },
                {
                    opcode: 'getUltrasonicDistanceInch',
                    blockType: reporter,
                    text: '超声波传感器 [PORT] 距离 (英寸)',
                    arguments: {PORT: sensorPortArg(string, 'S2')}
                },
                {
                    opcode: 'isUltrasonicNear',
                    blockType: bool,
                    text: '超声波传感器 [PORT] 距离小于 [DISTANCE] 厘米?',
                    arguments: {
                        PORT: sensorPortArg(string, 'S2'),
                        DISTANCE: numberArg(number, 20)
                    }
                },
                {
                    opcode: 'getGyroAngle',
                    blockType: reporter,
                    text: '陀螺仪传感器 [PORT] 角度',
                    arguments: {PORT: sensorPortArg(string, 'S3')}
                },
                {
                    opcode: 'getGyroRate',
                    blockType: reporter,
                    text: '陀螺仪传感器 [PORT] 角速度 (°/s)',
                    arguments: {PORT: sensorPortArg(string, 'S3')}
                },
                {
                    opcode: 'resetGyro',
                    blockType: command,
                    text: '重置陀螺仪传感器 [PORT]',
                    arguments: {PORT: sensorPortArg(string, 'S3')}
                },
                {
                    opcode: 'getTouchPressed',
                    blockType: bool,
                    text: '触碰传感器 [PORT] 被按下?',
                    arguments: {PORT: sensorPortArg(string, 'S4')}
                },
                {
                    opcode: 'waitTouchPress',
                    blockType: command,
                    text: '等待触碰传感器 [PORT] 被按下',
                    arguments: {PORT: sensorPortArg(string, 'S4')}
                },
                {
                    opcode: 'waitTouchRelease',
                    blockType: command,
                    text: '等待触碰传感器 [PORT] 松开',
                    arguments: {PORT: sensorPortArg(string, 'S4')}
                },
                {
                    opcode: 'getIRDistance',
                    blockType: reporter,
                    text: '红外传感器 [PORT] 距离',
                    arguments: {PORT: sensorPortArg(string, 'S4')}
                },
                {
                    opcode: 'getIRBeaconHeading',
                    blockType: reporter,
                    text: '红外传感器 [PORT] 信标方向 (频道 [CHANNEL])',
                    arguments: {
                        PORT: sensorPortArg(string, 'S4'),
                        CHANNEL: menuArg(string, 'irChannels', '1')
                    }
                },
                {
                    opcode: 'getIRBeaconDistance',
                    blockType: reporter,
                    text: '红外传感器 [PORT] 信标距离 (频道 [CHANNEL])',
                    arguments: {
                        PORT: sensorPortArg(string, 'S4'),
                        CHANNEL: menuArg(string, 'irChannels', '1')
                    }
                },
                {
                    opcode: 'getIRRemoteButton',
                    blockType: reporter,
                    text: '红外遥控器 [PORT] 频道 [CHANNEL] 按钮',
                    arguments: {
                        PORT: sensorPortArg(string, 'S4'),
                        CHANNEL: menuArg(string, 'irChannels', '1')
                    }
                },
                {
                    opcode: 'isBrickButtonPressed',
                    blockType: bool,
                    text: 'EV3砖块 [BUTTON] 键被按下?',
                    arguments: {
                        BUTTON: menuArg(string, 'brickButtons', 'center')
                    }
                },
                {
                    opcode: 'getBatteryLevel',
                    blockType: reporter,
                    text: 'EV3电池电量 (%)'
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

    const sensorPortArg = (type, defaultValue = 'S1') => ({
        type,
        menu: 'sensorPorts',
        defaultValue
    });

    const menuArg = (type, menu, defaultValue) => ({
        type,
        menu,
        defaultValue
    });

    const numberArg = (type, defaultValue) => ({
        type,
        defaultValue
    });

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const deepClone = value => JSON.parse(JSON.stringify(value));

    const deepMerge = (base, patch) => {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
            return patch;
        }
        const result = Array.isArray(base) ? base.slice() : {...base};
        Object.keys(patch).forEach(key => {
            const patchValue = patch[key];
            const baseValue = result[key];
            if (patchValue &&
                typeof patchValue === 'object' &&
                !Array.isArray(patchValue) &&
                baseValue &&
                typeof baseValue === 'object' &&
                !Array.isArray(baseValue)) {
                result[key] = deepMerge(baseValue, patchValue);
            } else {
                result[key] = Array.isArray(patchValue) ?
                    patchValue.slice() :
                    patchValue;
            }
        });
        return result;
    };

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
        SENSOR_BLOCK_OPCODES,
        SensorCache,
        VSLEEV3Extension,
        WeisileLinkClient,
        register
    };
});

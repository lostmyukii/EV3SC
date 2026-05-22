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
    const STATUS_LIGHT_COLORS = ['green', 'orange', 'red', 'amber', 'yellow'];
    const SOUND_FILES = ['ready.wav', 'success.wav', 'error.wav'];
    const DISPLAY_IMAGES = ['smile.png', 'heart.png', 'arrow.png'];
    const LCD_X_MAX = 177;
    const LCD_Y_MAX = 127;
    const WAIT_POLL_MS = 20;
    const WAIT_TIMEOUT_MS = 60000;
    const SENSOR_STALE_MS = 200;
    const SENSOR_PANEL_WIDTH_PX = 280;
    const SENSOR_PANEL_BACKGROUND = '#F5F5F5';
    const SENSOR_PANEL_ACTIVE_GREEN = '#4CBF56';
    const SENSOR_PANEL_COLLECTION_TARGET = 30;
    const CONNECTION_MODAL_WIDTH_PX = 480;
    const CONNECTION_MODAL_HEADER_GREEN = '#0B8E69';
    const CONNECTION_MODAL_BUTTON_PURPLE = '#855CD6';
    const CONNECTION_MODAL_DEFAULT_WIFI_IP = '192.168.1.100';
    const CONNECTION_MODAL_EV3_ICON_URL = 'assets/ev3-small.svg';

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

    const SOUND_BLOCK_OPCODES = [
        'playTone',
        'playToneAndWait',
        'playSoundFile',
        'setVolume',
        'beep',
        'stopSound'
    ];

    const DISPLAY_BLOCK_OPCODES = [
        'displayText',
        'displayNumber',
        'displayClear',
        'displayImage',
        'displayTextAt',
        'drawLine',
        'drawCircle',
        'displayUpdate'
    ];

    const SYSTEM_BLOCK_OPCODES = [
        'setStatusLight',
        'statusLightOff',
        'waitMilliseconds',
        'stopAllEV3',
        'isConnected',
        'getBatteryVoltage'
    ];

    const DATA_BLOCK_OPCODES = [
        'startDataCollection',
        'stopDataCollection',
        'addDataPoint',
        'uploadToTrainer',
        'clearCollectedData',
        'getDataCount',
        'exportDataCSV',
        'startAutoCollect'
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
            collected_points: 0,
            collecting: false,
            collect_label: '',
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

    const buildSensorDataPanelModel = (sensorCache, options = {}) => {
        const now = options.now || (() => Date.now());
        const current = typeof sensorCache.get === 'function' ?
            sensorCache.get() :
            {};
        const timestamp = safeNumber(
            getPath(current, 'timestamp'),
            0
        );
        const collectionTarget = Math.max(
            1,
            safeNumber(
                options.collectionTarget,
                SENSOR_PANEL_COLLECTION_TARGET
            )
        );
        const collected = safeNumber(
            getPath(current, 'system.collected_points'),
            0
        );
        const count = Math.max(0, Math.round(collected));
        const progressPct = clamp(
            Math.round((count / collectionTarget) * 100),
            0,
            100
        );

        return {
            layout: {
                widthPx: SENSOR_PANEL_WIDTH_PX,
                background: SENSOR_PANEL_BACKGROUND,
                activeGreen: SENSOR_PANEL_ACTIVE_GREEN
            },
            connection: {
                connected: timestamp > 0 &&
                    now() - timestamp <= SENSOR_STALE_MS,
                staleMs: timestamp > 0 ? Math.max(0, now() - timestamp) : null,
                brickId: getPath(current, 'brick_id') || 'vsle-ev3-wifi',
                brickName: getPath(current, 'brick_name') || 'VSLE EV3'
            },
            sensors: {
                color: {
                    port: 'S1',
                    value: safeNumber(getPath(current, 'sensors.S1.color')),
                    reflected: safeNumber(
                        getPath(current, 'sensors.S1.reflected')
                    ),
                    ambient: safeNumber(getPath(current, 'sensors.S1.ambient')),
                    rgb: normalRgb(getPath(current, 'sensors.S1.rgb'))
                },
                distance: {
                    port: 'S2',
                    value: safeNumber(
                        getPath(current, 'sensors.S2.distance_cm')
                    ),
                    inch: safeNumber(
                        getPath(current, 'sensors.S2.distance_inch')
                    )
                },
                gyro: {
                    port: 'S3',
                    angle: safeNumber(getPath(current, 'sensors.S3.angle')),
                    rate: safeNumber(getPath(current, 'sensors.S3.rate'))
                },
                touch: {
                    port: 'S4',
                    pressed: getPath(current, 'sensors.S4.pressed') === true
                }
            },
            motors: MOTOR_PORTS.reduce((motors, port) => {
                motors[port] = {
                    port,
                    position: safeNumber(
                        getPath(current, `motors.${port}.position`)
                    ),
                    speed: safeNumber(getPath(current, `motors.${port}.speed`)),
                    running: getPath(current, `motors.${port}.running`) === true
                };
                return motors;
            }, {}),
            system: {
                batteryPct: safeNumber(
                    getPath(current, 'system.battery_pct'),
                    100
                ),
                batteryV: safeNumber(getPath(current, 'system.battery_v')),
                updateRate: safeNumber(sensorCache.updateRate)
            },
            collection: {
                collecting: getPath(current, 'system.collecting') === true,
                label: getPath(current, 'system.collect_label') || '',
                count,
                target: collectionTarget,
                progressPct
            }
        };
    };

    const renderSensorDataPanel = (sensorCache, options = {}) => {
        const model = buildSensorDataPanelModel(sensorCache, options);
        const collapsed = options.collapsed === true;
        const bodyStyle = collapsed ? ' style="display:none"' : '';
        const toggleText = collapsed ? '展开' : '收起';
        const active = model.layout.activeGreen;
        const inactive = '#D9E3F2';
        const connectedText = model.connection.connected ? '已连接' : '未连接';
        const connectedColor = model.connection.connected ? active : '#FF8C1A';
        const touchText = model.sensors.touch.pressed ? '已按' : '未按';
        const touchColor = model.sensors.touch.pressed ? active : inactive;
        const collectionLabel = model.collection.collecting ?
            `采集中 · ${escapeHtml(model.collection.label || '未命名')}` :
            '未采集';

        return [
            `<section class="vsle-sensor-panel" data-vsle-component="sensor-panel" aria-expanded="${!collapsed}" style="width: ${model.layout.widthPx}px; background: ${model.layout.background}; font-family: &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; color: #575E75; border-left: 1px solid rgba(0,0,0,0.15);">`,
            '<style>',
            SENSOR_DATA_PANEL_CSS,
            '</style>',
            '<div class="vsle-sensor-panel__header">',
            '<strong>EV3 传感器实时数据</strong>',
            `<button type="button" class="vsle-sensor-panel__toggle" data-vsle-action="toggle" aria-label="${toggleText}传感器面板">${toggleText}</button>`,
            '</div>',
            `<div class="vsle-sensor-panel__body"${bodyStyle}>`,
            '<div class="vsle-sensor-panel__status">',
            `<span class="vsle-sensor-panel__dot" style="background: ${connectedColor}"></span>`,
            `<span>${escapeHtml(model.connection.brickName)} · ${connectedText}</span>`,
            `<span>${model.system.batteryPct}% · ${model.system.updateRate}Hz</span>`,
            '</div>',
            '<div class="vsle-sensor-panel__group">',
            sensorRow(
                '颜色 S1',
                `${model.sensors.color.reflected}`,
                model.sensors.color.reflected,
                active
            ),
            sensorRow(
                '距离 S2',
                `${formatNumber(model.sensors.distance.value)}cm`,
                clamp(model.sensors.distance.value, 0, 100),
                active
            ),
            sensorRow(
                '陀螺 S3',
                `${formatNumber(model.sensors.gyro.angle)}°`,
                50 + clamp(model.sensors.gyro.angle, -90, 90) / 1.8,
                active
            ),
            sensorRow('触碰 S4', touchText, 100, touchColor),
            '</div>',
            '<div class="vsle-sensor-panel__subhead">电机</div>',
            '<div class="vsle-sensor-panel__group">',
            MOTOR_PORTS.map(port => motorRow(model.motors[port], active)).join(''),
            '</div>',
            '<div class="vsle-sensor-panel__subhead">数据采集</div>',
            '<div class="vsle-sensor-panel__collection">',
            `<div class="vsle-sensor-panel__progress" aria-label="数据采集 ${model.collection.count}/${model.collection.target}">`,
            `<span style="width: ${model.collection.progressPct}%; background: ${active}"></span>`,
            '</div>',
            `<span>${model.collection.count}/${model.collection.target}</span>`,
            `<span>${collectionLabel}</span>`,
            '</div>',
            '<div class="vsle-sensor-panel__actions">',
            '<button type="button" data-vsle-action="startCollect">开始采集</button>',
            '<button type="button" data-vsle-action="uploadToTrainer">上传训练工场</button>',
            '</div>',
            '</div>',
            '</section>'
        ].join('');
    };

    class SensorDataPanel {
        constructor (options = {}) {
            if (!options.container) {
                throw new Error('SensorDataPanel requires a host container');
            }
            this.sensorCache = options.sensorCache;
            this.container = options.container;
            this.now = options.now || (() => Date.now());
            this.collectionTarget = options.collectionTarget ||
                SENSOR_PANEL_COLLECTION_TARGET;
            this.collapsed = options.collapsed === true;
            this.onStartCollect = options.onStartCollect || (async () => {});
            this.onUploadToTrainer = options.onUploadToTrainer ||
                (async () => {});
        }

        render () {
            this.container.innerHTML = renderSensorDataPanel(this.sensorCache, {
                now: this.now,
                collectionTarget: this.collectionTarget,
                collapsed: this.collapsed
            });
            this._bindAction('toggle', () => this.toggle());
            this._bindAction('startCollect', () => this.onStartCollect());
            this._bindAction('uploadToTrainer', () => this.onUploadToTrainer());
            return this.container;
        }

        toggle () {
            this.collapsed = !this.collapsed;
            this.render();
        }

        _bindAction (name, handler) {
            if (!this.container.querySelector) {
                return;
            }
            const element = this.container.querySelector(
                `[data-vsle-action="${name}"]`
            );
            if (element && element.addEventListener) {
                element.addEventListener('click', handler);
            }
        }
    }

    const buildConnectionModalModel = (options = {}) => {
        const transport = normalizeTransport(options.transport);
        const status = normalizeConnectionStatus(options.status);
        const defaultMessage = {
            idle: '请选择连接方式',
            connecting: '正在连接...',
            connected: '已连接',
            error: '连接失败'
        }[status];
        return {
            transport,
            ev3Ip: trimOrDefault(
                options.ev3Ip || options.ev3_ip,
                CONNECTION_MODAL_DEFAULT_WIFI_IP
            ),
            ev3Bt: trimOrDefault(options.ev3Bt || options.ev3_bt, ''),
            status,
            message: trimOrDefault(options.message, defaultMessage),
            layout: {
                widthPx: CONNECTION_MODAL_WIDTH_PX,
                headerGreen: CONNECTION_MODAL_HEADER_GREEN,
                buttonPurple: CONNECTION_MODAL_BUTTON_PURPLE
            }
        };
    };

    const renderConnectionModal = (options = {}) => {
        const model = buildConnectionModalModel(options);
        const wifiChecked = model.transport === 'wifi' ? ' checked' : '';
        const bluetoothChecked = model.transport === 'bluetooth' ?
            ' checked' :
            '';
        const wifiHidden = model.transport === 'wifi' ? '' : ' hidden';
        const btHidden = model.transport === 'bluetooth' ? '' : ' hidden';
        const dotsClass = model.status === 'connected' ?
            'vsle-connection-modal__dots--success' :
            '';
        const connectLabel = model.status === 'connecting' ?
            '连接中...' :
            '连接';

        return [
            `<section id="connectionModal" class="vsle-connection-modal" role="dialog" aria-modal="true" aria-labelledby="vsle-connection-title" style="width: ${model.layout.widthPx}px; font-family: &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; color: #575E75;">`,
            '<style>',
            CONNECTION_MODAL_CSS,
            '</style>',
            `<header class="vsle-connection-modal__header" style="background-color: ${model.layout.headerGreen}">`,
            '<button type="button" class="vsle-connection-modal__close" data-vsle-action="cancel" aria-label="关闭">×</button>',
            '<strong id="vsle-connection-title">连接到 EV3</strong>',
            '<span aria-hidden="true"></span>',
            '</header>',
            '<div class="vsle-connection-modal__body">',
            '<p class="vsle-connection-modal__label">连接方式</p>',
            '<div class="vsle-connection-modal__transport-row">',
            '<label>',
            `<input type="radio" name="vsle-transport" value="wifi" data-vsle-transport="wifi"${wifiChecked}>`,
            ' WiFi (推荐)',
            '</label>',
            '<label>',
            `<input type="radio" name="vsle-transport" value="bluetooth" data-vsle-transport="bluetooth"${bluetoothChecked}>`,
            ' 蓝牙',
            '</label>',
            '</div>',
            `<label class="vsle-connection-modal__field"${wifiHidden}>`,
            '<span>EV3 IP地址:</span>',
            `<input type="text" data-vsle-input="wifi-ip" value="${escapeHtml(model.ev3Ip)}" inputmode="numeric">`,
            '</label>',
            `<label class="vsle-connection-modal__field"${btHidden}>`,
            '<span>EV3 蓝牙地址:</span>',
            `<input type="text" data-vsle-input="bt-address" value="${escapeHtml(model.ev3Bt)}" placeholder="00:16:53:AA:BB:CC">`,
            '</label>',
            '<div class="vsle-connection-modal__activity">',
            `<img alt="EV3" src="${CONNECTION_MODAL_EV3_ICON_URL}" class="vsle-connection-modal__ev3-icon">`,
            '<span class="vsle-connection-modal__radio" aria-hidden="true"></span>',
            '</div>',
            '<div class="vsle-connection-modal__status-row">',
            `<span>状态: ${escapeHtml(model.message)}</span>`,
            `<span class="vsle-connection-modal__dots ${dotsClass}" aria-hidden="true"><i></i><i></i><i></i></span>`,
            '</div>',
            '</div>',
            '<footer class="vsle-connection-modal__footer">',
            '<button type="button" class="vsle-connection-modal__help" data-vsle-action="help">帮助</button>',
            `<button type="button" class="vsle-connection-modal__connect" data-vsle-action="connect" style="background: ${model.layout.buttonPurple}">${connectLabel}</button>`,
            '</footer>',
            '</section>'
        ].join('');
    };

    class ConnectionModal {
        constructor (options = {}) {
            if (!options.container) {
                throw new Error('ConnectionModal requires a host container');
            }
            const model = buildConnectionModalModel(options);
            this.container = options.container;
            this.transport = model.transport;
            this.ev3Ip = model.ev3Ip;
            this.ev3Bt = model.ev3Bt;
            this.status = model.status;
            this.message = model.message;
            this.onConnect = options.onConnect || (async () => {});
            this.onCancel = options.onCancel || (() => {});
            this.onHelp = options.onHelp || (() => {});
        }

        render () {
            this.container.innerHTML = renderConnectionModal({
                transport: this.transport,
                ev3Ip: this.ev3Ip,
                ev3Bt: this.ev3Bt,
                status: this.status,
                message: this.message
            });
            this._bind('connect', () => this.connect());
            this._bind('cancel', () => this.onCancel());
            this._bind('help', () => this.onHelp());
            this._bindTransport('wifi');
            this._bindTransport('bluetooth');
            this._bindInput('wifi-ip', value => {
                this.ev3Ip = value.trim();
            });
            this._bindInput('bt-address', value => {
                this.ev3Bt = value.trim();
            });
            return this.container;
        }

        selectTransport (transport) {
            this.transport = normalizeTransport(transport);
            this.render();
        }

        async connect () {
            this.status = 'connecting';
            this.message = '正在连接...';
            this.render();
            try {
                await this.onConnect(this._connectionParams());
                this.status = 'connected';
                this.message = '已连接';
            } catch (error) {
                this.status = 'error';
                this.message = error && error.message ? error.message : '连接失败';
            }
            this.render();
        }

        _connectionParams () {
            if (this.transport === 'bluetooth') {
                return {
                    transport: 'bluetooth',
                    ev3Bt: this.ev3Bt
                };
            }
            return {
                transport: 'wifi',
                ev3Ip: this.ev3Ip
            };
        }

        _bind (name, handler) {
            if (!this.container.querySelector) {
                return;
            }
            const element = this.container.querySelector(
                `[data-vsle-action="${name}"]`
            );
            if (element && element.addEventListener) {
                element.addEventListener('click', handler);
            }
        }

        _bindTransport (transport) {
            if (!this.container.querySelector) {
                return;
            }
            const element = this.container.querySelector(
                `[data-vsle-transport="${transport}"]`
            );
            if (element && element.addEventListener) {
                element.addEventListener('change', () => {
                    this.selectTransport(transport);
                });
            }
        }

        _bindInput (name, handler) {
            if (!this.container.querySelector) {
                return;
            }
            const element = this.container.querySelector(
                `[data-vsle-input="${name}"]`
            );
            if (element && element.addEventListener) {
                element.addEventListener('input', event => {
                    handler(event && event.target ? event.target.value : '');
                });
            }
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
                blocks: this._motorBlocks()
                    .concat(this._sensorBlocks())
                    .concat(this._soundBlocks())
                    .concat(this._displayBlocks())
                    .concat(this._systemBlocks())
                    .concat(this._dataBlocks()),
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
                    },
                    soundFiles: {
                        acceptReporters: true,
                        items: SOUND_FILES
                    },
                    displayImages: {
                        acceptReporters: true,
                        items: DISPLAY_IMAGES
                    },
                    statusLightColors: {
                        acceptReporters: true,
                        items: STATUS_LIGHT_COLORS
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

        async playTone (args) {
            return this._sendSoundCommand('sound.playTone', {
                freq: this._frequency(args.FREQ),
                duration: this._duration(args.DURATION),
                volume: this._volume(args.VOLUME)
            });
        }

        async playToneAndWait (args) {
            return this._sendSoundCommand('sound.playToneWait', {
                freq: this._frequency(args.FREQ),
                duration: this._duration(args.DURATION),
                volume: this._volume(args.VOLUME)
            });
        }

        async playSoundFile (args) {
            return this._sendSoundCommand('sound.playFile', {
                file: this._assetName(args.FILE, ['.wav'])
            });
        }

        async setVolume (args) {
            return this._sendSoundCommand('sound.setVolume', {
                volume: this._volume(args.VOLUME)
            });
        }

        async beep () {
            return this._sendSoundCommand('sound.beep', {});
        }

        async stopSound () {
            return this._sendSoundCommand('sound.stop', {});
        }

        async displayText (args) {
            return this._sendDisplayCommand('display.text', {
                text: this.Cast.toString(args.TEXT),
                line: this._line(args.LINE)
            });
        }

        async displayNumber (args) {
            return this._sendDisplayCommand('display.number', {
                number: this._number(args.NUMBER),
                line: this._line(args.LINE)
            });
        }

        async displayClear () {
            return this._sendDisplayCommand('display.clear', {});
        }

        async displayImage (args) {
            return this._sendDisplayCommand('display.image', {
                image: this._assetName(args.IMAGE, [
                    '.png',
                    '.bmp',
                    '.jpg',
                    '.jpeg'
                ])
            });
        }

        async displayTextAt (args) {
            return this._sendDisplayCommand('display.textAt', {
                text: this.Cast.toString(args.TEXT),
                x: this._coord(args.X, LCD_X_MAX),
                y: this._coord(args.Y, LCD_Y_MAX)
            });
        }

        async drawLine (args) {
            return this._sendDisplayCommand('display.drawLine', {
                x1: this._coord(args.X1, LCD_X_MAX),
                y1: this._coord(args.Y1, LCD_Y_MAX),
                x2: this._coord(args.X2, LCD_X_MAX),
                y2: this._coord(args.Y2, LCD_Y_MAX)
            });
        }

        async drawCircle (args) {
            return this._sendDisplayCommand('display.drawCircle', {
                x: this._coord(args.X, LCD_X_MAX),
                y: this._coord(args.Y, LCD_Y_MAX),
                r: this._coord(args.R, LCD_Y_MAX)
            });
        }

        async displayUpdate () {
            return this._sendDisplayCommand('display.update', {});
        }

        async setStatusLight (args) {
            const color = this._statusLightColor(args.COLOR);
            return this._sendSystemCommand('system.setStatusLight', {color});
        }

        async statusLightOff () {
            return this._sendSystemCommand('system.statusLightOff', {});
        }

        async waitMilliseconds (args) {
            await sleep(this._waitMilliseconds(args.MS));
        }

        async stopAllEV3 () {
            return this._sendSystemCommand('system.stopAll', {});
        }

        isConnected () {
            const timestamp = this._cacheNumber('timestamp', 0);
            return timestamp > 0 && Date.now() - timestamp <= SENSOR_STALE_MS;
        }

        getBatteryVoltage () {
            return this._cacheNumber('system.battery_v', 0);
        }

        async startDataCollection (args) {
            const label = this._label(args.LABEL);
            return this._sendDataCommand('data.startCollect', {label});
        }

        async stopDataCollection () {
            return this._sendDataCommand('data.stopCollect', {});
        }

        async addDataPoint (args) {
            const label = this._label(args.LABEL);
            return this._sendDataCommand('data.addPoint', {label});
        }

        async uploadToTrainer () {
            return this._sendDataCommand('data.uploadToTrainer', {});
        }

        async clearCollectedData () {
            return this._sendDataCommand('data.clear', {});
        }

        getDataCount () {
            return this._cacheNumber('system.collected_points', 0);
        }

        async exportDataCSV () {
            return this._sendDataCommand('data.exportCSV', {});
        }

        async startAutoCollect (args) {
            const label = this._label(args.LABEL);
            return this._sendDataCommand('data.startAutoCollect', {
                interval_ms: this._milliseconds(args.INTERVAL),
                label
            });
        }

        async setTransport (args) {
            const transport = normalizeTransport(args.TRANSPORT || args.transport);
            const params = {transport};
            if (transport === 'bluetooth') {
                params.ev3_bt = trimOrDefault(
                    args.EV3_BT || args.ev3Bt || args.ev3_bt,
                    ''
                );
            } else {
                params.ev3_ip = trimOrDefault(
                    args.EV3_IP || args.ev3Ip || args.ev3_ip,
                    CONNECTION_MODAL_DEFAULT_WIFI_IP
                );
            }
            return this.link.sendCommand({
                method: 'vsle.setTransport',
                params
            });
        }

        createSensorDataPanel (options = {}) {
            const panel = new SensorDataPanel({
                sensorCache: this.sensorCache,
                container: options.container,
                now: options.now,
                collectionTarget: options.collectionTarget,
                collapsed: options.collapsed,
                onStartCollect: () => this.startDataCollection({
                    LABEL: options.collectionLabel || 'panel'
                }),
                onUploadToTrainer: () => this.uploadToTrainer()
            });
            panel.render();
            return panel;
        }

        createConnectionModal (options = {}) {
            const modal = new ConnectionModal({
                container: options.container,
                transport: options.transport,
                ev3Ip: options.ev3Ip,
                ev3Bt: options.ev3Bt,
                status: options.status,
                message: options.message,
                onCancel: options.onCancel,
                onHelp: options.onHelp,
                onConnect: params => this.setTransport(params)
            });
            modal.render();
            return modal;
        }

        async _sendMotorCommand (method, params) {
            if (!params ||
                Object.keys(params).some(key => params[key] === null ||
                    params[key] === undefined)) {
                return;
            }
            return this.link.sendCommand({method, params});
        }

        async _sendSoundCommand (method, params) {
            return this._sendMotorCommand(method, params);
        }

        async _sendDisplayCommand (method, params) {
            return this._sendMotorCommand(method, params);
        }

        async _sendSensorCommand (method, params) {
            return this._sendMotorCommand(method, params);
        }

        async _sendSystemCommand (method, params) {
            return this._sendMotorCommand(method, params);
        }

        async _sendDataCommand (method, params) {
            return this._sendMotorCommand(method, params);
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

        _statusLightColor (value) {
            const color = this.Cast.toString(value).toLowerCase();
            return STATUS_LIGHT_COLORS.includes(color) ? color : null;
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

        _frequency (value) {
            return clamp(this._number(value), 20, 20000);
        }

        _volume (value) {
            return clamp(this._number(value, 100), 0, 100);
        }

        _line (value) {
            return clamp(this._number(value, 1), 1, 8);
        }

        _coord (value, upper) {
            return clamp(this._number(value), 0, upper);
        }

        _milliseconds (value) {
            return clamp(this._number(value), 20, 60000);
        }

        _waitMilliseconds (value) {
            return clamp(this._number(value), 0, 60000);
        }

        _label (value) {
            const label = this.Cast.toString(value);
            return label.length <= 64 ? label : null;
        }

        _assetName (value, extensions) {
            const name = this.Cast.toString(value).trim();
            const lowerName = name.toLowerCase();
            const safe = name.length > 0 &&
                name.length <= 64 &&
                !name.includes('/') &&
                !name.includes('\\') &&
                !name.includes('\u0000') &&
                extensions.some(extension => lowerName.endsWith(extension));
            return safe ? name : null;
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

        _soundBlocks () {
            const command = this.BlockType.COMMAND;
            const string = this.ArgumentType.STRING;
            const number = this.ArgumentType.NUMBER;
            return [
                {
                    opcode: 'playTone',
                    blockType: command,
                    text: '播放音调 [FREQ] Hz 持续 [DURATION] 秒',
                    arguments: {
                        FREQ: numberArg(number, 440),
                        DURATION: numberArg(number, 0.5),
                        VOLUME: numberArg(number, 100)
                    }
                },
                {
                    opcode: 'playToneAndWait',
                    blockType: command,
                    text: '播放音调 [FREQ] Hz 持续 [DURATION] 秒 并等待',
                    arguments: {
                        FREQ: numberArg(number, 440),
                        DURATION: numberArg(number, 0.5),
                        VOLUME: numberArg(number, 100)
                    }
                },
                {
                    opcode: 'playSoundFile',
                    blockType: command,
                    text: '播放声音文件 [FILE]',
                    arguments: {
                        FILE: menuArg(string, 'soundFiles', 'ready.wav')
                    }
                },
                {
                    opcode: 'setVolume',
                    blockType: command,
                    text: '设置音量为 [VOLUME] %',
                    arguments: {VOLUME: numberArg(number, 100)}
                },
                {
                    opcode: 'beep',
                    blockType: command,
                    text: '发出哔声'
                },
                {
                    opcode: 'stopSound',
                    blockType: command,
                    text: '停止声音'
                }
            ];
        }

        _displayBlocks () {
            const command = this.BlockType.COMMAND;
            const string = this.ArgumentType.STRING;
            const number = this.ArgumentType.NUMBER;
            return [
                {
                    opcode: 'displayText',
                    blockType: command,
                    text: '在第 [LINE] 行显示 [TEXT]',
                    arguments: {
                        TEXT: stringArg(string, 'Hello'),
                        LINE: numberArg(number, 1)
                    }
                },
                {
                    opcode: 'displayNumber',
                    blockType: command,
                    text: '在第 [LINE] 行显示数字 [NUMBER]',
                    arguments: {
                        NUMBER: numberArg(number, 0),
                        LINE: numberArg(number, 1)
                    }
                },
                {
                    opcode: 'displayClear',
                    blockType: command,
                    text: '清空显示屏'
                },
                {
                    opcode: 'displayImage',
                    blockType: command,
                    text: '显示图案 [IMAGE]',
                    arguments: {
                        IMAGE: menuArg(string, 'displayImages', 'smile.png')
                    }
                },
                {
                    opcode: 'displayTextAt',
                    blockType: command,
                    text: '在位置 X=[X] Y=[Y] 显示 [TEXT]',
                    arguments: {
                        TEXT: stringArg(string, 'Hello'),
                        X: numberArg(number, 0),
                        Y: numberArg(number, 0)
                    }
                },
                {
                    opcode: 'drawLine',
                    blockType: command,
                    text: '从 [X1],[Y1] 到 [X2],[Y2] 画线',
                    arguments: {
                        X1: numberArg(number, 0),
                        Y1: numberArg(number, 0),
                        X2: numberArg(number, 177),
                        Y2: numberArg(number, 127)
                    }
                },
                {
                    opcode: 'drawCircle',
                    blockType: command,
                    text: '在 [X],[Y] 画圆形 半径=[R]',
                    arguments: {
                        X: numberArg(number, 90),
                        Y: numberArg(number, 64),
                        R: numberArg(number, 10)
                    }
                },
                {
                    opcode: 'displayUpdate',
                    blockType: command,
                    text: '刷新显示屏'
                }
            ];
        }

        _systemBlocks () {
            const command = this.BlockType.COMMAND;
            const reporter = this.BlockType.REPORTER;
            const bool = this.BlockType.BOOLEAN;
            const string = this.ArgumentType.STRING;
            const number = this.ArgumentType.NUMBER;
            return [
                {
                    opcode: 'setStatusLight',
                    blockType: command,
                    text: '设置状态灯为 [COLOR]',
                    arguments: {
                        COLOR: menuArg(string, 'statusLightColors', 'green')
                    }
                },
                {
                    opcode: 'statusLightOff',
                    blockType: command,
                    text: '关闭状态灯'
                },
                {
                    opcode: 'waitMilliseconds',
                    blockType: command,
                    text: '等待 [MS] 毫秒',
                    arguments: {MS: numberArg(number, 100)}
                },
                {
                    opcode: 'stopAllEV3',
                    blockType: command,
                    text: '停止所有EV3功能'
                },
                {
                    opcode: 'isConnected',
                    blockType: bool,
                    text: 'EV3已连接?'
                },
                {
                    opcode: 'getBatteryVoltage',
                    blockType: reporter,
                    text: 'EV3电池电压 (V)'
                }
            ];
        }

        _dataBlocks () {
            const command = this.BlockType.COMMAND;
            const reporter = this.BlockType.REPORTER;
            const string = this.ArgumentType.STRING;
            const number = this.ArgumentType.NUMBER;
            return [
                {
                    opcode: 'startDataCollection',
                    blockType: command,
                    text: '开始采集数据 标签=[LABEL]',
                    arguments: {LABEL: stringArg(string, '类别A')}
                },
                {
                    opcode: 'stopDataCollection',
                    blockType: command,
                    text: '停止数据采集'
                },
                {
                    opcode: 'addDataPoint',
                    blockType: command,
                    text: '手动记录一条数据 标签=[LABEL]',
                    arguments: {LABEL: stringArg(string, '类别A')}
                },
                {
                    opcode: 'uploadToTrainer',
                    blockType: command,
                    text: '上传数据到训练工场'
                },
                {
                    opcode: 'clearCollectedData',
                    blockType: command,
                    text: '清空已采集数据'
                },
                {
                    opcode: 'getDataCount',
                    blockType: reporter,
                    text: '已采集数据条数'
                },
                {
                    opcode: 'exportDataCSV',
                    blockType: command,
                    text: '导出数据为CSV文件'
                },
                {
                    opcode: 'startAutoCollect',
                    blockType: command,
                    text: '每 [INTERVAL] 毫秒自动采集一条 标签=[LABEL]',
                    arguments: {
                        INTERVAL: numberArg(number, 100),
                        LABEL: stringArg(string, '类别A')
                    }
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

    const stringArg = (type, defaultValue) => ({
        type,
        defaultValue
    });

    const normalizeTransport = value => {
        const transport = String(value || 'wifi').toLowerCase();
        return transport === 'bluetooth' ? 'bluetooth' : 'wifi';
    };

    const normalizeConnectionStatus = value => {
        const status = String(value || 'idle').toLowerCase();
        return ['idle', 'connecting', 'connected', 'error'].includes(status) ?
            status :
            'idle';
    };

    const trimOrDefault = (value, defaultValue) => {
        const text = value === undefined || value === null ? '' : String(value);
        const trimmed = text.trim();
        return trimmed || defaultValue;
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const deepClone = value => JSON.parse(JSON.stringify(value));

    const getPath = (object, path) => path.split('.').reduce((current, key) => (
        current === undefined || current === null ? undefined : current[key]
    ), object);

    const safeNumber = (value, defaultValue = 0) => {
        const number = Number(value);
        return Number.isFinite(number) ? number : defaultValue;
    };

    const normalRgb = value => {
        if (!Array.isArray(value)) {
            return [0, 0, 0];
        }
        return [0, 1, 2].map(index => clamp(
            Math.round(safeNumber(value[index])),
            0,
            255
        ));
    };

    const formatNumber = value => {
        const number = safeNumber(value);
        return Number.isInteger(number) ? String(number) : number.toFixed(1);
    };

    const escapeHtml = value => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const sensorRow = (label, value, percentage, color) => [
        '<div class="vsle-sensor-panel__row">',
        `<span>${escapeHtml(label)}</span>`,
        '<span class="vsle-sensor-panel__meter">',
        `<i style="width: ${clamp(Math.round(percentage), 0, 100)}%; background: ${color}"></i>`,
        '</span>',
        `<strong>${escapeHtml(value)}</strong>`,
        '</div>'
    ].join('');

    const motorRow = (motor, activeColor) => {
        const color = motor.running ? activeColor : '#D9E3F2';
        const state = motor.running ? `${motor.speed}%` : '停止';
        return [
            '<div class="vsle-sensor-panel__motor">',
            `<span>${motor.port}: ${formatNumber(motor.position)}°</span>`,
            `<i style="background: ${color}"></i>`,
            `<strong>${escapeHtml(state)}</strong>`,
            '</div>'
        ].join('');
    };

    const SENSOR_DATA_PANEL_CSS = [
        '.vsle-sensor-panel{box-sizing:border-box;min-height:100%;font-size:0.75rem;}',
        '.vsle-sensor-panel *{box-sizing:border-box;}',
        '.vsle-sensor-panel__header{display:flex;align-items:center;justify-content:space-between;padding:0.5rem;border-bottom:1px solid rgba(0,0,0,0.15);}',
        '.vsle-sensor-panel__header strong{font-size:0.85rem;}',
        '.vsle-sensor-panel__toggle,.vsle-sensor-panel__actions button{border:1px solid rgba(0,0,0,0.15);border-radius:0.25rem;background:#fff;color:#575E75;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif;font-weight:600;font-size:0.75rem;padding:0.25rem 0.5rem;}',
        '.vsle-sensor-panel__body{padding:0.5rem;}',
        '.vsle-sensor-panel__status{display:grid;grid-template-columns:auto 1fr auto;gap:0.35rem;align-items:center;margin-bottom:0.5rem;}',
        '.vsle-sensor-panel__dot{width:0.55rem;height:0.55rem;border-radius:50%;display:inline-block;}',
        '.vsle-sensor-panel__group{background:#fff;border:1px solid rgba(0,0,0,0.15);border-radius:0.25rem;overflow:hidden;}',
        '.vsle-sensor-panel__row,.vsle-sensor-panel__motor{display:grid;grid-template-columns:4.5rem 1fr 3.25rem;gap:0.35rem;align-items:center;min-height:1.8rem;padding:0.25rem 0.4rem;border-bottom:1px solid rgba(0,0,0,0.10);}',
        '.vsle-sensor-panel__row:last-child,.vsle-sensor-panel__motor:last-child{border-bottom:0;}',
        '.vsle-sensor-panel__meter{height:0.45rem;background:#E9F1FC;border-radius:0.25rem;overflow:hidden;}',
        '.vsle-sensor-panel__meter i{display:block;height:100%;border-radius:0.25rem;}',
        '.vsle-sensor-panel__motor i{width:0.65rem;height:0.65rem;display:inline-block;border-radius:0.15rem;}',
        '.vsle-sensor-panel__subhead{font-weight:700;margin:0.65rem 0 0.25rem;}',
        '.vsle-sensor-panel__collection{display:grid;grid-template-columns:1fr auto;gap:0.35rem;align-items:center;}',
        '.vsle-sensor-panel__collection span:last-child{grid-column:1 / -1;}',
        '.vsle-sensor-panel__progress{height:0.55rem;background:#E9F1FC;border-radius:0.25rem;overflow:hidden;}',
        '.vsle-sensor-panel__progress span{display:block;height:100%;border-radius:0.25rem;}',
        '.vsle-sensor-panel__actions{display:flex;gap:0.35rem;margin-top:0.5rem;}'
    ].join('');

    const CONNECTION_MODAL_CSS = [
        '.vsle-connection-modal{box-sizing:border-box;margin:100px auto;border:4px solid rgba(255,255,255,0.25);border-radius:0.5rem;background:#fff;overflow:hidden;line-height:1.75;user-select:none;}',
        '.vsle-connection-modal *{box-sizing:border-box;}',
        '.vsle-connection-modal__header{height:3.125rem;display:grid;grid-template-columns:4rem 1fr 4rem;align-items:center;color:#fff;}',
        '.vsle-connection-modal__header strong{text-align:center;font-size:1rem;font-weight:400;letter-spacing:0.4px;}',
        '.vsle-connection-modal__close{border:0;background:transparent;color:#fff;font-size:1.45rem;line-height:1;cursor:pointer;}',
        '.vsle-connection-modal__body{background:#fff;padding:1rem 1.25rem 0.75rem;}',
        '.vsle-connection-modal__label{font-weight:500;margin:0 0 0.5rem;}',
        '.vsle-connection-modal__transport-row{display:flex;gap:1.5rem;margin-bottom:0.75rem;}',
        '.vsle-connection-modal__transport-row label{font-weight:600;}',
        '.vsle-connection-modal__field{display:grid;grid-template-columns:6rem 1fr;align-items:center;gap:0.5rem;margin-bottom:0.75rem;}',
        '.vsle-connection-modal__field input{border:1px solid rgba(0,0,0,0.15);border-radius:0.25rem;color:#575E75;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif;font-size:0.875rem;padding:0.45rem 0.5rem;}',
        '.vsle-connection-modal__activity{height:8rem;background:rgba(133,92,214,0.15);display:flex;justify-content:center;align-items:center;position:relative;margin:0 -1.25rem 0.75rem;}',
        '.vsle-connection-modal__ev3-icon{width:80px;height:80px;}',
        '.vsle-connection-modal__radio{position:absolute;width:2rem;height:2rem;right:11.5rem;top:1.4rem;border-radius:100%;background:#855CD6;box-shadow:0 0 0 4px rgba(133,92,214,0.35);}',
        '.vsle-connection-modal__status-row{display:flex;justify-content:center;align-items:center;gap:0.75rem;text-align:center;}',
        '.vsle-connection-modal__dots{display:flex;padding:0.25rem 0.1rem;border-radius:1rem;background:rgba(133,92,214,0.15);}',
        '.vsle-connection-modal__dots i{width:0.5rem;height:0.5rem;margin:0 0.3rem;border-radius:100%;background:#855CD6;}',
        '.vsle-connection-modal__dots--success{background:rgba(15,189,140,0.25);}',
        '.vsle-connection-modal__dots--success i{background:#0FBD8C;}',
        '.vsle-connection-modal__footer{display:flex;justify-content:space-between;align-items:center;padding:0.75rem;background:#fff;}',
        '.vsle-connection-modal__footer button{border:0;border-radius:0.5rem;color:#fff;cursor:pointer;font-family:"Helvetica Neue", Helvetica, Arial, sans-serif;font-size:0.85rem;font-weight:600;padding:0.6rem 0.75rem;}',
        '.vsle-connection-modal__help{background:#0B8E69;}'
    ].join('');

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
        CONNECTION_MODAL_BUTTON_PURPLE,
        CONNECTION_MODAL_CSS,
        CONNECTION_MODAL_EV3_ICON_URL,
        CONNECTION_MODAL_HEADER_GREEN,
        CONNECTION_MODAL_WIDTH_PX,
        SENSOR_DATA_PANEL_CSS,
        SENSOR_PANEL_ACTIVE_GREEN,
        SENSOR_PANEL_BACKGROUND,
        SENSOR_PANEL_WIDTH_PX,
        DATA_BLOCK_OPCODES,
        DISPLAY_BLOCK_OPCODES,
        MOTOR_BLOCK_OPCODES,
        SENSOR_BLOCK_OPCODES,
        SOUND_BLOCK_OPCODES,
        SYSTEM_BLOCK_OPCODES,
        ConnectionModal,
        SensorDataPanel,
        SensorCache,
        VSLEEV3Extension,
        WeisileLinkClient,
        buildConnectionModalModel,
        buildSensorDataPanelModel,
        renderConnectionModal,
        renderSensorDataPanel,
        register
    };
});

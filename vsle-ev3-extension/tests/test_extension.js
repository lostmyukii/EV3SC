const assert = require('node:assert/strict');
const test = require('node:test');

const {
    AIQUEST_BLOCK_OPCODES,
    LEGO_RED,
    DATA_BLOCK_OPCODES,
    DISPLAY_BLOCK_OPCODES,
    MOTOR_BLOCK_OPCODES,
    MOTOR_PID_MODES,
    MOTOR_PID_TERMS,
    SENSOR_BLOCK_OPCODES,
    SOUND_BLOCK_OPCODES,
    SYSTEM_BLOCK_OPCODES,
    SensorCache,
    VSLEEV3Extension,
    WeisileLinkClient,
    register
} = require('../index.js');

const makeScratch = () => {
    const registered = [];
    return {
        registered,
        extensions: {
            unsandboxed: true,
            register (extension) {
                registered.push(extension);
            }
        },
        BlockType: {
            COMMAND: 'command',
            REPORTER: 'reporter',
            BOOLEAN: 'Boolean'
        },
        ArgumentType: {
            STRING: 'string',
            NUMBER: 'number'
        },
        Cast: {
            toString: value => String(value),
            toNumber: value => {
                const number = Number(value);
                return Number.isNaN(number) ? 0 : number;
            }
        }
    };
};

const makeExtension = () => {
    const sent = [];
    const link = {
        sendCommand: async command => {
            sent.push(command);
            return {ok: true};
        }
    };
    const sensorCache = new SensorCache();
    const extension = new VSLEEV3Extension({link, sensorCache});
    return {extension, sent, sensorCache};
};

test('register requires unsandboxed TurboWarp extension context', () => {
    const scratch = makeScratch();

    register(scratch);

    assert.equal(scratch.registered.length, 1);
    assert.equal(scratch.registered[0].getInfo().id, 'vsleev3');
    assert.throws(
        () => register({...scratch, extensions: {unsandboxed: false}}),
        /must run unsandboxed/
    );
});

test('getInfo exposes complete EV3 and AI Quest blocks in LEGO red', () => {
    const {extension} = makeExtension();
    const info = extension.getInfo();

    assert.equal(info.name, 'EV3');
    assert.equal(info.color1, LEGO_RED);
    assert.equal(info.blocks.length, 64 + AIQUEST_BLOCK_OPCODES.length);
    assert.deepEqual(
        info.blocks.map(block => block.opcode),
        [
            ...MOTOR_BLOCK_OPCODES,
            ...SENSOR_BLOCK_OPCODES,
            ...SOUND_BLOCK_OPCODES,
            ...DISPLAY_BLOCK_OPCODES,
            ...SYSTEM_BLOCK_OPCODES,
            ...DATA_BLOCK_OPCODES,
            ...AIQUEST_BLOCK_OPCODES
        ]
    );
    assert.equal(info.menus.motorPorts.items.length, 4);
    assert.deepEqual(info.menus.sensorPorts.items, ['S1', 'S2', 'S3', 'S4']);
    assert.deepEqual(info.menus.rgbChannels.items, ['R', 'G', 'B']);
    assert.deepEqual(info.menus.irChannels.items, ['1', '2', '3', '4']);
    assert.ok(info.menus.brickButtons.items.includes('center'));
    assert.ok(info.menus.soundFiles.items.includes('ready.wav'));
    assert.ok(info.menus.displayImages.items.includes('smile.png'));
    assert.ok(info.menus.statusLightColors.items.includes('green'));
    assert.deepEqual(info.menus.motorPidModes.items, MOTOR_PID_MODES);
    assert.deepEqual(info.menus.motorPidTerms.items, MOTOR_PID_TERMS);
});

test('AI Quest blocks call the server-side contract and expose sync reporters', async () => {
    const sent = [];
    const link = {
        sendCommand: async command => {
            sent.push(command);
            if (command.method === 'aiquest.uploadDataset') {
                return {
                    dataset_id: 'mock-dataset-1',
                    uploaded_samples: 4,
                    scope: {type: 'project', id: 'project-1'}
                };
            }
            if (command.method === 'aiquest.startTraining') {
                return {
                    job_id: 'mock-job-1',
                    status: 'succeeded',
                    model_id: 'mock-model-1',
                    metrics: {accuracy: 0.875}
                };
            }
            if (command.method === 'aiquest.getTrainingStatus') {
                return {status: 'succeeded', metrics: {accuracy: 0.875}};
            }
            if (command.method === 'aiquest.selectModel') {
                return {
                    model_id: 'model-shared',
                    scope: {type: 'classSession', id: 'class-a'},
                    status: 'selected'
                };
            }
            if (command.method === 'aiquest.predictCurrent') {
                return {
                    label: 'obstacle',
                    confidence: 0.91,
                    mode: 'cloud',
                    model_id: 'mock-model-1'
                };
            }
            if (command.method === 'aiquest.exportModel') {
                return {filename: 'ai_quest_model_report.json'};
            }
            return {ok: true};
        }
    };
    const extension = new VSLEEV3Extension({link, sensorCache: new SensorCache()});

    await extension.uploadAIQuestDataset({
        SCOPE: 'project',
        SCOPE_ID: 'project-1'
    });
    await extension.startAIQuestTraining({ACCURACY: 70});
    await extension.refreshAIQuestTrainingStatus();
    await extension.selectAIQuestModel({
        MODEL_ID: 'model-shared',
        SCOPE: 'classSession',
        SCOPE_ID: 'class-a'
    });
    await extension.updateAIQuestPrediction();
    await extension.exportAIQuestModel();

    assert.deepEqual(sent.map(command => command.method), [
        'aiquest.uploadDataset',
        'aiquest.startTraining',
        'aiquest.getTrainingStatus',
        'aiquest.selectModel',
        'aiquest.predictCurrent',
        'aiquest.exportModel'
    ]);
    assert.equal(extension.getAIQuestTrainingStatus(), 'succeeded');
    assert.equal(extension.getAIQuestPrediction(), 'obstacle');
    assert.equal(extension.isAIQuestPrediction({LABEL: 'obstacle'}), true);
    assert.equal(extension.getAIQuestModelAccuracy(), 87.5);
    assert.equal(extension.getAIQuestPredictionMode(), 'cloud');
    assert.equal(extension.getAIQuestPrediction() instanceof Promise, false);
    assert.equal(extension.isAIQuestPrediction({LABEL: 'obstacle'}) instanceof Promise, false);
});

test('SensorCache provides default EV3 state and merges partial updates', () => {
    const sensorCache = new SensorCache({clock: () => 1000});

    assert.equal(sensorCache.get('sensors.S1.color'), 0);
    assert.equal(sensorCache.get('sensors.S2.distance_cm'), 0);
    assert.equal(sensorCache.get('system.battery_pct'), 100);
    assert.equal(sensorCache.updateRate, 0);

    sensorCache.update({sensors: {S1: {color: 4}}});
    sensorCache.update({sensors: {S2: {distance_cm: 18.5}}});

    assert.equal(sensorCache.get('sensors.S1.color'), 4);
    assert.equal(sensorCache.get('sensors.S2.distance_cm'), 18.5);
    assert.equal(sensorCache.get('sensors.S1.reflected'), 0);
    assert.equal(sensorCache.get('system.buttons.center'), false);
});

test('SensorCache normalizes EV3 epoch-second timestamps to milliseconds', () => {
    const sensorCache = new SensorCache({clock: () => 1716387600125});

    sensorCache.update({timestamp: 1716387600.123});

    assert.equal(sensorCache.get('timestamp'), 1716387600123);
});

test('motor command blocks normalize arguments before sending to WeisileLink', async () => {
    const {extension, sent} = makeExtension();

    await extension.motorRunForever({PORT: 'a', SPEED: 125});
    await extension.motorRunTimed({PORT: 'b', SPEED: -125, TIME: 90});
    await extension.motorRunToAbsPos({PORT: 'c', DEGREES: '720', SPEED: 55});
    await extension.motorRunToRelPos({PORT: 'd', DEGREES: '-360', SPEED: 'bad'});
    await extension.motorStop({PORT: 'A'});
    await extension.motorStopAll();
    await extension.motorSetSpeed({PORT: 'B', SPEED: 33});
    await extension.motorSyncRun({PORT_L: 'a', PORT_R: 'b', SPEED: 101, TIME: 61});
    await extension.motorSyncTurn({PORT_L: 'c', PORT_R: 'd', SPEED: 40, TURN: -140});
    await extension.motorResetPosition({PORT: 'C'});
    await extension.motorSetPID({
        PORT: 'd',
        MODE: 'SPEED',
        TERM: 'KP',
        VALUE: 12345
    });

    assert.deepEqual(sent, [
        {method: 'motor.runForever', params: {port: 'A', speed: 100}},
        {method: 'motor.runTimed', params: {port: 'B', speed: -100, time: 60}},
        {method: 'motor.runToAbsPos', params: {port: 'C', degrees: 720, speed: 55}},
        {method: 'motor.runToRelPos', params: {port: 'D', degrees: -360, speed: 0}},
        {method: 'motor.stop', params: {port: 'A'}},
        {method: 'motor.stopAll', params: {}},
        {method: 'motor.runForever', params: {port: 'B', speed: 33}},
        {method: 'motor.syncRun', params: {port_l: 'A', port_r: 'B', speed: 100, time: 60}},
        {method: 'motor.syncTurn', params: {port_l: 'C', port_r: 'D', speed: 40, turn: -100}},
        {method: 'motor.resetPosition', params: {port: 'C'}},
        {
            method: 'motor.setPID',
            params: {port: 'D', mode: 'speed', term: 'kp', value: 10000}
        }
    ]);
});

test('invalid motor ports fail closed without sending commands', async () => {
    const {extension, sent} = makeExtension();

    await extension.motorRunForever({PORT: 'Z', SPEED: 50});

    assert.deepEqual(sent, []);
});

test('motor reporter and boolean blocks synchronously read sensor cache', () => {
    const {extension, sensorCache} = makeExtension();
    sensorCache.update({
        motors: {
            A: {position: 360, speed: 42, running: true},
            B: {position: -90, speed: 0, running: false},
            C: {
                pid: {
                    speed: {kp: 11.3, ki: 0.05, kd: 3.2},
                    position: {kp: 9, ki: 0, kd: 1}
                }
            }
        }
    });

    const position = extension.getMotorPosition({PORT: 'a'});
    const speed = extension.getMotorSpeed({PORT: 'A'});
    const speedKp = extension.getMotorPID({
        PORT: 'c',
        MODE: 'speed',
        TERM: 'kp'
    });
    const positionKd = extension.getMotorPID({
        PORT: 'C',
        MODE: 'POSITION',
        TERM: 'KD'
    });
    const runningA = extension.isMotorRunning({PORT: 'A'});
    const runningB = extension.isMotorRunning({PORT: 'B'});

    assert.equal(position, 360);
    assert.equal(speed, 42);
    assert.equal(speedKp, 11.3);
    assert.equal(positionKd, 1);
    assert.equal(runningA, true);
    assert.equal(runningB, false);
    assert.equal(position instanceof Promise, false);
    assert.equal(speed instanceof Promise, false);
    assert.equal(speedKp instanceof Promise, false);
    assert.equal(positionKd instanceof Promise, false);
    assert.equal(runningA instanceof Promise, false);
});

test('waitMotorStopped polls cache instead of sending network commands', async () => {
    const {extension, sensorCache, sent} = makeExtension();
    sensorCache.update({motors: {A: {running: false}}});

    await extension.waitMotorStopped({PORT: 'A'});

    assert.deepEqual(sent, []);
});

test('sensor reporter and boolean blocks synchronously read sensor cache', () => {
    const {extension, sensorCache, sent} = makeExtension();
    sensorCache.update({
        sensors: {
            S1: {color: 5, reflected: 67, ambient: 12, rgb: [10, 20, 30]},
            S2: {distance_cm: 24.5, distance_inch: 9.65},
            S3: {angle: -45, rate: 7},
            S4: {
                pressed: true,
                distance: 63,
                beacon: {
                    2: {heading: -7, distance: 44}
                },
                remote: {
                    2: {buttons: ['top_left', 'bottom_right']}
                }
            }
        },
        system: {
            battery_pct: 87,
            buttons: {center: true}
        }
    });

    const values = [
        extension.getColorSensorColor({PORT: 'S1'}),
        extension.getColorSensorReflected({PORT: 'S1'}),
        extension.getColorSensorAmbient({PORT: 'S1'}),
        extension.getColorSensorRGB({PORT: 'S1', CHANNEL: 'G'}),
        extension.isColor({PORT: 'S1', COLOR: '5'}),
        extension.getUltrasonicDistance({PORT: 'S2'}),
        extension.getUltrasonicDistanceInch({PORT: 'S2'}),
        extension.isUltrasonicNear({PORT: 'S2', DISTANCE: 30}),
        extension.getGyroAngle({PORT: 'S3'}),
        extension.getGyroRate({PORT: 'S3'}),
        extension.getTouchPressed({PORT: 'S4'}),
        extension.getIRDistance({PORT: 'S4'}),
        extension.getIRBeaconHeading({PORT: 'S4', CHANNEL: '2'}),
        extension.getIRBeaconDistance({PORT: 'S4', CHANNEL: '2'}),
        extension.getIRRemoteButton({PORT: 'S4', CHANNEL: '2'}),
        extension.isBrickButtonPressed({BUTTON: 'center'}),
        extension.getBatteryLevel()
    ];

    assert.deepEqual(values, [
        5,
        67,
        12,
        20,
        true,
        24.5,
        9.65,
        true,
        -45,
        7,
        true,
        63,
        -7,
        44,
        'top_left,bottom_right',
        true,
        87
    ]);
    assert.equal(values.some(value => value instanceof Promise), false);
    assert.deepEqual(sent, []);
});

test('sensor command and wait blocks use validated ports and cache polling', async () => {
    const {extension, sensorCache, sent} = makeExtension();
    sensorCache.update({sensors: {S4: {pressed: true}, S3: {angle: 18}}});

    await extension.resetGyro({PORT: 's3'});
    await extension.resetGyro({PORT: 'z9'});
    await extension.waitTouchPress({PORT: 'S4'});
    sensorCache.update({sensors: {S4: {pressed: false}}});
    await extension.waitTouchRelease({PORT: 'S4'});

    assert.deepEqual(sent, [
        {method: 'gyro.reset', params: {port: 'S3'}}
    ]);
});

test('sound command blocks normalize arguments before sending to WeisileLink', async () => {
    const {extension, sent} = makeExtension();

    await extension.playTone({FREQ: 5, DURATION: 90, VOLUME: 101});
    await extension.playToneAndWait({FREQ: 22000, DURATION: -1, VOLUME: -5});
    await extension.playSoundFile({FILE: 'ready.wav'});
    await extension.playSoundFile({FILE: '../secret.wav'});
    await extension.setVolume({VOLUME: 120});
    await extension.beep();
    await extension.stopSound();

    assert.deepEqual(sent, [
        {method: 'sound.playTone', params: {freq: 20, duration: 60, volume: 100}},
        {method: 'sound.playToneWait', params: {freq: 20000, duration: 0, volume: 0}},
        {method: 'sound.playFile', params: {file: 'ready.wav'}},
        {method: 'sound.setVolume', params: {volume: 100}},
        {method: 'sound.beep', params: {}},
        {method: 'sound.stop', params: {}}
    ]);
});

test('display command blocks normalize arguments before sending to WeisileLink', async () => {
    const {extension, sent} = makeExtension();

    await extension.displayText({TEXT: 'Hello', LINE: 10});
    await extension.displayNumber({NUMBER: 123.5, LINE: -1});
    await extension.displayClear();
    await extension.displayImage({IMAGE: 'smile.png'});
    await extension.displayImage({IMAGE: 'bad/path.png'});
    await extension.displayTextAt({TEXT: 'XY', X: -9, Y: 300});
    await extension.drawLine({X1: -1, Y1: 200, X2: 999, Y2: -5});
    await extension.drawCircle({X: 90, Y: 64, R: 400});
    await extension.displayUpdate();

    assert.deepEqual(sent, [
        {method: 'display.text', params: {text: 'Hello', line: 8}},
        {method: 'display.number', params: {number: 123.5, line: 1}},
        {method: 'display.clear', params: {}},
        {method: 'display.image', params: {image: 'smile.png'}},
        {method: 'display.textAt', params: {text: 'XY', x: 0, y: 127}},
        {method: 'display.drawLine', params: {x1: 0, y1: 127, x2: 177, y2: 0}},
        {method: 'display.drawCircle', params: {x: 90, y: 64, r: 127}},
        {method: 'display.update', params: {}}
    ]);
});

test('system blocks use cache for reporters and normalize commands', async () => {
    const {extension, sent, sensorCache} = makeExtension();
    sensorCache.update({
        system: {
            battery_v: 7.82,
            collected_points: 12,
            collecting: true
        }
    });

    await extension.setStatusLight({COLOR: 'green'});
    await extension.setStatusLight({COLOR: 'purple'});
    await extension.statusLightOff();
    await extension.waitMilliseconds({MS: -20});
    await extension.waitMilliseconds({MS: 1});
    await extension.stopAllEV3();

    assert.equal(extension.isConnected(), true);
    assert.equal(extension.getBatteryVoltage(), 7.82);
    assert.deepEqual(sent, [
        {method: 'system.setStatusLight', params: {color: 'green'}},
        {method: 'system.statusLightOff', params: {}},
        {method: 'system.stopAll', params: {}}
    ]);
});

test('data collection blocks normalize commands and keep reporters synchronous', async () => {
    const {extension, sent, sensorCache} = makeExtension();
    sensorCache.update({system: {collected_points: 7}});

    await extension.startDataCollection({LABEL: 'safe'});
    await extension.startDataCollection({LABEL: 'x'.repeat(65)});
    await extension.stopDataCollection();
    await extension.addDataPoint({LABEL: 'turn'});
    await extension.uploadToTrainer();
    await extension.clearCollectedData();
    const csv = await extension.exportDataCSV();
    await extension.startAutoCollect({INTERVAL: 5, LABEL: 'auto'});

    assert.equal(extension.getDataCount(), 7);
    assert.equal(extension.getDataCount() instanceof Promise, false);
    assert.deepEqual(sent, [
        {method: 'data.startCollect', params: {label: 'safe'}},
        {method: 'data.stopCollect', params: {}},
        {method: 'data.addPoint', params: {label: 'turn'}},
        {method: 'data.uploadToTrainer', params: {}},
        {method: 'data.clear', params: {}},
        {method: 'data.exportCSV', params: {}},
        {method: 'data.startAutoCollect', params: {interval_ms: 20, label: 'auto'}}
    ]);
    assert.deepEqual(csv, {ok: true});
});

test('WeisileLink client sends JSON-RPC 2.0 commands to local Scratch endpoint', async () => {
    let socket;
    class FakeWebSocket {
        static OPEN = 1;

        constructor (url) {
            this.url = url;
            this.readyState = FakeWebSocket.OPEN;
            this.sent = [];
            socket = this;
            setImmediate(() => this.onopen());
        }

        send (raw) {
            this.sent.push(JSON.parse(raw));
            const id = this.sent[0].id;
            setImmediate(() => this.onmessage({
                data: JSON.stringify({
                    jsonrpc: '2.0',
                    id,
                    result: {ok: true}
                })
            }));
        }
    }

    const client = new WeisileLinkClient({WebSocket: FakeWebSocket});
    const result = await client.sendCommand({
        method: 'motor.stopAll',
        params: {}
    });

    assert.equal(socket.url, 'ws://127.0.0.1:20111/scratch/bt');
    assert.deepEqual(socket.sent, [{
        jsonrpc: '2.0',
        id: 'vsle-1',
        method: 'motor.stopAll',
        params: {}
    }]);
    assert.deepEqual(result, {ok: true});
});

test('WeisileLink client stores Scratch Link base64 sensor notifications', async () => {
    let socket;
    class FakeWebSocket {
        static OPEN = 1;

        constructor () {
            this.readyState = FakeWebSocket.OPEN;
            socket = this;
            setImmediate(() => this.onopen());
        }

        send () {}
    }

    const sensorCache = new SensorCache();
    const client = new WeisileLinkClient({
        WebSocket: FakeWebSocket,
        sensorCache
    });
    await client.connect();

    const payload = Buffer.from(JSON.stringify({
        motors: {A: {position: 90, speed: 25, running: true}}
    })).toString('base64');
    socket.onmessage({
        data: JSON.stringify({
            jsonrpc: '2.0',
            method: 'didReceiveMessage',
            params: {
                encoding: 'base64',
                message: payload
            }
        })
    });

    assert.equal(sensorCache.get('motors.A.position'), 90);
    assert.equal(sensorCache.get('motors.A.speed'), 25);
    assert.equal(sensorCache.get('motors.A.running'), true);
});

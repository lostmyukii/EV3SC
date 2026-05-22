const assert = require('node:assert/strict');
const test = require('node:test');

const {
    LEGO_RED,
    MOTOR_BLOCK_OPCODES,
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

test('getInfo exposes exactly the Phase 1 motor blocks in LEGO red', () => {
    const {extension} = makeExtension();
    const info = extension.getInfo();

    assert.equal(info.name, 'VSLE EV3');
    assert.equal(info.color1, LEGO_RED);
    assert.equal(info.blocks.length, 14);
    assert.deepEqual(info.blocks.map(block => block.opcode), MOTOR_BLOCK_OPCODES);
    assert.equal(info.menus.motorPorts.items.length, 4);
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
        {method: 'motor.resetPosition', params: {port: 'C'}}
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
            B: {position: -90, speed: 0, running: false}
        }
    });

    const position = extension.getMotorPosition({PORT: 'a'});
    const speed = extension.getMotorSpeed({PORT: 'A'});
    const runningA = extension.isMotorRunning({PORT: 'A'});
    const runningB = extension.isMotorRunning({PORT: 'B'});

    assert.equal(position, 360);
    assert.equal(speed, 42);
    assert.equal(runningA, true);
    assert.equal(runningB, false);
    assert.equal(position instanceof Promise, false);
    assert.equal(speed instanceof Promise, false);
    assert.equal(runningA instanceof Promise, false);
});

test('waitMotorStopped polls cache instead of sending network commands', async () => {
    const {extension, sensorCache, sent} = makeExtension();
    sensorCache.update({motors: {A: {running: false}}});

    await extension.waitMotorStopped({PORT: 'A'});

    assert.deepEqual(sent, []);
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

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const extensionPath = path.join(__dirname, '..', 'index.js');
const packageJson = require('../package.json');

let lastSocket = null;

class FakeWebSocket {
    static OPEN = 1;

    constructor (url) {
        this.url = url;
        this.readyState = FakeWebSocket.OPEN;
        this.sent = [];
        lastSocket = this;
        setImmediate(() => this.onopen && this.onopen());
    }

    send (raw) {
        const request = JSON.parse(raw);
        this.sent.push(request);
        setImmediate(() => this.onmessage && this.onmessage({
            data: JSON.stringify({
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    ok: true,
                    normalized: request.params
                }
            })
        }));
    }

    emitSensorUpdate (payload) {
        const message = Buffer.from(JSON.stringify(payload)).toString('base64');
        this.onmessage({
            data: JSON.stringify({
                jsonrpc: '2.0',
                method: 'didReceiveMessage',
                params: {
                    encoding: 'base64',
                    message
                }
            })
        });
    }
}

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

const makeDomSentinel = () => new Proxy({}, {
    get (_target, prop) {
        throw new Error(`Unexpected Scratch GUI DOM read: ${String(prop)}`);
    },
    set (_target, prop) {
        throw new Error(`Unexpected Scratch GUI DOM write: ${String(prop)}`);
    }
});

const loadLikeTurboWarp = () => {
    lastSocket = null;
    const Scratch = makeScratch();
    const document = makeDomSentinel();
    const sandbox = {
        Scratch,
        WebSocket: FakeWebSocket,
        Buffer,
        console,
        document,
        window: {document},
        setTimeout,
        clearTimeout,
        setImmediate
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(extensionPath, 'utf8'), sandbox, {
        filename: extensionPath
    });
    assert.equal(Scratch.registered.length, 1);
    return Scratch.registered[0];
};

test('package exposes a dedicated TurboWarp integration test command', () => {
    assert.equal(
        packageJson.scripts['test:integration'],
        'node --test tests/test_turbowarp_integration.js'
    );
});

test('TurboWarp-style URL load registers unsandboxed EV3 blocks without DOM writes', () => {
    const extension = loadLikeTurboWarp();
    const info = extension.getInfo();

    assert.equal(info.id, 'vsleev3');
    assert.equal(info.blocks.length, 62);
    assert.equal(info.showStatusButton, true);
    assert.equal(info.color1, '#E6001F');
});

test('TurboWarp-loaded extension drives motors and reads sensor notifications through WeisileLink', async () => {
    const extension = loadLikeTurboWarp();

    await extension.motorRunTimed({PORT: 'A', SPEED: 50, TIME: 1.5});

    assert.equal(lastSocket.url, 'ws://127.0.0.1:20111/scratch/bt');
    assert.deepEqual(lastSocket.sent[0], {
        jsonrpc: '2.0',
        id: 'vsle-1',
        method: 'motor.runTimed',
        params: {port: 'A', speed: 50, time: 1.5}
    });

    lastSocket.emitSensorUpdate({
        sensors: {
            S1: {color: 3},
            S2: {distance_cm: 22.4},
            S3: {angle: -12},
            S4: {pressed: true}
        }
    });

    assert.equal(extension.getColorSensorColor({PORT: 'S1'}), 3);
    assert.equal(extension.getUltrasonicDistance({PORT: 'S2'}), 22.4);
    assert.equal(extension.getGyroAngle({PORT: 'S3'}), -12);
    assert.equal(extension.getTouchPressed({PORT: 'S4'}), true);
});

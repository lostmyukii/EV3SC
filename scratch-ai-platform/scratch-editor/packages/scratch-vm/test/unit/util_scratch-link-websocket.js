const test = require('tap').test;
const ScratchLinkWebSocket = require('../../src/util/scratch-link-websocket');

const remoteFallbackHost = ['device-manager', 'scratch', 'mit', 'edu'].join('.');

const withEnv = (updates, fn) => {
    const previous = {};
    Object.keys(updates).forEach(key => {
        previous[key] = process.env[key];
        if (typeof updates[key] === 'undefined') {
            delete process.env[key];
        } else {
            process.env[key] = updates[key];
        }
    });
    try {
        fn();
    } finally {
        Object.keys(previous).forEach(key => {
            if (typeof previous[key] === 'undefined') {
                delete process.env[key];
            } else {
                process.env[key] = previous[key];
            }
        });
    }
};

test('getSocketUrls defaults to local Scratch Link only', t => {
    t.same(ScratchLinkWebSocket.getSocketUrls('scratch/bt'), [
        'ws://127.0.0.1:20111/scratch/bt'
    ]);
    t.end();
});

test('getSocketUrls appends remote fallback only when explicitly enabled', t => {
    withEnv({
        SCRATCH_AI_SCRATCH_LINK_REMOTE_FALLBACK_ENABLED: 'true'
    }, () => {
        t.same(ScratchLinkWebSocket.getSocketUrls('scratch/bt'), [
            'ws://127.0.0.1:20111/scratch/bt',
            `wss://${remoteFallbackHost}:20110/scratch/bt`,
            `wss://${remoteFallbackHost}:20111/scratch/bt`
        ]);
    });
    t.end();
});

test('open connects to the first Scratch Link candidate which opens', t => {
    const originalWebSocket = global.WebSocket;
    const sockets = [];
    global.WebSocket = class FakeWebSocket {
        constructor (url) {
            this.url = url;
            this.closed = false;
            sockets.push(this);
        }

        close () {
            this.closed = true;
        }
    };
    t.teardown(() => {
        global.WebSocket = originalWebSocket;
    });

    const socket = new ScratchLinkWebSocket('BT');
    let openEvent;
    socket.setOnOpen(event => {
        openEvent = event;
    });
    socket.setOnClose(() => {});
    socket.setOnError(() => {});
    socket.setHandleMessage(() => {});

    socket.open();
    sockets[0].onopen({type: 'open'});

    t.equal(openEvent.type, 'open');
    t.equal(sockets.length, 1);
    t.equal(sockets[0].closed, false);
    t.end();
});

test('open reports error when local Scratch Link construction fails and remote fallback is disabled', t => {
    const originalWebSocket = global.WebSocket;
    const sockets = [];
    global.WebSocket = class FakeWebSocket {
        constructor (url) {
            if (url === 'ws://127.0.0.1:20111/scratch/ble') {
                throw new Error('blocked');
            }
            this.url = url;
            this.closed = false;
            sockets.push(this);
        }

        close () {
            this.closed = true;
        }
    };
    t.teardown(() => {
        global.WebSocket = originalWebSocket;
    });

    const socket = new ScratchLinkWebSocket('BLE');
    let errorEvent;
    socket.setOnOpen(() => {});
    socket.setOnClose(() => {});
    socket.setOnError(event => {
        errorEvent = event;
    });
    socket.setHandleMessage(() => {});

    socket.open();

    t.equal(errorEvent.message, 'blocked');
    t.equal(sockets.length, 0);
    t.end();
});

test('open can try remote fallback after local construction fails when explicitly enabled', t => {
    withEnv({
        SCRATCH_AI_SCRATCH_LINK_REMOTE_FALLBACK_ENABLED: 'true'
    }, () => {
        const originalWebSocket = global.WebSocket;
        const sockets = [];
        global.WebSocket = class FakeWebSocket {
            constructor (url) {
                if (url === 'ws://127.0.0.1:20111/scratch/ble') {
                    throw new Error('blocked');
                }
                this.url = url;
                this.closed = false;
                sockets.push(this);
            }

            close () {
                this.closed = true;
            }
        };
        t.teardown(() => {
            global.WebSocket = originalWebSocket;
        });

        const socket = new ScratchLinkWebSocket('BLE');
        let opened = false;
        socket.setOnOpen(() => {
            opened = true;
        });
        socket.setOnClose(() => {});
        socket.setOnError(() => {});
        socket.setHandleMessage(() => {});

        socket.open();
        sockets[0].onopen({type: 'open'});

        t.equal(opened, true);
        t.equal(sockets[0].url, `wss://${remoteFallbackHost}:20110/scratch/ble`);
        t.equal(sockets[1].closed, true);
    });
    t.end();
});

test('open reports a timeout if Scratch Link candidates do not respond', t => {
    const originalWebSocket = global.WebSocket;
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const sockets = [];
    let timeoutCallback;
    global.WebSocket = class FakeWebSocket {
        constructor (url) {
            this.url = url;
            this.closed = false;
            sockets.push(this);
        }

        close () {
            this.closed = true;
        }
    };
    let timeoutDelay;
    global.setTimeout = (callback, delay) => {
        timeoutCallback = callback;
        timeoutDelay = delay;
        return 1;
    };
    global.clearTimeout = () => {};
    t.teardown(() => {
        global.WebSocket = originalWebSocket;
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
    });

    const socket = new ScratchLinkWebSocket('BT');
    let errorEvent;
    socket.setOnOpen(() => {});
    socket.setOnClose(() => {});
    socket.setOnError(event => {
        errorEvent = event;
    });
    socket.setHandleMessage(() => {});

    socket.open();
    timeoutCallback();

    t.equal(errorEvent.type, 'timeout');
    t.equal(timeoutDelay, 5000);
    t.equal(sockets.length, 1);
    t.equal(sockets[0].closed, false);
    t.end();
});

test('connect timeout is configurable with safe bounds', t => {
    withEnv({
        SCRATCH_AI_SCRATCH_LINK_CONNECT_TIMEOUT_MS: '2500'
    }, () => {
        t.equal(ScratchLinkWebSocket.getConnectTimeoutMs(), 2500);
    });
    withEnv({
        SCRATCH_AI_SCRATCH_LINK_CONNECT_TIMEOUT_MS: '20'
    }, () => {
        t.equal(ScratchLinkWebSocket.getConnectTimeoutMs(), 500);
    });
    withEnv({
        SCRATCH_AI_SCRATCH_LINK_CONNECT_TIMEOUT_MS: '90000'
    }, () => {
        t.equal(ScratchLinkWebSocket.getConnectTimeoutMs(), 30000);
    });
    withEnv({
        SCRATCH_AI_SCRATCH_LINK_CONNECT_TIMEOUT_MS: 'not-a-number'
    }, () => {
        t.equal(ScratchLinkWebSocket.getConnectTimeoutMs(), 5000);
    });
    t.end();
});

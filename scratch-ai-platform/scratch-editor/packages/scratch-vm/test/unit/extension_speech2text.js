const EventEmitter = require('events');
const test = require('tap').test;

test('disabled speech to text extension does not use microphone or websocket', async t => {
    const previousEnabled = process.env.SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED;
    const previousServiceUrl = process.env.SCRATCH_AI_SPEECH_TO_TEXT_WS_URL;
    const previousNavigatorDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
    const previousWebSocket = global.WebSocket;
    const extensionPath = require.resolve('../../src/extensions/scratch3_speech2text/index.js');

    process.env.SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED = 'false';
    process.env.SCRATCH_AI_SPEECH_TO_TEXT_WS_URL = 'wss://example.invalid/speech';
    delete require.cache[extensionPath];

    let getUserMediaCalled = false;
    let webSocketCreated = false;

    Object.defineProperty(global, 'navigator', {
        configurable: true,
        value: {
            mediaDevices: {
                getUserMedia: () => {
                    getUserMediaCalled = true;
                    return Promise.reject(new Error('getUserMedia should not be called'));
                }
            }
        }
    });
    global.WebSocket = function DisabledSpeechWebSocket () {
        webSocketCreated = true;
    };

    const runtime = new EventEmitter();
    runtime.targets = [];
    runtime.emitMicListening = () => {};

    const Speech2Text = require(extensionPath);
    const speech2Text = new Speech2Text(runtime);

    await speech2Text.listenAndWait();

    t.equal(getUserMediaCalled, false);
    t.equal(webSocketCreated, false);

    if (typeof previousEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED;
    } else {
        process.env.SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED = previousEnabled;
    }
    if (typeof previousServiceUrl === 'undefined') {
        delete process.env.SCRATCH_AI_SPEECH_TO_TEXT_WS_URL;
    } else {
        process.env.SCRATCH_AI_SPEECH_TO_TEXT_WS_URL = previousServiceUrl;
    }
    if (previousNavigatorDescriptor) {
        Object.defineProperty(global, 'navigator', previousNavigatorDescriptor);
    } else {
        delete global.navigator;
    }
    global.WebSocket = previousWebSocket;
    delete require.cache[extensionPath];
});

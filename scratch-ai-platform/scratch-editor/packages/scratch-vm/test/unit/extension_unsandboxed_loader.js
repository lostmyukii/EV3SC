const test = require('tap').test;

const dispatch = require('../../src/dispatch/central-dispatch');
const ExtensionManager = require('../../src/extension-support/extension-manager');

const VSLE_EV3_EXTENSION_URL = 'http://localhost:8000/vsle-ev3-extension/index.js';

test('VSLE-EV3 URL is registered as an unsandboxed extension URL', t => {
    t.equal(
        ExtensionManager.isUnsandboxedExtensionURL(VSLE_EV3_EXTENSION_URL),
        true
    );
    t.end();
});

test('configured VSLE-EV3 URL is registered as an unsandboxed extension URL', t => {
    const previousUrl = process.env.SCRATCH_AI_VSLE_EV3_EXTENSION_URL;
    const deployedUrl = 'http://101.42.92.6:18612/vsle-ev3-extension/index.js';
    process.env.SCRATCH_AI_VSLE_EV3_EXTENSION_URL = deployedUrl;

    t.equal(
        ExtensionManager.isUnsandboxedExtensionURL(deployedUrl),
        true
    );

    if (typeof previousUrl === 'undefined') {
        delete process.env.SCRATCH_AI_VSLE_EV3_EXTENSION_URL;
    } else {
        process.env.SCRATCH_AI_VSLE_EV3_EXTENSION_URL = previousUrl;
    }
    t.end();
});

test('configured VSLE-EV3 URL stays unsandboxed when browser process is absent', t => {
    const extensionManagerPath = require.resolve(
        '../../src/extension-support/extension-manager'
    );
    const previousUrl = process.env.SCRATCH_AI_VSLE_EV3_EXTENSION_URL;
    const previousProcess = global.process;
    const deployedUrl = 'http://127.0.0.1:8000/vsle-ev3-extension/index.js';
    let result = false;

    delete require.cache[extensionManagerPath];
    process.env.SCRATCH_AI_VSLE_EV3_EXTENSION_URL = deployedUrl;
    const ConfiguredExtensionManager = require(
        '../../src/extension-support/extension-manager'
    );

    try {
        global.process = undefined;
        result = ConfiguredExtensionManager.isUnsandboxedExtensionURL(deployedUrl);
    } finally {
        global.process = previousProcess;
        if (typeof previousUrl === 'undefined') {
            delete process.env.SCRATCH_AI_VSLE_EV3_EXTENSION_URL;
        } else {
            process.env.SCRATCH_AI_VSLE_EV3_EXTENSION_URL = previousUrl;
        }
        delete require.cache[extensionManagerPath];
    }

    t.equal(result, true);
    t.end();
});

test('VSLE-EV3 URL loads through the unsandboxed main-thread Scratch API', async t => {
    const previousDocument = global.document;
    const previousScratch = global.Scratch;
    const previousServices = dispatch.services;
    const appendedScripts = [];

    dispatch.services = {};
    dispatch.setServiceSync('runtime', {
        _registerExtensionPrimitives: () => {}
    });

    global.document = {
        createElement: tagName => {
            t.equal(tagName, 'script');
            return {};
        },
        head: {
            appendChild: script => {
                appendedScripts.push(script);
                global.Scratch.extensions.register({
                    getInfo: () => ({
                        id: 'vsleev3',
                        name: 'EV3',
                        blocks: []
                    })
                });
                script.onload();
            }
        }
    };

    const manager = new ExtensionManager({});
    await manager.loadExtensionURL(VSLE_EV3_EXTENSION_URL);

    t.equal(appendedScripts.length, 1);
    t.equal(appendedScripts[0].src, VSLE_EV3_EXTENSION_URL);
    t.equal(global.Scratch.extensions.unsandboxed, true);
    t.equal(global.Scratch.Cast.toString(123), '123');
    t.equal(manager.isExtensionLoaded(VSLE_EV3_EXTENSION_URL), true);
    t.equal(manager.isExtensionLoaded('vsleev3'), true);

    const serviceName = manager._loadedExtensions.get(VSLE_EV3_EXTENSION_URL);
    t.equal(dispatch.services[serviceName].getInfo().name, 'EV3');

    global.document = previousDocument;
    global.Scratch = previousScratch;
    dispatch.services = previousServices;
});

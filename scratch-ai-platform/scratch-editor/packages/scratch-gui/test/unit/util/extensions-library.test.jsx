const GLOBAL_FLAG_NAMES = [
    '__SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED__',
    '__SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED__'
];

const clearGlobalFlags = () => {
    for (const flagName of GLOBAL_FLAG_NAMES) {
        delete global[flagName];
    }
};

const readExtensionIds = () => {
    jest.resetModules();
    const extensionLibrary = require('../../../src/lib/libraries/extensions/index.jsx').default;
    return extensionLibrary.map(extension => extension.extensionId);
};

const readExtension = extensionId => {
    jest.resetModules();
    const extensionLibrary = require('../../../src/lib/libraries/extensions/index.jsx').default;
    return extensionLibrary.find(extension => extension.extensionId === extensionId);
};

describe('extensions library', () => {
    beforeEach(clearGlobalFlags);
    afterEach(clearGlobalFlags);

    test('hides external Scratch service extensions by default', () => {
        const extensionIds = readExtensionIds();

        expect(extensionIds).not.toContain('text2speech');
        expect(extensionIds).not.toContain('translate');
    });

    test('shows external Scratch service extensions when explicitly enabled', () => {
        global.__SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED__ = 'true';
        global.__SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED__ = 'true';

        const extensionIds = readExtensionIds();

        expect(extensionIds).toContain('text2speech');
        expect(extensionIds).toContain('translate');
    });

    test('routes the EV3 card to the VSLE-EV3 unsandboxed extension URL', () => {
        const ev3Extension = readExtension('ev3');

        expect(ev3Extension).toEqual(expect.objectContaining({
            extensionId: 'ev3',
            loadedExtensionId: 'vsleev3',
            name: 'EV3',
            extensionURL: 'http://localhost:8000/vsle-ev3-extension/index.js',
            featured: true,
            disabled: false
        }));
        expect(ev3Extension.iconURL).toBeTruthy();
        expect(ev3Extension.insetIconURL).toBeTruthy();
    });
});

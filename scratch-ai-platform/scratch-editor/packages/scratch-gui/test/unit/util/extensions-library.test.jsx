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
});

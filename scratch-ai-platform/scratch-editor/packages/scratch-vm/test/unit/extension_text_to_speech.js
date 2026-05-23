const test = require('tap').test;
const {setFetch} = require('../../src/util/fetch-with-timeout');
const TextToSpeech = require('../../src/extensions/scratch3_text2speech/index.js');

const fakeStage = {
    textToSpeechLanguage: null
};

const fakeRuntime = {
    getTargetForStage: () => fakeStage,
    on: () => {} // Stub out listener methods used in constructor.
};

const ext = new TextToSpeech(fakeRuntime);

test('if no language is saved in the project, use default', t => {
    t.equal(ext.getCurrentLanguage(), 'en');
    t.end();
});

test('if an unsupported language is dropped onto the set language block, use default', t => {
    ext.setLanguage({LANGUAGE: 'nope'});
    t.equal(ext.getCurrentLanguage(), 'en');
    t.end();
});

test('if a supported language name is dropped onto the set language block, use it', t => {
    ext.setLanguage({LANGUAGE: 'español'});
    t.equal(ext.getCurrentLanguage(), 'es');
    t.end();
});

test('get the extension locale for a supported locale that differs', t => {
    ext.setLanguage({LANGUAGE: 'ja-hira'});
    t.equal(ext.getCurrentLanguage(), 'ja');
    t.end();
});

test('use localized spoken language name in place of localized written language name', t => {
    ext.getEditorLanguage = () => 'es';
    const languageMenu = ext.getLanguageMenu();
    const localizedNameForChineseInSpanish = languageMenu.find(el => el.value === 'zh-cn').text;
    t.equal(localizedNameForChineseInSpanish, 'Chino (mandarín)'); // i.e. should not be 'Chino (simplificado)'
    t.end();
});

test('disabled extension does not call speech synthesis service', async t => {
    const previousEnabled = process.env.SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED;
    const previousServiceUrl = process.env.SCRATCH_AI_TEXT_TO_SPEECH_SERVICE_URL;
    const extensionPath = require.resolve('../../src/extensions/scratch3_text2speech/index.js');

    process.env.SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED = 'false';
    process.env.SCRATCH_AI_TEXT_TO_SPEECH_SERVICE_URL = 'https://example.invalid/speech';
    delete require.cache[extensionPath];

    const DisabledTextToSpeech = require(extensionPath);
    const disabledExtension = new DisabledTextToSpeech(fakeRuntime);

    setFetch(() => {
        t.fail('speech synthesis fetch should not be called when extension is disabled');
        return Promise.reject(new Error('fetch should not be called'));
    });

    await disabledExtension.speakAndWait({WORDS: 'hello'}, {});

    setFetch(global.fetch);
    if (typeof previousEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED;
    } else {
        process.env.SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED = previousEnabled;
    }
    if (typeof previousServiceUrl === 'undefined') {
        delete process.env.SCRATCH_AI_TEXT_TO_SPEECH_SERVICE_URL;
    } else {
        process.env.SCRATCH_AI_TEXT_TO_SPEECH_SERVICE_URL = previousServiceUrl;
    }
    delete require.cache[extensionPath];

    t.pass('disabled text to speech resolved without fetching');
});

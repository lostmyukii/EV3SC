const test = require('tap').test;
const {setFetch} = require('../../src/util/fetch-with-timeout');

test('disabled translate extension does not fetch or return the source text', async t => {
    const previousEnabled = process.env.SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED;
    const previousServiceUrl = process.env.SCRATCH_AI_TRANSLATE_SERVICE_URL;
    const extensionPath = require.resolve('../../src/extensions/scratch3_translate/index.js');

    process.env.SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED = 'false';
    process.env.SCRATCH_AI_TRANSLATE_SERVICE_URL = 'https://example.invalid/translate/';
    delete require.cache[extensionPath];

    const Translate = require(extensionPath);
    const translate = new Translate();

    setFetch(() => {
        t.fail('translate fetch should not be called when extension is disabled');
        return Promise.reject(new Error('fetch should not be called'));
    });

    const result = await translate.getTranslate({
        WORDS: 'hello',
        LANGUAGE: 'es'
    });

    t.equal(result, '');
    t.not(result, 'hello');

    setFetch(global.fetch);
    if (typeof previousEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED;
    } else {
        process.env.SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED = previousEnabled;
    }
    if (typeof previousServiceUrl === 'undefined') {
        delete process.env.SCRATCH_AI_TRANSLATE_SERVICE_URL;
    } else {
        process.env.SCRATCH_AI_TRANSLATE_SERVICE_URL = previousServiceUrl;
    }
    delete require.cache[extensionPath];
});

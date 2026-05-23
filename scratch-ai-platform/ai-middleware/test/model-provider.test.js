import assert from 'node:assert/strict';
import test from 'node:test';

import {createMiddlewareConfig} from '../src/config.js';
import {
    MODEL_PROVIDER_IDS,
    createConfiguredModelProvider,
    describeModelProvider
} from '../src/model-provider.js';

test('creates a Moonshot model provider behind the generic interface', async () => {
    let capturedRequest = null;
    const provider = createConfiguredModelProvider({
        config: createMiddlewareConfig({
            AI_MODEL_ENABLED: 'true',
            MOONSHOT_API_KEY: 'test-key',
            MOONSHOT_MODEL: 'moonshot-test-model'
        }),
        fetchImpl: async (url, options) => {
            capturedRequest = {
                url,
                body: JSON.parse(options.body)
            };
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: {
                            content: 'What might you test first?'
                        }
                    }]
                })
            };
        }
    });

    const responseJson = await provider.createChatCompletion({
        messages: [{role: 'user', content: 'Help'}],
        maxTokens: 50,
        responseFormat: {
            type: 'json_object'
        },
        temperature: 0.1
    });

    assert.equal(provider.id, MODEL_PROVIDER_IDS.MOONSHOT);
    assert.deepEqual(describeModelProvider(provider), {
        provider: 'moonshot',
        model: 'moonshot-test-model'
    });
    assert.equal(capturedRequest.url, 'https://api.moonshot.cn/v1/chat/completions');
    assert.equal(capturedRequest.body.model, 'moonshot-test-model');
    assert.equal(capturedRequest.body.max_tokens, 50);
    assert.deepEqual(capturedRequest.body.response_format, {
        type: 'json_object'
    });
    assert.equal(provider.readAssistantText(responseJson), 'What might you test first?');
});

test('creates a DeepSeek model provider behind the generic interface', async () => {
    let capturedRequest = null;
    const provider = createConfiguredModelProvider({
        config: createMiddlewareConfig({
            AI_PROVIDER: 'deepseek',
            AI_MODEL_ENABLED: 'true',
            DEEPSEEK_API_KEY: 'test-key',
            DEEPSEEK_MODEL: 'deepseek-test-model'
        }),
        fetchImpl: async (url, options) => {
            capturedRequest = {
                url,
                body: JSON.parse(options.body)
            };
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: {
                            content: 'What happens after the green flag?'
                        }
                    }]
                })
            };
        }
    });

    const responseJson = await provider.createChatCompletion({
        messages: [{role: 'user', content: 'Help'}],
        maxTokens: 50,
        responseFormat: {
            type: 'json_object'
        },
        temperature: 0.1
    });

    assert.equal(provider.id, MODEL_PROVIDER_IDS.DEEPSEEK);
    assert.deepEqual(describeModelProvider(provider), {
        provider: 'deepseek',
        model: 'deepseek-test-model'
    });
    assert.equal(capturedRequest.url, 'https://api.deepseek.com/chat/completions');
    assert.equal(capturedRequest.body.model, 'deepseek-test-model');
    assert.equal(capturedRequest.body.max_tokens, 50);
    assert.deepEqual(capturedRequest.body.response_format, {
        type: 'json_object'
    });
    assert.equal(provider.readAssistantText(responseJson), 'What happens after the green flag?');
});

test('returns a non-calling provider for unsupported provider ids', async () => {
    const provider = createConfiguredModelProvider({
        config: createMiddlewareConfig({
            AI_PROVIDER: 'unknown',
            AI_MODEL_ENABLED: 'true'
        })
    });

    assert.deepEqual(describeModelProvider(provider), {
        provider: 'unknown',
        model: ''
    });
    await assert.rejects(
        provider.createChatCompletion({messages: [{role: 'user', content: 'Help'}]}),
        /Unsupported model provider: unknown/
    );
});

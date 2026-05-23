import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildDeepSeekChatUrl,
    createDeepSeekChatCompletion,
    readAssistantText
} from '../src/deepseek-client.js';

test('builds the official DeepSeek chat completions URL from a base URL', () => {
    assert.equal(
        buildDeepSeekChatUrl('https://api.deepseek.com/'),
        'https://api.deepseek.com/chat/completions'
    );
});

test('sends DeepSeek authorization header without returning the key', async () => {
    let capturedRequest = null;
    const fetchImpl = async (url, options) => {
        capturedRequest = {url, options};
        return {
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: 'What should happen first?'
                    }
                }]
            })
        };
    };

    const responseJson = await createDeepSeekChatCompletion({
        apiKey: 'secret-test-key',
        baseUrl: 'https://api.deepseek.com',
        fetchImpl,
        messages: [{role: 'user', content: 'Help'}],
        model: 'deepseek-chat'
    });

    assert.equal(capturedRequest.url, 'https://api.deepseek.com/chat/completions');
    assert.equal(capturedRequest.options.headers.Authorization, 'Bearer secret-test-key');
    assert.equal(readAssistantText(responseJson), 'What should happen first?');
    assert.equal(JSON.stringify(responseJson).includes('secret-test-key'), false);
});

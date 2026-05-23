import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildMoonshotChatUrl,
    createMoonshotChatCompletion,
    readAssistantText
} from '../src/moonshot-client.js';

test('builds the official chat completions URL from a base URL', () => {
    assert.equal(
        buildMoonshotChatUrl('https://api.moonshot.cn/v1/'),
        'https://api.moonshot.cn/v1/chat/completions'
    );
});

test('sends authorization header without logging or returning the key', async () => {
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

    const responseJson = await createMoonshotChatCompletion({
        apiKey: 'secret-test-key',
        baseUrl: 'https://api.moonshot.cn/v1',
        fetchImpl,
        messages: [{role: 'user', content: 'Help'}],
        model: 'moonshot-v1-8k'
    });

    assert.equal(capturedRequest.url, 'https://api.moonshot.cn/v1/chat/completions');
    assert.equal(capturedRequest.options.headers.Authorization, 'Bearer secret-test-key');
    assert.equal(readAssistantText(responseJson), 'What should happen first?');
    assert.equal(JSON.stringify(responseJson).includes('secret-test-key'), false);
});

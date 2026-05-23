const CHAT_COMPLETIONS_PATH = '/chat/completions';
const DEEPSEEK_PROVIDER_ID = 'deepseek';

const buildDeepSeekChatUrl = baseUrl => `${String(baseUrl).replace(/\/+$/, '')}${CHAT_COMPLETIONS_PATH}`;

const readAssistantText = responseJson => {
    const choices = responseJson && Array.isArray(responseJson.choices) ? responseJson.choices : [];
    const firstChoice = choices[0] || {};
    const message = firstChoice.message || {};
    return typeof message.content === 'string' ? message.content : '';
};

const createDeepSeekChatCompletion = async ({
    apiKey,
    baseUrl,
    fetchImpl = globalThis.fetch,
    maxTokens = 500,
    messages,
    model,
    responseFormat,
    temperature = 0.2
}) => {
    if (!apiKey) {
        throw new Error('DeepSeek API key is not configured');
    }
    if (typeof fetchImpl !== 'function') {
        throw new Error('A fetch implementation is required');
    }
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('At least one chat message is required');
    }

    const body = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens
    };
    if (responseFormat && typeof responseFormat === 'object') {
        body.response_format = responseFormat;
    }

    const response = await fetchImpl(buildDeepSeekChatUrl(baseUrl), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`DeepSeek request failed with HTTP ${response.status}`);
    }

    return response.json();
};

const createDeepSeekModelProvider = ({
    apiKey,
    baseUrl,
    fetchImpl,
    model
}) => ({
    id: DEEPSEEK_PROVIDER_ID,
    model,
    createChatCompletion: ({messages, maxTokens, responseFormat, temperature}) => createDeepSeekChatCompletion({
        apiKey,
        baseUrl,
        fetchImpl,
        maxTokens,
        messages,
        model,
        responseFormat,
        temperature
    }),
    readAssistantText
});

export {
    DEEPSEEK_PROVIDER_ID,
    buildDeepSeekChatUrl,
    createDeepSeekChatCompletion,
    createDeepSeekModelProvider,
    readAssistantText
};

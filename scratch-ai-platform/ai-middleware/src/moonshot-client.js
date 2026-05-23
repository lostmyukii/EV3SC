const CHAT_COMPLETIONS_PATH = '/chat/completions';
const MOONSHOT_PROVIDER_ID = 'moonshot';

const buildMoonshotChatUrl = baseUrl => `${String(baseUrl).replace(/\/+$/, '')}${CHAT_COMPLETIONS_PATH}`;

const readAssistantText = responseJson => {
    const choices = responseJson && Array.isArray(responseJson.choices) ? responseJson.choices : [];
    const firstChoice = choices[0] || {};
    const message = firstChoice.message || {};
    return typeof message.content === 'string' ? message.content : '';
};

const createMoonshotChatCompletion = async ({
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
        throw new Error('Moonshot API key is not configured');
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

    const response = await fetchImpl(buildMoonshotChatUrl(baseUrl), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`Moonshot request failed with HTTP ${response.status}`);
    }

    return response.json();
};

const createMoonshotModelProvider = ({
    apiKey,
    baseUrl,
    fetchImpl,
    model
}) => ({
    id: MOONSHOT_PROVIDER_ID,
    model,
    createChatCompletion: ({messages, maxTokens, responseFormat, temperature}) => createMoonshotChatCompletion({
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
    MOONSHOT_PROVIDER_ID,
    buildMoonshotChatUrl,
    createMoonshotChatCompletion,
    createMoonshotModelProvider,
    readAssistantText
};

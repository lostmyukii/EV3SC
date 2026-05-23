import {
    MOONSHOT_PROVIDER_ID,
    createMoonshotModelProvider,
    readAssistantText
} from './moonshot-client.js';
import {
    DEEPSEEK_PROVIDER_ID,
    createDeepSeekModelProvider
} from './deepseek-client.js';

const MODEL_PROVIDER_IDS = Object.freeze({
    DEEPSEEK: DEEPSEEK_PROVIDER_ID,
    MOONSHOT: MOONSHOT_PROVIDER_ID
});

const createUnsupportedModelProvider = ({
    model = '',
    provider = 'unknown'
} = {}) => ({
    id: provider,
    model,
    createChatCompletion: async () => {
        throw new Error(`Unsupported model provider: ${provider}`);
    },
    readAssistantText
});

const createConfiguredModelProvider = ({
    config,
    fetchImpl
} = {}) => {
    if (config && config.provider === MODEL_PROVIDER_IDS.MOONSHOT) {
        return createMoonshotModelProvider({
            apiKey: config.moonshot.apiKey,
            baseUrl: config.moonshot.baseUrl,
            fetchImpl,
            model: config.moonshot.model
        });
    }
    if (config && config.provider === MODEL_PROVIDER_IDS.DEEPSEEK) {
        return createDeepSeekModelProvider({
            apiKey: config.deepseek.apiKey,
            baseUrl: config.deepseek.baseUrl,
            fetchImpl,
            model: config.deepseek.model
        });
    }

    return createUnsupportedModelProvider({
        provider: config && config.provider,
        model: ''
    });
};

const describeModelProvider = provider => ({
    provider: provider && provider.id ? provider.id : 'unknown',
    model: provider && provider.model ? provider.model : ''
});

const readModelProviderAssistantText = (provider, responseJson) => {
    if (provider && typeof provider.readAssistantText === 'function') {
        return provider.readAssistantText(responseJson);
    }
    return readAssistantText(responseJson);
};

export {
    MODEL_PROVIDER_IDS,
    createConfiguredModelProvider,
    createUnsupportedModelProvider,
    describeModelProvider,
    readModelProviderAssistantText
};

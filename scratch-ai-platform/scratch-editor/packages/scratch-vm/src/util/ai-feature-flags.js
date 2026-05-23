/* global process, __SCRATCH_AI_ENABLED__, __SCRATCH_AI_EXTENSION_ENABLED__ */
/* global __SCRATCH_AI_VOICE_BLOCKS_ENABLED__, __SCRATCH_AI_ONE_LINE_PROJECT_ENABLED__ */
/* global __SCRATCH_AI_ADDITION_TEMPLATE_ENABLED__ */
/* global __SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED__, __SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED__ */
/* global __SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED__ */
/* global __SCRATCH_AI_SCRATCH_LINK_REMOTE_FALLBACK_ENABLED__ */

const parseBooleanFlag = (value, defaultValue = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string' || value.length === 0) return defaultValue;

    switch (value.toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
        return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
        return false;
    default:
        return defaultValue;
    }
};

const readEnvFlag = (name, defaultValue = false) => {
    if (name === 'SCRATCH_AI_ENABLED') {
        if (typeof __SCRATCH_AI_ENABLED__ !== 'undefined') {
            return parseBooleanFlag(__SCRATCH_AI_ENABLED__, defaultValue);
        }
    }
    if (name === 'SCRATCH_AI_EXTENSION_ENABLED') {
        if (typeof __SCRATCH_AI_EXTENSION_ENABLED__ !== 'undefined') {
            return parseBooleanFlag(__SCRATCH_AI_EXTENSION_ENABLED__, defaultValue);
        }
    }
    if (name === 'SCRATCH_AI_VOICE_BLOCKS_ENABLED') {
        if (typeof __SCRATCH_AI_VOICE_BLOCKS_ENABLED__ !== 'undefined') {
            return parseBooleanFlag(__SCRATCH_AI_VOICE_BLOCKS_ENABLED__, defaultValue);
        }
    }
    if (name === 'SCRATCH_AI_ONE_LINE_PROJECT_ENABLED') {
        if (typeof __SCRATCH_AI_ONE_LINE_PROJECT_ENABLED__ !== 'undefined') {
            return parseBooleanFlag(__SCRATCH_AI_ONE_LINE_PROJECT_ENABLED__, defaultValue);
        }
    }
    if (name === 'SCRATCH_AI_ADDITION_TEMPLATE_ENABLED') {
        if (typeof __SCRATCH_AI_ADDITION_TEMPLATE_ENABLED__ !== 'undefined') {
            return parseBooleanFlag(__SCRATCH_AI_ADDITION_TEMPLATE_ENABLED__, defaultValue);
        }
    }
    if (name === 'SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED') {
        if (typeof __SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED__ !== 'undefined') {
            return parseBooleanFlag(__SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED__, defaultValue);
        }
    }
    if (name === 'SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED') {
        if (typeof __SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED__ !== 'undefined') {
            return parseBooleanFlag(__SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED__, defaultValue);
        }
    }
    if (name === 'SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED') {
        if (typeof __SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED__ !== 'undefined') {
            return parseBooleanFlag(__SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED__, defaultValue);
        }
    }
    if (name === 'SCRATCH_AI_SCRATCH_LINK_REMOTE_FALLBACK_ENABLED') {
        if (typeof __SCRATCH_AI_SCRATCH_LINK_REMOTE_FALLBACK_ENABLED__ !== 'undefined') {
            return parseBooleanFlag(__SCRATCH_AI_SCRATCH_LINK_REMOTE_FALLBACK_ENABLED__, defaultValue);
        }
    }

    if (typeof process === 'undefined' || !process.env) return defaultValue;

    return parseBooleanFlag(process.env[name], defaultValue);
};

const isScratchAIEnabled = () => readEnvFlag('SCRATCH_AI_ENABLED', false);

const isScratchAIExtensionEnabled = () => (
    isScratchAIEnabled() && readEnvFlag('SCRATCH_AI_EXTENSION_ENABLED', false)
);

const isScratchAIVoiceBlocksEnabled = () => (
    isScratchAIEnabled() && readEnvFlag('SCRATCH_AI_VOICE_BLOCKS_ENABLED', false)
);

const isScratchAIOneLineProjectEnabled = () => (
    isScratchAIEnabled() && readEnvFlag('SCRATCH_AI_ONE_LINE_PROJECT_ENABLED', false)
);

const isScratchAIAdditionTemplateEnabled = () => (
    isScratchAIEnabled() && readEnvFlag('SCRATCH_AI_ADDITION_TEMPLATE_ENABLED', false)
);

const isTextToSpeechExtensionEnabled = () => (
    readEnvFlag('SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED', false)
);

const isTranslateExtensionEnabled = () => (
    readEnvFlag('SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED', false)
);

const isSpeechToTextExtensionEnabled = () => (
    readEnvFlag('SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED', false)
);

const isScratchLinkRemoteFallbackEnabled = () => (
    readEnvFlag('SCRATCH_AI_SCRATCH_LINK_REMOTE_FALLBACK_ENABLED', false)
);

module.exports = {
    parseBooleanFlag,
    readEnvFlag,
    isScratchAIEnabled,
    isScratchAIExtensionEnabled,
    isScratchAIAdditionTemplateEnabled,
    isScratchAIOneLineProjectEnabled,
    isScratchAIVoiceBlocksEnabled,
    isScratchLinkRemoteFallbackEnabled,
    isSpeechToTextExtensionEnabled,
    isTextToSpeechExtensionEnabled,
    isTranslateExtensionEnabled
};

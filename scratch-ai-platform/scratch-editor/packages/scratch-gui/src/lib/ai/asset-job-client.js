/* eslint-disable arrow-parens */
import {
    normalizeMiddlewareUrl,
    requestScratchAIJson
} from './socratic-chat-client.js';

const ASSET_IMAGE_JOB_PATH = '/api/v1/assets/image-jobs';
const ASSET_PROMPT_LIMIT = 240;
const ASSET_STYLE_LIMIT = 80;
const ASSET_TYPES = Object.freeze({
    BACKDROP: 'backdrop',
    CHARACTER: 'character'
});

const truncateText = (value, maxLength) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
};

const normalizeAssetType = value => {
    if (value === ASSET_TYPES.BACKDROP) return ASSET_TYPES.BACKDROP;
    return ASSET_TYPES.CHARACTER;
};

const createAssetImageJobUrl = middlewareUrl => `${normalizeMiddlewareUrl(middlewareUrl)}${ASSET_IMAGE_JOB_PATH}`;

const createAssetImageJobPayload = ({
    assetConsent = false,
    prompt,
    style,
    type
} = {}) => ({
    assetConsent: assetConsent === true,
    type: normalizeAssetType(type),
    prompt: truncateText(prompt, ASSET_PROMPT_LIMIT),
    style: truncateText(style, ASSET_STYLE_LIMIT),
    size: {
        width: 480,
        height: 480
    }
});

const requestAssetImageJob = async ({
    fetchImpl = globalThis.fetch,
    middlewareUrl,
    payload,
    signal,
    timeoutMs
} = {}) => requestScratchAIJson({
    fetchImpl,
    failedMessage: 'Scratch AI asset request failed.',
    payload,
    signal,
    timeoutMs,
    unavailableMessage: 'Fetch is unavailable for Scratch AI asset requests.',
    url: createAssetImageJobUrl(middlewareUrl)
});

export {
    ASSET_IMAGE_JOB_PATH,
    ASSET_PROMPT_LIMIT,
    ASSET_TYPES,
    createAssetImageJobPayload,
    createAssetImageJobUrl,
    requestAssetImageJob
};

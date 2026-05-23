import {
    createSocraticChatPayload,
    normalizeMiddlewareUrl,
    requestScratchAIJson
} from './socratic-chat-client.js';

const NL_BLOCKS_SCRIPT_DRAFT_PATH = '/api/v1/nl-blocks/script-draft';
const DEFAULT_NL_BLOCKS_SCRIPT_DRAFT_TIMEOUT_MS = 45000;

const createNlBlocksScriptDraftUrl = middlewareUrl => (
    `${normalizeMiddlewareUrl(middlewareUrl)}${NL_BLOCKS_SCRIPT_DRAFT_PATH}`
);

const createNlBlocksScriptDraftPayload = ({
    evidenceChecklist,
    gateDraft,
    gateReviewed = false,
    modelConsent = false,
    projectSummary,
    studentText,
    teacherPolicy
} = {}) => Object.assign(createSocraticChatPayload({
    evidenceChecklist,
    gateDraft,
    modelConsent,
    projectSummary,
    studentText,
    teacherPolicy
}), {
    explainGateReviewed: gateReviewed === true
});

const requestNlBlocksScriptDraft = async ({
    fetchImpl = globalThis.fetch,
    middlewareUrl,
    payload,
    signal,
    timeoutMs = DEFAULT_NL_BLOCKS_SCRIPT_DRAFT_TIMEOUT_MS
} = {}) => requestScratchAIJson({
    fetchImpl,
    failedMessage: 'Scratch AI NL blocks script draft request failed.',
    payload,
    signal,
    timeoutMs,
    unavailableMessage: 'Fetch is unavailable for Scratch AI NL blocks script draft requests.',
    url: createNlBlocksScriptDraftUrl(middlewareUrl)
});

export {
    DEFAULT_NL_BLOCKS_SCRIPT_DRAFT_TIMEOUT_MS,
    NL_BLOCKS_SCRIPT_DRAFT_PATH,
    createNlBlocksScriptDraftPayload,
    createNlBlocksScriptDraftUrl,
    requestNlBlocksScriptDraft
};

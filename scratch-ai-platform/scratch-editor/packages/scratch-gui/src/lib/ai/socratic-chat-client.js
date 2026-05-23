import {
    createBroadcastLinkPath,
    createPathId
} from './evidence-checklist.js';
import {createTeacherPolicySummary} from './teacher-policy.js';

const DEFAULT_SCRATCH_AI_MIDDLEWARE_URL = 'http://127.0.0.1:8787';
const SOCRATIC_CHAT_PATH = '/api/v1/socratic-chat';
const TEXT_LIMIT = 1200;
const SUMMARY_TEXT_LIMIT = 240;
const LIST_LIMIT = 5;
const DEFAULT_AI_REQUEST_TIMEOUT_MS = 15000;

const SCRATCH_AI_REQUEST_ERROR_CODES = Object.freeze({
    CANCELED: 'SCRATCH_AI_REQUEST_CANCELED',
    FAILED: 'SCRATCH_AI_REQUEST_FAILED',
    TIMEOUT: 'SCRATCH_AI_REQUEST_TIMEOUT',
    UNAVAILABLE: 'SCRATCH_AI_FETCH_UNAVAILABLE'
});

const readNumber = value => (Number.isFinite(value) ? value : 0);

const readArray = value => (Array.isArray(value) ? value : []);

const truncateText = (value, maxLength = TEXT_LIMIT) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
};

const minimizePathId = pathId => {
    const pathValue = truncateText(pathId, SUMMARY_TEXT_LIMIT);
    if (pathValue.indexOf('logicFlow:') === 0) return createPathId('logicFlow', ['selected']);
    return pathValue;
};

const normalizeMiddlewareUrl = value => {
    const trimmedValue = typeof value === 'string' ? value.trim() : '';
    if (trimmedValue === '/') return '';
    return (trimmedValue || DEFAULT_SCRATCH_AI_MIDDLEWARE_URL).replace(/\/+$/, '');
};

const createSocraticChatUrl = middlewareUrl => `${normalizeMiddlewareUrl(middlewareUrl)}${SOCRATIC_CHAT_PATH}`;

const createScratchAIRequestError = (message, code) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

const isAbortError = error => Boolean(error && (
    error.name === 'AbortError' ||
    error.code === SCRATCH_AI_REQUEST_ERROR_CODES.CANCELED ||
    error.code === 'ABORT_ERR' ||
    error.code === 20
));

const isScratchAIRequestCanceledError = error => Boolean(
    error && error.code === SCRATCH_AI_REQUEST_ERROR_CODES.CANCELED
);

const isScratchAIRequestTimeoutError = error => Boolean(
    error && error.code === SCRATCH_AI_REQUEST_ERROR_CODES.TIMEOUT
);

const minimizeGateDraft = gateDraft => ({
    goal: truncateText(gateDraft && gateDraft.goal),
    logic: truncateText(gateDraft && gateDraft.logic),
    evidence: truncateText(gateDraft && gateDraft.evidence)
});

const minimizeEvidenceChecklist = evidenceChecklist => ({
    score: readNumber(evidenceChecklist && evidenceChecklist.score),
    maxScore: readNumber(evidenceChecklist && evidenceChecklist.maxScore),
    passedCount: readNumber(evidenceChecklist && evidenceChecklist.passedCount),
    partialCount: readNumber(evidenceChecklist && evidenceChecklist.partialCount),
    missingCount: readNumber(evidenceChecklist && evidenceChecklist.missingCount),
    items: readArray(evidenceChecklist && evidenceChecklist.items)
        .slice(0, LIST_LIMIT)
        .map(item => ({
            id: truncateText(item && item.id, SUMMARY_TEXT_LIMIT),
            pathId: minimizePathId(item && item.path && item.path.pathId),
            score: readNumber(item && item.score),
            status: truncateText(item && item.status, SUMMARY_TEXT_LIMIT)
        }))
});

const minimizeTrigger = trigger => ({
    opcode: truncateText(trigger && trigger.opcode, SUMMARY_TEXT_LIMIT),
    label: truncateText(trigger && trigger.label, SUMMARY_TEXT_LIMIT),
    detail: truncateText(trigger && trigger.detail, SUMMARY_TEXT_LIMIT)
});

const minimizeBroadcastSends = broadcastSends => readArray(broadcastSends)
    .slice(0, LIST_LIMIT)
    .map(message => ({
        name: truncateText(message && message.name, SUMMARY_TEXT_LIMIT),
        count: readNumber(message && message.count)
    }));

const minimizeLogicFlow = (flow, index) => ({
    pathId: createPathId('logicFlow', [
        `script-${readNumber(flow && flow.scriptIndex) || index + 1}`
    ]),
    targetLabel: flow && flow.isStage ? 'Stage' : 'Sprite',
    scriptIndex: readNumber(flow && flow.scriptIndex),
    trigger: minimizeTrigger(flow && flow.trigger),
    blockCount: readNumber(flow && flow.blockCount),
    broadcastSends: minimizeBroadcastSends(flow && flow.broadcastSends)
});

const minimizeBroadcastLink = link => ({
    name: truncateText(link && link.name, SUMMARY_TEXT_LIMIT),
    pathId: truncateText(createBroadcastLinkPath(link && link.name).pathId, SUMMARY_TEXT_LIMIT),
    sendCount: readArray(link && link.sends).length,
    receiveCount: readArray(link && link.receives).length
});

const minimizeProjectSummary = projectSummary => {
    const logic = projectSummary && projectSummary.logic ? projectSummary.logic : {};
    return {
        targets: {
            total: readNumber(projectSummary && projectSummary.targets && projectSummary.targets.total),
            sprites: readNumber(projectSummary && projectSummary.targets && projectSummary.targets.sprites)
        },
        blocks: {
            visible: readNumber(projectSummary && projectSummary.blocks && projectSummary.blocks.visible),
            scripts: readNumber(projectSummary && projectSummary.blocks && projectSummary.blocks.scripts)
        },
        events: {
            hats: readNumber(projectSummary && projectSummary.events && projectSummary.events.hats)
        },
        broadcasts: {
            sends: readNumber(projectSummary && projectSummary.broadcasts && projectSummary.broadcasts.sends),
            receives: readNumber(projectSummary && projectSummary.broadcasts && projectSummary.broadcasts.receives),
            messageCount: readArray(
                projectSummary && projectSummary.broadcasts && projectSummary.broadcasts.messages
            ).length
        },
        logic: {
            flows: readArray(logic.flows)
                .slice(0, LIST_LIMIT)
                .map(minimizeLogicFlow),
            broadcastLinks: readArray(logic.broadcastLinks)
                .slice(0, LIST_LIMIT)
                .map(minimizeBroadcastLink)
        }
    };
};

const createSocraticChatPayload = ({
    evidenceChecklist,
    gateDraft,
    modelConsent = false,
    projectSummary,
    studentText,
    teacherPolicy
} = {}) => ({
    modelConsent: modelConsent === true,
    studentText: truncateText(studentText),
    gateDraft: minimizeGateDraft(gateDraft),
    evidenceChecklist: minimizeEvidenceChecklist(evidenceChecklist),
    projectSummary: minimizeProjectSummary(projectSummary),
    teacherPolicy: createTeacherPolicySummary({
        teacherPolicy
    })
});

const requestScratchAIJson = async ({
    fetchImpl = globalThis.fetch,
    failedMessage = 'Scratch AI middleware request failed.',
    payload,
    signal,
    timeoutMs = DEFAULT_AI_REQUEST_TIMEOUT_MS,
    unavailableMessage = 'Fetch is unavailable for Scratch AI middleware requests.',
    url
} = {}) => {
    if (typeof fetchImpl !== 'function') {
        throw createScratchAIRequestError(
            unavailableMessage,
            SCRATCH_AI_REQUEST_ERROR_CODES.UNAVAILABLE
        );
    }

    const requestController = typeof AbortController === 'undefined' ?
        null :
        new AbortController();
    let timeoutId = null;
    let didTimeout = false;

    const handleExternalAbort = () => {
        if (requestController) requestController.abort();
    };

    if (signal) {
        if (signal.aborted) {
            throw createScratchAIRequestError(
                'Scratch AI middleware request was canceled.',
                SCRATCH_AI_REQUEST_ERROR_CODES.CANCELED
            );
        }
        if (requestController && typeof signal.addEventListener === 'function') {
            signal.addEventListener('abort', handleExternalAbort, {once: true});
        }
    }

    try {
        const requestSignal = requestController ? requestController.signal : signal;
        const timeoutPromise = timeoutMs > 0 ? new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                didTimeout = true;
                if (requestController) requestController.abort();
                reject(createScratchAIRequestError(
                    'Scratch AI middleware request timed out.',
                    SCRATCH_AI_REQUEST_ERROR_CODES.TIMEOUT
                ));
            }, timeoutMs);
        }) : null;
        const fetchPromise = fetchImpl(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: requestSignal,
            body: JSON.stringify(payload || {})
        });
        const response = await (timeoutPromise ?
            Promise.race([fetchPromise, timeoutPromise]) :
            fetchPromise);

        if (!response || !response.ok) {
            let errorPayload = null;
            if (response && typeof response.json === 'function') {
                try {
                    errorPayload = await response.json();
                } catch (error) {
                    errorPayload = null;
                }
            }
            const requestError = createScratchAIRequestError(
                errorPayload && errorPayload.error ? errorPayload.error : failedMessage,
                errorPayload && errorPayload.code ? errorPayload.code : SCRATCH_AI_REQUEST_ERROR_CODES.FAILED
            );
            if (errorPayload && errorPayload.details) requestError.details = errorPayload.details;
            throw requestError;
        }

        return response.json();
    } catch (error) {
        if (didTimeout || isScratchAIRequestTimeoutError(error)) {
            throw createScratchAIRequestError(
                'Scratch AI middleware request timed out.',
                SCRATCH_AI_REQUEST_ERROR_CODES.TIMEOUT
            );
        }
        if ((signal && signal.aborted) || isAbortError(error)) {
            throw createScratchAIRequestError(
                'Scratch AI middleware request was canceled.',
                SCRATCH_AI_REQUEST_ERROR_CODES.CANCELED
            );
        }
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (
            signal &&
            requestController &&
            typeof signal.removeEventListener === 'function'
        ) {
            signal.removeEventListener('abort', handleExternalAbort);
        }
    }
};

const requestSocraticChat = async ({
    fetchImpl = globalThis.fetch,
    middlewareUrl,
    payload,
    signal,
    timeoutMs
} = {}) => requestScratchAIJson({
    fetchImpl,
    failedMessage: 'Scratch AI middleware request failed.',
    payload,
    signal,
    timeoutMs,
    unavailableMessage: 'Fetch is unavailable for Scratch AI middleware requests.',
    url: createSocraticChatUrl(middlewareUrl)
});

const isScratchAIRequestCanceled = isScratchAIRequestCanceledError;
const isScratchAIRequestTimeout = isScratchAIRequestTimeoutError;

export {
    DEFAULT_SCRATCH_AI_MIDDLEWARE_URL,
    DEFAULT_AI_REQUEST_TIMEOUT_MS,
    SCRATCH_AI_REQUEST_ERROR_CODES,
    SOCRATIC_CHAT_PATH,
    createSocraticChatPayload,
    createSocraticChatUrl,
    isScratchAIRequestCanceled,
    isScratchAIRequestTimeout,
    normalizeMiddlewareUrl,
    requestScratchAIJson,
    requestSocraticChat
};

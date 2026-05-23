/* eslint-disable arrow-parens */
import {normalizeMiddlewareUrl} from './socratic-chat-client.js';
import {createAssetAdoptionSummary} from './asset-adoption.js';

const RELEASE_AUDIT_PATH = '/api/v1/release/audit';
const RELEASE_AUDIT_LIFECYCLE_PATH = '/api/v1/release/audit-lifecycle';
const RELEASE_ADMIN_SUMMARY_PATH = '/api/v1/release/admin-summary';
const RELEASE_RESEARCH_DATASET_PATH = '/api/v1/release/research-dataset';
const RELEASE_AUDIT_TEXT_LIMIT = 360;
const RELEASE_AUDIT_SUMMARY_TEXT_LIMIT = 120;
const RELEASE_AUDIT_FLOW_LIMIT = 5;

const RELEASE_LOG_TYPES = Object.freeze({
    MODEL_QUESTION_SENT: 'model-question-sent',
    MODEL_REPLY_RECEIVED: 'model-reply-received',
    MODEL_REQUEST_BLOCKED: 'model-request-blocked',
    ASSET_JOB_SENT: 'asset-job-sent',
    ASSET_JOB_RECEIVED: 'asset-job-received',
    ASSET_JOB_BLOCKED: 'asset-job-blocked',
    ASSET_IMPORTED_TO_COSTUME_EDITOR: 'asset-imported-to-costume-editor',
    ASSET_VISUAL_EDIT_RECORDED: 'asset-visual-edit-recorded',
    ASSET_DRAFT_ADOPTED: 'asset-draft-adopted',
    TEACHER_LOCK_RECEIVED: 'teacher-lock-received',
    LESSON_PREP_RECEIVED: 'lesson-prep-received',
    RELEASE_HTML_EXPORTED: 'release-html-exported'
});

const readArray = value => (Array.isArray(value) ? value : []);

const readNumber = value => (Number.isFinite(value) ? value : 0);

const truncateText = (value, maxLength = RELEASE_AUDIT_TEXT_LIMIT) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
};

const countProcessLogType = (processLog, type) => (
    readArray(processLog).filter(entry => entry && entry.type === type).length
);

const createReleaseAuditUrl = middlewareUrl => `${normalizeMiddlewareUrl(middlewareUrl)}${RELEASE_AUDIT_PATH}`;

const createReleaseAuditLifecycleUrl = middlewareUrl => (
    `${normalizeMiddlewareUrl(middlewareUrl)}${RELEASE_AUDIT_LIFECYCLE_PATH}`
);

const createReleaseAdminSummaryUrl = middlewareUrl => (
    `${normalizeMiddlewareUrl(middlewareUrl)}${RELEASE_ADMIN_SUMMARY_PATH}`
);

const createReleaseResearchDatasetUrl = middlewareUrl => (
    `${normalizeMiddlewareUrl(middlewareUrl)}${RELEASE_RESEARCH_DATASET_PATH}`
);

const createReleaseAuditLogicFlow = (flow, index) => ({
    targetLabel: flow && flow.targetName === 'Stage' ? 'Stage' : 'Sprite',
    scriptIndex: readNumber(flow && flow.scriptIndex) || index + 1,
    triggerLabel: truncateText(flow && flow.triggerLabel, RELEASE_AUDIT_SUMMARY_TEXT_LIMIT),
    blockCount: readNumber(flow && flow.blockCount),
    broadcastCount: readNumber(flow && flow.broadcastCount)
});

const createReleaseAuditPreview = releasePreview => {
    const metrics = releasePreview && releasePreview.metrics ? releasePreview.metrics : {};
    const aiSummary = releasePreview && releasePreview.aiSummary ? releasePreview.aiSummary : {};

    return {
        version: truncateText(releasePreview && releasePreview.version, RELEASE_AUDIT_SUMMARY_TEXT_LIMIT) || '1.1',
        status: truncateText(releasePreview && releasePreview.status, RELEASE_AUDIT_SUMMARY_TEXT_LIMIT),
        productLine: truncateText(releasePreview && releasePreview.productLine),
        userFeedback: truncateText(releasePreview && releasePreview.userFeedback),
        iterationPlan: truncateText(releasePreview && releasePreview.iterationPlan),
        metrics: {
            sprites: readNumber(metrics.sprites),
            starts: readNumber(metrics.starts),
            blocks: readNumber(metrics.blocks),
            checkScore: readNumber(metrics.checkScore),
            checkMaxScore: readNumber(metrics.checkMaxScore)
        },
        logicFlows: readArray(releasePreview && releasePreview.logicFlows)
            .slice(0, RELEASE_AUDIT_FLOW_LIMIT)
            .map(createReleaseAuditLogicFlow),
        aiSummary: {
            questions: readNumber(aiSummary.questions),
            replies: readNumber(aiSummary.replies),
            blocked: readNumber(aiSummary.blocked)
        }
    };
};

const createReleaseProcessSummary = processLog => ({
    totalEntries: readArray(processLog).length,
    modelQuestions: countProcessLogType(processLog, RELEASE_LOG_TYPES.MODEL_QUESTION_SENT),
    modelReplies: countProcessLogType(processLog, RELEASE_LOG_TYPES.MODEL_REPLY_RECEIVED),
    modelBlocks: countProcessLogType(processLog, RELEASE_LOG_TYPES.MODEL_REQUEST_BLOCKED),
    assetRequests: countProcessLogType(processLog, RELEASE_LOG_TYPES.ASSET_JOB_SENT),
    assetReplies: countProcessLogType(processLog, RELEASE_LOG_TYPES.ASSET_JOB_RECEIVED),
    assetBlocks: countProcessLogType(processLog, RELEASE_LOG_TYPES.ASSET_JOB_BLOCKED),
    assetImports: countProcessLogType(processLog, RELEASE_LOG_TYPES.ASSET_IMPORTED_TO_COSTUME_EDITOR),
    assetVisualEdits: countProcessLogType(processLog, RELEASE_LOG_TYPES.ASSET_VISUAL_EDIT_RECORDED),
    assetAdoptions: countProcessLogType(processLog, RELEASE_LOG_TYPES.ASSET_DRAFT_ADOPTED),
    teacherDrafts: countProcessLogType(processLog, RELEASE_LOG_TYPES.TEACHER_LOCK_RECEIVED) +
        countProcessLogType(processLog, RELEASE_LOG_TYPES.LESSON_PREP_RECEIVED),
    releaseExports: countProcessLogType(processLog, RELEASE_LOG_TYPES.RELEASE_HTML_EXPORTED)
});

const createReleaseAssetSummary = (assetReply, assetAdoptionState) => {
    const workerJob = assetReply && assetReply.worker && assetReply.worker.job ? assetReply.worker.job : null;
    const audit = workerJob && workerJob.audit ? workerJob.audit : {};
    const adoptionSummary = createAssetAdoptionSummary({
        adoptionState: assetAdoptionState,
        assetReply
    });

    if (!workerJob) {
        return {
            present: false
        };
    }

    return {
        present: true,
        providerId: truncateText(audit.providerId, RELEASE_AUDIT_SUMMARY_TEXT_LIMIT),
        assetType: truncateText(audit.assetType || workerJob.type, RELEASE_AUDIT_SUMMARY_TEXT_LIMIT),
        generated: audit.generated === true,
        aiGeneratedLabel: audit.aiGeneratedLabel === true,
        humanReviewRequired: audit.humanReviewRequired === true,
        costumeEditorEditsRequired: readNumber(audit.costumeEditorEditsRequired),
        modelWeightsDownloaded: audit.modelWeightsDownloaded === true,
        promptStored: audit.promptStored === true,
        licenseStatus: truncateText(audit.licenseStatus, RELEASE_AUDIT_SUMMARY_TEXT_LIMIT),
        reviewState: truncateText(audit.reviewState, RELEASE_AUDIT_SUMMARY_TEXT_LIMIT),
        adopted: adoptionSummary.adopted === true,
        importedToCostumeEditor: adoptionSummary.imported === true,
        visualEditCount: readNumber(adoptionSummary.visualEditCount)
    };
};

const createReleaseGateSummary = releaseGate => ({
    allowed: releaseGate && releaseGate.allowed === true,
    reasons: readArray(releaseGate && releaseGate.reasons).slice(0, 8),
    checklist: readArray(releaseGate && releaseGate.checklist)
        .slice(0, 8)
        .map(item => ({
            id: truncateText(item && item.id, RELEASE_AUDIT_SUMMARY_TEXT_LIMIT),
            ready: item && item.ready === true,
            reason: truncateText(item && item.reason, RELEASE_AUDIT_SUMMARY_TEXT_LIMIT)
        })),
    schemaVersion: truncateText(
        releaseGate && releaseGate.schemaVersion,
        RELEASE_AUDIT_SUMMARY_TEXT_LIMIT
    ) || 'scratch-ai-release-gate-v1'
});

const createReleaseAuditPayload = ({
    assetAdoptionState,
    assetReply,
    processLog,
    releaseGate,
    releasePreview
} = {}) => ({
    releaseConsent: true,
    releaseGate: createReleaseGateSummary(releaseGate),
    releasePreview: createReleaseAuditPreview(releasePreview),
    processSummary: createReleaseProcessSummary(processLog),
    assetSummary: createReleaseAssetSummary(assetReply, assetAdoptionState)
});

const requestReleaseAudit = async ({
    fetchImpl = globalThis.fetch,
    middlewareUrl,
    payload
} = {}) => {
    if (typeof fetchImpl !== 'function') {
        throw new Error('Fetch is unavailable for Scratch AI release audit requests.');
    }

    const response = await fetchImpl(createReleaseAuditUrl(middlewareUrl), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload || {})
    });

    if (!response || !response.ok) {
        throw new Error('Scratch AI release audit request failed.');
    }

    return response.json();
};

const requestReleaseAuditLifecycle = async ({
    fetchImpl = globalThis.fetch,
    middlewareUrl
} = {}) => {
    if (typeof fetchImpl !== 'function') {
        throw new Error('Fetch is unavailable for Scratch AI release audit lifecycle requests.');
    }

    const response = await fetchImpl(createReleaseAuditLifecycleUrl(middlewareUrl), {
        method: 'GET'
    });

    if (!response || !response.ok) {
        throw new Error('Scratch AI release audit lifecycle request failed.');
    }

    return response.json();
};

const requestReleaseAdminSummary = async ({
    fetchImpl = globalThis.fetch,
    middlewareUrl
} = {}) => {
    if (typeof fetchImpl !== 'function') {
        throw new Error('Fetch is unavailable for Scratch AI release admin summary requests.');
    }

    const response = await fetchImpl(createReleaseAdminSummaryUrl(middlewareUrl), {
        method: 'GET'
    });

    if (!response || !response.ok) {
        throw new Error('Scratch AI release admin summary request failed.');
    }

    return response.json();
};

const requestReleaseResearchDataset = async ({
    fetchImpl = globalThis.fetch,
    middlewareUrl
} = {}) => {
    if (typeof fetchImpl !== 'function') {
        throw new Error('Fetch is unavailable for Scratch AI research dataset requests.');
    }

    const response = await fetchImpl(createReleaseResearchDatasetUrl(middlewareUrl), {
        method: 'GET'
    });

    if (!response || !response.ok) {
        throw new Error('Scratch AI research dataset request failed.');
    }

    return response.json();
};

export {
    RELEASE_ADMIN_SUMMARY_PATH,
    RELEASE_AUDIT_LIFECYCLE_PATH,
    RELEASE_AUDIT_PATH,
    RELEASE_LOG_TYPES,
    RELEASE_RESEARCH_DATASET_PATH,
    createReleaseAssetSummary,
    createReleaseAuditPayload,
    createReleaseAuditLifecycleUrl,
    createReleaseAuditPreview,
    createReleaseAuditUrl,
    createReleaseAdminSummaryUrl,
    createReleaseGateSummary,
    createReleaseProcessSummary,
    createReleaseResearchDatasetUrl,
    requestReleaseAdminSummary,
    requestReleaseAudit,
    requestReleaseAuditLifecycle,
    requestReleaseResearchDataset
};

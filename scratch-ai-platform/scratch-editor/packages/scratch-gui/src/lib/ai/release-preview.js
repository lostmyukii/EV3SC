const PREVIEW_LIMIT = 3;

const RELEASE_PREVIEW_STATUS = Object.freeze({
    DRAFTING: 'drafting',
    READY: 'ready'
});

const LOG_TYPES = Object.freeze({
    MODEL_QUESTION_SENT: 'model-question-sent',
    MODEL_REPLY_RECEIVED: 'model-reply-received',
    MODEL_REQUEST_BLOCKED: 'model-request-blocked'
});

const readArray = value => (Array.isArray(value) ? value : []);

const readNumber = value => (Number.isFinite(value) ? value : 0);

const trimText = value => (typeof value === 'string' ? value.trim() : '');

const readLogic = projectSummary => (
    projectSummary && projectSummary.logic ? projectSummary.logic : {}
);

const readTriggerLabel = flow => {
    const trigger = flow && flow.trigger ? flow.trigger : {};
    return trimText(trigger.label) || 'start';
};

const createPreviewMetrics = ({
    projectSummary,
    releaseDraftSummary
}) => ({
    sprites: readNumber(releaseDraftSummary && releaseDraftSummary.spriteCount),
    starts: readNumber(releaseDraftSummary && releaseDraftSummary.startCount),
    blocks: readNumber(projectSummary && projectSummary.blocks && projectSummary.blocks.visible),
    checkScore: readNumber(releaseDraftSummary && releaseDraftSummary.checkScore),
    checkMaxScore: readNumber(releaseDraftSummary && releaseDraftSummary.checkMaxScore)
});

const createPreviewLogicFlows = projectSummary => {
    const logic = readLogic(projectSummary);
    return readArray(logic.flows)
        .slice(0, PREVIEW_LIMIT)
        .map((flow, index) => ({
            blockCount: readNumber(flow && flow.blockCount),
            broadcastCount: readArray(flow && flow.broadcastSends)
                .reduce((total, message) => total + readNumber(message && message.count), 0),
            id: trimText(flow && flow.id) || `flow-${index + 1}`,
            scriptIndex: readNumber(flow && flow.scriptIndex) || index + 1,
            targetName: trimText(flow && flow.targetName) || 'Sprite',
            triggerLabel: readTriggerLabel(flow)
        }));
};

const countProcessLogType = (processLog, type) => (
    readArray(processLog).filter(entry => entry && entry.type === type).length
);

const createPreviewAISummary = processLog => ({
    blocked: countProcessLogType(processLog, LOG_TYPES.MODEL_REQUEST_BLOCKED),
    questions: countProcessLogType(processLog, LOG_TYPES.MODEL_QUESTION_SENT),
    replies: countProcessLogType(processLog, LOG_TYPES.MODEL_REPLY_RECEIVED)
});

const createReleasePreview = ({
    processLog,
    projectSummary,
    releaseDraftSummary
} = {}) => ({
    aiSummary: createPreviewAISummary(processLog),
    iterationPlan: trimText(releaseDraftSummary && releaseDraftSummary.iterationPlan),
    logicFlows: createPreviewLogicFlows(projectSummary),
    metrics: createPreviewMetrics({
        projectSummary,
        releaseDraftSummary
    }),
    productLine: trimText(releaseDraftSummary && releaseDraftSummary.productLine),
    status: releaseDraftSummary && releaseDraftSummary.status === RELEASE_PREVIEW_STATUS.READY ?
        RELEASE_PREVIEW_STATUS.READY :
        RELEASE_PREVIEW_STATUS.DRAFTING,
    userFeedback: trimText(releaseDraftSummary && releaseDraftSummary.userFeedback),
    version: trimText(releaseDraftSummary && releaseDraftSummary.version) || '1.1'
});

export {
    LOG_TYPES,
    RELEASE_PREVIEW_STATUS,
    createReleasePreview
};

const RELEASE_DRAFT_FIELDS = Object.freeze({
    PRODUCT_LINE: 'productLine',
    USER_FEEDBACK: 'userFeedback',
    ITERATION_PLAN: 'iterationPlan'
});

const RELEASE_DRAFT_STATUSES = Object.freeze({
    DRAFTING: 'drafting',
    READY: 'ready'
});

const createEmptyReleaseDraft = () => ({
    productLine: '',
    userFeedback: '',
    iterationPlan: ''
});

const isTextComplete = value => typeof value === 'string' && value.trim().length > 0;

const isReleaseDraftReady = releaseDraft => (
    isTextComplete(releaseDraft && releaseDraft.productLine) &&
    isTextComplete(releaseDraft && releaseDraft.userFeedback) &&
    isTextComplete(releaseDraft && releaseDraft.iterationPlan)
);

const getReleaseDraftStatus = releaseDraft => (
    isReleaseDraftReady(releaseDraft) ? RELEASE_DRAFT_STATUSES.READY : RELEASE_DRAFT_STATUSES.DRAFTING
);

const createReleaseDraftSummary = ({
    evidenceChecklist,
    projectSummary,
    releaseDraft
} = {}) => ({
    version: '1.1',
    status: getReleaseDraftStatus(releaseDraft),
    productLine: releaseDraft && releaseDraft.productLine ? releaseDraft.productLine.trim() : '',
    userFeedback: releaseDraft && releaseDraft.userFeedback ? releaseDraft.userFeedback.trim() : '',
    iterationPlan: releaseDraft && releaseDraft.iterationPlan ? releaseDraft.iterationPlan.trim() : '',
    checkScore: evidenceChecklist && Number.isFinite(evidenceChecklist.score) ? evidenceChecklist.score : 0,
    checkMaxScore: evidenceChecklist && Number.isFinite(evidenceChecklist.maxScore) ? evidenceChecklist.maxScore : 0,
    spriteCount: projectSummary && projectSummary.targets && Number.isFinite(projectSummary.targets.sprites) ?
        projectSummary.targets.sprites :
        0,
    startCount: projectSummary && projectSummary.events && Number.isFinite(projectSummary.events.hats) ?
        projectSummary.events.hats :
        0
});

export {
    RELEASE_DRAFT_FIELDS,
    RELEASE_DRAFT_STATUSES,
    createEmptyReleaseDraft,
    createReleaseDraftSummary,
    getReleaseDraftStatus,
    isReleaseDraftReady
};

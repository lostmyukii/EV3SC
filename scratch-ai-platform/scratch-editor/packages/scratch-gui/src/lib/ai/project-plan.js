import {
    createBroadcastLinkPath,
    createLogicFlowPath
} from './evidence-checklist.js';
import {BLOCK_DRAFT_STATUS} from './block-draft.js';

const PROJECT_PLAN_STATUS = Object.freeze({
    EMPTY: 'empty',
    READY: 'ready'
});

const PROJECT_PLAN_ITEM_STATUSES = Object.freeze({
    DONE: 'done',
    TODO: 'todo'
});

const readText = value => (typeof value === 'string' ? value.trim() : '');

const readArray = value => (Array.isArray(value) ? value : []);

const readLogic = projectSummary => (
    projectSummary && projectSummary.logic ? projectSummary.logic : {}
);

const readFlows = projectSummary => readArray(readLogic(projectSummary).flows);

const readBroadcastLinks = projectSummary => readArray(readLogic(projectSummary).broadcastLinks);

const formatTrigger = flow => {
    const trigger = flow && flow.trigger ? flow.trigger : {};
    if (trigger.label && trigger.detail) return `${trigger.label} (${trigger.detail})`;
    return trigger.label || 'this event';
};

const readDraftFields = gateDraft => ({
    evidence: readText(gateDraft && gateDraft.evidence),
    goal: readText(gateDraft && gateDraft.goal),
    logic: readText(gateDraft && gateDraft.logic)
});

const isFieldDone = value => Boolean(readText(value));

const createPlanItem = ({
    id,
    messageId,
    status,
    values
}) => ({
    id,
    messageId,
    status,
    values: values || {}
});

const createPlanItems = ({
    blockDraft,
    fields,
    flows,
    gateReviewed
}) => [
    createPlanItem({
        id: 'goal',
        messageId: 'gui.aiLogicCoach.projectPlanItem.goal',
        status: isFieldDone(fields.goal) ?
            PROJECT_PLAN_ITEM_STATUSES.DONE :
            PROJECT_PLAN_ITEM_STATUSES.TODO
    }),
    createPlanItem({
        id: 'logic',
        messageId: 'gui.aiLogicCoach.projectPlanItem.logic',
        status: isFieldDone(fields.logic) ?
            PROJECT_PLAN_ITEM_STATUSES.DONE :
            PROJECT_PLAN_ITEM_STATUSES.TODO
    }),
    createPlanItem({
        id: 'evidence',
        messageId: 'gui.aiLogicCoach.projectPlanItem.evidence',
        status: isFieldDone(fields.evidence) ?
            PROJECT_PLAN_ITEM_STATUSES.DONE :
            PROJECT_PLAN_ITEM_STATUSES.TODO
    }),
    createPlanItem({
        id: 'review',
        messageId: 'gui.aiLogicCoach.projectPlanItem.review',
        status: gateReviewed ?
            PROJECT_PLAN_ITEM_STATUSES.DONE :
            PROJECT_PLAN_ITEM_STATUSES.TODO
    }),
    createPlanItem({
        id: 'script',
        messageId: 'gui.aiLogicCoach.projectPlanItem.script',
        status: flows.length ?
            PROJECT_PLAN_ITEM_STATUSES.DONE :
            PROJECT_PLAN_ITEM_STATUSES.TODO,
        values: {
            scripts: flows.length
        }
    }),
    createPlanItem({
        id: 'concepts',
        messageId: 'gui.aiLogicCoach.projectPlanItem.concepts',
        status: blockDraft && blockDraft.status === BLOCK_DRAFT_STATUS.READY ?
            PROJECT_PLAN_ITEM_STATUSES.DONE :
            PROJECT_PLAN_ITEM_STATUSES.TODO,
        values: {
            concepts: blockDraft && blockDraft.values ? blockDraft.values.concepts : 0
        }
    })
];

const createScriptChoices = flows => flows.slice(0, 6).map(flow => ({
    blockCount: flow.blockCount || 0,
    broadcastCount: readArray(flow.broadcastSends).reduce((total, message) => (
        total + (message && message.count ? message.count : 0)
    ), 0),
    entry: formatTrigger(flow),
    id: flow.id,
    path: createLogicFlowPath(flow),
    script: flow.scriptIndex || 1,
    target: flow.targetName || 'Sprite',
    values: {
        blocks: flow.blockCount || 0,
        entry: formatTrigger(flow),
        script: flow.scriptIndex || 1,
        target: flow.targetName || 'Sprite'
    }
}));

const createConceptChoices = blockDraft => {
    if (!blockDraft || blockDraft.status !== BLOCK_DRAFT_STATUS.READY) return [];
    const steps = readArray(blockDraft.steps);
    return readArray(blockDraft.concepts).map(concept => {
        const step = steps.find(candidate => candidate.concept === concept.id) || null;
        return {
            id: concept.id,
            messageId: concept.messageId,
            stepMessageId: step && step.messageId,
            stepValues: step && step.values ? step.values : {}
        };
    });
};

const createMessageLinks = broadcastLinks => broadcastLinks.slice(0, 5).map(link => ({
    id: link.name,
    message: link.name,
    path: createBroadcastLinkPath(link.name),
    receives: readArray(link.receives).length,
    sends: readArray(link.sends).length,
    status: readArray(link.sends).length && readArray(link.receives).length ?
        PROJECT_PLAN_ITEM_STATUSES.DONE :
        PROJECT_PLAN_ITEM_STATUSES.TODO,
    values: {
        message: link.name,
        receives: readArray(link.receives).length,
        sends: readArray(link.sends).length
    }
}));

const hasPlanSignal = ({
    blockDraft,
    fields,
    flows
}) => Boolean(
    fields.goal ||
    fields.logic ||
    fields.evidence ||
    flows.length ||
    (blockDraft && blockDraft.status === BLOCK_DRAFT_STATUS.READY)
);

const createProjectPlan = ({
    blockDraft = null,
    gateDraft = {},
    gateReviewed = false,
    projectSummary = {}
} = {}) => {
    const fields = readDraftFields(gateDraft);
    const flows = readFlows(projectSummary);
    const broadcastLinks = readBroadcastLinks(projectSummary);
    const items = createPlanItems({
        blockDraft,
        fields,
        flows,
        gateReviewed
    });
    const conceptChoices = createConceptChoices(blockDraft);
    const scriptChoices = createScriptChoices(flows);
    const messageLinks = createMessageLinks(broadcastLinks);
    const completedCount = items.filter(item => item.status === PROJECT_PLAN_ITEM_STATUSES.DONE).length;

    if (!hasPlanSignal({
        blockDraft,
        fields,
        flows
    })) {
        return {
            conceptChoices,
            items,
            messageLinks,
            scriptChoices,
            status: PROJECT_PLAN_STATUS.EMPTY,
            values: {
                completed: completedCount,
                concepts: conceptChoices.length,
                messages: messageLinks.length,
                scripts: scriptChoices.length,
                total: items.length
            }
        };
    }

    return {
        conceptChoices,
        items,
        messageLinks,
        scriptChoices,
        status: PROJECT_PLAN_STATUS.READY,
        values: {
            completed: completedCount,
            concepts: conceptChoices.length,
            messages: messageLinks.length,
            scripts: scriptChoices.length,
            total: items.length
        }
    };
};

export {
    PROJECT_PLAN_ITEM_STATUSES,
    PROJECT_PLAN_STATUS,
    createProjectPlan
};

export default createProjectPlan;

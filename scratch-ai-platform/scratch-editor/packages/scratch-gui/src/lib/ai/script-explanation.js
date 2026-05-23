import {createLogicFlowPath} from './evidence-checklist.js';

const SCRIPT_EXPLANATION_STATUS = Object.freeze({
    EMPTY: 'empty',
    READY: 'ready'
});

const readArray = value => (Array.isArray(value) ? value : []);

const readLogic = projectSummary => (
    projectSummary && projectSummary.logic ? projectSummary.logic : {}
);

const readFlows = projectSummary => {
    const logic = readLogic(projectSummary);
    return readArray(logic.flows);
};

const formatTrigger = flow => {
    const trigger = flow && flow.trigger ? flow.trigger : {};
    if (trigger.label && trigger.detail) return `${trigger.label} (${trigger.detail})`;
    return trigger.label || 'this event';
};

const readBroadcastNames = flow => readArray(flow && flow.broadcastSends)
    .map(message => message && message.name)
    .filter(name => typeof name === 'string' && name.trim())
    .slice(0, 3);

const findFlowByPathId = (flows, activePathId) => {
    if (!activePathId) return null;
    return flows.find(flow => createLogicFlowPath(flow).pathId === activePathId) || null;
};

const selectScriptExplanationFlow = ({
    activePathId = '',
    projectSummary = {}
} = {}) => {
    const flows = readFlows(projectSummary);
    const activeFlow = findFlowByPathId(flows, activePathId);
    return activeFlow || flows[0] || null;
};

const createScriptExplanation = ({
    activePathId = '',
    projectSummary = {}
} = {}) => {
    const flow = selectScriptExplanationFlow({
        activePathId,
        projectSummary
    });

    if (!flow) {
        return {
            status: SCRIPT_EXPLANATION_STATUS.EMPTY,
            flow: null,
            path: null,
            broadcastNames: []
        };
    }

    const path = createLogicFlowPath(flow);
    const broadcastNames = readBroadcastNames(flow);

    return {
        status: SCRIPT_EXPLANATION_STATUS.READY,
        flow,
        path,
        broadcastNames,
        hasBroadcasts: broadcastNames.length > 0,
        values: {
            blocks: flow.blockCount || 0,
            entry: formatTrigger(flow),
            messages: broadcastNames.join(', '),
            firstMessage: broadcastNames[0] || '',
            script: flow.scriptIndex || 1,
            target: flow.targetName || 'Sprite'
        }
    };
};

export {
    SCRIPT_EXPLANATION_STATUS,
    createScriptExplanation,
    selectScriptExplanationFlow
};

export default createScriptExplanation;

import {createLogicFlowPath} from './evidence-checklist.js';

const LOGIC_FLOW_ALIAS_PREFIX = 'logicFlow:script-';

const readArray = value => (Array.isArray(value) ? value : []);

const readLogic = projectSummary => (
    projectSummary && projectSummary.logic ? projectSummary.logic : {}
);

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const createLogicFlowAlias = (flow, index) => {
    const scriptIndex = flow && flow.scriptIndex ? flow.scriptIndex : index + 1;
    return `${LOGIC_FLOW_ALIAS_PREFIX}${scriptIndex}`;
};

const createModelReplyPathAliasTable = projectSummary => {
    const logic = readLogic(projectSummary);
    return readArray(logic.flows)
        .slice(0, 5)
        .map((flow, index) => ({
            aliasPathId: createLogicFlowAlias(flow, index),
            pathId: createLogicFlowPath(flow).pathId,
            scriptIndex: flow && flow.scriptIndex ? flow.scriptIndex : index + 1,
            targetName: flow && flow.targetName,
            entry: flow && flow.trigger && flow.trigger.label
        }));
};

const findModelReplyPathAliases = (replyText, aliasTable) => {
    if (typeof replyText !== 'string' || !replyText.trim()) return [];

    return readArray(aliasTable).filter(alias => {
        if (!alias || !alias.aliasPathId || !alias.pathId) return false;
        const aliasPattern = new RegExp(`(^|[^\\w-])${escapeRegExp(alias.aliasPathId)}([^\\w-]|$)`);
        return aliasPattern.test(replyText);
    });
};

const resolveModelReplyPathAlias = (aliasPathId, aliasTable) => {
    const alias = readArray(aliasTable).find(candidate => (
        candidate && candidate.aliasPathId === aliasPathId
    ));
    return alias ? alias.pathId : '';
};

export {
    LOGIC_FLOW_ALIAS_PREFIX,
    createModelReplyPathAliasTable,
    findModelReplyPathAliases,
    resolveModelReplyPathAlias
};

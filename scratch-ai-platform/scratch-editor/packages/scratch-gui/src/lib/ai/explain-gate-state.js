const EXPLAIN_GATE_STATES = Object.freeze({
    EMPTY: 'empty',
    DRAFTING: 'drafting',
    READY: 'ready',
    REVIEWED: 'reviewed'
});

const GATE_FIELDS = Object.freeze([
    'goal',
    'logic',
    'evidence'
]);

const isFieldComplete = value => typeof value === 'string' && value.trim().length > 0;

const getCompletedGateFieldCount = gateDraft => GATE_FIELDS.filter(field => (
    isFieldComplete(gateDraft && gateDraft[field])
)).length;

const isExplainGateComplete = gateDraft => getCompletedGateFieldCount(gateDraft) === GATE_FIELDS.length;

const getExplainGateState = (gateDraft, reviewed) => {
    const completedFields = getCompletedGateFieldCount(gateDraft);
    if (completedFields === 0) return EXPLAIN_GATE_STATES.EMPTY;
    if (completedFields < GATE_FIELDS.length) return EXPLAIN_GATE_STATES.DRAFTING;
    if (reviewed) return EXPLAIN_GATE_STATES.REVIEWED;
    return EXPLAIN_GATE_STATES.READY;
};

export {
    EXPLAIN_GATE_STATES,
    GATE_FIELDS,
    getCompletedGateFieldCount,
    getExplainGateState,
    isExplainGateComplete
};

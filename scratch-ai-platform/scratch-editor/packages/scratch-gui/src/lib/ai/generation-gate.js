import {
    EXPLAIN_GATE_STATES,
    getExplainGateState
} from './explain-gate-state.js';

const GENERATION_GATE_REASONS = Object.freeze({
    EMPTY: 'explain-gate-empty',
    INCOMPLETE: 'explain-gate-incomplete',
    UNREVIEWED: 'explain-gate-unreviewed'
});

const getGenerationGate = ({
    gateDraft,
    gateReviewed = false
} = {}) => {
    const gateState = getExplainGateState(gateDraft, gateReviewed);
    if (gateState === EXPLAIN_GATE_STATES.REVIEWED) {
        return {
            allowed: true,
            blockedReason: '',
            gateState,
            requiredState: EXPLAIN_GATE_STATES.REVIEWED
        };
    }

    let blockedReason = GENERATION_GATE_REASONS.UNREVIEWED;
    if (gateState === EXPLAIN_GATE_STATES.EMPTY) {
        blockedReason = GENERATION_GATE_REASONS.EMPTY;
    } else if (gateState === EXPLAIN_GATE_STATES.DRAFTING) {
        blockedReason = GENERATION_GATE_REASONS.INCOMPLETE;
    }

    return {
        allowed: false,
        blockedReason,
        gateState,
        requiredState: EXPLAIN_GATE_STATES.REVIEWED
    };
};

export {
    GENERATION_GATE_REASONS,
    getGenerationGate
};

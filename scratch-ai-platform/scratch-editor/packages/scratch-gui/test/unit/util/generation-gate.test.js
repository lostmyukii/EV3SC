/* eslint-env jest */
import {
    GENERATION_GATE_REASONS,
    getGenerationGate
} from '../../../src/lib/ai/generation-gate';
import {EXPLAIN_GATE_STATES} from '../../../src/lib/ai/explain-gate-state';

describe('generation gate', () => {
    test('blocks generation before the student writes an explanation', () => {
        expect(getGenerationGate({
            gateDraft: {},
            gateReviewed: false
        })).toEqual({
            allowed: false,
            blockedReason: GENERATION_GATE_REASONS.EMPTY,
            gateState: EXPLAIN_GATE_STATES.EMPTY,
            requiredState: EXPLAIN_GATE_STATES.REVIEWED
        });
    });

    test('blocks generation until all fields are checked', () => {
        expect(getGenerationGate({
            gateDraft: {
                goal: 'Make a quiz',
                logic: 'Click an answer, then check it',
                evidence: ''
            },
            gateReviewed: false
        })).toEqual(expect.objectContaining({
            allowed: false,
            blockedReason: GENERATION_GATE_REASONS.INCOMPLETE,
            gateState: EXPLAIN_GATE_STATES.DRAFTING
        }));

        expect(getGenerationGate({
            gateDraft: {
                goal: 'Make a quiz',
                logic: 'Click an answer, then check it',
                evidence: 'Try A and see feedback'
            },
            gateReviewed: false
        })).toEqual(expect.objectContaining({
            allowed: false,
            blockedReason: GENERATION_GATE_REASONS.UNREVIEWED,
            gateState: EXPLAIN_GATE_STATES.READY
        }));
    });

    test('allows generation only after the explain gate is reviewed', () => {
        expect(getGenerationGate({
            gateDraft: {
                goal: 'Make a quiz',
                logic: 'Click an answer, then check it',
                evidence: 'Try A and see feedback'
            },
            gateReviewed: true
        })).toEqual({
            allowed: true,
            blockedReason: '',
            gateState: EXPLAIN_GATE_STATES.REVIEWED,
            requiredState: EXPLAIN_GATE_STATES.REVIEWED
        });
    });
});

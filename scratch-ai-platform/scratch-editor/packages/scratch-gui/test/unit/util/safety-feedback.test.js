/* eslint-env jest */
import {
    SAFETY_FEEDBACK_TYPES,
    getSafetyFeedbackType,
    getSafetyFeedbackTypes
} from '../../../src/lib/ai/safety-feedback';

describe('safety feedback', () => {
    test('maps middleware blocked reasons to child-friendly feedback types', () => {
        expect(getSafetyFeedbackType('missing-model-consent')).toBe(SAFETY_FEEDBACK_TYPES.MISSING_CONSENT);
        expect(getSafetyFeedbackType('forbidden-context:projectSummary.logic.flows.0.blockIds')).toBe(
            SAFETY_FEEDBACK_TYPES.TOO_MUCH_PROJECT
        );
        expect(getSafetyFeedbackType('unknown')).toBe(SAFETY_FEEDBACK_TYPES.UNKNOWN);
    });

    test('deduplicates reason types and includes private info redaction', () => {
        expect(getSafetyFeedbackTypes({
            blockedReasons: [
                'forbidden-context:targetId',
                'forbidden-context:scriptId'
            ],
            redactionApplied: true
        })).toEqual([
            SAFETY_FEEDBACK_TYPES.TOO_MUCH_PROJECT,
            SAFETY_FEEDBACK_TYPES.PRIVATE_INFO
        ]);
    });
});

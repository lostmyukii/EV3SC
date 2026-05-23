/* eslint-env jest */
import {
    RELEASE_DRAFT_STATUSES,
    createReleaseDraftSummary,
    getReleaseDraftStatus,
    isReleaseDraftReady
} from '../../../src/lib/ai/release-draft';

describe('release draft', () => {
    test('requires product line, user feedback, and iteration plan before ready', () => {
        expect(isReleaseDraftReady({
            productLine: 'Homework reminder',
            userFeedback: '',
            iterationPlan: 'Add score feedback'
        })).toBe(false);
        expect(getReleaseDraftStatus({
            productLine: 'Homework reminder',
            userFeedback: 'My friend wants a louder reminder.',
            iterationPlan: 'Add sound and a retry button.'
        })).toBe(RELEASE_DRAFT_STATUSES.READY);
    });

    test('creates a version 1.1 summary from local project counts', () => {
        expect(createReleaseDraftSummary({
            releaseDraft: {
                productLine: ' Help my family remember chores. ',
                userFeedback: 'Need clearer buttons.',
                iterationPlan: 'Make button labels bigger.'
            },
            evidenceChecklist: {
                score: 4,
                maxScore: 5
            },
            projectSummary: {
                targets: {
                    sprites: 2
                },
                events: {
                    hats: 1
                }
            }
        })).toEqual(expect.objectContaining({
            version: '1.1',
            status: RELEASE_DRAFT_STATUSES.READY,
            productLine: 'Help my family remember chores.',
            checkScore: 4,
            checkMaxScore: 5,
            spriteCount: 2,
            startCount: 1
        }));
    });
});

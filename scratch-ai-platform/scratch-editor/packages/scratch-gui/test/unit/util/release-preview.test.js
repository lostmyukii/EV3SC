/* eslint-env jest */
import {
    LOG_TYPES,
    RELEASE_PREVIEW_STATUS,
    createReleasePreview
} from '../../../src/lib/ai/release-preview';

describe('release preview', () => {
    test('combines release draft, project metrics, logic flows, and AI counts', () => {
        const preview = createReleasePreview({
            releaseDraftSummary: {
                version: '1.1',
                status: RELEASE_PREVIEW_STATUS.READY,
                productLine: ' A chore helper ',
                userFeedback: 'Buttons need to be bigger.',
                iterationPlan: 'Make buttons bigger.',
                checkScore: 4,
                checkMaxScore: 5,
                spriteCount: 2,
                startCount: 1
            },
            projectSummary: {
                blocks: {
                    visible: 12
                },
                logic: {
                    flows: [{
                        id: 'target-1:hat-1',
                        targetName: 'Cat',
                        scriptIndex: 1,
                        trigger: {
                            label: 'Green flag'
                        },
                        blockCount: 4,
                        broadcastSends: [{
                            name: 'go',
                            count: 2
                        }]
                    }]
                }
            },
            processLog: [{
                type: LOG_TYPES.MODEL_QUESTION_SENT
            }, {
                type: LOG_TYPES.MODEL_REPLY_RECEIVED
            }, {
                type: LOG_TYPES.MODEL_REQUEST_BLOCKED
            }]
        });

        expect(preview).toEqual(expect.objectContaining({
            productLine: 'A chore helper',
            status: RELEASE_PREVIEW_STATUS.READY,
            version: '1.1'
        }));
        expect(preview.metrics).toEqual(expect.objectContaining({
            blocks: 12,
            checkMaxScore: 5,
            checkScore: 4,
            sprites: 2,
            starts: 1
        }));
        expect(preview.logicFlows[0]).toEqual(expect.objectContaining({
            blockCount: 4,
            broadcastCount: 2,
            scriptIndex: 1,
            targetName: 'Cat',
            triggerLabel: 'Green flag'
        }));
        expect(preview.aiSummary).toEqual({
            blocked: 1,
            questions: 1,
            replies: 1
        });
    });

    test('stays in draft mode and uses safe defaults when fields are missing', () => {
        const preview = createReleasePreview();

        expect(preview.status).toBe(RELEASE_PREVIEW_STATUS.DRAFTING);
        expect(preview.productLine).toBe('');
        expect(preview.logicFlows).toEqual([]);
        expect(preview.metrics).toEqual(expect.objectContaining({
            blocks: 0,
            sprites: 0,
            starts: 0
        }));
    });
});

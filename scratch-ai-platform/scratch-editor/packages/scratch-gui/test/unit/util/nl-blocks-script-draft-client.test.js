/* eslint-env jest */
import {
    NL_BLOCKS_SCRIPT_DRAFT_PATH,
    createNlBlocksScriptDraftPayload,
    createNlBlocksScriptDraftUrl,
    requestNlBlocksScriptDraft
} from '../../../src/lib/ai/nl-blocks-script-draft-client';

describe('nl blocks script draft client', () => {
    test('builds the NL blocks script draft endpoint', () => {
        expect(createNlBlocksScriptDraftUrl('/')).toBe(NL_BLOCKS_SCRIPT_DRAFT_PATH);
        expect(createNlBlocksScriptDraftUrl('http://127.0.0.1:8787/')).toBe(
            'http://127.0.0.1:8787/api/v1/nl-blocks/script-draft'
        );
    });

    test('creates a minimized model payload with reviewed explain gate state', () => {
        const payload = createNlBlocksScriptDraftPayload({
            gateReviewed: true,
            modelConsent: true,
            studentText: 'Make a quiz.',
            gateDraft: {
                goal: 'Ask a question.',
                logic: 'Check answer.',
                evidence: 'I see right or wrong.'
            },
            projectSummary: {
                targets: {
                    total: 2,
                    sprites: 1,
                    items: [{
                        id: 'private-target',
                        name: 'Private Sprite Name'
                    }]
                },
                logic: {
                    flows: [{
                        targetId: 'private-target',
                        blockIds: ['private-block']
                    }]
                }
            },
            teacherPolicy: {
                active: true,
                selectedKnowledgePoints: [{
                    id: 'events',
                    label: '事件'
                }]
            }
        });
        const payloadJson = JSON.stringify(payload);

        expect(payload.modelConsent).toBe(true);
        expect(payload.explainGateReviewed).toBe(true);
        expect(payloadJson.includes('Private Sprite Name')).toBe(false);
        expect(payloadJson.includes('private-target')).toBe(false);
        expect(payloadJson.includes('blockIds')).toBe(false);
    });

    test('posts JSON and preserves server error codes', async () => {
        await expect(requestNlBlocksScriptDraft({
            middlewareUrl: '/',
            payload: {
                modelConsent: false
            },
            fetchImpl: () => ({
                ok: false,
                json: () => ({
                    code: 'SCRATCH_AI_NL_BLOCKS_MISSING_MODEL_CONSENT',
                    error: 'Model consent is required.'
                })
            })
        })).rejects.toMatchObject({
            code: 'SCRATCH_AI_NL_BLOCKS_MISSING_MODEL_CONSENT',
            message: 'Model consent is required.'
        });
    });
});

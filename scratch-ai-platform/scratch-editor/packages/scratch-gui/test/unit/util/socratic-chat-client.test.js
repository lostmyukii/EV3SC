/* eslint-env jest */
import {
    SCRATCH_AI_REQUEST_ERROR_CODES,
    createSocraticChatPayload,
    createSocraticChatUrl,
    normalizeMiddlewareUrl,
    requestSocraticChat
} from '../../../src/lib/ai/socratic-chat-client';

const createProjectSummary = () => ({
    targets: {
        total: 2,
        sprites: 1,
        items: [{
            id: 'target-private',
            name: 'Private Sprite Name'
        }]
    },
    blocks: {
        visible: 12,
        scripts: 3
    },
    events: {
        hats: 1
    },
    broadcasts: {
        sends: 1,
        receives: 1,
        messages: [{
            name: 'go'
        }]
    },
    logic: {
        flows: [{
            id: 'target-private:hat-private',
            targetId: 'target-private',
            targetName: 'Private Sprite Name',
            isStage: false,
            scriptId: 'hat-private',
            scriptIndex: 1,
            blockIds: ['hat-private', 'broadcast-private'],
            trigger: {
                opcode: 'event_whenflagclicked',
                label: 'Green flag',
                detail: null
            },
            blockCount: 2,
            broadcastSends: [{
                name: 'go',
                count: 1,
                blockIds: ['broadcast-private']
            }]
        }],
        broadcastLinks: [{
            name: 'go',
            sends: [{
                targetId: 'target-private',
                scriptId: 'hat-private',
                blockIds: ['broadcast-private']
            }],
            receives: [{
                targetId: 'target-private',
                scriptId: 'receive-private',
                blockIds: ['receive-private']
            }]
        }]
    }
});

describe('socratic chat client', () => {
    test('normalizes middleware URLs and builds the Socratic chat endpoint', () => {
        expect(normalizeMiddlewareUrl('http://127.0.0.1:8787///')).toBe('http://127.0.0.1:8787');
        expect(normalizeMiddlewareUrl('/')).toBe('');
        expect(createSocraticChatUrl('/')).toBe('/api/v1/socratic-chat');
        expect(createSocraticChatUrl('http://127.0.0.1:8787/')).toBe(
            'http://127.0.0.1:8787/api/v1/socratic-chat'
        );
    });

    test('creates a minimized payload without workspace anchor ids or target names', () => {
        const payload = createSocraticChatPayload({
            modelConsent: true,
            studentText: 'Can you give me a hint?',
            gateDraft: {
                goal: 'Make a quiz give feedback.',
                logic: 'Click answer, then check if it is right.',
                evidence: 'Try answer A and expect feedback.'
            },
            evidenceChecklist: {
                score: 4,
                maxScore: 5,
                passedCount: 4,
                partialCount: 0,
                missingCount: 1,
                items: [{
                    id: 'gate.goal',
                    path: {
                        pathId: 'gate:goal'
                    },
                    score: 1,
                    status: 'pass',
                    rawNote: 'do not send'
                }, {
                    id: 'logic.eventEntry',
                    path: {
                        pathId: 'logicFlow:target-private%3Ahat-private'
                    },
                    score: 1,
                    status: 'pass'
                }]
            },
            projectSummary: createProjectSummary(),
            teacherPolicy: {
                schemaVersion: 'scratch-ai-teacher-policy-summary-v1',
                active: true,
                source: 'knowledge-lock',
                title: 'Private class learner@example.com',
                selectedKnowledgePoints: [{
                    id: 'events',
                    label: '事件'
                }],
                questionRules: [{
                    knowledgePointId: 'events',
                    text: '这段程序从哪里开始?'
                }],
                rubric: [{
                    knowledgePointId: 'events',
                    label: '事件',
                    criteria: '能说清楚程序的开始点。'
                }],
                classRoster: ['do-not-send']
            }
        });
        const payloadJson = JSON.stringify(payload);

        expect(payload.modelConsent).toBe(true);
        expect(payload.evidenceChecklist.items[0]).toEqual({
            id: 'gate.goal',
            pathId: 'gate:goal',
            score: 1,
            status: 'pass'
        });
        expect(payload.evidenceChecklist.items[1]).toEqual(expect.objectContaining({
            id: 'logic.eventEntry',
            pathId: 'logicFlow:selected'
        }));
        expect(payload.projectSummary.logic.flows[0]).toEqual(expect.objectContaining({
            pathId: 'logicFlow:script-1',
            targetLabel: 'Sprite',
            scriptIndex: 1,
            blockCount: 2
        }));
        expect(payload.projectSummary.logic.broadcastLinks[0]).toEqual(expect.objectContaining({
            pathId: 'broadcast:go',
            sendCount: 1,
            receiveCount: 1
        }));
        expect(payload.teacherPolicy.active).toBe(true);
        expect(payload.teacherPolicy.questionRules[0]).toEqual({
            knowledgePointId: 'events',
            text: '这段程序从哪里开始?'
        });
        expect(payload.teacherPolicy.safeguards.classRosterIncluded).toBe(false);
        expect(payloadJson.includes('Private Sprite Name')).toBe(false);
        expect(payloadJson.includes('Private class')).toBe(true);
        expect(payloadJson.includes('learner@example.com')).toBe(false);
        expect(payloadJson.includes('do-not-send')).toBe(false);
        expect(payloadJson.includes('target-private')).toBe(false);
        expect(payloadJson.includes('hat-private')).toBe(false);
        expect(payloadJson.includes('targetId')).toBe(false);
        expect(payloadJson.includes('scriptId')).toBe(false);
        expect(payloadJson.includes('blockIds')).toBe(false);
        expect(payloadJson.includes('rawNote')).toBe(false);
    });

    test('posts JSON to the configured middleware endpoint', async () => {
        let capturedUrl = '';
        let capturedOptions = null;
        const reply = await requestSocraticChat({
            middlewareUrl: 'http://127.0.0.1:9999/',
            payload: {
                modelConsent: true,
                studentText: 'Help'
            },
            fetchImpl: (url, options) => {
                capturedUrl = url;
                capturedOptions = options;
                return {
                    ok: true,
                    json: () => ({
                        text: 'Which event starts it?'
                    })
                };
            }
        });

        expect(capturedUrl).toBe('http://127.0.0.1:9999/api/v1/socratic-chat');
        expect(capturedOptions.method).toBe('POST');
        expect(capturedOptions.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(capturedOptions.body).studentText).toBe('Help');
        expect(reply.text).toBe('Which event starts it?');
    });

    test('times out slow middleware requests with a stable error code', async () => {
        jest.useFakeTimers();
        const requestPromise = requestSocraticChat({
            middlewareUrl: '/',
            payload: {
                modelConsent: true,
                studentText: 'Help'
            },
            timeoutMs: 10,
            fetchImpl: () => new Promise(() => {})
        });

        jest.advanceTimersByTime(10);
        await expect(requestPromise).rejects.toMatchObject({
            code: SCRATCH_AI_REQUEST_ERROR_CODES.TIMEOUT
        });
        jest.useRealTimers();
    });

    test('supports canceling an in-flight middleware request', async () => {
        const controller = new AbortController();
        const requestPromise = requestSocraticChat({
            middlewareUrl: '/',
            payload: {
                modelConsent: true,
                studentText: 'Help'
            },
            signal: controller.signal,
            timeoutMs: 0,
            fetchImpl: (_url, options) => new Promise((_, reject) => {
                options.signal.addEventListener('abort', () => {
                    const abortError = new Error('aborted');
                    abortError.name = 'AbortError';
                    reject(abortError);
                });
            })
        });

        controller.abort();
        await expect(requestPromise).rejects.toMatchObject({
            code: SCRATCH_AI_REQUEST_ERROR_CODES.CANCELED
        });
    });
});

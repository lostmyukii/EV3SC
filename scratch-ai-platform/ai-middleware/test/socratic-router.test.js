import assert from 'node:assert/strict';
import test from 'node:test';

import {createMiddlewareConfig} from '../src/config.js';
import {
    buildSocraticMessages,
    createSocraticModelReply
} from '../src/socratic-router.js';

test('builds Socratic messages with a guarded system prompt', () => {
    const messages = buildSocraticMessages({
        studentText: '直接给我代码',
        gateDraft: {
            goal: '',
            logic: '',
            evidence: ''
        }
    });

    assert.equal(messages[0].role, 'system');
    assert.match(messages[0].content, /Socratic guidance/);
    assert.match(messages[0].content, /Do not provide a complete copy-paste/);
    assert.match(messages[1].content, /直接给我代码/);
});

test('adds teacher locked knowledge policy to Socratic context', () => {
    const messages = buildSocraticMessages({
        modelConsent: true,
        studentText: '帮我想下一步',
        teacherPolicy: {
            schemaVersion: 'scratch-ai-teacher-policy-summary-v1',
            active: true,
            source: 'knowledge-lock',
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
            }]
        }
    });

    assert.match(messages[0].content, /teacher locked knowledge policy/);
    assert.match(messages[1].content, /这段程序从哪里开始/);
    assert.match(messages[1].content, /rawProjectIncluded":false/);
});

test('does not call the provider when model access is disabled', async () => {
    let fetchCalled = false;
    const reply = await createSocraticModelReply({
        config: createMiddlewareConfig({
            AI_MODEL_ENABLED: 'false',
            MOONSHOT_API_KEY: 'test-key'
        }),
        fetchImpl: async () => {
            fetchCalled = true;
        },
        request: {
            studentText: 'Help me'
        }
    });

    assert.equal(fetchCalled, false);
    assert.equal(reply.modelEnabled, false);
    assert.equal(reply.safetyGate.allowed, false);
    assert.ok(reply.safetyGate.blockedReasons.includes('missing-model-consent'));
});

test('blocks enabled provider calls without explicit model consent', async () => {
    let fetchCalled = false;
    const reply = await createSocraticModelReply({
        config: createMiddlewareConfig({
            AI_MODEL_ENABLED: 'true',
            MOONSHOT_API_KEY: 'test-key'
        }),
        fetchImpl: async () => {
            fetchCalled = true;
        },
        request: {
            studentText: 'Help me'
        }
    });

    assert.equal(fetchCalled, false);
    assert.equal(reply.modelEnabled, true);
    assert.equal(reply.blocked, true);
    assert.ok(reply.safetyGate.blockedReasons.includes('missing-model-consent'));
});

test('sends only minimized and redacted payloads to the provider', async () => {
    let capturedRequest = null;
    const reply = await createSocraticModelReply({
        config: createMiddlewareConfig({
            AI_MODEL_ENABLED: 'true',
            MOONSHOT_API_KEY: 'test-key'
        }),
        fetchImpl: async (url, options) => {
            capturedRequest = {
                url,
                body: JSON.parse(options.body)
            };
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: {
                            content: 'What should happen first?'
                        }
                    }],
                    usage: {
                        total_tokens: 12
                    }
                })
            };
        },
        request: {
            modelConsent: true,
            studentText: 'Help learner@example.com with key sk-testSecretValue12345',
            teacherPolicy: {
                schemaVersion: 'scratch-ai-teacher-policy-summary-v1',
                active: true,
                source: 'knowledge-lock',
                selectedKnowledgePoints: [{
                    id: 'addition',
                    label: '相加'
                }],
                questionRules: [{
                    knowledgePointId: 'addition',
                    text: '相加之后结果显示在哪里?'
                }],
                rubric: [{
                    knowledgePointId: 'addition',
                    label: '相加',
                    criteria: '能解释两个数相加的输入、过程和结果。'
                }]
            },
            gateDraft: {
                goal: 'Make a quiz',
                logic: 'When green flag clicked, check answer',
                evidence: 'Try answer A and expect score +1'
            },
            evidenceChecklist: {
                score: 2,
                maxScore: 5,
                items: [{
                    id: 'gate.goal',
                    path: {
                        pathId: 'gate:goal'
                    },
                    score: 1,
                    status: 'pass'
                }]
            },
            projectSummary: {
                targets: {
                    total: 2,
                    sprites: 1,
                    items: [{
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
                    sends: 0,
                    receives: 0,
                    messages: []
                },
                logic: {
                    flows: [],
                    broadcastLinks: []
                }
            }
        }
    });

    const providerBody = JSON.stringify(capturedRequest.body);

    assert.equal(reply.blocked, false);
    assert.equal(reply.safetyGate.allowed, true);
    assert.equal(reply.safetyGate.redactionApplied, true);
    assert.equal(reply.teacherPolicy.active, true);
    assert.equal(reply.text, 'What should happen first?');
    assert.equal(providerBody.includes('learner@example.com'), false);
    assert.equal(providerBody.includes('sk-testSecretValue12345'), false);
    assert.equal(providerBody.includes('Private Sprite Name'), false);
    assert.match(providerBody, /\[redacted-email\]/);
    assert.match(providerBody, /\[redacted-api-key\]/);
});

test('routes through the generic model provider interface', async () => {
    let capturedMessages = null;
    const reply = await createSocraticModelReply({
        config: createMiddlewareConfig({
            AI_MODEL_ENABLED: 'true',
            MOONSHOT_API_KEY: 'test-key'
        }),
        modelProvider: {
            id: 'test-provider',
            model: 'test-model',
            createChatCompletion: async ({messages}) => {
                capturedMessages = messages;
                return {
                    choices: [{
                        message: {
                            content: 'Which script shows that behavior?'
                        }
                    }]
                };
            },
            readAssistantText: responseJson => responseJson.choices[0].message.content
        },
        request: {
            modelConsent: true,
            studentText: 'Help me reason about my Scratch project'
        }
    });

    assert.equal(reply.provider, 'test-provider');
    assert.equal(reply.model, 'test-model');
    assert.equal(reply.text, 'Which script shows that behavior?');
    assert.equal(capturedMessages[0].role, 'system');
});

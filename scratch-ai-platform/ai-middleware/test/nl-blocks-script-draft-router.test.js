import assert from 'node:assert/strict';
import test from 'node:test';

import {createMiddlewareConfig} from '../src/config.js';
import {
    NL_BLOCKS_ERROR_CODES,
    SCRIPT_DRAFT_SCHEMA_VERSION,
    createNlBlocksScriptDraftReply,
    validateAndNormalizeModelDraft
} from '../src/nl-blocks-script-draft-router.js';

const createValidModelDraft = () => ({
    schemaVersion: SCRIPT_DRAFT_SCHEMA_VERSION,
    completeScript: true,
    insertIntoWorkspace: false,
    target: 'Sprite',
    scripts: [{
        ref: 'script1',
        blocks: [{
            ref: 'start',
            opcode: 'event_whenflagclicked',
            nextRef: 'say',
            parentRef: null,
            fields: {},
            inputs: {}
        }, {
            ref: 'say',
            opcode: 'looks_sayforsecs',
            nextRef: null,
            parentRef: 'start',
            fields: {},
            inputs: {
                MESSAGE: {
                    literal: 'Hello',
                    valueType: 'text'
                },
                SECS: {
                    literal: 2,
                    valueType: 'number'
                }
            }
        }]
    }],
    reviewQuestions: ['What should you check before inserting?']
});

const createRequest = overrides => Object.assign({
    explainGateReviewed: true,
    modelConsent: true,
    studentText: 'Make the sprite say hello.',
    gateDraft: {
        goal: 'Make the sprite greet the class.',
        logic: 'When green flag starts, say hello.',
        evidence: 'I run it and see the message.'
    },
    projectSummary: {
        targets: {
            total: 2,
            sprites: 1
        },
        blocks: {
            visible: 0,
            scripts: 0
        },
        events: {
            hats: 0
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
}, overrides || {});

const createModelProvider = response => ({
    id: 'test-provider',
    model: 'test-model',
    createChatCompletion: async () => ({
        choices: [{
            message: {
                content: JSON.stringify(response)
            }
        }],
        usage: {
            total_tokens: 20
        }
    }),
    readAssistantText: responseJson => responseJson.choices[0].message.content
});

const createTextModelProvider = text => ({
    id: 'test-provider',
    model: 'test-model',
    createChatCompletion: async () => ({
        choices: [{
            message: {
                content: text
            }
        }],
        usage: {
            total_tokens: 20
        }
    }),
    readAssistantText: responseJson => responseJson.choices[0].message.content
});

const createSequenceModelProvider = texts => {
    const requests = [];
    let index = 0;
    return {
        id: 'test-provider',
        model: 'test-model',
        requests,
        createChatCompletion: async request => {
            requests.push(request);
            const content = texts[Math.min(index, texts.length - 1)];
            index += 1;
            return {
                choices: [{
                    message: {
                        content
                    }
                }],
                usage: {
                    total_tokens: 20
                }
            };
        },
        readAssistantText: responseJson => responseJson.choices[0].message.content
    };
};

test('rejects script draft requests without model consent', async () => {
    await assert.rejects(
        createNlBlocksScriptDraftReply({
            config: createMiddlewareConfig({
                AI_MODEL_ENABLED: 'true',
                MOONSHOT_API_KEY: 'test-key'
            }),
            modelProvider: createModelProvider(createValidModelDraft()),
            request: createRequest({
                modelConsent: false
            })
        }),
        error => {
            assert.equal(error.code, NL_BLOCKS_ERROR_CODES.MISSING_MODEL_CONSENT);
            return true;
        }
    );
});

test('requires a reviewed explain gate before model generation', async () => {
    await assert.rejects(
        createNlBlocksScriptDraftReply({
            config: createMiddlewareConfig({
                AI_MODEL_ENABLED: 'true',
                MOONSHOT_API_KEY: 'test-key'
            }),
            modelProvider: createModelProvider(createValidModelDraft()),
            request: createRequest({
                explainGateReviewed: false
            })
        }),
        error => {
            assert.equal(error.code, NL_BLOCKS_ERROR_CODES.EXPLAIN_GATE_REQUIRED);
            return true;
        }
    );
});

test('rejects forbidden raw project fields before calling the model', async () => {
    let providerCalled = false;
    await assert.rejects(
        createNlBlocksScriptDraftReply({
            config: createMiddlewareConfig({
                AI_MODEL_ENABLED: 'true',
                MOONSHOT_API_KEY: 'test-key'
            }),
            modelProvider: {
                id: 'test-provider',
                model: 'test-model',
                createChatCompletion: async () => {
                    providerCalled = true;
                },
                readAssistantText: () => ''
            },
            request: createRequest({
                projectJson: {
                    targets: []
                }
            })
        }),
        error => {
            assert.equal(error.code, NL_BLOCKS_ERROR_CODES.SAFETY_BLOCKED);
            assert.equal(providerCalled, false);
            return true;
        }
    );
});

test('returns a clear error when model access is disabled', async () => {
    await assert.rejects(
        createNlBlocksScriptDraftReply({
            config: createMiddlewareConfig({
                AI_MODEL_ENABLED: 'false',
                MOONSHOT_API_KEY: 'test-key'
            }),
            modelProvider: createModelProvider(createValidModelDraft()),
            request: createRequest()
        }),
        error => {
            assert.equal(error.code, NL_BLOCKS_ERROR_CODES.MODEL_DISABLED);
            assert.equal(error.statusCode, 503);
            return true;
        }
    );
});

test('rejects unsupported Scratch opcodes in model output', () => {
    const draft = createValidModelDraft();
    draft.scripts[0].blocks[1].opcode = 'sound_play';

    assert.throws(
        () => validateAndNormalizeModelDraft(draft),
        error => {
            assert.equal(error.code, NL_BLOCKS_ERROR_CODES.UNSUPPORTED_OPCODE);
            return true;
        }
    );
});

test('flattens nested model input blocks before connection validation', () => {
    const draft = createValidModelDraft();
    draft.scripts[0].blocks = [{
        ref: 'start',
        opcode: 'event_whenflagclicked',
        nextRef: 'branch',
        parentRef: null,
        fields: {},
        inputs: {}
    }, {
        ref: 'branch',
        opcode: 'control_if',
        nextRef: null,
        parentRef: 'start',
        fields: {},
        inputs: {
            CONDITION: {
                opcode: 'operator_equals',
                fields: {},
                inputs: {
                    OPERAND1: {
                        literal: 1,
                        valueType: 'number'
                    },
                    OPERAND2: {
                        literal: 1,
                        valueType: 'number'
                    }
                }
            }
        }
    }];

    const normalized = validateAndNormalizeModelDraft(draft);

    assert.equal(normalized.scripts[0].blocks.length, 3);
    assert.equal(normalized.scripts[0].blocks[1].inputs.CONDITION.blockRef, 'branch_CONDITION');
    assert.equal(normalized.scripts[0].blocks[2].opcode, 'operator_equals');
    assert.equal(normalized.scripts[0].blocks[2].parentRef, 'branch');
});

test('creates a validated complete script draft with warn-only teacher policy notices', async () => {
    const reply = await createNlBlocksScriptDraftReply({
        config: createMiddlewareConfig({
            AI_MODEL_ENABLED: 'true',
            MOONSHOT_API_KEY: 'test-key'
        }),
        modelProvider: createModelProvider(createValidModelDraft()),
        request: createRequest({
            teacherPolicy: {
                active: true,
                selectedKnowledgePoints: [{
                    id: 'events',
                    label: '事件'
                }]
            }
        })
    });

    assert.equal(reply.schemaVersion, SCRIPT_DRAFT_SCHEMA_VERSION);
    assert.equal(reply.status, 'ready');
    assert.equal(reply.completeScript, true);
    assert.equal(reply.insertIntoWorkspace, false);
    assert.equal(reply.safety.requiresStudentReview, true);
    assert.equal(reply.scripts[0].blocks[0].opcode, 'event_whenflagclicked');
    assert.ok(reply.teacherPolicyWarnings.length >= 1);
    assert.ok(reply.teacherPolicyWarnings.some(warning => warning.concept === 'output'));
});

test('extracts a valid script draft when the model wraps JSON in markdown', async () => {
    const modelDraft = createValidModelDraft();
    const reply = await createNlBlocksScriptDraftReply({
        config: createMiddlewareConfig({
            AI_MODEL_ENABLED: 'true',
            MOONSHOT_API_KEY: 'test-key'
        }),
        modelProvider: createTextModelProvider([
            'Here is the draft:',
            '```json',
            JSON.stringify(modelDraft),
            '```'
        ].join('\n')),
        request: createRequest()
    });

    assert.equal(reply.schemaVersion, SCRIPT_DRAFT_SCHEMA_VERSION);
    assert.equal(reply.status, 'ready');
    assert.equal(reply.completeScript, true);
    assert.equal(reply.scripts[0].blocks[0].opcode, 'event_whenflagclicked');
});

test('extracts a valid script draft when the model adds text around JSON', async () => {
    const modelDraft = createValidModelDraft();
    const reply = await createNlBlocksScriptDraftReply({
        config: createMiddlewareConfig({
            AI_MODEL_ENABLED: 'true',
            MOONSHOT_API_KEY: 'test-key'
        }),
        modelProvider: createTextModelProvider(`说明文字\n${JSON.stringify(modelDraft)}\n请审核。`),
        request: createRequest()
    });

    assert.equal(reply.schemaVersion, SCRIPT_DRAFT_SCHEMA_VERSION);
    assert.equal(reply.status, 'ready');
    assert.equal(reply.insertIntoWorkspace, false);
});

test('returns a student-friendly error when model JSON is incomplete', async () => {
    await assert.rejects(
        createNlBlocksScriptDraftReply({
            config: createMiddlewareConfig({
                AI_MODEL_ENABLED: 'true',
                MOONSHOT_API_KEY: 'test-key'
            }),
            modelProvider: createTextModelProvider('```json\n{"schemaVersion": "scratch-ai-nl-blocks-script-draft-v1",'),
            request: createRequest()
        }),
        error => {
            assert.equal(error.code, NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT);
            assert.match(error.message, /AI 脚本草稿格式不完整/);
            return true;
        }
    );
});

test('returns a student-friendly error when model JSON uses the wrong schema', async () => {
    await assert.rejects(
        createNlBlocksScriptDraftReply({
            config: createMiddlewareConfig({
                AI_MODEL_ENABLED: 'true',
                MOONSHOT_API_KEY: 'test-key'
            }),
            modelProvider: createTextModelProvider(JSON.stringify({
                schemaVersion: 'wrong-schema',
                completeScript: true,
                insertIntoWorkspace: false,
                scripts: []
            })),
            request: createRequest()
        }),
        error => {
            assert.equal(error.code, NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT);
            assert.match(error.message, /AI 脚本草稿格式不完整/);
            return true;
        }
    );
});

test('requests JSON object mode when generating a script draft', async () => {
    let capturedRequest = null;
    const reply = await createNlBlocksScriptDraftReply({
        config: createMiddlewareConfig({
            AI_MODEL_ENABLED: 'true',
            MOONSHOT_API_KEY: 'test-key'
        }),
        modelProvider: {
            id: 'test-provider',
            model: 'test-model',
            createChatCompletion: async request => {
                capturedRequest = request;
                return {
                    choices: [{
                        message: {
                            content: JSON.stringify(createValidModelDraft())
                        }
                    }],
                    usage: {
                        total_tokens: 20
                    }
                };
            },
            readAssistantText: responseJson => responseJson.choices[0].message.content
        },
        request: createRequest()
    });

    assert.equal(reply.status, 'ready');
    assert.equal(capturedRequest.maxTokens, 5000);
    assert.deepEqual(capturedRequest.responseFormat, {
        type: 'json_object'
    });
});

test('retries once when the model draft has dangling refs', async () => {
    const invalidDraft = createValidModelDraft();
    invalidDraft.scripts[0].blocks[1].inputs.MESSAGE = {
        blockRef: 'missing-message'
    };
    const provider = createSequenceModelProvider([
        JSON.stringify(invalidDraft),
        JSON.stringify(createValidModelDraft())
    ]);

    const reply = await createNlBlocksScriptDraftReply({
        config: createMiddlewareConfig({
            AI_MODEL_ENABLED: 'true',
            MOONSHOT_API_KEY: 'test-key'
        }),
        modelProvider: provider,
        request: createRequest()
    });

    assert.equal(reply.status, 'ready');
    assert.equal(provider.requests.length, 2);
    assert.equal(provider.requests[1].temperature, 0);
    assert.match(provider.requests[1].messages[1].content, /unknown input ref/);
    assert.equal(reply.completeScript, true);
});

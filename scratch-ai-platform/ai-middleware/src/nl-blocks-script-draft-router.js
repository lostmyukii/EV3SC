import {randomUUID} from 'node:crypto';

import {
    createConfiguredModelProvider,
    describeModelProvider,
    readModelProviderAssistantText
} from './model-provider.js';
import {
    createModelRequestSafetyGate,
    createSafetyGatePublicSummary,
    minimizeModelRequestPayload,
    truncateText
} from './model-request-safety-gate.js';

const SCRIPT_DRAFT_SCHEMA_VERSION = 'scratch-ai-nl-blocks-script-draft-v1';
const MAX_SCRIPTS = 3;
const MAX_BLOCKS_PER_SCRIPT = 48;
const MAX_TOTAL_BLOCKS = 48;
const TEXT_LIMIT = 240;
const SCRIPT_DRAFT_INVALID_FORMAT_MESSAGE = 'AI 脚本草稿格式不完整，请再点一次“生成 AI 脚本”；如果连续失败，把目标写短一点。';

const NL_BLOCKS_ERROR_CODES = Object.freeze({
    EXPLAIN_GATE_REQUIRED: 'SCRATCH_AI_NL_BLOCKS_EXPLAIN_GATE_REQUIRED',
    INVALID_MODEL_OUTPUT: 'SCRATCH_AI_NL_BLOCKS_INVALID_MODEL_OUTPUT',
    MISSING_MODEL_CONSENT: 'SCRATCH_AI_NL_BLOCKS_MISSING_MODEL_CONSENT',
    MODEL_DISABLED: 'SCRATCH_AI_NL_BLOCKS_MODEL_DISABLED',
    MODEL_REQUEST_FAILED: 'SCRATCH_AI_NL_BLOCKS_MODEL_REQUEST_FAILED',
    SAFETY_BLOCKED: 'SCRATCH_AI_NL_BLOCKS_SAFETY_BLOCKED',
    UNSUPPORTED_OPCODE: 'SCRATCH_AI_NL_BLOCKS_UNSUPPORTED_OPCODE'
});

const ALLOWED_OPCODES = Object.freeze([
    'control_forever',
    'control_if',
    'control_if_else',
    'control_repeat',
    'control_wait',
    'data_changevariableby',
    'data_setvariableto',
    'data_variable',
    'event_whenflagclicked',
    'event_whenkeypressed',
    'event_whenthisspriteclicked',
    'looks_hide',
    'looks_say',
    'looks_sayforsecs',
    'looks_show',
    'math_number',
    'motion_glidesecstoxy',
    'motion_gotoxy',
    'motion_movesteps',
    'motion_pointindirection',
    'motion_turnleft',
    'motion_turnright',
    'operator_add',
    'operator_divide',
    'operator_equals',
    'operator_gt',
    'operator_lt',
    'operator_multiply',
    'operator_subtract',
    'sensing_answer',
    'sensing_askandwait',
    'text'
]);

const ALLOWED_OPCODE_SET = new Set(ALLOWED_OPCODES);

const HAT_OPCODES = new Set([
    'event_whenflagclicked',
    'event_whenkeypressed',
    'event_whenthisspriteclicked'
]);

const OPCODE_CONCEPTS = Object.freeze({
    control_forever: ['loop'],
    control_if: ['condition'],
    control_if_else: ['condition'],
    control_repeat: ['loop'],
    control_wait: ['sequence'],
    data_changevariableby: ['variable'],
    data_setvariableto: ['variable'],
    data_variable: ['variable'],
    event_whenflagclicked: ['event'],
    event_whenkeypressed: ['event', 'input'],
    event_whenthisspriteclicked: ['event', 'input'],
    looks_hide: ['output'],
    looks_say: ['output'],
    looks_sayforsecs: ['output'],
    looks_show: ['output'],
    math_number: ['operator'],
    motion_glidesecstoxy: ['motion'],
    motion_gotoxy: ['motion'],
    motion_movesteps: ['motion'],
    motion_pointindirection: ['motion'],
    motion_turnleft: ['motion'],
    motion_turnright: ['motion'],
    operator_add: ['operator'],
    operator_divide: ['operator'],
    operator_equals: ['condition', 'operator'],
    operator_gt: ['condition', 'operator'],
    operator_lt: ['condition', 'operator'],
    operator_multiply: ['operator'],
    operator_subtract: ['operator'],
    sensing_answer: ['input'],
    sensing_askandwait: ['input'],
    text: ['input']
});

const CONCEPT_LABELS = Object.freeze({
    condition: '判断',
    event: '事件',
    input: '输入',
    loop: '循环',
    motion: '运动',
    operator: '运算',
    output: '输出',
    sequence: '顺序',
    variable: '变量'
});

const TEACHER_CONCEPT_KEYWORDS = Object.freeze({
    condition: ['condition', 'if', '判断', '如果', '条件'],
    event: ['event', 'start', 'green flag', '事件', '开始', '绿旗'],
    input: ['input', 'answer', 'ask', 'sensing', '输入', '回答', '提问', '侦测'],
    loop: ['loop', 'repeat', 'forever', '循环', '重复', '一直'],
    motion: ['motion', 'move', 'x', 'y', '运动', '移动', '坐标'],
    operator: ['operator', 'math', 'addition', 'subtract', 'compare', '运算', '数学', '相加', '比较'],
    output: ['output', 'looks', 'say', 'show', '输出', '外观', '说', '显示'],
    sequence: ['sequence', 'order', 'step', '顺序', '步骤'],
    variable: ['variable', 'score', 'data', '变量', '分数', '数据']
});

const createRouteError = ({
    code,
    details,
    message,
    statusCode = 400
}) => {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    error.statusCode = statusCode;
    return error;
};

const readText = (value, maxLength = TEXT_LIMIT) => truncateText(
    typeof value === 'string' || typeof value === 'number' ? String(value) : '',
    maxLength
);

const readArray = value => (Array.isArray(value) ? value : []);

const readPlainObject = value => (
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const hasReviewedExplainGate = request => (
    request && (
        request.explainGateReviewed === true ||
        request.gateReviewed === true ||
        request.explainGate && request.explainGate.reviewed === true ||
        request.gateDraft && request.gateDraft.reviewed === true
    )
);

const summarizeRequestContext = request => JSON.stringify({
    gateDraft: request.gateDraft || {},
    projectSummary: request.projectSummary || {},
    teacherPolicy: request.teacherPolicy || {}
});

const buildNlBlocksScriptDraftMessages = request => {
    const minimizedRequest = minimizeModelRequestPayload(request || {});
    return [
        {
            role: 'system',
            content: [
                'You generate safe Scratch 3.0 script drafts for learners aged 8-14.',
                'Return strict JSON only. Do not use markdown fences or commentary.',
                `The JSON schemaVersion must be "${SCRIPT_DRAFT_SCHEMA_VERSION}".`,
                'The first top-level JSON key must be schemaVersion.',
                'The draft must be completeScript true and insertIntoWorkspace false.',
                'Use ref, nextRef, and parentRef strings instead of real Scratch VM block ids.',
                'Do not include targetId, blockIds, raw project JSON, assets, logs, secrets, or student identity.',
                `Allowed opcodes only: ${ALLOWED_OPCODES.join(', ')}.`,
                'Keep scripts short, classroom-friendly, and reviewable before insertion.',
                'Return one compact script when possible, with no more than 18 blocks total.',
                'For complex math or multi-input requests, make a small runnable first version instead of fully expanding every step.',
                'Do not include markdown fences, explanations, comments, or trailing commas.',
                'If the request is complex, return a smaller valid completeScript draft instead of prose.'
            ].join(' ')
        },
        {
            role: 'user',
            content: [
                `Student intent: ${truncateText(minimizedRequest.studentText, 1200)}`,
                `Local context: ${truncateText(summarizeRequestContext(minimizedRequest), 3000)}`,
                'Return JSON shaped like:',
                JSON.stringify({
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
                    reviewQuestions: ['What should happen first?']
                }),
                'Return compact JSON only. Avoid whitespace-heavy formatting.'
            ].join('\n')
        }
    ];
};

const buildNlBlocksScriptDraftRetryMessages = ({
    previousError,
    request
}) => {
    const messages = buildNlBlocksScriptDraftMessages(request);
    messages[messages.length - 1].content = [
        messages[messages.length - 1].content,
        `Previous JSON failed validation: ${readText(previousError && previousError.message, 220)}`,
        'Return a corrected compact JSON object only.',
        'Every nextRef, parentRef, and input.blockRef must reference a block ref included in the same script.',
        'Prefer literal inputs instead of blockRef values when you are unsure.'
    ].join('\n');
    return messages;
};

const createInvalidModelFormatError = () => createRouteError({
    code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
    message: SCRIPT_DRAFT_INVALID_FORMAT_MESSAGE
});

const isRetryableModelDraftError = error => (
    error && (
        error.code === NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT ||
        error.code === NL_BLOCKS_ERROR_CODES.UNSUPPORTED_OPCODE
    )
);

const collectBalancedJsonObjects = text => {
    const candidates = [];
    for (let startIndex = text.indexOf('{'); startIndex !== -1; startIndex = text.indexOf('{', startIndex + 1)) {
        let depth = 0;
        let escaped = false;
        let inString = false;

        for (let index = startIndex; index < text.length; index++) {
            const character = text[index];
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (character === '\\') {
                    escaped = true;
                } else if (character === '"') {
                    inString = false;
                }
                continue;
            }

            if (character === '"') {
                inString = true;
            } else if (character === '{') {
                depth += 1;
            } else if (character === '}') {
                depth -= 1;
                if (depth === 0) {
                    candidates.push(text.slice(startIndex, index + 1));
                    break;
                }
            }
        }
    }
    return candidates;
};

const collectJsonParseCandidates = text => {
    const trimmedText = text.trim();
    const candidates = [];
    const addCandidate = value => {
        const candidate = typeof value === 'string' ? value.trim() : '';
        if (candidate && !candidates.includes(candidate)) {
            candidates.push(candidate);
        }
    };

    addCandidate(trimmedText);

    const fencedJsonPattern = /```(?:json)?\s*([\s\S]*?)```/gi;
    let fenceMatch = fencedJsonPattern.exec(trimmedText);
    while (fenceMatch) {
        addCandidate(fenceMatch[1]);
        collectBalancedJsonObjects(fenceMatch[1]).forEach(addCandidate);
        fenceMatch = fencedJsonPattern.exec(trimmedText);
    }

    collectBalancedJsonObjects(trimmedText).forEach(addCandidate);
    return candidates;
};

const parseModelJson = text => {
    const trimmedText = readText(text, 24000);
    if (!trimmedText || trimmedText.indexOf('{') === -1) {
        throw createRouteError({
            code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
            message: SCRIPT_DRAFT_INVALID_FORMAT_MESSAGE
        });
    }

    for (const candidate of collectJsonParseCandidates(trimmedText)) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && parsed.schemaVersion === SCRIPT_DRAFT_SCHEMA_VERSION) {
                return parsed;
            }
        } catch (error) {
            // Keep trying other balanced JSON candidates from the same model reply.
        }
    }
    throw createRouteError({
        code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
        message: SCRIPT_DRAFT_INVALID_FORMAT_MESSAGE
    });
};

const normalizeFieldValue = value => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return readText(value);
    }
    const field = readPlainObject(value);
    return {
        name: readText(field.name || field.value),
        value: readText(field.value || field.name)
    };
};

const createUniqueDraftRef = (preferredRef, refs) => {
    const baseRef = readText(preferredRef) || `embedded_${refs.size + 1}`;
    let ref = baseRef;
    let suffix = 2;
    while (refs.has(ref)) {
        ref = `${baseRef}_${suffix}`;
        suffix += 1;
    }
    refs.add(ref);
    return ref;
};

const normalizeInputValue = (value, context) => {
    if (typeof value === 'string') {
        return {
            blockRef: readText(value)
        };
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return {
            literal: value,
            valueType: 'number'
        };
    }
    const input = readPlainObject(value);
    if (input.opcode && context) {
        const embeddedRef = createUniqueDraftRef(
            input.ref || `${context.parentRef}_${context.inputName}`,
            context.refs
        );
        const embeddedBlock = normalizeBlock(Object.assign({}, input, {
            ref: embeddedRef,
            parentRef: input.parentRef === undefined ? context.parentRef : input.parentRef
        }), context);
        context.embeddedBlocks.push(embeddedBlock);
        return {
            blockRef: embeddedRef
        };
    }
    if (input.blockRef || input.ref || input.substackRef) {
        return {
            blockRef: readText(input.blockRef || input.ref || input.substackRef)
        };
    }
    return {
        literal: typeof input.literal === 'number' ? input.literal : readText(input.literal || input.value),
        valueType: readText(input.valueType || input.type) === 'number' ? 'number' : 'text'
    };
};

const normalizeBlock = (block, context) => {
    const blockObject = readPlainObject(block);
    const ref = readText(blockObject.ref);
    const fields = {};
    Object.entries(readPlainObject(blockObject.fields)).forEach(([name, value]) => {
        const fieldName = readText(name);
        if (fieldName) fields[fieldName] = normalizeFieldValue(value);
    });
    const inputs = {};
    Object.entries(readPlainObject(blockObject.inputs)).forEach(([name, value]) => {
        const inputName = readText(name);
        if (inputName) {
            inputs[inputName] = normalizeInputValue(value, context && Object.assign({}, context, {
                inputName,
                parentRef: ref
            }));
        }
    });
    return {
        ref,
        opcode: readText(blockObject.opcode),
        nextRef: blockObject.nextRef === null ? null : readText(blockObject.nextRef),
        parentRef: blockObject.parentRef === null ? null : readText(blockObject.parentRef),
        fields,
        inputs
    };
};

const collectConcepts = scripts => {
    const concepts = [];
    scripts.forEach(script => {
        script.blocks.forEach(block => {
            readArray(OPCODE_CONCEPTS[block.opcode]).forEach(concept => {
                if (!concepts.includes(concept)) concepts.push(concept);
            });
        });
    });
    return concepts;
};

const validateScriptConnections = script => {
    const refs = new Set(script.blocks.map(block => block.ref));
    const firstBlock = script.blocks[0];
    if (!firstBlock || !HAT_OPCODES.has(firstBlock.opcode)) {
        throw createRouteError({
            code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
            message: 'Each generated script must start with a supported event block.'
        });
    }
    if (firstBlock.parentRef) {
        throw createRouteError({
            code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
            message: 'A generated script hat block must not have a parentRef.'
        });
    }

    script.blocks.forEach(block => {
        if (!block.ref) {
            throw createRouteError({
                code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
                message: 'Every generated block must include a ref.'
            });
        }
        if (!ALLOWED_OPCODE_SET.has(block.opcode)) {
            throw createRouteError({
                code: NL_BLOCKS_ERROR_CODES.UNSUPPORTED_OPCODE,
                details: {
                    opcode: block.opcode
                },
                message: `Unsupported Scratch opcode in generated script: ${block.opcode}`
            });
        }
        if (block.nextRef && !refs.has(block.nextRef)) {
            throw createRouteError({
                code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
                message: `Generated block ${block.ref} points to an unknown nextRef.`
            });
        }
        if (block.parentRef && !refs.has(block.parentRef)) {
            throw createRouteError({
                code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
                message: `Generated block ${block.ref} points to an unknown parentRef.`
            });
        }
        Object.values(block.inputs).forEach(input => {
            if (input.blockRef && !refs.has(input.blockRef)) {
                throw createRouteError({
                    code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
                    message: `Generated block ${block.ref} points to an unknown input ref.`
                });
            }
        });
    });
};

const validateAndNormalizeModelDraft = draft => {
    const draftObject = readPlainObject(draft);
    if (draftObject.schemaVersion !== SCRIPT_DRAFT_SCHEMA_VERSION) {
        throw createRouteError({
            code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
            message: 'Model output used an unsupported schemaVersion.'
        });
    }
    if (draftObject.completeScript !== true || draftObject.insertIntoWorkspace !== false) {
        throw createRouteError({
            code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
            message: 'Model output must be a complete, review-only script draft.'
        });
    }

    const scripts = readArray(draftObject.scripts).slice(0, MAX_SCRIPTS).map((script, index) => {
        const rawBlocks = readArray(script && script.blocks).slice(0, MAX_BLOCKS_PER_SCRIPT);
        const refs = new Set(rawBlocks.map(block => readText(block && block.ref)).filter(Boolean));
        const context = {
            embeddedBlocks: [],
            refs
        };
        const blocks = rawBlocks.map(block => normalizeBlock(block, context)).concat(context.embeddedBlocks);
        if (blocks.length > MAX_BLOCKS_PER_SCRIPT) {
            throw createRouteError({
                code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
                message: 'Model output included too many blocks in one script.'
            });
        }
        return {
            ref: readText(script && script.ref) || `script${index + 1}`,
            blocks
        };
    }).filter(script => script.blocks.length > 0);
    const totalBlocks = scripts.reduce((sum, script) => sum + script.blocks.length, 0);
    if (!scripts.length || totalBlocks > MAX_TOTAL_BLOCKS) {
        throw createRouteError({
            code: NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT,
            message: 'Model output did not include a valid reviewable script.'
        });
    }

    scripts.forEach(validateScriptConnections);

    return {
        schemaVersion: SCRIPT_DRAFT_SCHEMA_VERSION,
        completeScript: true,
        insertIntoWorkspace: false,
        target: readText(draftObject.target) || 'Sprite',
        scripts,
        reviewQuestions: readArray(draftObject.reviewQuestions)
            .map(question => readText(question, 180))
            .filter(Boolean)
            .slice(0, 3)
    };
};

const teacherPolicyIncludesConcept = (teacherPolicy, concept) => {
    if (!teacherPolicy || teacherPolicy.active !== true) return true;
    const keywords = TEACHER_CONCEPT_KEYWORDS[concept] || [concept];
    const selectedText = readArray(teacherPolicy.selectedKnowledgePoints)
        .map(point => `${point && point.id || ''} ${point && point.label || ''}`.toLowerCase())
        .join(' ');
    return keywords.some(keyword => selectedText.indexOf(keyword.toLowerCase()) !== -1);
};

const createTeacherPolicyWarnings = ({
    concepts,
    teacherPolicy
}) => {
    if (!teacherPolicy || teacherPolicy.active !== true) return [];
    return concepts
        .filter(concept => !teacherPolicyIncludesConcept(teacherPolicy, concept))
        .map(concept => ({
            concept,
            label: CONCEPT_LABELS[concept] || concept,
            message: `${CONCEPT_LABELS[concept] || concept} 可能超出了当前老师锁定的知识点，请先确认是否允许扩展。`,
            severity: 'notice'
        }));
};

const createDisabledRouteError = () => createRouteError({
    code: NL_BLOCKS_ERROR_CODES.MODEL_DISABLED,
    message: 'Model access is disabled for Scratch AI NL blocks script drafts.',
    statusCode: 503
});

const createNlBlocksScriptDraftReply = async ({
    config,
    fetchImpl,
    modelProvider,
    request
}) => {
    const safetyGate = createModelRequestSafetyGate(request || {});
    const provider = modelProvider || createConfiguredModelProvider({
        config,
        fetchImpl
    });
    const providerInfo = describeModelProvider(provider);

    if (request && request.modelConsent !== true) {
        throw createRouteError({
            code: NL_BLOCKS_ERROR_CODES.MISSING_MODEL_CONSENT,
            details: {
                safetyGate: createSafetyGatePublicSummary(safetyGate)
            },
            message: 'Model consent is required before generating a Scratch script draft.'
        });
    }

    if (!hasReviewedExplainGate(request || {})) {
        throw createRouteError({
            code: NL_BLOCKS_ERROR_CODES.EXPLAIN_GATE_REQUIRED,
            message: 'A reviewed Explain Gate draft is required before generating a Scratch script draft.'
        });
    }

    if (!safetyGate.allowed) {
        throw createRouteError({
            code: NL_BLOCKS_ERROR_CODES.SAFETY_BLOCKED,
            details: {
                safetyGate: createSafetyGatePublicSummary(safetyGate)
            },
            message: 'Model request blocked by the safety gate.'
        });
    }

    if (!config.modelEnabled) {
        throw createDisabledRouteError();
    }

    let normalizedDraft = null;
    let responseJson = null;
    let validationError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            responseJson = await provider.createChatCompletion({
                messages: attempt === 0 ?
                    buildNlBlocksScriptDraftMessages(safetyGate.minimizedRequest) :
                    buildNlBlocksScriptDraftRetryMessages({
                        previousError: validationError,
                        request: safetyGate.minimizedRequest
                    }),
                maxTokens: 5000,
                responseFormat: {
                    type: 'json_object'
                },
                temperature: attempt === 0 ? 0.1 : 0
            });
        } catch (error) {
            throw createRouteError({
                code: NL_BLOCKS_ERROR_CODES.MODEL_REQUEST_FAILED,
                message: 'Model request failed while generating a Scratch script draft.',
                statusCode: 502
            });
        }

        const assistantText = readModelProviderAssistantText(provider, responseJson);
        try {
            normalizedDraft = validateAndNormalizeModelDraft(parseModelJson(assistantText));
            break;
        } catch (error) {
            validationError = error;
            if (attempt === 0 && isRetryableModelDraftError(error)) {
                continue;
            }
            if (error && error.code === NL_BLOCKS_ERROR_CODES.INVALID_MODEL_OUTPUT) {
                throw createInvalidModelFormatError();
            }
            throw error;
        }
    }
    const concepts = collectConcepts(normalizedDraft.scripts);
    const teacherPolicyWarnings = createTeacherPolicyWarnings({
        concepts,
        teacherPolicy: safetyGate.minimizedRequest.teacherPolicy
    });

    return {
        draftId: randomUUID(),
        provider: providerInfo.provider,
        model: providerInfo.model,
        status: 'ready',
        schemaVersion: SCRIPT_DRAFT_SCHEMA_VERSION,
        target: normalizedDraft.target,
        completeScript: true,
        insertIntoWorkspace: false,
        scripts: normalizedDraft.scripts,
        concepts: concepts.map(concept => ({
            id: concept,
            label: CONCEPT_LABELS[concept] || concept
        })),
        teacherPolicyWarnings,
        reviewQuestions: normalizedDraft.reviewQuestions,
        safety: {
            requiresStudentReview: true,
            insertIntoWorkspace: false,
            safetyGate: createSafetyGatePublicSummary(safetyGate)
        },
        usage: responseJson.usage || null
    };
};

export {
    ALLOWED_OPCODES,
    NL_BLOCKS_ERROR_CODES,
    SCRIPT_DRAFT_SCHEMA_VERSION,
    buildNlBlocksScriptDraftMessages,
    createNlBlocksScriptDraftReply,
    validateAndNormalizeModelDraft
};

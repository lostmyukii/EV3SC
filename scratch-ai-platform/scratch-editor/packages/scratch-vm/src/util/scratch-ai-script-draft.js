const uid = require('./uid');
const Variable = require('../engine/variable');

const SCRIPT_DRAFT_SCHEMA_VERSION = 'scratch-ai-nl-blocks-script-draft-v1';

const ALLOWED_OPCODES = new Set([
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

const HAT_OPCODES = new Set([
    'event_whenflagclicked',
    'event_whenkeypressed',
    'event_whenthisspriteclicked'
]);

const readArray = value => (Array.isArray(value) ? value : []);

const readObject = value => (
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const readText = value => {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
};

const getFieldValue = value => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return readText(value);
    }
    const field = readObject(value);
    return readText(field.value || field.name);
};

const createField = (name, value) => ({
    name,
    value: getFieldValue(value)
});

const ensureScalarVariable = (target, name, createdVariables) => {
    const variableName = readText(name) || 'score';
    let variable = target.lookupVariableByNameAndType(variableName, Variable.SCALAR_TYPE);
    if (!variable) {
        const variableId = uid();
        target.createVariable(variableId, variableName, Variable.SCALAR_TYPE);
        variable = target.lookupVariableById(variableId);
        createdVariables.push({
            id: variableId,
            name: variableName
        });
    }
    return variable;
};

const createScratchField = ({
    createdVariables,
    name,
    target,
    value
}) => {
    if (name === 'VARIABLE') {
        const variable = ensureScalarVariable(target, getFieldValue(value), createdVariables);
        return {
            id: variable.id,
            name,
            value: variable.name,
            variableType: Variable.SCALAR_TYPE
        };
    }
    return createField(name, value);
};

const createLiteralShadow = ({
    parentId,
    value
}) => {
    const inputValue = readObject(value);
    const valueType = readText(inputValue.valueType || inputValue.type);
    const isNumber = valueType === 'number' || typeof inputValue.literal === 'number';
    const fieldName = isNumber ? 'NUM' : 'TEXT';
    const literal = typeof inputValue.literal === 'number' ? inputValue.literal : getFieldValue(inputValue.literal);
    const id = uid();

    return {
        id,
        opcode: isNumber ? 'math_number' : 'text',
        inputs: {},
        fields: {
            [fieldName]: {
                name: fieldName,
                value: literal
            }
        },
        next: null,
        parent: parentId,
        shadow: true,
        topLevel: false
    };
};

const createInput = ({
    inputName,
    parentId,
    refToId,
    shadowBlocks,
    value
}) => {
    if (typeof value === 'string') {
        return {
            name: inputName,
            block: refToId.get(value) || null,
            shadow: null
        };
    }

    const inputValue = readObject(value);
    const blockRef = readText(inputValue.blockRef || inputValue.ref || inputValue.substackRef);
    if (blockRef) {
        return {
            name: inputName,
            block: refToId.get(blockRef) || null,
            shadow: null
        };
    }

    const shadow = createLiteralShadow({
        parentId,
        value: inputValue
    });
    shadowBlocks.push(shadow);
    return {
        name: inputName,
        block: shadow.id,
        shadow: shadow.id
    };
};

const readInputBlockRef = value => {
    if (typeof value === 'string') return readText(value);
    const inputValue = readObject(value);
    return readText(inputValue.blockRef || inputValue.ref || inputValue.substackRef);
};

const validateDraft = draft => {
    if (!draft || draft.schemaVersion !== SCRIPT_DRAFT_SCHEMA_VERSION) {
        throw new Error('Scratch AI script draft has an unsupported schemaVersion.');
    }
    if (draft.completeScript !== true || draft.insertIntoWorkspace !== false) {
        throw new Error('Scratch AI script draft must be complete and review-only before insertion.');
    }
    const scripts = readArray(draft.scripts);
    if (!scripts.length) throw new Error('Scratch AI script draft does not contain scripts.');
    scripts.forEach(script => {
        const blocks = readArray(script && script.blocks);
        const refs = new Set();
        if (!blocks.length || !HAT_OPCODES.has(readText(blocks[0] && blocks[0].opcode))) {
            throw new Error('Scratch AI script draft scripts must start with an event block.');
        }
        blocks.forEach(block => {
            const ref = readText(block && block.ref);
            if (!ref) {
                throw new Error('Scratch AI script draft blocks must include refs.');
            }
            if (refs.has(ref)) {
                throw new Error(`Scratch AI script draft contains duplicate ref: ${ref}`);
            }
            refs.add(ref);
        });
        blocks.forEach(block => {
            const opcode = readText(block && block.opcode);
            if (!ALLOWED_OPCODES.has(opcode)) {
                throw new Error(`Scratch AI script draft contains unsupported opcode: ${opcode}`);
            }
            const nextRef = readText(block && block.nextRef);
            if (nextRef && !refs.has(nextRef)) {
                throw new Error(`Scratch AI script draft contains unknown nextRef: ${nextRef}`);
            }
            const parentRef = readText(block && block.parentRef);
            if (parentRef && !refs.has(parentRef)) {
                throw new Error(`Scratch AI script draft contains unknown parentRef: ${parentRef}`);
            }
            Object.values(readObject(block && block.inputs)).forEach(input => {
                const inputRef = readInputBlockRef(input);
                if (inputRef && !refs.has(inputRef)) {
                    throw new Error(`Scratch AI script draft contains unknown input ref: ${inputRef}`);
                }
            });
        });
    });
};

const createScratchBlocksForScript = ({
    createdVariables,
    script,
    target,
    x,
    y
}) => {
    const draftBlocks = readArray(script && script.blocks);
    const refToId = new Map();
    draftBlocks.forEach(block => {
        refToId.set(readText(block && block.ref), uid());
    });

    const shadowBlocks = [];
    const blocks = draftBlocks.map((block, index) => {
        const blockRef = readText(block.ref);
        const id = refToId.get(blockRef);
        const fields = {};
        Object.entries(readObject(block.fields)).forEach(([name, value]) => {
            const fieldName = readText(name);
            if (fieldName) {
                fields[fieldName] = createScratchField({
                    createdVariables,
                    name: fieldName,
                    target,
                    value
                });
            }
        });

        const inputs = {};
        Object.entries(readObject(block.inputs)).forEach(([name, value]) => {
            const inputName = readText(name);
            if (inputName) {
                inputs[inputName] = createInput({
                    inputName,
                    parentId: id,
                    refToId,
                    shadowBlocks,
                    value
                });
            }
        });

        return {
            id,
            opcode: readText(block.opcode),
            inputs,
            fields,
            next: block.nextRef ? refToId.get(readText(block.nextRef)) || null : null,
            parent: block.parentRef ? refToId.get(readText(block.parentRef)) || null : null,
            shadow: false,
            topLevel: index === 0,
            x,
            y
        };
    });

    return blocks.concat(shadowBlocks);
};

const insertScratchAIScriptDraft = ({
    draft,
    target
}) => {
    if (!target || !target.blocks) {
        throw new Error('Scratch AI script draft insertion requires a Scratch target.');
    }
    validateDraft(draft);

    const createdVariables = [];
    const scripts = readArray(draft.scripts);
    const blocks = [];
    scripts.forEach((script, index) => {
        blocks.push(...createScratchBlocksForScript({
            createdVariables,
            script,
            target,
            x: 80 + (index * 40),
            y: 80 + (index * 60)
        }));
    });

    blocks.forEach(block => {
        target.blocks.createBlock(block);
    });
    target.blocks.updateTargetSpecificBlocks(target.isStage);

    return {
        blocksCreated: blocks.length,
        scriptsCreated: scripts.length,
        variablesCreated: createdVariables
    };
};

module.exports = {
    SCRIPT_DRAFT_SCHEMA_VERSION,
    insertScratchAIScriptDraft
};

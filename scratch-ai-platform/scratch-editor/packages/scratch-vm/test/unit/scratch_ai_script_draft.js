const test = require('tap').test;

const {
    SCRIPT_DRAFT_SCHEMA_VERSION,
    insertScratchAIScriptDraft
} = require('../../src/util/scratch-ai-script-draft');

const createTarget = () => {
    const target = {
        blocks: {
            _blocks: {},
            createBlock: block => {
                target.blocks._blocks[block.id] = block;
            },
            updateTargetSpecificBlocks: () => {
                target.blocksUpdated = true;
            }
        },
        blocksUpdated: false,
        isStage: false,
        variables: {},
        lookupVariableById: id => target.variables[id],
        lookupVariableByNameAndType: (name, type) => Object.values(target.variables)
            .find(variable => variable.name === name && variable.type === type),
        createVariable: (id, name, type) => {
            target.variables[id] = {
                id,
                isCloud: false,
                name,
                type,
                value: 0
            };
        }
    };
    return target;
};

const createDraft = blocks => ({
    schemaVersion: SCRIPT_DRAFT_SCHEMA_VERSION,
    completeScript: true,
    insertIntoWorkspace: false,
    target: 'Sprite',
    scripts: [{
        ref: 'script1',
        blocks
    }]
});

const createHelloScriptBlocks = () => ([{
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
}]);

test('insertScratchAIScriptDraft inserts a reviewed script into the editing target', t => {
    const target = createTarget();

    const result = insertScratchAIScriptDraft({
        draft: createDraft(createHelloScriptBlocks()),
        target
    });

    const blocks = Object.values(target.blocks._blocks);
    t.equal(result.scriptsCreated, 1);
    t.equal(result.blocksCreated, 4);
    t.equal(blocks.filter(block => block.opcode === 'event_whenflagclicked').length, 1);
    t.equal(blocks.filter(block => block.opcode === 'looks_sayforsecs').length, 1);
    t.equal(blocks.filter(block => block.shadow).length, 2);
    t.equal(target.blocksUpdated, true);
    t.end();
});

test('insertScratchAIScriptDraft rejects unknown next refs', t => {
    const target = createTarget();
    const blocks = createHelloScriptBlocks();
    blocks[0].nextRef = 'missing';

    t.throws(() => insertScratchAIScriptDraft({
        draft: createDraft(blocks),
        target
    }), /unknown nextRef: missing/);
    t.equal(Object.keys(target.blocks._blocks).length, 0);
    t.end();
});

test('insertScratchAIScriptDraft rejects unknown parent refs', t => {
    const target = createTarget();
    const blocks = createHelloScriptBlocks();
    blocks[1].parentRef = 'missing-parent';

    t.throws(() => insertScratchAIScriptDraft({
        draft: createDraft(blocks),
        target
    }), /unknown parentRef: missing-parent/);
    t.equal(Object.keys(target.blocks._blocks).length, 0);
    t.end();
});

test('insertScratchAIScriptDraft rejects unknown input refs', t => {
    const target = createTarget();

    t.throws(() => insertScratchAIScriptDraft({
        draft: createDraft([{
            ref: 'start',
            opcode: 'event_whenflagclicked',
            nextRef: 'say',
            parentRef: null,
            fields: {},
            inputs: {}
        }, {
            ref: 'say',
            opcode: 'looks_say',
            nextRef: null,
            parentRef: 'start',
            fields: {},
            inputs: {
                MESSAGE: {
                    blockRef: 'missing-input'
                }
            }
        }]),
        target
    }), /unknown input ref: missing-input/);
    t.equal(Object.keys(target.blocks._blocks).length, 0);
    t.end();
});

test('insertScratchAIScriptDraft creates scalar variables by name', t => {
    const target = createTarget();

    const result = insertScratchAIScriptDraft({
        draft: createDraft([{
            ref: 'start',
            opcode: 'event_whenflagclicked',
            nextRef: 'setScore',
            parentRef: null,
            fields: {},
            inputs: {}
        }, {
            ref: 'setScore',
            opcode: 'data_setvariableto',
            nextRef: null,
            parentRef: 'start',
            fields: {
                VARIABLE: 'score'
            },
            inputs: {
                VALUE: {
                    literal: 0,
                    valueType: 'number'
                }
            }
        }]),
        target
    });

    const variable = Object.values(target.variables)[0];
    const setBlock = Object.values(target.blocks._blocks)
        .find(block => block.opcode === 'data_setvariableto');
    t.equal(result.variablesCreated.length, 1);
    t.equal(variable.name, 'score');
    t.equal(setBlock.fields.VARIABLE.id, variable.id);
    t.equal(setBlock.fields.VARIABLE.value, 'score');
    t.end();
});

test('insertScratchAIScriptDraft inserts only Scratch block and variable data', t => {
    const target = createTarget();
    const draft = createDraft(createHelloScriptBlocks());
    draft.draftId = 'private-draft-id';
    draft.provider = 'model-provider';
    draft.reviewQuestions = ['What should you check?'];
    draft.teacherPolicyWarnings = [{
        concept: 'output',
        message: 'Teacher-only note'
    }];

    insertScratchAIScriptDraft({
        draft,
        target
    });

    const workspaceJson = JSON.stringify({
        blocks: target.blocks._blocks,
        variables: target.variables
    });
    t.notMatch(workspaceJson, /private-draft-id|model-provider|reviewQuestions|Teacher-only note/);
    t.notMatch(workspaceJson, /schemaVersion|insertIntoWorkspace|completeScript/);
    t.end();
});

test('insertScratchAIScriptDraft rejects unsupported opcodes', t => {
    const target = createTarget();

    t.throws(() => insertScratchAIScriptDraft({
        draft: createDraft([{
            ref: 'start',
            opcode: 'event_whenflagclicked',
            nextRef: 'sound',
            parentRef: null,
            fields: {},
            inputs: {}
        }, {
            ref: 'sound',
            opcode: 'sound_play',
            nextRef: null,
            parentRef: 'start',
            fields: {},
            inputs: {}
        }]),
        target
    }), /unsupported opcode/);
    t.end();
});

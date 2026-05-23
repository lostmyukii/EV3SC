const EventEmitter = require('events');
const test = require('tap').test;

const ArgumentType = require('../../src/extension-support/argument-type');
const BlockType = require('../../src/extension-support/block-type');
const {
    isScratchAIAdditionTemplateEnabled,
    isScratchAIExtensionEnabled,
    isScratchAIOneLineProjectEnabled,
    isScratchAIVoiceBlocksEnabled,
    isSpeechToTextExtensionEnabled,
    isTextToSpeechExtensionEnabled,
    isTranslateExtensionEnabled,
    readEnvFlag
} = require('../../src/util/ai-feature-flags');
const Scratch3AIBlocks = require('../../src/extensions/scratch3_ai');

const createRuntime = () => {
    const runtime = new EventEmitter();
    runtime.targets = [];
    return runtime;
};

test('AI extension flag requires both AI and extension flags', t => {
    const previousAIEnabled = process.env.SCRATCH_AI_ENABLED;
    const previousExtensionEnabled = process.env.SCRATCH_AI_EXTENSION_ENABLED;
    const previousVoiceEnabled = process.env.SCRATCH_AI_VOICE_BLOCKS_ENABLED;
    const previousOneLineEnabled = process.env.SCRATCH_AI_ONE_LINE_PROJECT_ENABLED;
    const previousAdditionEnabled = process.env.SCRATCH_AI_ADDITION_TEMPLATE_ENABLED;

    process.env.SCRATCH_AI_ENABLED = 'true';
    process.env.SCRATCH_AI_EXTENSION_ENABLED = 'false';
    process.env.SCRATCH_AI_VOICE_BLOCKS_ENABLED = 'true';
    process.env.SCRATCH_AI_ONE_LINE_PROJECT_ENABLED = 'true';
    process.env.SCRATCH_AI_ADDITION_TEMPLATE_ENABLED = 'true';
    t.equal(readEnvFlag('SCRATCH_AI_ENABLED'), true);
    t.equal(isScratchAIExtensionEnabled(), false);
    t.equal(isScratchAIVoiceBlocksEnabled(), true);
    t.equal(isScratchAIOneLineProjectEnabled(), true);
    t.equal(isScratchAIAdditionTemplateEnabled(), true);

    process.env.SCRATCH_AI_EXTENSION_ENABLED = 'true';
    t.equal(isScratchAIExtensionEnabled(), true);

    if (typeof previousAIEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_ENABLED;
    } else {
        process.env.SCRATCH_AI_ENABLED = previousAIEnabled;
    }

    if (typeof previousExtensionEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_EXTENSION_ENABLED;
    } else {
        process.env.SCRATCH_AI_EXTENSION_ENABLED = previousExtensionEnabled;
    }

    if (typeof previousVoiceEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_VOICE_BLOCKS_ENABLED;
    } else {
        process.env.SCRATCH_AI_VOICE_BLOCKS_ENABLED = previousVoiceEnabled;
    }

    if (typeof previousOneLineEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_ONE_LINE_PROJECT_ENABLED;
    } else {
        process.env.SCRATCH_AI_ONE_LINE_PROJECT_ENABLED = previousOneLineEnabled;
    }

    if (typeof previousAdditionEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_ADDITION_TEMPLATE_ENABLED;
    } else {
        process.env.SCRATCH_AI_ADDITION_TEMPLATE_ENABLED = previousAdditionEnabled;
    }

    t.end();
});

test('AI Logic Coach extension exposes Q18 blocks only behind their flags', t => {
    const previousAIEnabled = process.env.SCRATCH_AI_ENABLED;
    const previousVoiceEnabled = process.env.SCRATCH_AI_VOICE_BLOCKS_ENABLED;
    const previousOneLineEnabled = process.env.SCRATCH_AI_ONE_LINE_PROJECT_ENABLED;
    const previousAdditionEnabled = process.env.SCRATCH_AI_ADDITION_TEMPLATE_ENABLED;

    process.env.SCRATCH_AI_ENABLED = 'true';
    process.env.SCRATCH_AI_VOICE_BLOCKS_ENABLED = 'true';
    process.env.SCRATCH_AI_ONE_LINE_PROJECT_ENABLED = 'true';
    process.env.SCRATCH_AI_ADDITION_TEMPLATE_ENABLED = 'true';

    const extension = new Scratch3AIBlocks(createRuntime());
    const info = extension.getInfo();
    const opcodes = info.blocks.map(block => block.opcode);

    t.ok(opcodes.includes('draftVoice'));
    t.ok(opcodes.includes('planOneLineProject'));
    t.ok(opcodes.includes('openAdditionTemplate'));
    t.equal(info.blocks.find(block => block.opcode === 'draftVoice').blockType, BlockType.COMMAND);

    if (typeof previousAIEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_ENABLED;
    } else {
        process.env.SCRATCH_AI_ENABLED = previousAIEnabled;
    }

    if (typeof previousVoiceEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_VOICE_BLOCKS_ENABLED;
    } else {
        process.env.SCRATCH_AI_VOICE_BLOCKS_ENABLED = previousVoiceEnabled;
    }

    if (typeof previousOneLineEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_ONE_LINE_PROJECT_ENABLED;
    } else {
        process.env.SCRATCH_AI_ONE_LINE_PROJECT_ENABLED = previousOneLineEnabled;
    }

    if (typeof previousAdditionEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_ADDITION_TEMPLATE_ENABLED;
    } else {
        process.env.SCRATCH_AI_ADDITION_TEMPLATE_ENABLED = previousAdditionEnabled;
    }

    t.end();
});

test('external Scratch service extension flags default off and do not require main AI flag', t => {
    const previousTextToSpeechEnabled = process.env.SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED;
    const previousTranslateEnabled = process.env.SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED;
    const previousSpeechToTextEnabled = process.env.SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED;

    delete process.env.SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED;
    delete process.env.SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED;
    delete process.env.SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED;

    t.equal(isTextToSpeechExtensionEnabled(), false);
    t.equal(isTranslateExtensionEnabled(), false);
    t.equal(isSpeechToTextExtensionEnabled(), false);

    process.env.SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED = 'true';
    process.env.SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED = 'true';
    process.env.SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED = 'true';

    t.equal(isTextToSpeechExtensionEnabled(), true);
    t.equal(isTranslateExtensionEnabled(), true);
    t.equal(isSpeechToTextExtensionEnabled(), true);

    if (typeof previousTextToSpeechEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED;
    } else {
        process.env.SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED = previousTextToSpeechEnabled;
    }

    if (typeof previousTranslateEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED;
    } else {
        process.env.SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED = previousTranslateEnabled;
    }

    if (typeof previousSpeechToTextEnabled === 'undefined') {
        delete process.env.SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED;
    } else {
        process.env.SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED = previousSpeechToTextEnabled;
    }

    t.end();
});

test('AI Logic Coach extension exposes low-risk MVP blocks', t => {
    const extension = new Scratch3AIBlocks(createRuntime());
    const info = extension.getInfo();

    t.equal(info.id, 'scratchai');
    t.equal(info.blocks.length, 3);
    t.equal(info.blocks[0].opcode, 'openCoach');
    t.equal(info.blocks[0].blockType, BlockType.COMMAND);
    t.equal(info.blocks[1].opcode, 'recordExplanation');
    t.equal(info.blocks[1].blockType, BlockType.COMMAND);
    t.equal(info.blocks[1].arguments.TEXT.type, ArgumentType.STRING);
    t.equal(info.blocks[2].opcode, 'nextQuestion');
    t.equal(info.blocks[2].blockType, BlockType.REPORTER);
    t.same(
        info.menus.explanationFields.items.map(item => item.value),
        ['goal', 'logic', 'evidence']
    );
    t.end();
});

test('openCoach emits a panel action without mutating the project', t => {
    const runtime = createRuntime();
    const extension = new Scratch3AIBlocks(runtime);
    const targetsBefore = runtime.targets;

    runtime.once(Scratch3AIBlocks.AI_LOGIC_COACH_VM_EVENT, payload => {
        t.equal(payload.extensionId, 'scratchai');
        t.equal(payload.source, 'scratchai-extension');
        t.equal(payload.action, 'open-panel');
        t.equal(runtime.targets, targetsBefore);
        t.end();
    });

    extension.openCoach();
});

test('recordExplanation emits bounded student text and a normalized field', t => {
    const runtime = createRuntime();
    const extension = new Scratch3AIBlocks(runtime);
    const longText = `${'a'.repeat(260)} secret tail`;

    runtime.once(Scratch3AIBlocks.AI_LOGIC_COACH_VM_EVENT, payload => {
        t.equal(payload.action, 'record-explanation');
        t.equal(payload.field, 'goal');
        t.equal(payload.text.length, 240);
        t.notMatch(payload.text, /secret tail/);
        t.end();
    });

    extension.recordExplanation({
        FIELD: 'unknown field',
        TEXT: longText
    });
});

test('nextQuestion is local and depends only on project structure', t => {
    const runtime = createRuntime();
    const extension = new Scratch3AIBlocks(runtime);

    t.equal(
        extension.nextQuestion(),
        'What should happen first when someone starts your project?'
    );

    runtime.targets = [
        {
            blocks: {
                _blocks: {
                    a: {
                        id: 'a',
                        opcode: 'motion_movesteps',
                        topLevel: true
                    }
                },
                getScripts: () => ['a']
            },
            isStage: false
        }
    ];

    t.equal(extension.nextQuestion(), 'Which event block should start this idea?');

    runtime.targets[0].blocks._blocks.b = {
        id: 'b',
        opcode: 'event_whenflagclicked',
        topLevel: true
    };
    runtime.targets[0].blocks.getScripts = () => ['a', 'b'];

    t.equal(extension.nextQuestion(), 'Which loose script should connect to a starting block?');

    runtime.targets[0].blocks.getScripts = () => ['b'];
    t.equal(
        extension.nextQuestion(),
        'What will you test on the stage to prove this logic works?'
    );
    t.end();
});

test('Q18 extension commands emit bounded preview actions without mutating targets', t => {
    const runtime = createRuntime();
    const extension = new Scratch3AIBlocks(runtime);
    const targetsBefore = runtime.targets;
    const actions = [];

    runtime.on(Scratch3AIBlocks.AI_LOGIC_COACH_VM_EVENT, payload => {
        actions.push(payload);
        if (actions.length < 3) return;

        t.same(actions.map(action => action.action), [
            'q18-voice-draft',
            'q18-one-line-project',
            'q18-addition-template'
        ]);
        t.equal(actions[0].text.length, 240);
        t.notMatch(actions[0].text, /tail/);
        t.equal(runtime.targets, targetsBefore);
        t.end();
    });

    extension.draftVoice({
        TEXT: `${'v'.repeat(260)} tail`
    });
    extension.planOneLineProject({
        TEXT: 'Make a project skeleton'
    });
    extension.openAdditionTemplate({
        TEXT: 'Add two numbers'
    });
});

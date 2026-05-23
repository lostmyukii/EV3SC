const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const {
    isScratchAIAdditionTemplateEnabled,
    isScratchAIOneLineProjectEnabled,
    isScratchAIVoiceBlocksEnabled
} = require('../../util/ai-feature-flags');

const AI_LOGIC_COACH_VM_EVENT = 'scratch-ai-logic-coach-extension-action';

const EXPLANATION_FIELDS = Object.freeze({
    GOAL: 'goal',
    LOGIC: 'logic',
    EVIDENCE: 'evidence'
});

const EVENT_HAT_OPCODES = new Set([
    'event_whenflagclicked',
    'event_whenkeypressed',
    'event_whenthisspriteclicked',
    'event_whenstageclicked',
    'event_whenbackdropswitchesto',
    'event_whengreaterthan',
    'event_whenbroadcastreceived',
    'event_whentouchingobject'
]);

const TEXT_LIMIT = 240;

const truncateText = value => {
    if (typeof value === 'undefined' || value === null) return '';
    return Cast.toString(value)
        .trim()
        .slice(0, TEXT_LIMIT);
};

const normalizeExplanationField = value => {
    if (typeof value === 'undefined' || value === null) return EXPLANATION_FIELDS.GOAL;
    const normalized = Cast.toString(value)
        .trim()
        .toLowerCase();
    if (
        normalized === EXPLANATION_FIELDS.GOAL ||
        normalized === EXPLANATION_FIELDS.LOGIC ||
        normalized === EXPLANATION_FIELDS.EVIDENCE
    ) {
        return normalized;
    }
    return EXPLANATION_FIELDS.GOAL;
};

const createQ18CommandBlock = ({
    defaultValue,
    opcode,
    text
}) => ({
    opcode,
    text,
    blockType: BlockType.COMMAND,
    arguments: {
        TEXT: {
            type: ArgumentType.STRING,
            defaultValue
        }
    }
});

const readBlockMap = target => {
    if (!target || !target.blocks) return {};
    return target.blocks._blocks || {};
};

const readScriptIds = (target, blockMap) => {
    if (target && target.blocks && typeof target.blocks.getScripts === 'function') {
        return target.blocks.getScripts();
    }
    return Object.keys(blockMap).filter(blockId => blockMap[blockId] && blockMap[blockId].topLevel);
};

const readProjectCounts = runtime => {
    const targets = runtime && Array.isArray(runtime.targets) ? runtime.targets : [];
    return targets.reduce((summary, target) => {
        if (!target || target.isOriginal === false) return summary;

        if (target.isStage) {
            summary.stageCount++;
        } else {
            summary.spriteCount++;
        }

        const blockMap = readBlockMap(target);
        Object.values(blockMap).forEach(block => {
            if (!block || block.shadow) return;
            summary.blockCount++;
            if (EVENT_HAT_OPCODES.has(block.opcode)) {
                summary.startCount++;
            }
        });
        summary.scriptCount += readScriptIds(target, blockMap).length;
        return summary;
    }, {
        blockCount: 0,
        scriptCount: 0,
        spriteCount: 0,
        stageCount: 0,
        startCount: 0
    });
};

/**
 * Low-risk AI Logic Coach blocks.
 *
 * These blocks do not call a model, do not generate Scratch scripts, and do not
 * mutate the project. Command blocks only emit a small runtime event so the GUI
 * panel can open or record the student's own explanation.
 */
class Scratch3AIBlocks {
    constructor (runtime) {
        this.runtime = runtime;
    }

    getInfo () {
        const blocks = [
            {
                opcode: 'openCoach',
                text: 'open AI thinking helper',
                blockType: BlockType.COMMAND
            },
            {
                opcode: 'recordExplanation',
                text: 'record my explanation [TEXT] as [FIELD]',
                blockType: BlockType.COMMAND,
                arguments: {
                    TEXT: {
                        type: ArgumentType.STRING,
                        defaultValue: 'I want my project to...'
                    },
                    FIELD: {
                        type: ArgumentType.STRING,
                        menu: 'explanationFields',
                        defaultValue: EXPLANATION_FIELDS.GOAL
                    }
                }
            },
            {
                opcode: 'nextQuestion',
                text: 'next thinking question',
                blockType: BlockType.REPORTER
            }
        ];

        if (isScratchAIVoiceBlocksEnabled()) {
            blocks.push(createQ18CommandBlock({
                defaultValue: 'Hello from my project',
                opcode: 'draftVoice',
                text: 'draft AI voice idea [TEXT]'
            }));
        }

        if (isScratchAIOneLineProjectEnabled()) {
            blocks.push(createQ18CommandBlock({
                defaultValue: 'A game where a sprite asks a math question',
                opcode: 'planOneLineProject',
                text: 'plan project skeleton [TEXT]'
            }));
        }

        if (isScratchAIAdditionTemplateEnabled()) {
            blocks.push(createQ18CommandBlock({
                defaultValue: 'Add two numbers and show the result',
                opcode: 'openAdditionTemplate',
                text: 'open addition template [TEXT]'
            }));
        }

        return {
            id: 'scratchai',
            name: 'AI Logic Coach',
            color1: '#4C97FF',
            color2: '#3373CC',
            color3: '#2E5AA7',
            blocks,
            menus: {
                explanationFields: {
                    acceptReporters: true,
                    items: [
                        {
                            text: 'what I want',
                            value: EXPLANATION_FIELDS.GOAL
                        },
                        {
                            text: 'how it works',
                            value: EXPLANATION_FIELDS.LOGIC
                        },
                        {
                            text: 'how I will check',
                            value: EXPLANATION_FIELDS.EVIDENCE
                        }
                    ]
                }
            }
        };
    }

    openCoach () {
        this._emitCoachAction({
            action: 'open-panel'
        });
    }

    recordExplanation (args) {
        const text = truncateText(args && args.TEXT);
        if (!text) return;

        this._emitCoachAction({
            action: 'record-explanation',
            field: normalizeExplanationField(args && args.FIELD),
            text
        });
    }

    nextQuestion () {
        const summary = readProjectCounts(this.runtime);
        if (!summary.blockCount) {
            return 'What should happen first when someone starts your project?';
        }
        if (!summary.startCount) {
            return 'Which event block should start this idea?';
        }
        if (summary.scriptCount > summary.startCount) {
            return 'Which loose script should connect to a starting block?';
        }
        return 'What will you test on the stage to prove this logic works?';
    }

    draftVoice (args) {
        this._emitQ18Action('q18-voice-draft', args);
    }

    planOneLineProject (args) {
        this._emitQ18Action('q18-one-line-project', args);
    }

    openAdditionTemplate (args) {
        this._emitQ18Action('q18-addition-template', args);
    }

    _emitQ18Action (action, args) {
        const text = truncateText(args && args.TEXT);
        if (!text) return;

        this._emitCoachAction({
            action,
            text
        });
    }

    _emitCoachAction (payload) {
        if (!this.runtime || typeof this.runtime.emit !== 'function') return;
        this.runtime.emit(AI_LOGIC_COACH_VM_EVENT, Object.assign({
            extensionId: 'scratchai',
            source: 'scratchai-extension'
        }, payload));
    }
}

module.exports = Scratch3AIBlocks;
module.exports.AI_LOGIC_COACH_VM_EVENT = AI_LOGIC_COACH_VM_EVENT;
module.exports.EXPLANATION_FIELDS = EXPLANATION_FIELDS;

/* eslint-env jest */
import createNlBlocksDraft, {
    BLOCK_DRAFT_CONCEPTS,
    BLOCK_DRAFT_STATUS
} from '../../../src/lib/ai/block-draft';

const createProjectSummary = ({
    broadcasts = [],
    targetName = 'Cat'
} = {}) => ({
    broadcasts: {
        messages: broadcasts.map(name => ({name}))
    },
    targets: {
        items: [
            {
                isStage: true,
                name: 'Stage'
            },
            {
                isStage: false,
                name: targetName
            }
        ]
    }
});

describe('createNlBlocksDraft', () => {
    test('returns an empty preview when the explain gate has no text', () => {
        const draft = createNlBlocksDraft({
            gateDraft: {},
            projectSummary: createProjectSummary()
        });

        expect(draft.status).toBe(BLOCK_DRAFT_STATUS.EMPTY);
        expect(draft.steps).toEqual([]);
        expect(draft.jsonPlan).toBe('');
        expect(draft.values.target).toBe('Cat');
    });

    test('creates a preview-only JSON and Blockly outline from student intent', () => {
        const draft = createNlBlocksDraft({
            gateDraft: {
                goal: 'Make a quiz that says right or wrong and changes score.',
                logic: 'When green flag starts, ask for an answer, if it is correct then add points.',
                evidence: 'I will type an answer and should see the score change.'
            },
            projectSummary: createProjectSummary({
                broadcasts: ['round-done'],
                targetName: 'QuizCat'
            })
        });
        const plan = JSON.parse(draft.jsonPlan);
        const conceptIds = draft.concepts.map(concept => concept.id);

        expect(draft.status).toBe(BLOCK_DRAFT_STATUS.READY);
        expect(conceptIds).toEqual(expect.arrayContaining([
            BLOCK_DRAFT_CONCEPTS.EVENT,
            BLOCK_DRAFT_CONCEPTS.SEQUENCE,
            BLOCK_DRAFT_CONCEPTS.INPUT,
            BLOCK_DRAFT_CONCEPTS.CONDITION,
            BLOCK_DRAFT_CONCEPTS.VARIABLE,
            BLOCK_DRAFT_CONCEPTS.BROADCAST,
            BLOCK_DRAFT_CONCEPTS.OUTPUT
        ]));
        expect(plan.previewOnly).toBe(true);
        expect(plan.insertIntoWorkspace).toBe(false);
        expect(plan.completeScript).toBe(false);
        expect(plan.target).toBe('QuizCat');
        expect(draft.blocklyOutline).toContain('previewOnly="true"');
        expect(draft.blocklyOutline).toContain('insertIntoWorkspace="false"');
    });

    test('does not mutate the gate draft or project summary', () => {
        const gateDraft = {
            evidence: 'I will click and should see the sprite move.',
            goal: 'Show a moving sprite.',
            logic: 'Click the sprite, then move.'
        };
        const projectSummary = createProjectSummary();
        const before = JSON.stringify({
            gateDraft,
            projectSummary
        });

        createNlBlocksDraft({
            gateDraft,
            projectSummary
        });

        expect(JSON.stringify({
            gateDraft,
            projectSummary
        })).toBe(before);
    });

    test('does not emit real Scratch opcodes or workspace insertion data', () => {
        const draft = createNlBlocksDraft({
            gateDraft: {
                evidence: 'I will run it and should see a message.',
                goal: 'Send a message to another sprite.',
                logic: 'When clicked, broadcast a message.'
            },
            projectSummary: createProjectSummary()
        });

        expect(draft.jsonPlan).not.toMatch(/event_when|control_|motion_|looks_/);
        expect(draft.blocklyOutline).not.toMatch(/event_when|control_|motion_|looks_/);
        expect(draft.jsonPlan).not.toMatch(/targets|blocks/);
    });
});

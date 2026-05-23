/* eslint-env jest */
import {
    Q18_TOOL_STATUS,
    createAdditionTemplate,
    createOneLineProjectSkeleton,
    createVoiceDraft
} from '../../../src/lib/ai/q18-learning-tools';

const createProjectSummary = () => ({
    targets: {
        items: [
            {
                isStage: true,
                name: 'Stage'
            },
            {
                isStage: false,
                name: 'Calculator'
            }
        ]
    }
});

describe('Q18 learning tools', () => {
    test('keeps every tool locked until the explain gate is reviewed', () => {
        expect(createVoiceDraft({
            enabled: true,
            text: 'hello'
        }).status).toBe(Q18_TOOL_STATUS.LOCKED);
        expect(createOneLineProjectSkeleton({
            description: 'make a project',
            enabled: true
        }).status).toBe(Q18_TOOL_STATUS.LOCKED);
        expect(createAdditionTemplate({
            description: 'add two numbers',
            enabled: true
        }).status).toBe(Q18_TOOL_STATUS.LOCKED);
    });

    test('creates a voice fallback draft without audio upload or generated sounds', () => {
        const draft = createVoiceDraft({
            enabled: true,
            gateReviewed: true,
            text: 'Say hello when the project starts.'
        });

        expect(draft.status).toBe(Q18_TOOL_STATUS.READY);
        expect(draft.playback.ttsMode).toBe('mock-schema');
        expect(draft.safeguards.soundAssetGenerated).toBe(false);
        expect(draft.safeguards.studentAudioUploaded).toBe(false);
        expect(draft.safeguards.projectMutated).toBe(false);
    });

    test('creates a one-line skeleton with empty target blocks only', () => {
        const skeleton = createOneLineProjectSkeleton({
            description: 'A math helper that adds two numbers.',
            enabled: true,
            gateReviewed: true,
            projectSummary: createProjectSummary()
        });

        expect(skeleton.status).toBe(Q18_TOOL_STATUS.READY);
        expect(skeleton.skeleton.targets).toHaveLength(2);
        expect(skeleton.proof.allTargetBlocksEmpty).toBe(true);
        expect(skeleton.proof.executableScriptsGenerated).toBe(false);
        expect(skeleton.skeleton.targets.every(target => (
            Object.keys(target.blocks).length === 0
        ))).toBe(true);
        expect(JSON.stringify(skeleton)).not.toMatch(/event_when|control_|motion_|operator_/);
    });

    test('creates an addition template with variables and questions but no answer script', () => {
        const template = createAdditionTemplate({
            description: 'Add two numbers and show the result.',
            enabled: true,
            gateReviewed: true
        });

        expect(template.status).toBe(Q18_TOOL_STATUS.READY);
        expect(template.template.variables.map(variable => variable.id)).toEqual([
            'firstNumber',
            'secondNumber',
            'result'
        ]);
        expect(template.template.explainQuestions).toHaveLength(3);
        expect(template.proof.completeAnswerScript).toBe(false);
        expect(template.proof.executableBlocksGenerated).toBe(false);
        expect(template.proof.opcodes).toEqual([]);
    });
});

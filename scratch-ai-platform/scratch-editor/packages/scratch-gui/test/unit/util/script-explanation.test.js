/* eslint-env jest */
import createScriptExplanation, {
    SCRIPT_EXPLANATION_STATUS,
    selectScriptExplanationFlow
} from '../../../src/lib/ai/script-explanation';
import {createLogicFlowPath} from '../../../src/lib/ai/evidence-checklist';

const createFlow = ({
    id = 'target-1:hat-1',
    targetName = 'Sprite1',
    scriptIndex = 1,
    blockCount = 4,
    label = 'Green flag',
    detail = null,
    broadcastSends = []
} = {}) => ({
    id,
    targetName,
    scriptIndex,
    blockCount,
    trigger: {
        label,
        detail
    },
    broadcastSends
});

const createProjectSummary = flows => ({
    logic: {
        flows,
        broadcastLinks: []
    }
});

describe('createScriptExplanation', () => {
    test('returns an empty explanation when there is no started script', () => {
        const explanation = createScriptExplanation({
            projectSummary: createProjectSummary([])
        });

        expect(explanation.status).toBe(SCRIPT_EXPLANATION_STATUS.EMPTY);
        expect(explanation.flow).toBe(null);
        expect(explanation.broadcastNames).toEqual([]);
    });

    test('uses the active logic flow when one is selected', () => {
        const firstFlow = createFlow();
        const selectedFlow = createFlow({
            id: 'target-2:hat-2',
            targetName: 'Cat',
            scriptIndex: 2,
            blockCount: 7,
            label: 'Key press',
            detail: 'space',
            broadcastSends: [
                {name: 'start-game', count: 1}
            ]
        });
        const activePathId = createLogicFlowPath(selectedFlow).pathId;
        const explanation = createScriptExplanation({
            activePathId,
            projectSummary: createProjectSummary([firstFlow, selectedFlow])
        });

        expect(explanation.status).toBe(SCRIPT_EXPLANATION_STATUS.READY);
        expect(explanation.flow).toBe(selectedFlow);
        expect(explanation.path.pathId).toBe(activePathId);
        expect(explanation.values).toEqual(expect.objectContaining({
            blocks: 7,
            entry: 'Key press (space)',
            firstMessage: 'start-game',
            messages: 'start-game',
            script: 2,
            target: 'Cat'
        }));
    });

    test('falls back to the first logic flow without mutating project summary', () => {
        const firstFlow = createFlow({
            broadcastSends: [
                {name: 'a', count: 1},
                {name: 'b', count: 1},
                {name: 'c', count: 1},
                {name: 'd', count: 1}
            ]
        });
        const projectSummary = createProjectSummary([firstFlow]);
        const before = JSON.stringify(projectSummary);

        const selected = selectScriptExplanationFlow({
            activePathId: 'gate:goal',
            projectSummary
        });
        const explanation = createScriptExplanation({
            activePathId: 'gate:goal',
            projectSummary
        });

        expect(selected).toBe(firstFlow);
        expect(explanation.broadcastNames).toEqual(['a', 'b', 'c']);
        expect(JSON.stringify(projectSummary)).toBe(before);
    });
});

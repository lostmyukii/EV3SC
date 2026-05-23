/* eslint-env jest */
import {
    createModelReplyPathAliasTable,
    findModelReplyPathAliases,
    resolveModelReplyPathAlias
} from '../../../src/lib/ai/model-reply-path-aliases';

const createProjectSummary = () => ({
    logic: {
        flows: [{
            id: 'target-1:hat-1',
            targetName: 'Sprite1',
            scriptIndex: 1,
            trigger: {
                label: 'Green flag'
            }
        }, {
            id: 'target-2:hat-2',
            targetName: 'Sprite2',
            scriptIndex: 2,
            trigger: {
                label: 'Click sprite'
            }
        }]
    }
});

describe('model reply path aliases', () => {
    test('creates local aliases without exposing workspace ids to the model request', () => {
        const aliasTable = createModelReplyPathAliasTable(createProjectSummary());

        expect(aliasTable[0]).toEqual(expect.objectContaining({
            aliasPathId: 'logicFlow:script-1',
            pathId: 'logicFlow:target-1%3Ahat-1',
            scriptIndex: 1
        }));
        expect(aliasTable[1]).toEqual(expect.objectContaining({
            aliasPathId: 'logicFlow:script-2',
            pathId: 'logicFlow:target-2%3Ahat-2',
            scriptIndex: 2
        }));
    });

    test('finds aliases mentioned in model replies and resolves them to active path ids', () => {
        const aliasTable = createModelReplyPathAliasTable(createProjectSummary());
        const foundAliases = findModelReplyPathAliases(
            'Look at logicFlow:script-2 first, then explain what starts it.',
            aliasTable
        );

        expect(foundAliases).toHaveLength(1);
        expect(foundAliases[0].aliasPathId).toBe('logicFlow:script-2');
        expect(resolveModelReplyPathAlias('logicFlow:script-2', aliasTable)).toBe('logicFlow:target-2%3Ahat-2');
    });
});

/* eslint-env jest */
import {
    AI_LOGIC_WORKSPACE_FOCUS_EVENT,
    focusScratchWorkspacePath,
    resolveScratchWorkspaceLocation
} from '../../../src/lib/ai/workspace-path-locator';

const createProjectSummary = () => ({
    logic: {
        flows: [{
            id: 'target-1:hat-1',
            targetId: 'target-1',
            targetName: 'Sprite1',
            scriptId: 'hat-1',
            blockIds: ['hat-1', 'say-1'],
            trigger: {
                label: 'Green flag'
            }
        }],
        broadcastLinks: [{
            name: 'go',
            sends: [{
                id: 'target-1:hat-1',
                targetId: 'target-1',
                targetName: 'Sprite1',
                scriptId: 'hat-1',
                blockIds: ['broadcast-1']
            }],
            receives: [{
                id: 'target-2:receive-1',
                targetId: 'target-2',
                targetName: 'Sprite2',
                scriptId: 'receive-1',
                blockIds: ['receive-1', 'show-1']
            }]
        }]
    }
});

describe('workspace path locator', () => {
    test('resolves a logic flow path to its top-level script block', () => {
        expect(resolveScratchWorkspaceLocation({
            activePathId: 'logicFlow:target-1%3Ahat-1',
            projectSummary: createProjectSummary()
        })).toEqual(expect.objectContaining({
            blockId: 'hat-1',
            pathId: 'logicFlow:target-1%3Ahat-1',
            scriptId: 'hat-1',
            targetId: 'target-1',
            targetName: 'Sprite1'
        }));
    });

    test('resolves a broadcast path to the concrete broadcast sender block first', () => {
        expect(resolveScratchWorkspaceLocation({
            activePathId: 'broadcast:go',
            projectSummary: createProjectSummary()
        })).toEqual(expect.objectContaining({
            blockId: 'broadcast-1',
            blockIds: ['broadcast-1', 'receive-1', 'show-1'],
            message: 'go',
            scriptId: 'hat-1',
            targetId: 'target-1'
        }));
    });

    test('switches editing target before emitting a workspace focus request', () => {
        const calls = [];
        const vm = {
            editingTarget: {
                id: 'other-target'
            },
            emit: (eventName, payload) => {
                calls.push(['emit', eventName, payload]);
            },
            setEditingTarget: targetId => {
                calls.push(['setEditingTarget', targetId]);
                vm.editingTarget.id = targetId;
            }
        };

        const location = focusScratchWorkspacePath({
            activePathId: 'logicFlow:target-1%3Ahat-1',
            projectSummary: createProjectSummary(),
            vm
        });

        expect(location.targetId).toBe('target-1');
        expect(calls[0]).toEqual(['setEditingTarget', 'target-1']);
        expect(calls[1][0]).toBe('emit');
        expect(calls[1][1]).toBe(AI_LOGIC_WORKSPACE_FOCUS_EVENT);
        expect(calls[1][2]).toEqual(expect.objectContaining({
            blockId: 'hat-1'
        }));
    });

    test('emits a clear request for paths without a Scratch workspace anchor', () => {
        const calls = [];
        focusScratchWorkspacePath({
            activePathId: 'gate:goal',
            projectSummary: createProjectSummary(),
            vm: {
                emit: (eventName, payload) => calls.push([eventName, payload])
            }
        });

        expect(calls).toEqual([[
            AI_LOGIC_WORKSPACE_FOCUS_EVENT,
            {clear: true}
        ]]);
    });
});

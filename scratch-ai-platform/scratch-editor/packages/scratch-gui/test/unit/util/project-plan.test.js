/* eslint-env jest */
import createProjectPlan, {
    PROJECT_PLAN_ITEM_STATUSES,
    PROJECT_PLAN_STATUS
} from '../../../src/lib/ai/project-plan';
import createNlBlocksDraft from '../../../src/lib/ai/block-draft';

const createFlow = ({
    id = 'target-1:hat-1',
    targetName = 'Cat',
    scriptIndex = 1,
    blockCount = 4,
    broadcastSends = []
} = {}) => ({
    id,
    targetName,
    scriptIndex,
    blockCount,
    trigger: {
        label: 'Green flag',
        detail: null
    },
    broadcastSends
});

const createProjectSummary = ({
    broadcastLinks = [],
    flows = []
} = {}) => ({
    logic: {
        broadcastLinks,
        flows
    }
});

describe('createProjectPlan', () => {
    test('returns empty plan when there is no student text or script signal', () => {
        const plan = createProjectPlan({
            gateDraft: {},
            projectSummary: createProjectSummary()
        });

        expect(plan.status).toBe(PROJECT_PLAN_STATUS.EMPTY);
        expect(plan.values.total).toBe(6);
        expect(plan.values.completed).toBe(0);
        expect(plan.scriptChoices).toEqual([]);
    });

    test('summarizes reviewed gate, scripts, concepts, and messages', () => {
        const gateDraft = {
            evidence: 'I will type an answer and should see the score change.',
            goal: 'Make a quiz that changes score.',
            logic: 'When green flag starts, ask an answer, if correct add score.'
        };
        const blockDraft = createNlBlocksDraft({
            gateDraft,
            projectSummary: {
                broadcasts: {
                    messages: [{name: 'done'}]
                },
                targets: {
                    items: [{isStage: false, name: 'Cat'}]
                }
            }
        });
        const plan = createProjectPlan({
            blockDraft,
            gateDraft,
            gateReviewed: true,
            projectSummary: createProjectSummary({
                broadcastLinks: [
                    {
                        name: 'done',
                        receives: [{id: 'receiver'}],
                        sends: [{id: 'sender'}]
                    }
                ],
                flows: [
                    createFlow({
                        broadcastSends: [{count: 1, name: 'done'}]
                    })
                ]
            })
        });

        expect(plan.status).toBe(PROJECT_PLAN_STATUS.READY);
        expect(plan.values.completed).toBe(6);
        expect(plan.scriptChoices).toHaveLength(1);
        expect(plan.scriptChoices[0].path.pathId).toMatch(/^logicFlow:/);
        expect(plan.conceptChoices.length).toBeGreaterThan(3);
        expect(plan.messageLinks[0].status).toBe(PROJECT_PLAN_ITEM_STATUSES.DONE);
    });

    test('does not mutate inputs', () => {
        const gateDraft = {
            evidence: 'I will run it and should see a message.',
            goal: 'Send a message.',
            logic: 'When clicked, broadcast a message.'
        };
        const projectSummary = createProjectSummary({
            flows: [createFlow()]
        });
        const before = JSON.stringify({
            gateDraft,
            projectSummary
        });

        createProjectPlan({
            gateDraft,
            projectSummary
        });

        expect(JSON.stringify({
            gateDraft,
            projectSummary
        })).toBe(before);
    });
});

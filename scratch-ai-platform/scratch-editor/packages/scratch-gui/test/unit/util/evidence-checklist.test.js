/* eslint-env jest */
import scoreEvidenceChecklist, {
    AI_LOGIC_PATH_TYPES,
    EVIDENCE_CHECK_STATUSES,
    LOGIC_GRAPH_PATH_KINDS
} from '../../../src/lib/ai/evidence-checklist';
import {EXPLAIN_GATE_STATES} from '../../../src/lib/ai/explain-gate-state';

const createProjectSummary = ({
    flows = [],
    broadcastLinks = []
} = {}) => ({
    logic: {
        flows,
        broadcastLinks
    }
});

const createFlow = ({
    id = 'flow-1',
    targetName = 'Sprite1',
    label = 'Green flag',
    detail = null,
    broadcastSends = []
} = {}) => ({
    id,
    targetName,
    trigger: {
        label,
        detail
    },
    broadcastSends
});

const findItem = (checklist, itemId) => checklist.items.find(item => item.id === itemId);

describe('scoreEvidenceChecklist', () => {
    test('keeps an empty project at a low local evidence score', () => {
        const checklist = scoreEvidenceChecklist({
            gateDraft: {
                goal: '',
                logic: '',
                evidence: ''
            },
            projectSummary: createProjectSummary()
        });

        expect(checklist.score).toBe(1);
        expect(checklist.maxScore).toBe(5);
        expect(checklist.missingCount).toBe(4);
        expect(findItem(checklist, 'logic.eventEntry')).toEqual(expect.objectContaining({
            path: {
                type: AI_LOGIC_PATH_TYPES.LOGIC_GRAPH,
                kind: LOGIC_GRAPH_PATH_KINDS.EVENT_ENTRY,
                pathId: 'logicGraph:eventEntry'
            },
            status: EVIDENCE_CHECK_STATUSES.MISSING
        }));
    });

    test('marks test evidence missing even when a green flag event exists', () => {
        const checklist = scoreEvidenceChecklist({
            gateDraft: {
                goal: 'Make the sprite greet the user.',
                logic: 'Green flag starts the script and the sprite says hello.',
                evidence: ''
            },
            projectSummary: createProjectSummary({
                flows: [createFlow()]
            })
        });

        expect(checklist.score).toBe(4);
        expect(findItem(checklist, 'gate.evidence')).toEqual(expect.objectContaining({
            path: {
                type: AI_LOGIC_PATH_TYPES.EXPLAIN_GATE,
                field: 'evidence',
                pathId: 'gate:evidence'
            },
            status: EVIDENCE_CHECK_STATUSES.MISSING
        }));
        expect(findItem(checklist, 'logic.eventEntry')).toEqual(expect.objectContaining({
            status: EVIDENCE_CHECK_STATUSES.PASS
        }));
    });

    test('flags broadcasts that send without a receiver', () => {
        const checklist = scoreEvidenceChecklist({
            gateDraft: {
                goal: 'Start a game.',
                logic: 'Green flag sends go to start the game.',
                evidence: 'Click green flag and see the game start.'
            },
            projectSummary: createProjectSummary({
                flows: [
                    createFlow({
                        broadcastSends: [{name: 'go', count: 1}]
                    })
                ],
                broadcastLinks: [{
                    name: 'go',
                    sends: [{id: 'flow-1'}],
                    receives: []
                }]
            })
        });

        expect(checklist.score).toBe(4);
        expect(findItem(checklist, 'logic.broadcastClosure')).toEqual(expect.objectContaining({
            path: {
                type: AI_LOGIC_PATH_TYPES.BROADCAST_LINK,
                message: 'go',
                pathId: 'broadcast:go'
            },
            status: EVIDENCE_CHECK_STATUSES.MISSING,
            values: {message: 'go'}
        }));
    });

    test('raises the score when explanation fields and the local graph are complete', () => {
        const emptyChecklist = scoreEvidenceChecklist({
            gateDraft: {
                goal: '',
                logic: '',
                evidence: ''
            },
            projectSummary: createProjectSummary()
        });
        const completeChecklist = scoreEvidenceChecklist({
            gateDraft: {
                goal: 'Make a quiz give feedback.',
                logic: 'Answer input is checked, then feedback is shown.',
                evidence: 'Try one right answer and one wrong answer.'
            },
            projectSummary: createProjectSummary({
                flows: [createFlow()]
            })
        });

        expect(completeChecklist.score).toBe(5);
        expect(completeChecklist.score).toBeGreaterThan(emptyChecklist.score);
        expect(completeChecklist.passedCount).toBe(5);
    });

    test('does not mutate project summary when gate state is reviewed', () => {
        const projectSummary = createProjectSummary({
            flows: [createFlow()]
        });
        const before = JSON.stringify(projectSummary);
        const checklist = scoreEvidenceChecklist({
            gateDraft: {
                goal: 'Make a timer finish.',
                logic: 'Green flag starts a countdown.',
                evidence: 'Run the timer and expect it to reach zero.'
            },
            gateState: EXPLAIN_GATE_STATES.REVIEWED,
            projectSummary
        });

        expect(checklist.gateState).toBe(EXPLAIN_GATE_STATES.REVIEWED);
        expect(JSON.stringify(projectSummary)).toBe(before);
        expect(checklist).not.toHaveProperty('meta');
        expect(checklist).not.toHaveProperty('logPointer');
    });

    test('uses partial credit for thin explanations without changing max score', () => {
        const checklist = scoreEvidenceChecklist({
            gateDraft: {
                goal: 'Quiz',
                logic: 'Checks answers.',
                evidence: 'Try it.'
            },
            projectSummary: createProjectSummary({
                flows: [createFlow()]
            })
        });

        expect(checklist.maxScore).toBe(5);
        expect(checklist.score).toBe(3.5);
        expect(checklist.partialCount).toBe(3);
        expect(findItem(checklist, 'gate.goal')).toEqual(expect.objectContaining({
            score: 0.5,
            status: EVIDENCE_CHECK_STATUSES.PARTIAL
        }));
        expect(findItem(checklist, 'gate.logic')).toEqual(expect.objectContaining({
            score: 0.5,
            status: EVIDENCE_CHECK_STATUSES.PARTIAL
        }));
        expect(findItem(checklist, 'gate.evidence')).toEqual(expect.objectContaining({
            score: 0.5,
            status: EVIDENCE_CHECK_STATUSES.PARTIAL
        }));
    });
});

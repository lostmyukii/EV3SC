/* eslint-env jest */
import {
    SOCRATIC_QUESTION_CATEGORIES,
    generateSocraticQuestions
} from '../../../src/lib/ai/socratic-question-engine';
import {
    AI_LOGIC_PATH_TYPES,
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

describe('generateSocraticQuestions', () => {
    test('asks for missing Explain Gate fields before project checks', () => {
        const questions = generateSocraticQuestions({
            gateDraft: {
                goal: '',
                logic: '',
                evidence: ''
            },
            projectSummary: createProjectSummary()
        });

        expect(questions.map(question => question.ruleId)).toEqual([
            'gate.goal.missing',
            'gate.logic.missing',
            'gate.evidence.missing',
            'logic.flows.missing'
        ]);
    });

    test('checks broadcasts that are sent without receivers', () => {
        const questions = generateSocraticQuestions({
            gateDraft: {
                goal: 'Make a start sequence.',
                logic: 'Green flag sends go.',
                evidence: 'Sprite changes.'
            },
            gateState: EXPLAIN_GATE_STATES.READY,
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

        expect(questions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                category: SOCRATIC_QUESTION_CATEGORIES.CHECK,
                path: {
                    type: AI_LOGIC_PATH_TYPES.BROADCAST_LINK,
                    message: 'go',
                    pathId: 'broadcast:go'
                },
                ruleId: 'logic.broadcast.unmatchedSend',
                values: {message: 'go'}
            })
        ]));
    });

    test('uses connected logic graph paths to ask for evidence after review', () => {
        const questions = generateSocraticQuestions({
            gateDraft: {
                goal: 'Make a quiz with feedback.',
                logic: 'Answer checked, then feedback is broadcast.',
                evidence: 'Use one wrong answer and one right answer.'
            },
            gateState: EXPLAIN_GATE_STATES.REVIEWED,
            projectSummary: createProjectSummary({
                flows: [
                    createFlow({
                        id: 'sender',
                        broadcastSends: [{name: 'feedback', count: 1}]
                    }),
                    createFlow({
                        id: 'receiver',
                        label: 'Broadcast received',
                        detail: 'feedback'
                    })
                ],
                broadcastLinks: [{
                    name: 'feedback',
                    sends: [{id: 'sender'}],
                    receives: [{id: 'receiver'}]
                }]
            })
        });

        expect(questions.map(question => question.ruleId)).toEqual(expect.arrayContaining([
            'logic.broadcast.trace',
            'gate.reviewed.transfer'
        ]));
    });

    test('honors max question limit', () => {
        const questions = generateSocraticQuestions({
            gateDraft: {
                goal: '',
                logic: '',
                evidence: ''
            },
            projectSummary: createProjectSummary(),
            maxQuestions: 2
        });

        expect(questions).toHaveLength(2);
        expect(questions.map(question => question.ruleId)).toEqual([
            'gate.goal.missing',
            'gate.logic.missing'
        ]);
    });

    test('puts teacher locked knowledge questions before local checks', () => {
        const questions = generateSocraticQuestions({
            gateDraft: {
                goal: '',
                logic: '',
                evidence: ''
            },
            projectSummary: createProjectSummary(),
            teacherPolicy: {
                active: true,
                selectedKnowledgePoints: [{
                    id: 'events',
                    label: '事件'
                }],
                questionRules: [{
                    knowledgePointId: 'events',
                    text: '这段程序从哪里开始?'
                }]
            }
        });

        expect(questions[0]).toEqual(expect.objectContaining({
            category: SOCRATIC_QUESTION_CATEGORIES.EXPLAIN,
            ruleId: 'teacher.knowledge.events-1',
            text: '事件: 这段程序从哪里开始?'
        }));
        expect(questions.map(question => question.ruleId)).toContain('gate.goal.missing');
    });

    test('attaches read-only logic paths to graph questions', () => {
        const questions = generateSocraticQuestions({
            gateDraft: {
                goal: 'Make a project start.',
                logic: 'The start event runs the first behavior.',
                evidence: 'Run the project and observe the first behavior.'
            },
            projectSummary: createProjectSummary()
        });

        expect(questions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                path: {
                    type: AI_LOGIC_PATH_TYPES.LOGIC_GRAPH,
                    kind: LOGIC_GRAPH_PATH_KINDS.EVENT_ENTRY,
                    pathId: 'logicGraph:eventEntry'
                },
                ruleId: 'logic.flows.missing'
            })
        ]));
    });
});

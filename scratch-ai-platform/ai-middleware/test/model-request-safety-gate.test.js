import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createModelRequestSafetyGate,
    minimizeTeacherPolicySummary,
    redactSensitiveText
} from '../src/model-request-safety-gate.js';

test('requires explicit consent before a model request can pass', () => {
    const safetyGate = createModelRequestSafetyGate({
        studentText: 'Help me debug this Scratch project'
    });

    assert.equal(safetyGate.allowed, false);
    assert.ok(safetyGate.blockedReasons.includes('missing-model-consent'));
});

test('redacts common sensitive text before building model payloads', () => {
    const redacted = redactSensitiveText(
        'Email learner@example.com, phone +1 415 555 0101, key sk-testSecretValue12345, Bearer abcdefghijklmnop'
    );

    assert.equal(redacted.includes('learner@example.com'), false);
    assert.equal(redacted.includes('+1 415 555 0101'), false);
    assert.equal(redacted.includes('sk-testSecretValue12345'), false);
    assert.equal(redacted.includes('Bearer abcdefghijklmnop'), false);
    assert.match(redacted, /\[redacted-email\]/);
    assert.match(redacted, /\[redacted-phone\]/);
    assert.match(redacted, /\[redacted-api-key\]/);
    assert.match(redacted, /Bearer \[redacted-token\]/);
});

test('minimizes project summaries to counts and stable path identifiers', () => {
    const safetyGate = createModelRequestSafetyGate({
        modelConsent: true,
        studentText: '请看 learner@example.com 的项目',
        gateDraft: {
            goal: 'Score should update',
            logic: 'When green flag clicked, then check answer',
            evidence: 'Try answer A and expect score +1'
        },
        evidenceChecklist: {
            score: 2,
            maxScore: 5,
            passedCount: 2,
            partialCount: 0,
            missingCount: 3,
            items: [{
                id: 'gate.goal',
                path: {
                    pathId: 'gate:goal'
                },
                score: 1,
                status: 'pass',
                rawNote: 'do not send'
            }]
        },
        projectSummary: {
            targets: {
                total: 2,
                sprites: 1,
                items: [{
                    name: 'Private Sprite Name'
                }]
            },
            blocks: {
                visible: 12,
                scripts: 3
            },
            events: {
                hats: 1
            },
            broadcasts: {
                sends: 1,
                receives: 0,
                messages: [{
                    name: 'go'
                }]
            },
            logic: {
                flows: [{
                    id: 'flow-1',
                    targetName: 'Quiz Sprite',
                    trigger: {
                        opcode: 'event_whenflagclicked',
                        label: 'Green Flag',
                        detail: 'learner@example.com'
                    },
                    blockCount: 4,
                    broadcastSends: [{
                        name: 'go',
                        count: 1
                    }]
                }],
                broadcastLinks: [{
                    name: 'go',
                    sends: [{}],
                    receives: []
                }]
            }
        }
    });

    const minimized = safetyGate.minimizedRequest;
    const minimizedJson = JSON.stringify(minimized);

    assert.equal(safetyGate.allowed, true);
    assert.equal(safetyGate.redactionApplied, true);
    assert.equal(minimized.evidenceChecklist.items[0].pathId, 'gate:goal');
    assert.equal(minimized.projectSummary.logic.flows[0].pathId, 'logicFlow:flow-1');
    assert.equal(minimized.projectSummary.logic.broadcastLinks[0].pathId, 'broadcast:go');
    assert.equal(Object.prototype.hasOwnProperty.call(minimized.projectSummary.targets, 'items'), false);
    assert.equal(minimizedJson.includes('Private Sprite Name'), false);
    assert.equal(minimizedJson.includes('learner@example.com'), false);
});

test('blocks raw project contexts before provider fetch', () => {
    const safetyGate = createModelRequestSafetyGate({
        modelConsent: true,
        studentText: 'Help',
        projectJson: {
            targets: []
        },
        projectSummary: {
            targets: {
                total: 1,
                items: [{
                    variables: {
                        score: 0
                    }
                }]
            }
        }
    });

    assert.equal(safetyGate.allowed, false);
    assert.ok(safetyGate.blockedReasons.includes('forbidden-context:projectJson'));
    assert.ok(safetyGate.blockedReasons.includes('forbidden-context:projectSummary.targets.items.0.variables'));
});

test('blocks concrete Scratch workspace anchors from model requests', () => {
    const safetyGate = createModelRequestSafetyGate({
        modelConsent: true,
        studentText: 'Help',
        projectSummary: {
            logic: {
                flows: [{
                    targetId: 'target-private',
                    scriptId: 'hat-private',
                    blockIds: ['hat-private', 'say-private']
                }]
            }
        }
    });

    assert.equal(safetyGate.allowed, false);
    assert.ok(safetyGate.blockedReasons.includes('forbidden-context:projectSummary.logic.flows.0.targetId'));
    assert.ok(safetyGate.blockedReasons.includes('forbidden-context:projectSummary.logic.flows.0.scriptId'));
    assert.ok(safetyGate.blockedReasons.includes('forbidden-context:projectSummary.logic.flows.0.blockIds'));
});

test('preserves client-minimized path ids and generic target labels', () => {
    const safetyGate = createModelRequestSafetyGate({
        modelConsent: true,
        studentText: 'Help',
        projectSummary: {
            logic: {
                flows: [{
                    pathId: 'logicFlow:script-2',
                    targetLabel: 'Sprite',
                    scriptIndex: 2,
                    trigger: {
                        opcode: 'event_whenflagclicked',
                        label: 'Green flag'
                    },
                    blockCount: 3
                }],
                broadcastLinks: [{
                    name: 'go',
                    pathId: 'broadcast:go',
                    sendCount: 1,
                    receiveCount: 1
                }]
            }
        }
    });

    const minimizedFlow = safetyGate.minimizedRequest.projectSummary.logic.flows[0];
    const minimizedLink = safetyGate.minimizedRequest.projectSummary.logic.broadcastLinks[0];

    assert.equal(safetyGate.allowed, true);
    assert.equal(minimizedFlow.pathId, 'logicFlow:script-2');
    assert.equal(minimizedFlow.targetName, 'Sprite');
    assert.equal(minimizedFlow.scriptIndex, 2);
    assert.equal(minimizedLink.pathId, 'broadcast:go');
});

test('minimizes teacher policy summaries and blocks roster fields', () => {
    const teacherPolicy = {
        schemaVersion: 'scratch-ai-teacher-policy-summary-v1',
        active: true,
        source: 'knowledge-lock',
        title: 'Addition lesson for learner@example.com',
        selectedKnowledgePoints: [{
            id: 'events',
            label: '事件'
        }, {
            id: 'addition',
            label: '相加'
        }],
        questionRules: [{
            knowledgePointId: 'events',
            text: '这段程序从哪里开始?'
        }],
        rubric: [{
            knowledgePointId: 'addition',
            label: '相加',
            criteria: '能解释两个数相加的输入、过程和结果。',
            rawStudentWork: 'do not send'
        }],
        classRoster: ['do-not-send']
    };
    const summary = minimizeTeacherPolicySummary(teacherPolicy);
    const safetyGate = createModelRequestSafetyGate({
        modelConsent: true,
        studentText: 'Help',
        teacherPolicy
    });
    const minimizedJson = JSON.stringify(safetyGate.minimizedRequest);

    assert.equal(summary.active, true);
    assert.equal(summary.selectedKnowledgePoints.length, 2);
    assert.equal(summary.questionRules[0].text, '这段程序从哪里开始?');
    assert.equal(summary.safeguards.classRosterIncluded, false);
    assert.equal(safetyGate.allowed, false);
    assert.ok(safetyGate.blockedReasons.includes('forbidden-context:teacherPolicy.classRoster'));
    assert.equal(minimizedJson.includes('learner@example.com'), false);
    assert.equal(minimizedJson.includes('rawStudentWork'), false);
});

/* eslint-env jest */
import {
    TEACHER_POLICY_SCHEMA_VERSION,
    createTeacherPolicySummary
} from '../../../src/lib/ai/teacher-policy';

describe('teacher policy summary', () => {
    test('creates a minimized policy summary from a knowledge lock reply', () => {
        const summary = createTeacherPolicySummary({
            knowledgeLockReply: {
                blocked: false,
                knowledgeLock: {
                    title: 'Addition lesson for learner@example.com',
                    gradeBand: 'upper-primary',
                    selectedKnowledgePoints: [{
                        id: 'events',
                        label: '事件'
                    }, {
                        id: 'addition',
                        label: '相加'
                    }],
                    promptContract: [
                        '只围绕锁定知识点追问。',
                        '不直接给完整可复制脚本。'
                    ],
                    questionRules: [{
                        knowledgePointId: 'events',
                        text: '这段程序从哪里开始?'
                    }, {
                        knowledgePointId: 'addition',
                        text: '相加之后结果显示在哪里?'
                    }],
                    rubricFocus: [{
                        knowledgePointId: 'addition',
                        label: '相加',
                        focus: '能解释两个数相加的输入、过程和结果。'
                    }]
                }
            }
        });
        const summaryJson = JSON.stringify(summary);

        expect(summary.schemaVersion).toBe(TEACHER_POLICY_SCHEMA_VERSION);
        expect(summary.active).toBe(true);
        expect(summary.source).toBe('knowledge-lock');
        expect(summary.selectedKnowledgePoints.map(point => point.id)).toEqual(['events', 'addition']);
        expect(summary.questionRules).toHaveLength(2);
        expect(summary.rubric[0].criteria).toContain('两个数相加');
        expect(summary.safeguards.writesToSb3).toBe(false);
        expect(summaryJson.includes('learner@example.com')).toBe(false);
    });

    test('returns an inactive summary for blocked or empty teacher drafts', () => {
        const summary = createTeacherPolicySummary({
            knowledgeLockReply: {
                blocked: true,
                knowledgeLock: {
                    selectedKnowledgePoints: [{
                        id: 'events',
                        label: '事件'
                    }]
                }
            }
        });

        expect(summary.active).toBe(false);
        expect(summary.selectedKnowledgePoints).toEqual([]);
        expect(summary.safeguards.rawProjectIncluded).toBe(false);
    });

    test('creates a policy summary from an active class knowledge lock', () => {
        const summary = createTeacherPolicySummary({
            activeKnowledgeLockReply: {
                active: true,
                classSession: {
                    id: 'class-a'
                },
                knowledgeLock: {
                    title: 'Class A active lock',
                    gradeBand: 'upper-primary',
                    selectedKnowledgePoints: [{
                        id: 'events',
                        label: '事件'
                    }],
                    questionRules: [{
                        knowledgePointId: 'events',
                        text: '这段程序从哪里开始?'
                    }],
                    rubricFocus: [{
                        knowledgePointId: 'events',
                        label: '事件',
                        focus: '能说明绿旗或广播如何开始程序。'
                    }]
                }
            }
        });
        const summaryJson = JSON.stringify(summary);

        expect(summary.active).toBe(true);
        expect(summary.source).toBe('active-knowledge-lock');
        expect(summary.selectedKnowledgePoints[0].id).toBe('events');
        expect(summary.rubric[0].criteria).toContain('绿旗');
        expect(summaryJson.includes('class-a')).toBe(false);
    });
});

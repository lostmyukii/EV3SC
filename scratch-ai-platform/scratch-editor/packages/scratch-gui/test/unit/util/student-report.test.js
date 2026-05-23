/* eslint-env jest */
import {
    createStudentReport,
    createStudentReportHtml,
    createStudentReportHtmlFilename
} from '../../../src/lib/ai/student-report';

const createReleasePreview = () => ({
    aiSummary: {
        blocked: 1,
        questions: 2,
        replies: 1
    },
    iterationPlan: 'Add a timer.',
    logicFlows: [{
        blockCount: 5,
        broadcastCount: 1,
        id: 'private-id',
        scriptIndex: 1,
        targetName: 'Private Sprite Name',
        triggerLabel: 'Green flag'
    }],
    metrics: {
        blocks: 12,
        checkMaxScore: 5,
        checkScore: 4,
        sprites: 2,
        starts: 1
    },
    productLine: 'Chore helper',
    status: 'ready',
    userFeedback: 'Make the button larger.',
    version: '1.1'
});

describe('student report', () => {
    test('creates a minimal student report without raw project anchors', () => {
        const report = createStudentReport({
            assetAdoptionSummary: {
                adopted: true,
                hasAsset: true,
                imported: true,
                visualEditCount: 2
            },
            classSessionId: ' Class A / Spring ',
            releaseGate: {
                allowed: true,
                reasons: []
            },
            releasePreview: createReleasePreview(),
            studentScopeId: ' student-001 ',
            teacherPolicy: {
                schemaVersion: 'scratch-ai-teacher-policy-summary-v1',
                active: true,
                title: 'Addition lesson learner@example.com',
                selectedKnowledgePoints: [{
                    id: 'events',
                    label: '事件'
                }],
                questionRules: [{
                    knowledgePointId: 'events',
                    text: '这段程序从哪里开始?'
                }],
                rubric: [{
                    knowledgePointId: 'events',
                    label: '事件',
                    criteria: '能说清楚程序的开始点。',
                    levels: [
                        '能找到开始事件。',
                        '能说明事件和目标的关系。'
                    ]
                }]
            }
        });
        const reportJson = JSON.stringify(report);

        expect(report.schemaVersion).toBe('scratch-ai-student-report-v1');
        expect(report.status).toBe('ready');
        expect(report.scope.classSession.id).toBe('Class-A-Spring');
        expect(report.scope.student.id).toBe('student-001');
        expect(report.logicFlows[0]).toEqual(expect.objectContaining({
            blockCount: 5,
            scriptIndex: 1,
            targetLabel: 'Sprite'
        }));
        expect(report.assetSummary).toEqual(expect.objectContaining({
            adopted: true,
            importedToCostumeEditor: true,
            visualEditCount: 2
        }));
        expect(report.teacherPolicy.active).toBe(true);
        expect(report.teacherPolicy.questionRules[0].text).toBe('这段程序从哪里开始?');
        expect(report.teacherPolicy.rubric[0].criteria).toContain('程序的开始点');
        expect(report.teacherPolicy.rubric[0].levels).toHaveLength(2);
        expect(report.safeguards.rawProjectIncluded).toBe(false);
        expect(report.safeguards.classRosterIncluded).toBe(false);
        expect(report.safeguards.studentScoped).toBe(true);
        expect(reportJson.includes('private-id')).toBe(false);
        expect(reportJson.includes('Private Sprite Name')).toBe(false);
        expect(reportJson.includes('learner@example.com')).toBe(false);
    });

    test('exports escaped static HTML and stable filename', () => {
        const report = createStudentReport({
            assetAdoptionSummary: {
                hasAsset: false
            },
            releaseGate: {
                allowed: false,
                reasons: ['release-draft-not-ready']
            },
            releasePreview: Object.assign({}, createReleasePreview(), {
                productLine: '<script>alert(1)</script>'
            })
        });
        const html = createStudentReportHtml({
            report
        });

        expect(html).toContain('<!doctype html>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('<script>');
        expect(html).toContain('rawProjectIncluded=false');
        expect(html).toContain('classRosterIncluded=false');
        expect(html).toContain('studentScoped=true');
        expect(createStudentReportHtmlFilename(report)).toBe('scratch-ai-student-report-1-1.html');
    });
});

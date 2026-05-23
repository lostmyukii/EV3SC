/* eslint-env jest */
import {
    PDF_SCHEMA_VERSION,
    PDF_TEMPLATE_VERSION,
    createStudentReportPdfDraft,
    createStudentReportPdfFilename
} from '../../../src/lib/ai/student-report-pdf';

const createReport = () => ({
    aiSummary: {
        blocked: 1,
        questions: 2,
        replies: 1
    },
    assetSummary: {
        adopted: true,
        importedToCostumeEditor: true,
        present: true
    },
    blockedReasons: [],
    metrics: {
        blocks: 12,
        checkMaxScore: 5,
        checkScore: 4,
        sprites: 2,
        starts: 1
    },
    release: {
        iterationPlan: 'Add a timer.',
        productLine: 'Chore helper <private>',
        userFeedback: 'Make the button larger.',
        version: '1.1'
    },
    status: 'ready',
    teacherPolicy: {
        active: true,
        title: 'Events and sequence',
        selectedKnowledgePoints: [{
            id: 'events',
            label: 'Events'
        }, {
            id: 'sequence',
            label: 'Sequence'
        }],
        questionRules: [{
            knowledgePointId: 'events',
            text: 'Where does the program start?'
        }],
        rubric: [{
            knowledgePointId: 'events',
            label: 'Events',
            criteria: 'Explains the start event.',
            levels: [
                'Needs help finding the start event.',
                'Names the start event.',
                'Explains when the event runs.',
                'Connects the event to the product goal.'
            ]
        }, {
            knowledgePointId: 'sequence',
            label: 'Sequence',
            criteria: 'Explains the order of actions.'
        }]
    }
});

describe('student report pdf', () => {
    test('creates a teacher evaluation PDF template without raw project or identity fields', () => {
        const draft = createStudentReportPdfDraft({
            hostedRelease: {
                hostedReleaseId: 'hosted-123',
                persisted: true,
                publicUrl: 'http://127.0.0.1:8604/api/v1/release/hosted-pages/hosted-123',
                player: {
                    projectAvailable: true,
                    readOnly: true
                }
            },
            report: createReport(),
            teacherReview: {
                decision: 'approved',
                persisted: true,
                reviewId: 'teacher-review-abc'
            }
        });
        const pdf = draft.pdf;

        expect(draft.schemaVersion).toBe(PDF_SCHEMA_VERSION);
        expect(draft.templateVersion).toBe(PDF_TEMPLATE_VERSION);
        expect(draft.mimeType).toBe('application/pdf');
        expect(pdf.startsWith('%PDF-1.4')).toBe(true);
        expect(pdf).toContain('Scratch AI teacher evaluation report');
        expect(pdf).toContain('5. Rubric checklist');
        expect(pdf).toContain('Hosted release: hosted-123');
        expect(pdf).toContain('Teacher review: approved');
        expect(pdf).toContain('Teacher review id: teacher-review-abc');
        expect(pdf).toContain('rawProjectIncluded=false');
        expect(pdf).toContain('studentIdentityIncluded=false');
        expect(pdf).toContain('classRosterIncluded=false');
        expect(pdf).toContain('teacherNotesIncluded=false');
        expect(pdf).toContain('Teacher lock: Events, Sequence');
        expect(pdf).toContain('Rubric 1: Events');
        expect(pdf).toContain('Rubric 2: Sequence');
        expect(pdf).toContain('Level 4: Connects the event to the product goal.');
        expect(pdf).toContain('Evidence note: ______________________________________________');
        expect(pdf).toContain('Teacher score: ____ / 4');
        expect(pdf).toContain('Strengths: __________________________________________________');
        expect(pdf).not.toContain('http://127.0.0.1');
        expect(pdf).not.toContain('targetId');
        expect(pdf).not.toContain('blockIds');
        expect(draft.values.rubricItems).toBe(2);
        expect(draft.values.templateSections).toBe(7);
        expect(draft.values.pages).toBeGreaterThanOrEqual(2);
        expect(draft.safeguards.scratchProjectMutated).toBe(false);
    });

    test('creates a stable pdf filename from version', () => {
        expect(createStudentReportPdfFilename(createReport())).toBe('scratch-ai-student-report-1-1.pdf');
    });
});

/* eslint-env jest */
import {
    RELEASE_APPROVAL_QUEUE_FILTERS,
    RELEASE_APPROVAL_QUEUE_PATH,
    RELEASE_APPROVAL_QUEUE_SCHEMA_ID,
    RELEASE_APPROVAL_QUEUE_WORKFLOW_SCHEMA_ID,
    createReleaseApprovalQueue,
    createReleaseApprovalQueueWorkflow,
    createReleaseApprovalQueueUrl,
    requestReleaseApprovalQueue
} from '../../../src/lib/ai/release-approval-queue-client';

const createClassShowcaseReply = () => ({
    schemaVersion: 'scratch-ai-class-showcase-v1',
    configured: true,
    generatedAt: '2026-05-04T06:30:00.000Z',
    scope: {
        classSessionId: 'Class-A-Spring',
        filterApplied: true
    },
    releases: [{
        hostedReleaseId: 'hosted-approved',
        createdAt: '2026-05-04T06:00:00.000Z',
        classSession: {
            id: 'Class-A-Spring'
        },
        publicUrl: '/api/v1/release/hosted-pages/hosted-approved',
        release: {
            status: 'ready',
            title: 'Approved game',
            version: '1.1'
        },
        metrics: {
            blocks: 12,
            checkMaxScore: 5,
            checkScore: 5,
            sprites: 2,
            starts: 1
        },
        teacherReview: {
            decision: 'approved',
            notesSummary: 'Private review note',
            reviewedAt: '2026-05-04T06:10:00.000Z',
            status: 'approved'
        }
    }, {
        hostedReleaseId: 'hosted-revision',
        createdAt: '2026-05-04T06:15:00.000Z',
        classSession: {
            id: 'Class-A-Spring'
        },
        publicUrl: '/api/v1/release/hosted-pages/hosted-revision',
        release: {
            status: 'ready',
            title: 'Needs revision maze',
            version: '1.2'
        },
        metrics: {
            blocks: 10,
            checkMaxScore: 5,
            checkScore: 3,
            sprites: 3,
            starts: 1
        },
        teacherReview: {
            decision: 'needs-revision',
            notesSummary: 'Private revision note',
            reviewedAt: '2026-05-04T06:18:00.000Z',
            status: 'needs-revision'
        }
    }, {
        hostedReleaseId: 'hosted-pending',
        createdAt: '2026-05-04T06:20:00.000Z',
        classSession: {
            id: 'Class-A-Spring'
        },
        hostedPath: '/api/v1/release/hosted-pages/hosted-pending',
        release: {
            status: 'ready',
            title: 'Pending helper',
            version: '1.1'
        },
        metrics: {
            blocks: 8,
            checkMaxScore: 5,
            checkScore: 4,
            sprites: 1,
            starts: 1
        },
        teacherReview: {
            decision: 'pending',
            reviewedAt: '',
            status: 'pending'
        }
    }]
});

describe('release approval queue client', () => {
    test('builds the class showcase backed queue endpoint', () => {
        expect(createReleaseApprovalQueueUrl('/')).toBe(RELEASE_APPROVAL_QUEUE_PATH);
        expect(createReleaseApprovalQueueUrl('/', {
            classSessionId: ' Class A / Spring '
        })).toBe(`${RELEASE_APPROVAL_QUEUE_PATH}?classSessionId=Class-A-Spring`);
        expect(createReleaseApprovalQueueUrl('http://127.0.0.1:8787/')).toBe(
            `http://127.0.0.1:8787${RELEASE_APPROVAL_QUEUE_PATH}`
        );
    });

    test('normalizes pending releases before approved releases without notes', () => {
        const queue = createReleaseApprovalQueue(createClassShowcaseReply());
        const queueJson = JSON.stringify(queue);

        expect(queue.schemaVersion).toBe(RELEASE_APPROVAL_QUEUE_SCHEMA_ID);
        expect(queue.scope.classSessionId).toBe('Class-A-Spring');
        expect(queue.scope.filterApplied).toBe(true);
        expect(queue.items.map(item => item.hostedReleaseId)).toEqual([
            'hosted-pending',
            'hosted-revision',
            'hosted-approved'
        ]);
        expect(queue.totals).toEqual(expect.objectContaining({
            approved: 1,
            needsRevision: 1,
            pending: 1,
            queued: 3
        }));
        expect(queue.items[0].teacherReview.status).toBe('pending');
        expect(queue.items[0].classSession.id).toBe('Class-A-Spring');
        expect(queue.items[0].publicUrl).toBe('/api/v1/release/hosted-pages/hosted-pending');
        expect(queueJson.includes('Private review note')).toBe(false);
        expect(queueJson.includes('Private revision note')).toBe(false);
        expect(queueJson.includes('studentIdentityIncluded":true')).toBe(false);
    });

    test('creates a filtered approval workflow with a redacted review target', () => {
        const queue = createReleaseApprovalQueue(createClassShowcaseReply());
        const workflow = createReleaseApprovalQueueWorkflow({
            filterStatus: RELEASE_APPROVAL_QUEUE_FILTERS.NEEDS_REVISION,
            queue,
            searchText: 'maze',
            selectedHostedReleaseId: 'hosted-revision'
        });
        const workflowJson = JSON.stringify(workflow);

        expect(workflow.schemaVersion).toBe(RELEASE_APPROVAL_QUEUE_WORKFLOW_SCHEMA_ID);
        expect(workflow.items.map(item => item.hostedReleaseId)).toEqual(['hosted-revision']);
        expect(workflow.reviewTarget).toEqual(expect.objectContaining({
            hostedReleaseId: 'hosted-revision',
            releaseTitle: 'Needs revision maze',
            reviewStatus: 'needs-revision'
        }));
        expect(workflow.totals).toEqual({
            filtered: 1,
            queued: 3
        });
        expect(workflowJson.includes('Private revision note')).toBe(false);
        expect(workflowJson.includes('classRosterIncluded":true')).toBe(false);
    });

    test('requests the queue JSON and normalizes the reply', async () => {
        const captured = [];
        const fetchImpl = (url, options) => {
            captured.push({
                options,
                url
            });
            return {
                ok: true,
                json: () => createClassShowcaseReply()
            };
        };

        const queue = await requestReleaseApprovalQueue({
            classSessionId: ' Class A / Spring ',
            fetchImpl,
            middlewareUrl: 'http://127.0.0.1:9999'
        });

        expect(captured[0].url).toBe(
            `http://127.0.0.1:9999${RELEASE_APPROVAL_QUEUE_PATH}?classSessionId=Class-A-Spring`
        );
        expect(captured[0].options.method).toBe('GET');
        expect(queue.totals.pending).toBe(1);
    });
});

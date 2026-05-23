/* eslint-disable arrow-parens */
import {normalizeMiddlewareUrl} from './socratic-chat-client.js';
import {normalizeClassSessionId} from './teacher-tools-client.js';

const RELEASE_APPROVAL_QUEUE_SCHEMA_ID = 'scratch-ai-release-approval-queue-v1';
const RELEASE_APPROVAL_QUEUE_WORKFLOW_SCHEMA_ID = 'scratch-ai-release-approval-workflow-v1';
const RELEASE_APPROVAL_QUEUE_PATH = '/api/v1/release/class-showcase';
const RELEASE_APPROVAL_QUEUE_LIMIT = 50;
const TEXT_LIMIT = 160;

const RELEASE_APPROVAL_QUEUE_FILTERS = Object.freeze({
    ALL: 'all',
    APPROVED: 'approved',
    NEEDS_REVISION: 'needs-revision',
    PENDING: 'pending'
});

const REVIEW_STATUS_ORDER = Object.freeze({
    'pending': 0,
    'needs-revision': 1,
    'approved': 2
});

const readArray = value => (Array.isArray(value) ? value : []);

const readNumber = value => (Number.isFinite(value) ? value : 0);

const readText = (value, limit = TEXT_LIMIT) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, limit);
};

const readReviewStatus = value => {
    const status = readText(value, 40).toLowerCase();
    if (status === 'approved' || status === 'needs-revision') return status;
    return 'pending';
};

const readFilterStatus = value => {
    const status = readText(value, 40).toLowerCase();
    if (
        status === RELEASE_APPROVAL_QUEUE_FILTERS.APPROVED ||
        status === RELEASE_APPROVAL_QUEUE_FILTERS.NEEDS_REVISION ||
        status === RELEASE_APPROVAL_QUEUE_FILTERS.PENDING
    ) {
        return status;
    }
    return RELEASE_APPROVAL_QUEUE_FILTERS.ALL;
};

const createApprovalQueueSearchText = item => [
    item && item.hostedReleaseId,
    item && item.release && item.release.title,
    item && item.release && item.release.version,
    item && item.teacherReview && item.teacherReview.status
]
    .map(value => readText(value, TEXT_LIMIT).toLowerCase())
    .filter(Boolean)
    .join(' ');

const createReleaseApprovalQueueUrl = (middlewareUrl, {
    classSessionId = ''
} = {}) => {
    const baseUrl = `${normalizeMiddlewareUrl(middlewareUrl)}${RELEASE_APPROVAL_QUEUE_PATH}`;
    const normalizedClassSessionId = normalizeClassSessionId(classSessionId);
    return normalizedClassSessionId ?
        `${baseUrl}?classSessionId=${encodeURIComponent(normalizedClassSessionId)}` :
        baseUrl;
};

const createReleaseApprovalQueueItem = release => {
    const releaseInfo = release && release.release ? release.release : {};
    const metrics = release && release.metrics ? release.metrics : {};
    const teacherReview = release && release.teacherReview ? release.teacherReview : {};
    const status = readReviewStatus(teacherReview.status || teacherReview.decision);

    return {
        hostedReleaseId: readText(release && release.hostedReleaseId, 100),
        createdAt: readText(release && release.createdAt, 100),
        classSession: {
            id: normalizeClassSessionId(release && release.classSession && release.classSession.id),
            scoped: true
        },
        publicUrl: readText(release && (release.publicUrl || release.hostedPath), TEXT_LIMIT),
        release: {
            title: readText(releaseInfo.title, TEXT_LIMIT) || 'Scratch AI release',
            version: readText(releaseInfo.version, 40) || '1.1',
            status: readText(releaseInfo.status, 40)
        },
        metrics: {
            blocks: readNumber(metrics.blocks),
            checkMaxScore: readNumber(metrics.checkMaxScore),
            checkScore: readNumber(metrics.checkScore),
            sprites: readNumber(metrics.sprites),
            starts: readNumber(metrics.starts)
        },
        teacherReview: {
            decision: readText(teacherReview.decision, 40) || status,
            reviewedAt: readText(teacherReview.reviewedAt, 100),
            status
        },
        safeguards: {
            classRosterIncluded: false,
            rawProjectIncluded: false,
            studentIdentityIncluded: false,
            teacherNotesIncluded: false
        }
    };
};

const sortReleaseApprovalQueueItems = items => items.slice().sort((left, right) => {
    const leftStatus = REVIEW_STATUS_ORDER[left && left.teacherReview && left.teacherReview.status] || 0;
    const rightStatus = REVIEW_STATUS_ORDER[right && right.teacherReview && right.teacherReview.status] || 0;
    if (leftStatus !== rightStatus) return leftStatus - rightStatus;

    const rightTime = Date.parse(right && right.createdAt);
    const leftTime = Date.parse(left && left.createdAt);
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
});

const createReleaseApprovalQueue = reply => {
    const items = sortReleaseApprovalQueueItems(
        readArray(reply && reply.releases)
            .slice(0, RELEASE_APPROVAL_QUEUE_LIMIT)
            .map(createReleaseApprovalQueueItem)
            .filter(item => item.hostedReleaseId)
    );

    return {
        schemaVersion: RELEASE_APPROVAL_QUEUE_SCHEMA_ID,
        configured: Boolean(reply && reply.configured),
        generatedAt: readText(reply && reply.generatedAt, 100),
        items,
        routes: {
            source: RELEASE_APPROVAL_QUEUE_PATH,
            teacherReview: '/api/v1/release/teacher-review'
        },
        scope: {
            classSessionId: normalizeClassSessionId(reply && reply.scope && reply.scope.classSessionId),
            classSessionScoped: true,
            filterApplied: Boolean(reply && reply.scope && reply.scope.filterApplied)
        },
        totals: {
            approved: items.filter(item => item.teacherReview.status === 'approved').length,
            needsRevision: items.filter(item => item.teacherReview.status === 'needs-revision').length,
            pending: items.filter(item => item.teacherReview.status === 'pending').length,
            queued: items.length
        },
        safeguards: {
            classRosterIncluded: false,
            classSessionScoped: true,
            rawProjectIncluded: false,
            studentIdentityIncluded: false,
            teacherNotesIncluded: false
        }
    };
};

const createReleaseApprovalQueueWorkflow = ({
    filterStatus = RELEASE_APPROVAL_QUEUE_FILTERS.ALL,
    queue,
    searchText = '',
    selectedHostedReleaseId = ''
} = {}) => {
    const sourceItems = readArray(queue && queue.items);
    const normalizedFilterStatus = readFilterStatus(filterStatus);
    const normalizedSearchText = readText(searchText, TEXT_LIMIT).toLowerCase();
    const normalizedSelectedHostedReleaseId = readText(selectedHostedReleaseId, 100);
    const selectedItem = sourceItems.find(item => (
        item && item.hostedReleaseId === normalizedSelectedHostedReleaseId
    )) || null;
    const items = sourceItems.filter(item => {
        const status = item && item.teacherReview ? item.teacherReview.status : 'pending';
        const statusMatches = normalizedFilterStatus === RELEASE_APPROVAL_QUEUE_FILTERS.ALL ||
            status === normalizedFilterStatus;
        const searchMatches = !normalizedSearchText ||
            createApprovalQueueSearchText(item).includes(normalizedSearchText);
        return statusMatches && searchMatches;
    });

    return {
        schemaVersion: RELEASE_APPROVAL_QUEUE_WORKFLOW_SCHEMA_ID,
        filters: {
            searchText: normalizedSearchText,
            status: normalizedFilterStatus
        },
        items,
        reviewTarget: selectedItem ? {
            hostedReleaseId: selectedItem.hostedReleaseId,
            publicUrl: selectedItem.publicUrl,
            releaseTitle: selectedItem.release.title,
            reviewStatus: selectedItem.teacherReview.status
        } : null,
        selectedHostedReleaseId: selectedItem ? selectedItem.hostedReleaseId : '',
        totals: {
            filtered: items.length,
            queued: sourceItems.length
        },
        safeguards: {
            classRosterIncluded: false,
            classSessionScoped: true,
            rawProjectIncluded: false,
            studentIdentityIncluded: false,
            teacherNotesIncluded: false
        }
    };
};

const requestReleaseApprovalQueue = async ({
    classSessionId = '',
    fetchImpl = globalThis.fetch,
    middlewareUrl
} = {}) => {
    if (typeof fetchImpl !== 'function') {
        throw new Error('Fetch is unavailable for Scratch AI release approval queue requests.');
    }

    const response = await fetchImpl(createReleaseApprovalQueueUrl(middlewareUrl, {
        classSessionId
    }), {
        method: 'GET'
    });

    if (!response || !response.ok) {
        throw new Error('Scratch AI release approval queue request failed.');
    }

    return createReleaseApprovalQueue(await response.json());
};

export {
    RELEASE_APPROVAL_QUEUE_FILTERS,
    RELEASE_APPROVAL_QUEUE_PATH,
    RELEASE_APPROVAL_QUEUE_SCHEMA_ID,
    RELEASE_APPROVAL_QUEUE_WORKFLOW_SCHEMA_ID,
    createReleaseApprovalQueue,
    createReleaseApprovalQueueWorkflow,
    createReleaseApprovalQueueUrl,
    requestReleaseApprovalQueue
};

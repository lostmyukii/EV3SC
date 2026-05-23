import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';
import VM from '@scratch/scratch-vm';

import {
    EXPLAIN_GATE_STATES,
    getExplainGateState,
    isExplainGateComplete
} from '../../lib/ai/explain-gate-state.js';
import scoreEvidenceChecklist, {
    AI_LOGIC_PATH_TYPES,
    EVIDENCE_CHECK_STATUSES,
    LOGIC_GRAPH_PATH_KINDS,
    createBroadcastLinkPath,
    createExplainGatePath,
    createLogicFlowPath,
    createLogicGraphPath
} from '../../lib/ai/evidence-checklist.js';
import summarizeScratchProject from '../../lib/ai/project-summary.js';
import generateSocraticQuestions, {
    SOCRATIC_QUESTION_CATEGORIES
} from '../../lib/ai/socratic-question-engine.js';
import aiFeatureFlags from '../../lib/ai/feature-flags.js';
import {
    createSocraticChatPayload,
    isScratchAIRequestCanceled,
    isScratchAIRequestTimeout,
    requestSocraticChat
} from '../../lib/ai/socratic-chat-client.js';
import {
    DEFAULT_NL_BLOCKS_SCRIPT_DRAFT_TIMEOUT_MS,
    createNlBlocksScriptDraftPayload,
    requestNlBlocksScriptDraft
} from '../../lib/ai/nl-blocks-script-draft-client.js';
import {
    getScriptDraftCreateButtonState,
    getScriptDraftInsertButtonState,
    getScriptDraftResultVisibility,
    shouldRequestScriptDraft
} from '../../lib/ai/nl-blocks-script-draft-ui.js';
import {getGenerationGate} from '../../lib/ai/generation-gate.js';
import {
    ASSET_TYPES,
    createAssetImageJobPayload,
    requestAssetImageJob
} from '../../lib/ai/asset-job-client.js';
import {
    ASSET_ADOPTION_ACTIONS,
    createAssetAdoptionState,
    createAssetAdoptionSummary,
    createAssetImportData,
    createEmptyAssetAdoptionState,
    getNextAssetAdoptionState
} from '../../lib/ai/asset-adoption.js';
import {costumeUpload, spriteUpload} from '../../lib/file-uploader.js';
import {
    GRADE_BANDS,
    TEACHER_KNOWLEDGE_POINTS,
    createKnowledgeLockPayload,
    createLessonPrepPayload,
    createTeacherAccountAdminPayload,
    createTeacherSessionPayload,
    normalizeClassSessionId,
    requestActiveKnowledgeLock,
    requestKnowledgeLockDraft,
    requestLessonPrepDraft,
    requestTeacherAccountAdminAction,
    requestTeacherAccounts,
    requestTeacherSession
} from '../../lib/ai/teacher-tools-client.js';
import {createTeacherPolicySummary} from '../../lib/ai/teacher-policy.js';
import {
    createTeacherRubricReviewState,
    getTeacherRubricLevelOptions,
    isTeacherRubricReviewComplete,
    updateTeacherRubricReviewEvidence,
    updateTeacherRubricReviewLevel
} from '../../lib/ai/teacher-rubric-review.js';
import {
    SAFETY_FEEDBACK_TYPES,
    getSafetyFeedbackTypes
} from '../../lib/ai/safety-feedback.js';
import {
    RELEASE_DRAFT_FIELDS,
    RELEASE_DRAFT_STATUSES,
    createEmptyReleaseDraft,
    createReleaseDraftSummary
} from '../../lib/ai/release-draft.js';
import {
    RELEASE_PREVIEW_STATUS,
    createReleasePreview
} from '../../lib/ai/release-preview.js';
import {
    createReleasePreviewHtml,
    createReleasePreviewHtmlFilename
} from '../../lib/ai/release-html.js';
import {createReleaseGate} from '../../lib/ai/release-gate.js';
import {
    createStudentReport,
    createStudentReportHtml,
    createStudentReportHtmlFilename
} from '../../lib/ai/student-report.js';
import {createStudentReportPdfDraft} from '../../lib/ai/student-report-pdf.js';
import {
    createReleaseAuditPayload,
    requestReleaseAdminSummary,
    requestReleaseAudit,
    requestReleaseAuditLifecycle,
    requestReleaseResearchDataset
} from '../../lib/ai/release-audit-client.js';
import {
    RELEASE_APPROVAL_QUEUE_FILTERS,
    createReleaseApprovalQueueWorkflow,
    requestReleaseApprovalQueue
} from '../../lib/ai/release-approval-queue-client.js';
import {
    createHostedReleasePayload,
    createQrPreviewSvg,
    createTeacherReviewPayload,
    requestHostedReleasePage,
    requestTeacherReview
} from '../../lib/ai/release-hosting-client.js';
import {
    createModelReplyPathAliasTable,
    findModelReplyPathAliases
} from '../../lib/ai/model-reply-path-aliases.js';
import createScriptExplanation, {
    SCRIPT_EXPLANATION_STATUS
} from '../../lib/ai/script-explanation.js';
import createNlBlocksDraft, {
    BLOCK_DRAFT_STATUS
} from '../../lib/ai/block-draft.js';
import createProjectPlan, {
    PROJECT_PLAN_ITEM_STATUSES,
    PROJECT_PLAN_STATUS
} from '../../lib/ai/project-plan.js';
import {
    Q18_TOOL_STATUS,
    createAdditionTemplate,
    createOneLineProjectSkeleton,
    createVoiceDraft
} from '../../lib/ai/q18-learning-tools.js';
import {focusScratchWorkspacePath} from '../../lib/ai/workspace-path-locator.js';
import styles from './ai-logic-coach.css';

const SUMMARY_EVENTS = [
    'targetsUpdate',
    'workspaceUpdate',
    'PROJECT_CHANGED'
];

const PROCESS_LOG_MAX_ENTRIES = 8;
const AI_LOGIC_COACH_EXTENSION_EVENT = 'scratch-ai-logic-coach-extension-action';
const AI_LOGIC_COACH_EXTENSION_FIELDS = new Set(['goal', 'logic', 'evidence']);
const AI_LOGIC_COACH_EXTENSION_TEXT_LIMIT = 240;
const AI_LOGIC_COACH_CLASS_SESSION_QUERY_KEYS = [
    'scratchAiClassSessionId',
    'classSessionId'
];

const MODEL_REPLY_STATUSES = Object.freeze({
    CANCELED: 'canceled',
    IDLE: 'idle',
    LOADING: 'loading',
    READY: 'ready',
    TIMEOUT: 'timeout',
    ERROR: 'error'
});

const ASSET_JOB_STATUSES = Object.freeze({
    CANCELED: 'canceled',
    IDLE: 'idle',
    LOADING: 'loading',
    READY: 'ready',
    TIMEOUT: 'timeout',
    ERROR: 'error'
});

const AI_MODEL_REQUEST_TIMEOUT_MS = 15000;
const AI_ASSET_REQUEST_TIMEOUT_MS = 120000;

const TEACHER_DRAFT_STATUSES = Object.freeze({
    IDLE: 'idle',
    LOADING: 'loading',
    READY: 'ready',
    ERROR: 'error'
});

const RELEASE_AUDIT_STATUSES = Object.freeze({
    IDLE: 'idle',
    LOADING: 'loading',
    READY: 'ready',
    ERROR: 'error'
});

const readInitialClassSessionId = () => {
    if (
        typeof window === 'undefined' ||
        !window.location ||
        !window.location.search ||
        typeof URLSearchParams === 'undefined'
    ) {
        return '';
    }

    const queryParams = new URLSearchParams(window.location.search);
    for (const key of AI_LOGIC_COACH_CLASS_SESSION_QUERY_KEYS) {
        const classSessionId = normalizeClassSessionId(queryParams.get(key));
        if (classSessionId) return classSessionId;
    }
    return '';
};

const TEACHER_ACCOUNT_MANAGEMENT_UI_SCHEMA_ID = 'scratch-ai-teacher-account-management-ui-v1';
const TEACHER_ACCOUNT_ADMIN_UI_SCHEMA_ID = 'scratch-ai-teacher-account-admin-ui-v1';

const formatTeacherSessionExpiresAt = (intl, expiresAt) => {
    const timestamp = Date.parse(expiresAt);
    if (!Number.isFinite(timestamp)) return '';
    const date = new Date(timestamp);
    return `${intl.formatDate(date, {
        month: 'short',
        day: 'numeric'
    })} ${intl.formatTime(date, {
        hour: '2-digit',
        minute: '2-digit'
    })}`;
};

const LOG_TYPES = Object.freeze({
    PANEL_OPENED: 'panel-opened',
    SUMMARY_REFRESHED: 'summary-refreshed',
    GATE_FIELD_COMPLETED: 'gate-field-completed',
    GATE_FIELD_CLEARED: 'gate-field-cleared',
    GATE_STATE_EMPTY: 'gate-state-empty',
    GATE_STATE_DRAFTING: 'gate-state-drafting',
    GATE_STATE_READY: 'gate-state-ready',
    GATE_STATE_REVIEWED: 'gate-state-reviewed',
    MODEL_QUESTION_SENT: 'model-question-sent',
    MODEL_REPLY_RECEIVED: 'model-reply-received',
    MODEL_REQUEST_BLOCKED: 'model-request-blocked',
    MODEL_REQUEST_CANCELED: 'model-request-canceled',
    MODEL_REQUEST_FAILED: 'model-request-failed',
    MODEL_REQUEST_TIMEOUT: 'model-request-timeout',
    MODEL_REPLY_PATH_SELECTED: 'model-reply-path-selected',
    SCRIPT_EXPLANATION_CREATED: 'script-explanation-created',
    BLOCK_DRAFT_CREATED: 'block-draft-created',
    ASSET_JOB_SENT: 'asset-job-sent',
    ASSET_JOB_RECEIVED: 'asset-job-received',
    ASSET_JOB_BLOCKED: 'asset-job-blocked',
    ASSET_JOB_CANCELED: 'asset-job-canceled',
    ASSET_JOB_FAILED: 'asset-job-failed',
    ASSET_JOB_TIMEOUT: 'asset-job-timeout',
    ASSET_DRAFT_REVIEWED: 'asset-draft-reviewed',
    ASSET_IMPORTED_TO_COSTUME_EDITOR: 'asset-imported-to-costume-editor',
    ASSET_IMPORT_FAILED: 'asset-import-failed',
    ASSET_VISUAL_EDIT_RECORDED: 'asset-visual-edit-recorded',
    ASSET_DRAFT_ADOPTED: 'asset-draft-adopted',
    TEACHER_SESSION_SENT: 'teacher-session-sent',
    TEACHER_SESSION_RECEIVED: 'teacher-session-received',
    TEACHER_SESSION_BLOCKED: 'teacher-session-blocked',
    TEACHER_SESSION_FAILED: 'teacher-session-failed',
    TEACHER_SESSION_SIGNED_OUT: 'teacher-session-signed-out',
    TEACHER_ACCOUNT_ADMIN_SENT: 'teacher-account-admin-sent',
    TEACHER_ACCOUNT_ADMIN_RECEIVED: 'teacher-account-admin-received',
    TEACHER_ACCOUNT_ADMIN_BLOCKED: 'teacher-account-admin-blocked',
    TEACHER_ACCOUNT_ADMIN_FAILED: 'teacher-account-admin-failed',
    ACTIVE_TEACHER_LOCK_SENT: 'active-teacher-lock-sent',
    ACTIVE_TEACHER_LOCK_RECEIVED: 'active-teacher-lock-received',
    ACTIVE_TEACHER_LOCK_EMPTY: 'active-teacher-lock-empty',
    ACTIVE_TEACHER_LOCK_FAILED: 'active-teacher-lock-failed',
    TEACHER_LOCK_SENT: 'teacher-lock-sent',
    TEACHER_LOCK_RECEIVED: 'teacher-lock-received',
    TEACHER_LOCK_BLOCKED: 'teacher-lock-blocked',
    TEACHER_LOCK_FAILED: 'teacher-lock-failed',
    LESSON_PREP_SENT: 'lesson-prep-sent',
    LESSON_PREP_RECEIVED: 'lesson-prep-received',
    LESSON_PREP_BLOCKED: 'lesson-prep-blocked',
    LESSON_PREP_FAILED: 'lesson-prep-failed',
    RELEASE_DRAFT_FIELD_COMPLETED: 'release-draft-field-completed',
    RELEASE_DRAFT_FIELD_CLEARED: 'release-draft-field-cleared',
    RELEASE_DRAFT_READY: 'release-draft-ready',
    RELEASE_HTML_EXPORTED: 'release-html-exported',
    STUDENT_REPORT_EXPORTED: 'student-report-exported',
    STUDENT_REPORT_PDF_EXPORTED: 'student-report-pdf-exported',
    RELEASE_HOSTING_SENT: 'release-hosting-sent',
    RELEASE_HOSTING_RECEIVED: 'release-hosting-received',
    RELEASE_HOSTING_BLOCKED: 'release-hosting-blocked',
    RELEASE_HOSTING_FAILED: 'release-hosting-failed',
    TEACHER_REVIEW_SENT: 'teacher-review-sent',
    TEACHER_REVIEW_RECEIVED: 'teacher-review-received',
    TEACHER_REVIEW_BLOCKED: 'teacher-review-blocked',
    TEACHER_REVIEW_FAILED: 'teacher-review-failed',
    RELEASE_AUDIT_SENT: 'release-audit-sent',
    RELEASE_AUDIT_RECEIVED: 'release-audit-received',
    RELEASE_AUDIT_BLOCKED: 'release-audit-blocked',
    RELEASE_AUDIT_FAILED: 'release-audit-failed',
    RELEASE_AUDIT_POLICY_SENT: 'release-audit-policy-sent',
    RELEASE_AUDIT_POLICY_RECEIVED: 'release-audit-policy-received',
    RELEASE_AUDIT_POLICY_FAILED: 'release-audit-policy-failed',
    RELEASE_ADMIN_SUMMARY_SENT: 'release-admin-summary-sent',
    RELEASE_ADMIN_SUMMARY_RECEIVED: 'release-admin-summary-received',
    RELEASE_ADMIN_SUMMARY_FAILED: 'release-admin-summary-failed',
    RELEASE_RESEARCH_DATASET_SENT: 'release-research-dataset-sent',
    RELEASE_RESEARCH_DATASET_RECEIVED: 'release-research-dataset-received',
    RELEASE_RESEARCH_DATASET_FAILED: 'release-research-dataset-failed',
    RELEASE_APPROVAL_QUEUE_SENT: 'release-approval-queue-sent',
    RELEASE_APPROVAL_QUEUE_RECEIVED: 'release-approval-queue-received',
    RELEASE_APPROVAL_QUEUE_FAILED: 'release-approval-queue-failed',
    RELEASE_APPROVAL_QUEUE_TARGET_SELECTED: 'release-approval-queue-target-selected',
    Q18_VOICE_DRAFT_CREATED: 'q18-voice-draft-created',
    Q18_PROJECT_SKELETON_CREATED: 'q18-project-skeleton-created',
    Q18_ADDITION_TEMPLATE_CREATED: 'q18-addition-template-created',
    EXTENSION_PANEL_OPENED: 'extension-panel-opened',
    EXTENSION_EXPLANATION_RECORDED: 'extension-explanation-recorded',
    EXTENSION_Q18_ACTION: 'extension-q18-action'
});

const messages = defineMessages({
    openCoach: {
        id: 'gui.aiLogicCoach.openCoach',
        defaultMessage: 'Open thinking helper',
        description: 'Button label for opening the AI logic coach panel'
    },
    closeCoach: {
        id: 'gui.aiLogicCoach.closeCoach',
        defaultMessage: 'Close thinking helper',
        description: 'Button label for closing the AI logic coach panel'
    },
    panel: {
        id: 'gui.aiLogicCoach.panel',
        defaultMessage: 'Thinking Helper',
        description: 'ARIA label for the AI logic coach panel'
    },
    goalPlaceholder: {
        id: 'gui.aiLogicCoach.goalPlaceholder',
        defaultMessage: 'Example: I want to make a quiz that says right or try again.',
        description: 'Placeholder for the goal field in the explain gate'
    },
    logicPlaceholder: {
        id: 'gui.aiLogicCoach.logicPlaceholder',
        defaultMessage: 'Say what starts first, what the program checks, and what happens next.',
        description: 'Placeholder for the logic field in the explain gate'
    },
    evidencePlaceholder: {
        id: 'gui.aiLogicCoach.evidencePlaceholder',
        defaultMessage: 'Say one thing you will try, and what you should see.',
        description: 'Placeholder for the test evidence field in the explain gate'
    },
    goal: {
        id: 'gui.aiLogicCoach.goal',
        defaultMessage: 'What I want',
        description: 'Goal field label in explain gate'
    },
    logic: {
        id: 'gui.aiLogicCoach.logic',
        defaultMessage: 'How it works',
        description: 'Logic field label in explain gate'
    },
    evidence: {
        id: 'gui.aiLogicCoach.evidence',
        defaultMessage: 'How I will check',
        description: 'Test evidence field label in explain gate'
    },
    questionGoalMissing: {
        id: 'gui.aiLogicCoach.questionGoalMissing',
        defaultMessage: 'When your project works, what should we see?',
        description: 'Local Socratic question for a missing project goal'
    },
    questionLogicMissing: {
        id: 'gui.aiLogicCoach.questionLogicMissing',
        defaultMessage: 'What starts first? What does your program check? What happens next?',
        description: 'Local Socratic question for missing logic explanation'
    },
    questionEvidenceMissing: {
        id: 'gui.aiLogicCoach.questionEvidenceMissing',
        defaultMessage: 'What will you try to make sure it works?',
        description: 'Local Socratic question for missing test evidence'
    },
    questionNoLogicFlows: {
        id: 'gui.aiLogicCoach.questionNoLogicFlows',
        defaultMessage: 'I do not see a starting block yet. Which block should start this part?',
        description: 'Local Socratic question for an empty logic graph'
    },
    questionFlowExplain: {
        id: 'gui.aiLogicCoach.questionFlowExplain',
        defaultMessage: 'Look at {target}: {entry}. What job does this script do?',
        description: 'Local Socratic question connecting a flow to the student explanation'
    },
    questionUnmatchedBroadcastSend: {
        id: 'gui.aiLogicCoach.questionUnmatchedBroadcastSend',
        defaultMessage: 'The message "{message}" is sent, but nothing catches it. Should a sprite catch it?',
        description: 'Local Socratic question for a broadcast send without a receiver'
    },
    questionUnmatchedBroadcastReceive: {
        id: 'gui.aiLogicCoach.questionUnmatchedBroadcastReceive',
        defaultMessage: 'A script is waiting for "{message}", but nothing sends it. What should send it?',
        description: 'Local Socratic question for a broadcast receiver without a sender'
    },
    questionTraceBroadcast: {
        id: 'gui.aiLogicCoach.questionTraceBroadcast',
        defaultMessage: 'When "{message}" is sent, what should the sprite do or show?',
        description: 'Local Socratic question for tracing a connected broadcast'
    },
    questionScriptOutput: {
        id: 'gui.aiLogicCoach.questionScriptOutput',
        defaultMessage: 'After {target} starts with {entry}, what should you see on the stage?',
        description: 'Local Socratic question for evidence on a script path'
    },
    questionEvidenceDetail: {
        id: 'gui.aiLogicCoach.questionEvidenceDetail',
        defaultMessage: 'Can you write one thing to try and what should happen?',
        description: 'Local Socratic question asking for more specific evidence'
    },
    questionReadyCheck: {
        id: 'gui.aiLogicCoach.questionReadyCheck',
        defaultMessage: 'Before you check it, which script best shows your idea?',
        description: 'Local Socratic question before self-review'
    },
    questionReviewedTransfer: {
        id: 'gui.aiLogicCoach.questionReviewedTransfer',
        defaultMessage: 'Pick one thing you said, then point to the script that proves it.',
        description: 'Local Socratic question after self-review'
    },
    evidenceChecklist: {
        id: 'gui.aiLogicCoach.evidenceChecklist',
        defaultMessage: 'Check list',
        description: 'Heading for the local evidence checklist'
    },
    evidenceScoreLabel: {
        id: 'gui.aiLogicCoach.evidenceScoreLabel',
        defaultMessage: 'Check score',
        description: 'Label for local evidence checklist score'
    },
    evidenceScore: {
        id: 'gui.aiLogicCoach.evidenceScore',
        defaultMessage: '{score}/{maxScore}',
        description: 'Local evidence checklist score'
    },
    evidenceStatusPass: {
        id: 'gui.aiLogicCoach.evidenceStatusPass',
        defaultMessage: 'Looks good',
        description: 'Passing status for local evidence checklist items'
    },
    evidenceStatusPartial: {
        id: 'gui.aiLogicCoach.evidenceStatusPartial',
        defaultMessage: 'Add a little',
        description: 'Partial status for local evidence checklist items'
    },
    evidenceStatusMissing: {
        id: 'gui.aiLogicCoach.evidenceStatusMissing',
        defaultMessage: 'Not yet',
        description: 'Missing status for local evidence checklist items'
    },
    checkGoal: {
        id: 'gui.aiLogicCoach.checkGoal',
        defaultMessage: 'What I want',
        description: 'Evidence checklist item label for the goal claim'
    },
    checkGoalPass: {
        id: 'gui.aiLogicCoach.checkGoalPass',
        defaultMessage: 'You said what should happen.',
        description: 'Passing evidence checklist detail for the goal claim'
    },
    checkGoalPartial: {
        id: 'gui.aiLogicCoach.checkGoalPartial',
        defaultMessage: 'Say it so someone can see it happen.',
        description: 'Partial evidence checklist detail for the goal claim'
    },
    checkGoalMissing: {
        id: 'gui.aiLogicCoach.checkGoalMissing',
        defaultMessage: 'Write what your project should do.',
        description: 'Missing evidence checklist detail for the goal claim'
    },
    checkLogic: {
        id: 'gui.aiLogicCoach.checkLogic',
        defaultMessage: 'How it works',
        description: 'Evidence checklist item label for the logic chain'
    },
    checkLogicPass: {
        id: 'gui.aiLogicCoach.checkLogicPass',
        defaultMessage: 'You said the start, the check, and what happens.',
        description: 'Passing evidence checklist detail for the logic chain'
    },
    checkLogicPartial: {
        id: 'gui.aiLogicCoach.checkLogicPartial',
        defaultMessage: 'Add what starts it, what it checks, or what happens next.',
        description: 'Partial evidence checklist detail for the logic chain'
    },
    checkLogicMissing: {
        id: 'gui.aiLogicCoach.checkLogicMissing',
        defaultMessage: 'Write how your project should work.',
        description: 'Missing evidence checklist detail for the logic chain'
    },
    checkEvidence: {
        id: 'gui.aiLogicCoach.checkEvidence',
        defaultMessage: 'How I will check',
        description: 'Evidence checklist item label for test evidence'
    },
    checkEvidencePass: {
        id: 'gui.aiLogicCoach.checkEvidencePass',
        defaultMessage: 'You wrote a clear test.',
        description: 'Passing evidence checklist detail for test evidence'
    },
    checkEvidencePartial: {
        id: 'gui.aiLogicCoach.checkEvidencePartial',
        defaultMessage: 'Add what you will try and what you expect to see.',
        description: 'Partial evidence checklist detail for test evidence'
    },
    checkEvidenceMissing: {
        id: 'gui.aiLogicCoach.checkEvidenceMissing',
        defaultMessage: 'Write one way to test your project.',
        description: 'Missing evidence checklist detail for test evidence'
    },
    checkEventEntry: {
        id: 'gui.aiLogicCoach.checkEventEntry',
        defaultMessage: 'Start block',
        description: 'Evidence checklist item label for event entry'
    },
    checkEventEntryPass: {
        id: 'gui.aiLogicCoach.checkEventEntryPass',
        defaultMessage: 'Your project has a starting block.',
        description: 'Passing evidence checklist detail for event entry'
    },
    checkEventEntryMissing: {
        id: 'gui.aiLogicCoach.checkEventEntryMissing',
        defaultMessage: 'Add or find the block that starts this part.',
        description: 'Missing evidence checklist detail for event entry'
    },
    checkBroadcastClosure: {
        id: 'gui.aiLogicCoach.checkBroadcastClosure',
        defaultMessage: 'Message check',
        description: 'Evidence checklist item label for broadcast closure'
    },
    checkBroadcastClosurePass: {
        id: 'gui.aiLogicCoach.checkBroadcastClosurePass',
        defaultMessage: 'Messages are matched, or you do not need messages.',
        description: 'Passing evidence checklist detail for broadcast closure'
    },
    checkBroadcastClosureMissing: {
        id: 'gui.aiLogicCoach.checkBroadcastClosureMissing',
        defaultMessage: 'Fix message "{message}" so one script sends it and another catches it.',
        description: 'Missing evidence checklist detail for broadcast closure'
    },
    pathExplainGateGoal: {
        id: 'gui.aiLogicCoach.pathExplainGateGoal',
        defaultMessage: 'Place: Say it first > What I want',
        description: 'Path label for goal explain gate field'
    },
    pathExplainGateLogic: {
        id: 'gui.aiLogicCoach.pathExplainGateLogic',
        defaultMessage: 'Place: Say it first > How it works',
        description: 'Path label for logic explain gate field'
    },
    pathExplainGateEvidence: {
        id: 'gui.aiLogicCoach.pathExplainGateEvidence',
        defaultMessage: 'Place: Say it first > How I will check',
        description: 'Path label for evidence explain gate field'
    },
    pathLogicEventEntry: {
        id: 'gui.aiLogicCoach.pathLogicEventEntry',
        defaultMessage: 'Place: Program path > Start block',
        description: 'Path label for logic graph event entry'
    },
    pathLogicBroadcastClosure: {
        id: 'gui.aiLogicCoach.pathLogicBroadcastClosure',
        defaultMessage: 'Place: Program path > Message check',
        description: 'Path label for logic graph broadcast closure'
    },
    pathLogicFlow: {
        id: 'gui.aiLogicCoach.pathLogicFlow',
        defaultMessage: 'Place: Program path > {target} / {entry}',
        description: 'Path label for one logic flow'
    },
    pathBroadcastLink: {
        id: 'gui.aiLogicCoach.pathBroadcastLink',
        defaultMessage: 'Place: Message > {message}',
        description: 'Path label for one broadcast link'
    },
    pathReviewBridge: {
        id: 'gui.aiLogicCoach.pathReviewBridge',
        defaultMessage: 'Place: My words + program path',
        description: 'Path label for review transfer between explanation and graph'
    },
    selectedPathLabel: {
        id: 'gui.aiLogicCoach.selectedPathLabel',
        defaultMessage: 'Looking here',
        description: 'Accessible label for a selected evidence path'
    },
    scriptExplanation: {
        id: 'gui.aiLogicCoach.scriptExplanation',
        defaultMessage: 'Script explanation',
        description: 'Heading for Blocks to natural language explanation panel'
    },
    scriptExplanationSelected: {
        id: 'gui.aiLogicCoach.scriptExplanationSelected',
        defaultMessage: '{target} script {script}',
        description: 'Selected script label for Blocks to natural language explanation'
    },
    scriptExplanationNoScript: {
        id: 'gui.aiLogicCoach.scriptExplanationNoScript',
        defaultMessage: 'Add a starting block before asking for a script explanation.',
        description: 'Empty selected script state for Blocks to natural language explanation'
    },
    scriptExplanationGateLocked: {
        id: 'gui.aiLogicCoach.scriptExplanationGateLocked',
        defaultMessage: 'Finish and check "Say it first" before explaining scripts.',
        description: 'Gate message before script explanation is allowed'
    },
    explainSelectedScript: {
        id: 'gui.aiLogicCoach.explainSelectedScript',
        defaultMessage: 'Explain script',
        description: 'Button label for explaining the selected script'
    },
    scriptExplanationResult: {
        id: 'gui.aiLogicCoach.scriptExplanationResult',
        defaultMessage: 'What this script means',
        description: 'Result heading for Blocks to natural language explanation'
    },
    scriptExplanationEmptyResult: {
        id: 'gui.aiLogicCoach.scriptExplanationEmptyResult',
        defaultMessage: 'No explanation yet.',
        description: 'Empty result for Blocks to natural language explanation'
    },
    scriptExplanationSummary: {
        id: 'gui.aiLogicCoach.scriptExplanationSummary',
        defaultMessage: '{target} script {script} starts with {entry} and has {blocks} blocks.',
        description: 'Summary sentence for Blocks to natural language explanation'
    },
    scriptExplanationCauseStart: {
        id: 'gui.aiLogicCoach.scriptExplanationCauseStart',
        defaultMessage: 'When {entry} happens, this script starts.',
        description: 'First causal step for Blocks to natural language explanation'
    },
    scriptExplanationCauseSequence: {
        id: 'gui.aiLogicCoach.scriptExplanationCauseSequence',
        defaultMessage: 'Scratch then runs the script from top to bottom across {blocks} blocks.',
        description: 'Sequence causal step for Blocks to natural language explanation'
    },
    scriptExplanationCauseBroadcasts: {
        id: 'gui.aiLogicCoach.scriptExplanationCauseBroadcasts',
        defaultMessage: 'It sends {messages}, so another script can catch the message and continue the idea.',
        description: 'Broadcast causal step for Blocks to natural language explanation'
    },
    scriptExplanationCauseNoBroadcasts: {
        id: 'gui.aiLogicCoach.scriptExplanationCauseNoBroadcasts',
        defaultMessage: 'It does not send a message, so this path mostly finishes its own action.',
        description: 'No-broadcast causal step for Blocks to natural language explanation'
    },
    scriptExplanationEvidence: {
        id: 'gui.aiLogicCoach.scriptExplanationEvidence',
        defaultMessage:
            'Use your check plan to run this script and watch whether the stage shows the result you wrote.',
        description: 'Evidence sentence for Blocks to natural language explanation'
    },
    scriptExplanationQuestionVisible: {
        id: 'gui.aiLogicCoach.scriptExplanationQuestionVisible',
        defaultMessage: 'What is the first thing someone can see after this script starts?',
        description: 'Follow-up question for Blocks to natural language explanation'
    },
    scriptExplanationQuestionBroadcast: {
        id: 'gui.aiLogicCoach.scriptExplanationQuestionBroadcast',
        defaultMessage: 'Who should catch "{firstMessage}", and what should happen next?',
        description: 'Broadcast follow-up question for Blocks to natural language explanation'
    },
    scriptExplanationQuestionEvidence: {
        id: 'gui.aiLogicCoach.scriptExplanationQuestionEvidence',
        defaultMessage: 'Which part of your check proves that this script worked?',
        description: 'Evidence follow-up question for Blocks to natural language explanation'
    },
    scriptExplanationSafety: {
        id: 'gui.aiLogicCoach.scriptExplanationSafety',
        defaultMessage: 'Explanation only. No blocks were created or inserted.',
        description: 'Safety note for Blocks to natural language explanation'
    },
    blockDraft: {
        id: 'gui.aiLogicCoach.blockDraft',
        defaultMessage: 'Block draft',
        description: 'Heading for natural language to blocks draft panel'
    },
    blockDraftSourceReady: {
        id: 'gui.aiLogicCoach.blockDraftSourceReady',
        defaultMessage: 'Uses your Say it first card. Target: {target}',
        description: 'Source summary for natural language to blocks draft'
    },
    blockDraftSourceMissing: {
        id: 'gui.aiLogicCoach.blockDraftSourceMissing',
        defaultMessage: 'Write and check your idea before making a block draft.',
        description: 'Empty source state for natural language to blocks draft'
    },
    blockDraftGateLocked: {
        id: 'gui.aiLogicCoach.blockDraftGateLocked',
        defaultMessage: 'Finish and check "Say it first" before making a block draft.',
        description: 'Gate message before natural language to blocks draft is allowed'
    },
    makeBlockDraft: {
        id: 'gui.aiLogicCoach.makeBlockDraft',
        defaultMessage: 'Make block draft',
        description: 'Button label for natural language to blocks draft'
    },
    makeScriptDraft: {
        id: 'gui.aiLogicCoach.makeScriptDraft',
        defaultMessage: 'Generate AI script',
        description: 'Button label for model-backed natural language to blocks script draft'
    },
    insertScriptDraft: {
        id: 'gui.aiLogicCoach.insertScriptDraft',
        defaultMessage: 'Insert after review',
        description: 'Button label for inserting a reviewed model-backed script draft'
    },
    scriptDraftLoading: {
        id: 'gui.aiLogicCoach.scriptDraftLoading',
        defaultMessage: 'Generating a reviewed script draft...',
        description: 'Loading state for model-backed natural language to blocks script draft'
    },
    scriptDraftSummary: {
        id: 'gui.aiLogicCoach.scriptDraftSummary',
        defaultMessage: '{scripts} scripts / {blocks} blocks / {concepts} concepts',
        description: 'Summary for model-backed natural language to blocks script draft'
    },
    scriptDraftWarnings: {
        id: 'gui.aiLogicCoach.scriptDraftWarnings',
        defaultMessage: 'Teacher reminders',
        description: 'Heading for teacher policy warnings in model-backed script draft'
    },
    scriptDraftReviewQuestions: {
        id: 'gui.aiLogicCoach.scriptDraftReviewQuestions',
        defaultMessage: 'Review before inserting',
        description: 'Heading for review questions in model-backed script draft'
    },
    scriptDraftSafety: {
        id: 'gui.aiLogicCoach.scriptDraftSafety',
        defaultMessage: 'AI script draft. Nothing is inserted until you review and press insert.',
        description: 'Safety note for model-backed natural language to blocks script draft'
    },
    scriptDraftInserted: {
        id: 'gui.aiLogicCoach.scriptDraftInserted',
        defaultMessage: 'Inserted {scripts} scripts and {blocks} blocks into the current sprite.',
        description: 'Success note after inserting a reviewed model-backed script draft'
    },
    scriptDraftConsentRequired: {
        id: 'gui.aiLogicCoach.scriptDraftConsentRequired',
        defaultMessage: 'Check the model consent box before generating an AI script.',
        description: 'Consent reminder for model-backed natural language to blocks script draft'
    },
    blockDraftResult: {
        id: 'gui.aiLogicCoach.blockDraftResult',
        defaultMessage: 'Draft preview',
        description: 'Result heading for natural language to blocks draft'
    },
    blockDraftEmptyResult: {
        id: 'gui.aiLogicCoach.blockDraftEmptyResult',
        defaultMessage: 'No block draft yet.',
        description: 'Empty result for natural language to blocks draft'
    },
    blockDraftSummary: {
        id: 'gui.aiLogicCoach.blockDraftSummary',
        defaultMessage: '{steps} draft steps / {concepts} concepts',
        description: 'Summary for natural language to blocks draft'
    },
    blockDraftConcepts: {
        id: 'gui.aiLogicCoach.blockDraftConcepts',
        defaultMessage: 'Concepts to include',
        description: 'Concept list heading for natural language to blocks draft'
    },
    blockDraftJsonPreview: {
        id: 'gui.aiLogicCoach.blockDraftJsonPreview',
        defaultMessage: 'JSON plan',
        description: 'JSON preview heading for natural language to blocks draft'
    },
    blockDraftBlocklyPreview: {
        id: 'gui.aiLogicCoach.blockDraftBlocklyPreview',
        defaultMessage: 'Blockly outline',
        description: 'Blockly outline heading for natural language to blocks draft'
    },
    blockDraftSafety: {
        id: 'gui.aiLogicCoach.blockDraftSafety',
        defaultMessage: 'Concept draft only. No complete script, blocks, or workspace changes were created.',
        description: 'Safety note for natural language to blocks draft'
    },
    blockDraftConceptEvent: {
        id: 'gui.aiLogicCoach.blockDraftConcept.event',
        defaultMessage: 'Event',
        description: 'Event concept label in natural language to blocks draft'
    },
    blockDraftConceptSequence: {
        id: 'gui.aiLogicCoach.blockDraftConcept.sequence',
        defaultMessage: 'Sequence',
        description: 'Sequence concept label in natural language to blocks draft'
    },
    blockDraftConceptInput: {
        id: 'gui.aiLogicCoach.blockDraftConcept.input',
        defaultMessage: 'Input',
        description: 'Input concept label in natural language to blocks draft'
    },
    blockDraftConceptCondition: {
        id: 'gui.aiLogicCoach.blockDraftConcept.condition',
        defaultMessage: 'If / check',
        description: 'Condition concept label in natural language to blocks draft'
    },
    blockDraftConceptLoop: {
        id: 'gui.aiLogicCoach.blockDraftConcept.loop',
        defaultMessage: 'Loop',
        description: 'Loop concept label in natural language to blocks draft'
    },
    blockDraftConceptVariable: {
        id: 'gui.aiLogicCoach.blockDraftConcept.variable',
        defaultMessage: 'Variable',
        description: 'Variable concept label in natural language to blocks draft'
    },
    blockDraftConceptBroadcast: {
        id: 'gui.aiLogicCoach.blockDraftConcept.broadcast',
        defaultMessage: 'Message',
        description: 'Broadcast concept label in natural language to blocks draft'
    },
    blockDraftConceptOutput: {
        id: 'gui.aiLogicCoach.blockDraftConcept.output',
        defaultMessage: 'Output',
        description: 'Output concept label in natural language to blocks draft'
    },
    blockDraftStepEvent: {
        id: 'gui.aiLogicCoach.blockDraftStep.event',
        defaultMessage: 'Start {target} from {start}.',
        description: 'Event step in natural language to blocks draft'
    },
    blockDraftStepSequence: {
        id: 'gui.aiLogicCoach.blockDraftStep.sequence',
        defaultMessage: 'Put the actions in a clear top-to-bottom order.',
        description: 'Sequence step in natural language to blocks draft'
    },
    blockDraftStepInput: {
        id: 'gui.aiLogicCoach.blockDraftStep.input',
        defaultMessage: 'Add a place for input such as {input}.',
        description: 'Input step in natural language to blocks draft'
    },
    blockDraftStepCondition: {
        id: 'gui.aiLogicCoach.blockDraftStep.condition',
        defaultMessage: 'Use a check for {condition} before choosing the result.',
        description: 'Condition step in natural language to blocks draft'
    },
    blockDraftStepLoop: {
        id: 'gui.aiLogicCoach.blockDraftStep.loop',
        defaultMessage: 'Use {loop} only for the part that repeats.',
        description: 'Loop step in natural language to blocks draft'
    },
    blockDraftStepVariable: {
        id: 'gui.aiLogicCoach.blockDraftStep.variable',
        defaultMessage: 'Track {variable} with a variable card.',
        description: 'Variable step in natural language to blocks draft'
    },
    blockDraftStepBroadcast: {
        id: 'gui.aiLogicCoach.blockDraftStep.broadcast',
        defaultMessage: 'Use a message such as {message} only if another script should continue.',
        description: 'Broadcast step in natural language to blocks draft'
    },
    blockDraftStepOutput: {
        id: 'gui.aiLogicCoach.blockDraftStep.output',
        defaultMessage: 'Show the result with {output}.',
        description: 'Output step in natural language to blocks draft'
    },
    projectPlan: {
        id: 'gui.aiLogicCoach.projectPlan',
        defaultMessage: 'Project plan',
        description: 'Heading for project planner and logic visualization panel'
    },
    projectPlanEmpty: {
        id: 'gui.aiLogicCoach.projectPlanEmpty',
        defaultMessage: 'Write your idea or add a starting script to build a plan.',
        description: 'Empty state for project planner'
    },
    projectPlanSummary: {
        id: 'gui.aiLogicCoach.projectPlanSummary',
        defaultMessage: '{completed}/{total} ready / {scripts} scripts / {concepts} concepts',
        description: 'Summary for project planner'
    },
    projectPlanDone: {
        id: 'gui.aiLogicCoach.projectPlanDone',
        defaultMessage: 'Ready',
        description: 'Ready status badge for project plan item'
    },
    projectPlanTodo: {
        id: 'gui.aiLogicCoach.projectPlanTodo',
        defaultMessage: 'Next',
        description: 'Todo status badge for project plan item'
    },
    projectPlanChecklist: {
        id: 'gui.aiLogicCoach.projectPlanChecklist',
        defaultMessage: 'Plan card',
        description: 'Checklist heading for project planner'
    },
    projectPlanScripts: {
        id: 'gui.aiLogicCoach.projectPlanScripts',
        defaultMessage: 'Choose a script',
        description: 'Script chooser heading for project planner'
    },
    projectPlanConcepts: {
        id: 'gui.aiLogicCoach.projectPlanConcepts',
        defaultMessage: 'Choose a concept',
        description: 'Concept chooser heading for project planner'
    },
    projectPlanMessages: {
        id: 'gui.aiLogicCoach.projectPlanMessages',
        defaultMessage: 'Message map',
        description: 'Message map heading for project planner'
    },
    projectPlanNoScripts: {
        id: 'gui.aiLogicCoach.projectPlanNoScripts',
        defaultMessage: 'Add a starting block to choose a script.',
        description: 'Empty script chooser state for project planner'
    },
    projectPlanNoConcepts: {
        id: 'gui.aiLogicCoach.projectPlanNoConcepts',
        defaultMessage: 'Generate a block draft to choose a concept.',
        description: 'Empty concept chooser state for project planner'
    },
    projectPlanNoMessages: {
        id: 'gui.aiLogicCoach.projectPlanNoMessages',
        defaultMessage: 'No messages to connect yet.',
        description: 'Empty message map state for project planner'
    },
    projectPlanScriptChoice: {
        id: 'gui.aiLogicCoach.projectPlanScriptChoice',
        defaultMessage: '{target} script {script}: {entry}, {blocks} blocks',
        description: 'Script chooser button text for project planner'
    },
    projectPlanMessageLink: {
        id: 'gui.aiLogicCoach.projectPlanMessageLink',
        defaultMessage: '{message}: {sends} send / {receives} catch',
        description: 'Message map row text for project planner'
    },
    projectPlanConceptSelected: {
        id: 'gui.aiLogicCoach.projectPlanConceptSelected',
        defaultMessage: 'Selected concept',
        description: 'Selected concept status in project planner'
    },
    projectPlanItemGoal: {
        id: 'gui.aiLogicCoach.projectPlanItem.goal',
        defaultMessage: 'Goal is written',
        description: 'Goal item in project planner'
    },
    projectPlanItemLogic: {
        id: 'gui.aiLogicCoach.projectPlanItem.logic',
        defaultMessage: 'Logic is explained',
        description: 'Logic item in project planner'
    },
    projectPlanItemEvidence: {
        id: 'gui.aiLogicCoach.projectPlanItem.evidence',
        defaultMessage: 'Test is written',
        description: 'Evidence item in project planner'
    },
    projectPlanItemReview: {
        id: 'gui.aiLogicCoach.projectPlanItem.review',
        defaultMessage: 'Say it first is checked',
        description: 'Review item in project planner'
    },
    projectPlanItemScript: {
        id: 'gui.aiLogicCoach.projectPlanItem.script',
        defaultMessage: 'Project has {scripts} started scripts',
        description: 'Script item in project planner'
    },
    projectPlanItemConcepts: {
        id: 'gui.aiLogicCoach.projectPlanItem.concepts',
        defaultMessage: 'Block draft has {concepts} concepts',
        description: 'Concept item in project planner'
    },
    modelCoach: {
        id: 'gui.aiLogicCoach.modelCoach',
        defaultMessage: 'Ask for a hint',
        description: 'Heading for optional model-backed Socratic coach'
    },
    modelQuestionLabel: {
        id: 'gui.aiLogicCoach.modelQuestionLabel',
        defaultMessage: 'Question',
        description: 'Label for optional model-backed question field'
    },
    modelQuestionPlaceholder: {
        id: 'gui.aiLogicCoach.modelQuestionPlaceholder',
        defaultMessage: 'Ask for a small hint, not the whole answer.',
        description: 'Placeholder for optional model-backed question field'
    },
    modelConsentLabel: {
        id: 'gui.aiLogicCoach.modelConsentLabel',
        defaultMessage: 'I agree to share a short summary so AI can give me a hint.',
        description: 'Consent label before sending minimized context to middleware'
    },
    askModel: {
        id: 'gui.aiLogicCoach.askModel',
        defaultMessage: 'Give me a hint',
        description: 'Button label for sending a question to the model coach'
    },
    askingModel: {
        id: 'gui.aiLogicCoach.askingModel',
        defaultMessage: 'Thinking...',
        description: 'Loading button label while sending a model question'
    },
    cancelModelRequest: {
        id: 'gui.aiLogicCoach.cancelModelRequest',
        defaultMessage: 'Cancel',
        description: 'Button label for canceling an in-flight model request'
    },
    modelPending: {
        id: 'gui.aiLogicCoach.modelPending',
        defaultMessage: 'Waiting for a hint...',
        description: 'Status shown while a model-backed request is pending'
    },
    modelCanceled: {
        id: 'gui.aiLogicCoach.modelCanceled',
        defaultMessage: 'Hint request canceled.',
        description: 'Status shown after canceling a model-backed request'
    },
    modelTimeout: {
        id: 'gui.aiLogicCoach.modelTimeout',
        defaultMessage: 'The AI helper took too long. Try a shorter question.',
        description: 'Status shown after a model-backed request times out'
    },
    generationGateLocked: {
        id: 'gui.aiLogicCoach.generationGateLocked',
        defaultMessage: 'Finish and check "Say it first" before asking AI or making drafts.',
        description: 'Gate message shown before model or generation requests are allowed'
    },
    assetGenerationGateHint: {
        id: 'gui.aiLogicCoach.assetGenerationGateHint',
        defaultMessage: 'Tip: finish and check "Say it first" to make this draft fit your project better.',
        description: 'Soft reminder shown before asset draft requests when the explain gate is not reviewed'
    },
    modelReply: {
        id: 'gui.aiLogicCoach.modelReply',
        defaultMessage: 'Hint',
        description: 'Heading for optional model-backed reply'
    },
    modelReplyProvider: {
        id: 'gui.aiLogicCoach.modelReplyProvider',
        defaultMessage: '{provider} / {model}',
        description: 'Provider and model label for optional model-backed reply'
    },
    modelError: {
        id: 'gui.aiLogicCoach.modelError',
        defaultMessage: 'I cannot reach the AI helper right now.',
        description: 'Error shown when optional model-backed request fails'
    },
    modelEmptyReply: {
        id: 'gui.aiLogicCoach.modelEmptyReply',
        defaultMessage: 'No reply yet.',
        description: 'Empty state for optional model-backed reply'
    },
    modelBlocked: {
        id: 'gui.aiLogicCoach.modelBlocked',
        defaultMessage: 'This question was stopped. Try using the check list first.',
        description: 'Status shown when middleware safety gate blocks a model request'
    },
    modelBlockedMissingConsent: {
        id: 'gui.aiLogicCoach.modelBlockedMissingConsent',
        defaultMessage: 'Please check the sharing box before asking for a hint.',
        description: 'Friendly blocked reason for missing model consent'
    },
    modelBlockedTooMuchProject: {
        id: 'gui.aiLogicCoach.modelBlockedTooMuchProject',
        defaultMessage: 'I saw too much project detail. Ask about the step you are stuck on.',
        description: 'Friendly blocked reason for too much project context'
    },
    modelBlockedPrivateInfo: {
        id: 'gui.aiLogicCoach.modelBlockedPrivateInfo',
        defaultMessage: 'I hid private words first. Try asking without names, phone numbers, or keys.',
        description: 'Friendly blocked reason for redacted private information'
    },
    modelBlockedUnknown: {
        id: 'gui.aiLogicCoach.modelBlockedUnknown',
        defaultMessage: 'Try asking again with one short sentence about your problem.',
        description: 'Friendly fallback blocked reason'
    },
    modelReplyPaths: {
        id: 'gui.aiLogicCoach.modelReplyPaths',
        defaultMessage: 'Look at this path',
        description: 'Heading for clickable model reply path aliases'
    },
    modelReplyPathButton: {
        id: 'gui.aiLogicCoach.modelReplyPathButton',
        defaultMessage: 'Script {script}',
        description: 'Button label for a model reply path alias'
    },
    assetQuickJump: {
        id: 'gui.aiLogicCoach.assetQuickJump',
        defaultMessage: 'Make a sprite/backdrop asset',
        description: 'Quick action button that jumps to the asset draft generator'
    },
    assetGenerator: {
        id: 'gui.aiLogicCoach.assetGenerator',
        defaultMessage: 'Sprite / backdrop asset generator',
        description: 'Heading for AI asset mock request tool'
    },
    assetTypeLabel: {
        id: 'gui.aiLogicCoach.assetTypeLabel',
        defaultMessage: 'What do you need?',
        description: 'Label for AI asset type segmented control'
    },
    assetTypeCharacter: {
        id: 'gui.aiLogicCoach.assetTypeCharacter',
        defaultMessage: 'Sprite',
        description: 'AI asset type option for character sprite'
    },
    assetTypeBackdrop: {
        id: 'gui.aiLogicCoach.assetTypeBackdrop',
        defaultMessage: 'Backdrop',
        description: 'AI asset type option for backdrop'
    },
    assetPromptLabel: {
        id: 'gui.aiLogicCoach.assetPromptLabel',
        defaultMessage: 'One short idea',
        description: 'Label for AI asset prompt field'
    },
    assetPromptPlaceholder: {
        id: 'gui.aiLogicCoach.assetPromptPlaceholder',
        defaultMessage: 'Example: a friendly robot helper with a blue hat',
        description: 'Placeholder for AI asset prompt field'
    },
    assetConsentLabel: {
        id: 'gui.aiLogicCoach.assetConsentLabel',
        defaultMessage: 'I agree to send only this short idea to make a server draft.',
        description: 'Consent label for AI asset request'
    },
    assetSubmit: {
        id: 'gui.aiLogicCoach.assetSubmit',
        defaultMessage: 'Make draft',
        description: 'Button label for submitting an AI asset request'
    },
    assetSubmitting: {
        id: 'gui.aiLogicCoach.assetSubmitting',
        defaultMessage: 'Sending...',
        description: 'Loading button label for AI asset mock request'
    },
    cancelAssetRequest: {
        id: 'gui.aiLogicCoach.cancelAssetRequest',
        defaultMessage: 'Cancel',
        description: 'Button label for canceling an in-flight asset draft request'
    },
    assetPending: {
        id: 'gui.aiLogicCoach.assetPending',
        defaultMessage: 'Waiting for a draft...',
        description: 'Status shown while an asset draft request is pending'
    },
    assetCanceled: {
        id: 'gui.aiLogicCoach.assetCanceled',
        defaultMessage: 'Draft request canceled.',
        description: 'Status shown after canceling an asset draft request'
    },
    assetTimeout: {
        id: 'gui.aiLogicCoach.assetTimeout',
        defaultMessage: 'The draft request took too long. Try a shorter idea.',
        description: 'Status shown after an asset draft request times out'
    },
    assetResult: {
        id: 'gui.aiLogicCoach.assetResult',
        defaultMessage: 'Draft card',
        description: 'Heading for AI asset mock result'
    },
    assetEmptyResult: {
        id: 'gui.aiLogicCoach.assetEmptyResult',
        defaultMessage: 'No draft yet.',
        description: 'Empty state for AI asset mock result'
    },
    assetMockReady: {
        id: 'gui.aiLogicCoach.assetMockReady',
        defaultMessage: 'Draft generated',
        description: 'Status for successful AI asset request'
    },
    assetMockMessage: {
        id: 'gui.aiLogicCoach.assetMockMessage',
        defaultMessage: 'Review and edit before using it in a project.',
        description: 'Message explaining AI asset result review requirement'
    },
    assetTransparentRepairNotice: {
        id: 'gui.aiLogicCoach.assetTransparentRepairNotice',
        defaultMessage: 'The background was removed on the server. Check the edges before importing.',
        description: 'Message shown when a generated sprite image was repaired into a transparent PNG'
    },
    assetTransparentRepairFailed: {
        id: 'gui.aiLogicCoach.assetTransparentRepairFailed',
        defaultMessage: 'The model made an opaque image. Server background removal did not pass; try a simpler single-character idea.',
        description: 'Error shown when server-side generated asset background removal fails'
    },
    assetBlocked: {
        id: 'gui.aiLogicCoach.assetBlocked',
        defaultMessage: 'This draft was stopped. Try one short idea without project details.',
        description: 'Blocked status for AI asset request'
    },
    assetError: {
        id: 'gui.aiLogicCoach.assetError',
        defaultMessage: 'The AI image draft was not generated. Try again later.',
        description: 'Error shown when AI asset request fails'
    },
    assetAdoption: {
        id: 'gui.aiLogicCoach.assetAdoption',
        defaultMessage: 'Use safely',
        description: 'Heading for AI asset draft adoption checklist'
    },
    assetAdoptionReview: {
        id: 'gui.aiLogicCoach.assetAdoptionReview',
        defaultMessage: 'Reviewed',
        description: 'Checklist label for reviewing an AI asset draft'
    },
    assetAdoptionImport: {
        id: 'gui.aiLogicCoach.assetAdoptionImport',
        defaultMessage: 'In editor',
        description: 'Checklist label for importing an AI asset draft'
    },
    assetAdoptionEdits: {
        id: 'gui.aiLogicCoach.assetAdoptionEdits',
        defaultMessage: 'Edits {count}/{required}',
        description: 'Checklist label for required visual edits to an AI asset draft'
    },
    assetAdoptionAdopted: {
        id: 'gui.aiLogicCoach.assetAdoptionAdopted',
        defaultMessage: 'Adopted',
        description: 'Checklist label for adopting an AI asset draft'
    },
    assetReviewButton: {
        id: 'gui.aiLogicCoach.assetReviewButton',
        defaultMessage: 'Review',
        description: 'Button label for marking an AI asset draft reviewed'
    },
    assetImportButton: {
        id: 'gui.aiLogicCoach.assetImportButton',
        defaultMessage: 'Add to editor',
        description: 'Button label for importing an AI asset draft into the costume editor'
    },
    assetRecordEditButton: {
        id: 'gui.aiLogicCoach.assetRecordEditButton',
        defaultMessage: 'Record edit',
        description: 'Button label for recording one visual edit to an AI asset draft'
    },
    assetAdoptButton: {
        id: 'gui.aiLogicCoach.assetAdoptButton',
        defaultMessage: 'Mark adopted',
        description: 'Button label for marking an AI asset draft adopted'
    },
    assetImportedTarget: {
        id: 'gui.aiLogicCoach.assetImportedTarget',
        defaultMessage: 'Target: {target}',
        description: 'Imported asset target label'
    },
    teacherTools: {
        id: 'gui.aiLogicCoach.teacherTools',
        defaultMessage: 'Teacher tools',
        description: 'Heading for teacher draft tools'
    },
    teacherConsentLabel: {
        id: 'gui.aiLogicCoach.teacherConsentLabel',
        defaultMessage: 'I will only send lesson words, not real class or student data.',
        description: 'Consent label for teacher draft tools'
    },
    teacherSession: {
        id: 'gui.aiLogicCoach.teacherSession',
        defaultMessage: 'Teacher account',
        description: 'Heading for teacher account session controls'
    },
    teacherIdLabel: {
        id: 'gui.aiLogicCoach.teacherIdLabel',
        defaultMessage: 'Teacher ID',
        description: 'Label for teacher account id input'
    },
    teacherIdPlaceholder: {
        id: 'gui.aiLogicCoach.teacherIdPlaceholder',
        defaultMessage: 'teacher-a',
        description: 'Placeholder for teacher account id input'
    },
    teacherPasswordLabel: {
        id: 'gui.aiLogicCoach.teacherPasswordLabel',
        defaultMessage: 'Password',
        description: 'Label for teacher account password input'
    },
    teacherPasswordPlaceholder: {
        id: 'gui.aiLogicCoach.teacherPasswordPlaceholder',
        defaultMessage: 'Password',
        description: 'Placeholder for teacher account password input'
    },
    teacherLogin: {
        id: 'gui.aiLogicCoach.teacherLogin',
        defaultMessage: 'Sign in',
        description: 'Button label for starting a teacher account session'
    },
    teacherLoggingIn: {
        id: 'gui.aiLogicCoach.teacherLoggingIn',
        defaultMessage: 'Signing in...',
        description: 'Loading label for teacher account session'
    },
    teacherLoginReady: {
        id: 'gui.aiLogicCoach.teacherLoginReady',
        defaultMessage: 'Signed in as {teacher}.',
        description: 'Ready status for teacher account session'
    },
    teacherLoginBlocked: {
        id: 'gui.aiLogicCoach.teacherLoginBlocked',
        defaultMessage: 'Teacher sign in was stopped.',
        description: 'Blocked status for teacher account session'
    },
    teacherLoginError: {
        id: 'gui.aiLogicCoach.teacherLoginError',
        defaultMessage: 'Teacher sign in did not answer.',
        description: 'Error status for teacher account session'
    },
    teacherAccountSummary: {
        id: 'gui.aiLogicCoach.teacherAccountSummary',
        defaultMessage: 'Account profile',
        description: 'Heading for signed-in teacher account profile'
    },
    teacherAccountTeacherId: {
        id: 'gui.aiLogicCoach.teacherAccountTeacherId',
        defaultMessage: 'ID: {teacherId}',
        description: 'Teacher account id summary label'
    },
    teacherAccountRole: {
        id: 'gui.aiLogicCoach.teacherAccountRole',
        defaultMessage: 'Role: {role}',
        description: 'Teacher account role summary label'
    },
    teacherRoleAdmin: {
        id: 'gui.aiLogicCoach.teacherRoleAdmin',
        defaultMessage: 'admin',
        description: 'Teacher account admin role label'
    },
    teacherRoleTeacher: {
        id: 'gui.aiLogicCoach.teacherRoleTeacher',
        defaultMessage: 'teacher',
        description: 'Teacher account teacher role label'
    },
    teacherAccountClasses: {
        id: 'gui.aiLogicCoach.teacherAccountClasses',
        defaultMessage: 'Classes: {count}',
        description: 'Teacher assigned class count summary label'
    },
    teacherSessionExpiresAt: {
        id: 'gui.aiLogicCoach.teacherSessionExpiresAt',
        defaultMessage: 'Expires: {expiresAt}',
        description: 'Teacher account session expiry summary label'
    },
    teacherAssignedClasses: {
        id: 'gui.aiLogicCoach.teacherAssignedClasses',
        defaultMessage: 'Assigned classes',
        description: 'Label for teacher assigned class list'
    },
    teacherClassActive: {
        id: 'gui.aiLogicCoach.teacherClassActive',
        defaultMessage: 'Active',
        description: 'Badge for active teacher class session'
    },
    teacherSignOut: {
        id: 'gui.aiLogicCoach.teacherSignOut',
        defaultMessage: 'Sign out',
        description: 'Button label for ending a teacher account session'
    },
    teacherAdminAccounts: {
        id: 'gui.aiLogicCoach.teacherAdminAccounts',
        defaultMessage: 'Account admin',
        description: 'Heading for teacher account admin controls'
    },
    teacherAdminRefresh: {
        id: 'gui.aiLogicCoach.teacherAdminRefresh',
        defaultMessage: 'Refresh',
        description: 'Button label for refreshing teacher account list'
    },
    teacherAdminLoading: {
        id: 'gui.aiLogicCoach.teacherAdminLoading',
        defaultMessage: 'Loading...',
        description: 'Loading label for teacher account admin requests'
    },
    teacherAdminReady: {
        id: 'gui.aiLogicCoach.teacherAdminReady',
        defaultMessage: 'Accounts: {count}',
        description: 'Ready status for teacher account admin list'
    },
    teacherAdminBlocked: {
        id: 'gui.aiLogicCoach.teacherAdminBlocked',
        defaultMessage: 'Account admin was stopped.',
        description: 'Blocked status for teacher account admin action'
    },
    teacherAdminError: {
        id: 'gui.aiLogicCoach.teacherAdminError',
        defaultMessage: 'Account admin did not answer.',
        description: 'Error status for teacher account admin action'
    },
    teacherAdminTeacherId: {
        id: 'gui.aiLogicCoach.teacherAdminTeacherId',
        defaultMessage: 'Account ID',
        description: 'Label for managed teacher account id'
    },
    teacherAdminDisplayName: {
        id: 'gui.aiLogicCoach.teacherAdminDisplayName',
        defaultMessage: 'Display name',
        description: 'Label for managed teacher account display name'
    },
    teacherAdminRole: {
        id: 'gui.aiLogicCoach.teacherAdminRole',
        defaultMessage: 'Role',
        description: 'Label for managed teacher account role'
    },
    teacherAdminClasses: {
        id: 'gui.aiLogicCoach.teacherAdminClasses',
        defaultMessage: 'Class sessions',
        description: 'Label for managed teacher account class sessions'
    },
    teacherAdminClassesPlaceholder: {
        id: 'gui.aiLogicCoach.teacherAdminClassesPlaceholder',
        defaultMessage: 'class-a, class-b',
        description: 'Placeholder for managed teacher account class sessions'
    },
    teacherAdminNewPassword: {
        id: 'gui.aiLogicCoach.teacherAdminNewPassword',
        defaultMessage: 'New password',
        description: 'Label for managed teacher account new password'
    },
    teacherAdminCreate: {
        id: 'gui.aiLogicCoach.teacherAdminCreate',
        defaultMessage: 'Create',
        description: 'Button label for creating teacher account'
    },
    teacherAdminUpdate: {
        id: 'gui.aiLogicCoach.teacherAdminUpdate',
        defaultMessage: 'Update',
        description: 'Button label for updating teacher account'
    },
    teacherAdminResetPassword: {
        id: 'gui.aiLogicCoach.teacherAdminResetPassword',
        defaultMessage: 'Reset password',
        description: 'Button label for resetting teacher account password'
    },
    teacherAdminDeactivate: {
        id: 'gui.aiLogicCoach.teacherAdminDeactivate',
        defaultMessage: 'Deactivate',
        description: 'Button label for deactivating teacher account'
    },
    teacherAdminActivate: {
        id: 'gui.aiLogicCoach.teacherAdminActivate',
        defaultMessage: 'Activate',
        description: 'Button label for activating teacher account'
    },
    teacherAdminEdit: {
        id: 'gui.aiLogicCoach.teacherAdminEdit',
        defaultMessage: 'Edit',
        description: 'Button label for editing teacher account'
    },
    teacherAdminActive: {
        id: 'gui.aiLogicCoach.teacherAdminActive',
        defaultMessage: 'active',
        description: 'Teacher account active status'
    },
    teacherAdminInactive: {
        id: 'gui.aiLogicCoach.teacherAdminInactive',
        defaultMessage: 'inactive',
        description: 'Teacher account inactive status'
    },
    teacherClassSessionLabel: {
        id: 'gui.aiLogicCoach.teacherClassSessionLabel',
        defaultMessage: 'Class session',
        description: 'Label for class session selector'
    },
    teacherSaveToClass: {
        id: 'gui.aiLogicCoach.teacherSaveToClass',
        defaultMessage: 'Save to class',
        description: 'Checkbox label for saving teacher knowledge lock to a class session'
    },
    teacherSaveRequiresSession: {
        id: 'gui.aiLogicCoach.teacherSaveRequiresSession',
        defaultMessage: 'Sign in before saving to class.',
        description: 'Inline status for class persistence when no teacher session exists'
    },
    activeKnowledgeLock: {
        id: 'gui.aiLogicCoach.activeKnowledgeLock',
        defaultMessage: 'Class lock',
        description: 'Heading for active class knowledge lock controls'
    },
    activeClassSessionLabel: {
        id: 'gui.aiLogicCoach.activeClassSessionLabel',
        defaultMessage: 'Student class session',
        description: 'Label for loading the active class session knowledge lock'
    },
    activeClassSessionPlaceholder: {
        id: 'gui.aiLogicCoach.activeClassSessionPlaceholder',
        defaultMessage: 'pilot-class',
        description: 'Placeholder for active class session id'
    },
    loadActiveKnowledgeLock: {
        id: 'gui.aiLogicCoach.loadActiveKnowledgeLock',
        defaultMessage: 'Load lock',
        description: 'Button label for loading an active class knowledge lock'
    },
    loadingActiveKnowledgeLock: {
        id: 'gui.aiLogicCoach.loadingActiveKnowledgeLock',
        defaultMessage: 'Loading...',
        description: 'Loading label for active class knowledge lock'
    },
    activeKnowledgeLockReady: {
        id: 'gui.aiLogicCoach.activeKnowledgeLockReady',
        defaultMessage: 'Active: {points}',
        description: 'Ready status for active class knowledge lock'
    },
    activeKnowledgeLockEmpty: {
        id: 'gui.aiLogicCoach.activeKnowledgeLockEmpty',
        defaultMessage: 'No active lock for this class.',
        description: 'Empty status for active class knowledge lock'
    },
    activeKnowledgeLockError: {
        id: 'gui.aiLogicCoach.activeKnowledgeLockError',
        defaultMessage: 'Class lock did not answer.',
        description: 'Error status for active class knowledge lock'
    },
    teacherGradeLabel: {
        id: 'gui.aiLogicCoach.teacherGradeLabel',
        defaultMessage: 'Class level',
        description: 'Label for teacher grade band selector'
    },
    teacherGradeLower: {
        id: 'gui.aiLogicCoach.teacherGradeLower',
        defaultMessage: 'Grades 1-2',
        description: 'Teacher grade band option for lower primary'
    },
    teacherGradeUpper: {
        id: 'gui.aiLogicCoach.teacherGradeUpper',
        defaultMessage: 'Grades 3-6',
        description: 'Teacher grade band option for upper primary'
    },
    teacherGradeMiddle: {
        id: 'gui.aiLogicCoach.teacherGradeMiddle',
        defaultMessage: 'Grades 7-8',
        description: 'Teacher grade band option for middle school'
    },
    knowledgeLock: {
        id: 'gui.aiLogicCoach.knowledgeLock',
        defaultMessage: 'Knowledge lock',
        description: 'Heading for teacher knowledge lock tool'
    },
    lessonTitleLabel: {
        id: 'gui.aiLogicCoach.lessonTitleLabel',
        defaultMessage: 'Lesson name',
        description: 'Label for teacher lesson title'
    },
    lessonTitlePlaceholder: {
        id: 'gui.aiLogicCoach.lessonTitlePlaceholder',
        defaultMessage: 'Example: Addition with variables',
        description: 'Placeholder for teacher lesson title'
    },
    knowledgePointsLabel: {
        id: 'gui.aiLogicCoach.knowledgePointsLabel',
        defaultMessage: 'Choose today\'s points',
        description: 'Label for teacher knowledge point selector'
    },
    saveKnowledgeLockDraft: {
        id: 'gui.aiLogicCoach.saveKnowledgeLockDraft',
        defaultMessage: 'Make lock draft',
        description: 'Button label for creating a knowledge lock draft'
    },
    saveKnowledgeLockToClass: {
        id: 'gui.aiLogicCoach.saveKnowledgeLockToClass',
        defaultMessage: 'Save lock',
        description: 'Button label for saving a knowledge lock to a class session'
    },
    savingKnowledgeLockDraft: {
        id: 'gui.aiLogicCoach.savingKnowledgeLockDraft',
        defaultMessage: 'Making...',
        description: 'Loading label for creating a knowledge lock draft'
    },
    knowledgeLockDraft: {
        id: 'gui.aiLogicCoach.knowledgeLockDraft',
        defaultMessage: 'Lock draft',
        description: 'Heading for knowledge lock draft result'
    },
    noKnowledgeLockDraft: {
        id: 'gui.aiLogicCoach.noKnowledgeLockDraft',
        defaultMessage: 'No lock draft yet.',
        description: 'Empty state for knowledge lock draft'
    },
    lessonPrep: {
        id: 'gui.aiLogicCoach.lessonPrep',
        defaultMessage: 'One-sentence lesson prep',
        description: 'Heading for one-sentence lesson prep'
    },
    lessonGoalLabel: {
        id: 'gui.aiLogicCoach.lessonGoalLabel',
        defaultMessage: 'One sentence',
        description: 'Label for one-sentence lesson prep input'
    },
    lessonGoalPlaceholder: {
        id: 'gui.aiLogicCoach.lessonGoalPlaceholder',
        defaultMessage: 'Example: Make a game that adds two numbers.',
        description: 'Placeholder for one-sentence lesson prep input'
    },
    lessonDurationLabel: {
        id: 'gui.aiLogicCoach.lessonDurationLabel',
        defaultMessage: 'Minutes',
        description: 'Label for lesson duration input'
    },
    makeLessonPrepDraft: {
        id: 'gui.aiLogicCoach.makeLessonPrepDraft',
        defaultMessage: 'Make lesson draft',
        description: 'Button label for lesson prep draft'
    },
    makingLessonPrepDraft: {
        id: 'gui.aiLogicCoach.makingLessonPrepDraft',
        defaultMessage: 'Making...',
        description: 'Loading label for lesson prep draft'
    },
    lessonPrepDraft: {
        id: 'gui.aiLogicCoach.lessonPrepDraft',
        defaultMessage: 'Lesson draft',
        description: 'Heading for lesson prep draft result'
    },
    noLessonPrepDraft: {
        id: 'gui.aiLogicCoach.noLessonPrepDraft',
        defaultMessage: 'No lesson draft yet.',
        description: 'Empty state for lesson prep draft'
    },
    teacherDraftBlocked: {
        id: 'gui.aiLogicCoach.teacherDraftBlocked',
        defaultMessage: 'This teacher draft was stopped. Check consent and remove class or project data.',
        description: 'Blocked teacher draft status'
    },
    teacherDraftError: {
        id: 'gui.aiLogicCoach.teacherDraftError',
        defaultMessage: 'I cannot reach the teacher draft service right now.',
        description: 'Error status for teacher draft service'
    },
    teacherTaskCard: {
        id: 'gui.aiLogicCoach.teacherTaskCard',
        defaultMessage: 'Task card',
        description: 'Teacher lesson prep task card heading'
    },
    teacherExplainGateQuestions: {
        id: 'gui.aiLogicCoach.teacherExplainGateQuestions',
        defaultMessage: 'Explain gate questions',
        description: 'Teacher lesson prep explain gate heading'
    },
    teacherAIWhitelist: {
        id: 'gui.aiLogicCoach.teacherAIWhitelist',
        defaultMessage: 'AI whitelist',
        description: 'Teacher AI whitelist heading'
    },
    teacherRubric: {
        id: 'gui.aiLogicCoach.teacherRubric',
        defaultMessage: 'Rubric',
        description: 'Teacher rubric heading'
    },
    teacherDraftNotSaved: {
        id: 'gui.aiLogicCoach.teacherDraftNotSaved',
        defaultMessage: 'Draft only. Not saved to a class.',
        description: 'Teacher draft no persistence badge'
    },
    teacherDraftSaved: {
        id: 'gui.aiLogicCoach.teacherDraftSaved',
        defaultMessage: 'Saved to class.',
        description: 'Teacher draft saved to class badge'
    },
    releaseDraft: {
        id: 'gui.aiLogicCoach.releaseDraft',
        defaultMessage: 'Release draft',
        description: 'Heading for one-person-company release draft'
    },
    releaseDraftVersion: {
        id: 'gui.aiLogicCoach.releaseDraftVersion',
        defaultMessage: 'Version 1.1',
        description: 'Version label for release draft'
    },
    releaseDraftReady: {
        id: 'gui.aiLogicCoach.releaseDraftReady',
        defaultMessage: 'Ready to test',
        description: 'Ready status for release draft'
    },
    releaseDraftDrafting: {
        id: 'gui.aiLogicCoach.releaseDraftDrafting',
        defaultMessage: 'Still writing',
        description: 'Drafting status for release draft'
    },
    releaseProductLine: {
        id: 'gui.aiLogicCoach.releaseProductLine',
        defaultMessage: 'One-sentence product',
        description: 'Release draft product line field label'
    },
    releaseProductLinePlaceholder: {
        id: 'gui.aiLogicCoach.releaseProductLinePlaceholder',
        defaultMessage: 'Example: This game helps my family remember chores.',
        description: 'Release draft product line placeholder'
    },
    releaseUserFeedback: {
        id: 'gui.aiLogicCoach.releaseUserFeedback',
        defaultMessage: 'User feedback',
        description: 'Release draft user feedback field label'
    },
    releaseUserFeedbackPlaceholder: {
        id: 'gui.aiLogicCoach.releaseUserFeedbackPlaceholder',
        defaultMessage: 'Write one thing a classmate or family member said after trying it.',
        description: 'Release draft user feedback placeholder'
    },
    releaseIterationPlan: {
        id: 'gui.aiLogicCoach.releaseIterationPlan',
        defaultMessage: 'What I will improve in 1.1',
        description: 'Release draft iteration plan field label'
    },
    releaseIterationPlanPlaceholder: {
        id: 'gui.aiLogicCoach.releaseIterationPlanPlaceholder',
        defaultMessage: 'Write one change you will make next.',
        description: 'Release draft iteration plan placeholder'
    },
    releaseSummary: {
        id: 'gui.aiLogicCoach.releaseSummary',
        defaultMessage: '{sprites} sprites / {starts} starts / check {score}/{maxScore}',
        description: 'Release draft local summary'
    },
    releasePreview: {
        id: 'gui.aiLogicCoach.releasePreview',
        defaultMessage: 'Release preview',
        description: 'Heading for the release page preview'
    },
    releasePreviewReady: {
        id: 'gui.aiLogicCoach.releasePreviewReady',
        defaultMessage: 'Ready to show',
        description: 'Ready status in release preview'
    },
    releasePreviewDrafting: {
        id: 'gui.aiLogicCoach.releasePreviewDrafting',
        defaultMessage: 'Finish the draft first',
        description: 'Drafting status in release preview'
    },
    releasePreviewProduct: {
        id: 'gui.aiLogicCoach.releasePreviewProduct',
        defaultMessage: 'What I made',
        description: 'Release preview product line label'
    },
    releasePreviewFeedback: {
        id: 'gui.aiLogicCoach.releasePreviewFeedback',
        defaultMessage: 'What users said',
        description: 'Release preview feedback label'
    },
    releasePreviewNext: {
        id: 'gui.aiLogicCoach.releasePreviewNext',
        defaultMessage: 'Next in 1.1',
        description: 'Release preview iteration label'
    },
    releasePreviewStats: {
        id: 'gui.aiLogicCoach.releasePreviewStats',
        defaultMessage: 'Project snapshot',
        description: 'Release preview metrics heading'
    },
    releasePreviewLogic: {
        id: 'gui.aiLogicCoach.releasePreviewLogic',
        defaultMessage: 'Program paths',
        description: 'Release preview logic paths heading'
    },
    releasePreviewAI: {
        id: 'gui.aiLogicCoach.releasePreviewAI',
        defaultMessage: 'AI help',
        description: 'Release preview AI collaboration heading'
    },
    releasePreviewEmptyProduct: {
        id: 'gui.aiLogicCoach.releasePreviewEmptyProduct',
        defaultMessage: 'Write one sentence about your project.',
        description: 'Empty product line in release preview'
    },
    releasePreviewEmptyFeedback: {
        id: 'gui.aiLogicCoach.releasePreviewEmptyFeedback',
        defaultMessage: 'Ask one person to try it, then write what they said.',
        description: 'Empty user feedback in release preview'
    },
    releasePreviewEmptyNext: {
        id: 'gui.aiLogicCoach.releasePreviewEmptyNext',
        defaultMessage: 'Write one thing you will improve next.',
        description: 'Empty iteration plan in release preview'
    },
    releasePreviewMetricSprites: {
        id: 'gui.aiLogicCoach.releasePreviewMetricSprites',
        defaultMessage: 'sprites',
        description: 'Sprite metric label in release preview'
    },
    releasePreviewMetricStarts: {
        id: 'gui.aiLogicCoach.releasePreviewMetricStarts',
        defaultMessage: 'starts',
        description: 'Start metric label in release preview'
    },
    releasePreviewMetricBlocks: {
        id: 'gui.aiLogicCoach.releasePreviewMetricBlocks',
        defaultMessage: 'blocks',
        description: 'Block metric label in release preview'
    },
    releasePreviewMetricCheck: {
        id: 'gui.aiLogicCoach.releasePreviewMetricCheck',
        defaultMessage: 'check',
        description: 'Check metric label in release preview'
    },
    releasePreviewLogicEmpty: {
        id: 'gui.aiLogicCoach.releasePreviewLogicEmpty',
        defaultMessage: 'Add a starting block to show a program path.',
        description: 'Empty logic path in release preview'
    },
    releasePreviewLogicFlow: {
        id: 'gui.aiLogicCoach.releasePreviewLogicFlow',
        defaultMessage: '{target} script {script}: starts with {entry}, has {blocks} blocks.',
        description: 'Logic flow summary in release preview'
    },
    releasePreviewLogicBroadcasts: {
        id: 'gui.aiLogicCoach.releasePreviewLogicBroadcasts',
        defaultMessage: 'sends {count} messages',
        description: 'Broadcast count in release preview logic flow'
    },
    releasePreviewAISummary: {
        id: 'gui.aiLogicCoach.releasePreviewAISummary',
        defaultMessage: '{questions} questions / {replies} hints / {blocked} safety stops',
        description: 'AI collaboration summary in release preview'
    },
    releaseExportHtml: {
        id: 'gui.aiLogicCoach.releaseExportHtml',
        defaultMessage: 'Make page draft',
        description: 'Button label for exporting a static release preview HTML draft'
    },
    releaseExportStudentReport: {
        id: 'gui.aiLogicCoach.releaseExportStudentReport',
        defaultMessage: 'Make student report',
        description: 'Button label for exporting a static student report HTML draft'
    },
    releaseExportStudentReportPdf: {
        id: 'gui.aiLogicCoach.releaseExportStudentReportPdf',
        defaultMessage: 'Make PDF report',
        description: 'Button label for exporting a minimal student report PDF draft'
    },
    releaseHostPage: {
        id: 'gui.aiLogicCoach.releaseHostPage',
        defaultMessage: 'Host page',
        description: 'Button label for hosting a gated release page preview'
    },
    releaseHostingLoading: {
        id: 'gui.aiLogicCoach.releaseHostingLoading',
        defaultMessage: 'Hosting...',
        description: 'Button label while hosting a release page preview'
    },
    releaseHostingReady: {
        id: 'gui.aiLogicCoach.releaseHostingReady',
        defaultMessage: 'Hosted page: {url}',
        description: 'Status shown when release page hosting succeeds'
    },
    releaseHostingBlocked: {
        id: 'gui.aiLogicCoach.releaseHostingBlocked',
        defaultMessage: 'Hosting is blocked by the release checks.',
        description: 'Status shown when release page hosting is blocked'
    },
    releaseHostingError: {
        id: 'gui.aiLogicCoach.releaseHostingError',
        defaultMessage: 'Page hosting failed.',
        description: 'Status shown when release page hosting fails'
    },
    teacherReviewRequest: {
        id: 'gui.aiLogicCoach.teacherReviewRequest',
        defaultMessage: 'Teacher review',
        description: 'Button label for requesting token-gated teacher review'
    },
    teacherReviewLoading: {
        id: 'gui.aiLogicCoach.teacherReviewLoading',
        defaultMessage: 'Checking...',
        description: 'Button label while requesting teacher review'
    },
    teacherReviewReady: {
        id: 'gui.aiLogicCoach.teacherReviewReady',
        defaultMessage: 'Teacher review saved: {decision}',
        description: 'Status shown when a teacher review is saved'
    },
    teacherReviewLocked: {
        id: 'gui.aiLogicCoach.teacherReviewLocked',
        defaultMessage: 'Teacher review is admin locked.',
        description: 'Status shown when teacher review requires an admin token'
    },
    teacherReviewError: {
        id: 'gui.aiLogicCoach.teacherReviewError',
        defaultMessage: 'Teacher review check failed.',
        description: 'Status shown when teacher review request fails'
    },
    teacherRubricReview: {
        id: 'gui.aiLogicCoach.teacherRubricReview',
        defaultMessage: 'Rubric review',
        description: 'Heading for teacher rubric scoring before review'
    },
    teacherRubricReviewProgress: {
        id: 'gui.aiLogicCoach.teacherRubricReviewProgress',
        defaultMessage: '{scored}/{total} scored',
        description: 'Progress label for teacher rubric scoring'
    },
    teacherRubricReviewDecision: {
        id: 'gui.aiLogicCoach.teacherRubricReviewDecision',
        defaultMessage: 'Decision',
        description: 'Label for teacher review decision select'
    },
    teacherRubricReviewApproved: {
        id: 'gui.aiLogicCoach.teacherRubricReviewApproved',
        defaultMessage: 'Approved',
        description: 'Approved teacher review decision option'
    },
    teacherRubricReviewNeedsRevision: {
        id: 'gui.aiLogicCoach.teacherRubricReviewNeedsRevision',
        defaultMessage: 'Needs revision',
        description: 'Needs revision teacher review decision option'
    },
    teacherRubricReviewNotes: {
        id: 'gui.aiLogicCoach.teacherRubricReviewNotes',
        defaultMessage: 'Review notes',
        description: 'Label for teacher review notes'
    },
    teacherRubricReviewScore: {
        id: 'gui.aiLogicCoach.teacherRubricReviewScore',
        defaultMessage: 'Score',
        description: 'Label for a rubric score select'
    },
    teacherRubricReviewUnscored: {
        id: 'gui.aiLogicCoach.teacherRubricReviewUnscored',
        defaultMessage: 'Choose',
        description: 'Empty rubric score option'
    },
    teacherRubricReviewEvidence: {
        id: 'gui.aiLogicCoach.teacherRubricReviewEvidence',
        defaultMessage: 'Evidence',
        description: 'Label for teacher rubric evidence'
    },
    studentReportBlocked: {
        id: 'gui.aiLogicCoach.studentReportBlocked',
        defaultMessage: 'Needs revision',
        description: 'Status label for a student report that is not release-ready'
    },
    studentReportAssetEmpty: {
        id: 'gui.aiLogicCoach.studentReportAssetEmpty',
        defaultMessage: 'No AI asset draft was used.',
        description: 'Student report text when no AI asset draft exists'
    },
    studentReportAssetSummary: {
        id: 'gui.aiLogicCoach.studentReportAssetSummary',
        defaultMessage: 'Imported: {imported}. Edits: {edits}. Adopted: {adopted}.',
        description: 'Student report asset adoption summary'
    },
    studentReportSafeguards: {
        id: 'gui.aiLogicCoach.studentReportSafeguards',
        defaultMessage: 'Safeguards',
        description: 'Student report safeguards heading'
    },
    studentReportTeacherPolicy: {
        id: 'gui.aiLogicCoach.studentReportTeacherPolicy',
        defaultMessage: 'Teacher lock',
        description: 'Student report teacher knowledge lock heading'
    },
    studentReportTeacherPolicyEmpty: {
        id: 'gui.aiLogicCoach.studentReportTeacherPolicyEmpty',
        defaultMessage: 'No teacher knowledge lock was attached.',
        description: 'Student report text when no teacher knowledge lock is active'
    },
    studentReportTeacherQuestion: {
        id: 'gui.aiLogicCoach.studentReportTeacherQuestion',
        defaultMessage: 'Questions',
        description: 'Student report teacher question heading'
    },
    studentReportTeacherRubric: {
        id: 'gui.aiLogicCoach.studentReportTeacherRubric',
        defaultMessage: 'Rubric',
        description: 'Student report teacher rubric heading'
    },
    releaseGateReady: {
        id: 'gui.aiLogicCoach.releaseGateReady',
        defaultMessage: 'Release checks passed.',
        description: 'Status shown when the release gate is ready'
    },
    releaseGateBlocked: {
        id: 'gui.aiLogicCoach.releaseGateBlocked',
        defaultMessage: 'Finish the release checks before exporting or saving audit.',
        description: 'Status shown when the release gate blocks release actions'
    },
    releaseGateItemPublishing: {
        id: 'gui.aiLogicCoach.releaseGateItem.publishing',
        defaultMessage: 'Publishing is enabled',
        description: 'Release gate checklist item for publishing feature flag'
    },
    releaseGateItemExplainGate: {
        id: 'gui.aiLogicCoach.releaseGateItem.explainGate',
        defaultMessage: 'Say it first is checked',
        description: 'Release gate checklist item for explain gate review'
    },
    releaseGateItemReleaseDraft: {
        id: 'gui.aiLogicCoach.releaseGateItem.releaseDraft',
        defaultMessage: 'Release draft is ready',
        description: 'Release gate checklist item for release draft readiness'
    },
    releaseGateItemAssetAdoption: {
        id: 'gui.aiLogicCoach.releaseGateItem.assetAdoption',
        defaultMessage: 'AI asset is edited and adopted',
        description: 'Release gate checklist item for AI asset adoption'
    },
    releaseAuditSave: {
        id: 'gui.aiLogicCoach.releaseAuditSave',
        defaultMessage: 'Save audit',
        description: 'Button label for saving the release audit'
    },
    releaseAuditSaving: {
        id: 'gui.aiLogicCoach.releaseAuditSaving',
        defaultMessage: 'Saving...',
        description: 'Button label while saving the release audit'
    },
    releaseAuditSaved: {
        id: 'gui.aiLogicCoach.releaseAuditSaved',
        defaultMessage: 'Audit saved: {auditId}',
        description: 'Status shown when release audit persistence succeeds'
    },
    releaseAuditDraft: {
        id: 'gui.aiLogicCoach.releaseAuditDraft',
        defaultMessage: 'Audit draft ready. Storage is not configured yet.',
        description: 'Status shown when the release audit route is reachable but not persistent'
    },
    releaseAuditBlocked: {
        id: 'gui.aiLogicCoach.releaseAuditBlocked',
        defaultMessage: 'Audit blocked. Send only the release summary.',
        description: 'Status shown when release audit safety gate blocks the request'
    },
    releaseAuditError: {
        id: 'gui.aiLogicCoach.releaseAuditError',
        defaultMessage: 'Audit save failed.',
        description: 'Status shown when release audit persistence fails'
    },
    releaseAuditPolicy: {
        id: 'gui.aiLogicCoach.releaseAuditPolicy',
        defaultMessage: 'Audit policy',
        description: 'Button label for checking release audit lifecycle policy'
    },
    releaseAuditPolicyLoading: {
        id: 'gui.aiLogicCoach.releaseAuditPolicyLoading',
        defaultMessage: 'Checking...',
        description: 'Button label while checking release audit lifecycle policy'
    },
    releaseAuditPolicyReady: {
        id: 'gui.aiLogicCoach.releaseAuditPolicyReady',
        defaultMessage: 'Policy: {records} records / {days} days',
        description: 'Status shown for release audit lifecycle policy'
    },
    releaseAuditAdminOperations: {
        id: 'gui.aiLogicCoach.releaseAuditAdminOperations',
        defaultMessage: 'Admin actions: {records}',
        description: 'Status shown for release audit admin operation records'
    },
    releaseAuditPolicyLocked: {
        id: 'gui.aiLogicCoach.releaseAuditPolicyLocked',
        defaultMessage: 'Export and backup are admin locked.',
        description: 'Status shown for release audit admin governance'
    },
    releaseAuditPolicyError: {
        id: 'gui.aiLogicCoach.releaseAuditPolicyError',
        defaultMessage: 'Policy check failed.',
        description: 'Status shown when release audit lifecycle request fails'
    },
    releaseAdminSummary: {
        id: 'gui.aiLogicCoach.releaseAdminSummary',
        defaultMessage: 'Admin summary',
        description: 'Button label for checking the read-only release admin summary'
    },
    releaseAdminSummaryLoading: {
        id: 'gui.aiLogicCoach.releaseAdminSummaryLoading',
        defaultMessage: 'Checking...',
        description: 'Button label while checking the release admin summary'
    },
    releaseAdminSummaryReady: {
        id: 'gui.aiLogicCoach.releaseAdminSummaryReady',
        defaultMessage: 'Admin: {auditRecords} audits / {hostedPages} pages / {teacherReviews} reviews',
        description: 'Status shown for the read-only release admin summary'
    },
    releaseAdminSummaryOperations: {
        id: 'gui.aiLogicCoach.releaseAdminSummaryOperations',
        defaultMessage: 'Admin actions: {adminOperations}',
        description: 'Status shown for admin operation summary records'
    },
    releaseAdminSummaryGovernance: {
        id: 'gui.aiLogicCoach.releaseAdminSummaryGovernance',
        defaultMessage: 'Dry-run deletion only. Paths and identities are redacted.',
        description: 'Status shown for release admin governance safeguards'
    },
    releaseAdminSummaryError: {
        id: 'gui.aiLogicCoach.releaseAdminSummaryError',
        defaultMessage: 'Admin summary check failed.',
        description: 'Status shown when release admin summary request fails'
    },
    releaseResearchDataset: {
        id: 'gui.aiLogicCoach.releaseResearchDataset',
        defaultMessage: 'Research data',
        description: 'Button label for checking anonymous research dataset status'
    },
    releaseResearchDatasetLoading: {
        id: 'gui.aiLogicCoach.releaseResearchDatasetLoading',
        defaultMessage: 'Checking...',
        description: 'Button label while checking anonymous research dataset status'
    },
    releaseResearchDatasetReady: {
        id: 'gui.aiLogicCoach.releaseResearchDatasetReady',
        defaultMessage: 'Research: {rows} anonymous rows / {fields} fields',
        description: 'Status shown for anonymous research dataset readiness'
    },
    releaseResearchDatasetLocked: {
        id: 'gui.aiLogicCoach.releaseResearchDatasetLocked',
        defaultMessage: 'CSV and JSON export are admin locked.',
        description: 'Status shown for anonymous research dataset export governance'
    },
    releaseResearchDatasetError: {
        id: 'gui.aiLogicCoach.releaseResearchDatasetError',
        defaultMessage: 'Research data check failed.',
        description: 'Status shown when anonymous research dataset request fails'
    },
    releaseApprovalQueue: {
        id: 'gui.aiLogicCoach.releaseApprovalQueue',
        defaultMessage: 'Review queue',
        description: 'Button label for checking the release approval queue'
    },
    releaseApprovalQueueLoading: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueLoading',
        defaultMessage: 'Loading...',
        description: 'Button label while checking the release approval queue'
    },
    releaseApprovalQueueReady: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueReady',
        defaultMessage: '{pending} pending / {needsRevision} revision / {approved} approved',
        description: 'Summary for the release approval queue'
    },
    releaseApprovalQueueEmpty: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueEmpty',
        defaultMessage: 'No hosted releases yet.',
        description: 'Empty state for the release approval queue'
    },
    releaseApprovalQueueError: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueError',
        defaultMessage: 'Review queue failed.',
        description: 'Status shown when release approval queue request fails'
    },
    releaseApprovalQueueOpen: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueOpen',
        defaultMessage: 'Open',
        description: 'Link label for opening a hosted release from the queue'
    },
    releaseApprovalQueueSearchLabel: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueSearchLabel',
        defaultMessage: 'Search',
        description: 'Search label for the approval queue'
    },
    releaseApprovalQueueSearchPlaceholder: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueSearchPlaceholder',
        defaultMessage: 'Title or release id',
        description: 'Search placeholder for the approval queue'
    },
    releaseApprovalQueueStatusFilter: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueStatusFilter',
        defaultMessage: 'Status',
        description: 'Status filter label for the approval queue'
    },
    releaseApprovalQueueStatusAll: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueStatusAll',
        defaultMessage: 'All',
        description: 'All statuses filter label for the approval queue'
    },
    releaseApprovalQueueFiltered: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueFiltered',
        defaultMessage: '{shown} shown / {queued} total',
        description: 'Filtered approval queue count'
    },
    releaseApprovalQueueScore: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueScore',
        defaultMessage: 'Score',
        description: 'Button label for selecting a release queue item for scoring'
    },
    releaseApprovalQueueSelected: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueSelected',
        defaultMessage: 'Selected: {releaseId}',
        description: 'Selected approval queue target summary'
    },
    releaseApprovalQueueCurrentTarget: {
        id: 'gui.aiLogicCoach.releaseApprovalQueueCurrentTarget',
        defaultMessage: 'Current hosted release',
        description: 'Badge for the selected approval queue item matching current hosted release'
    },
    releaseApprovalStatusApproved: {
        id: 'gui.aiLogicCoach.releaseApprovalStatusApproved',
        defaultMessage: 'Approved',
        description: 'Approved release status label in the approval queue'
    },
    releaseApprovalStatusNeedsRevision: {
        id: 'gui.aiLogicCoach.releaseApprovalStatusNeedsRevision',
        defaultMessage: 'Needs revision',
        description: 'Needs revision release status label in the approval queue'
    },
    releaseApprovalStatusPending: {
        id: 'gui.aiLogicCoach.releaseApprovalStatusPending',
        defaultMessage: 'Pending',
        description: 'Pending release status label in the approval queue'
    },
    q18Tools: {
        id: 'gui.aiLogicCoach.q18Tools',
        defaultMessage: 'Build starters',
        description: 'Heading for Q18 voice, one-line project, and addition template tools'
    },
    q18GateLocked: {
        id: 'gui.aiLogicCoach.q18GateLocked',
        defaultMessage: 'Check Say it first before making starters.',
        description: 'Q18 generation gate locked message'
    },
    q18Voice: {
        id: 'gui.aiLogicCoach.q18Voice',
        defaultMessage: 'Voice idea',
        description: 'Heading for Q18 voice draft tool'
    },
    q18VoiceTextLabel: {
        id: 'gui.aiLogicCoach.q18VoiceTextLabel',
        defaultMessage: 'Line',
        description: 'Label for Q18 voice text input'
    },
    q18VoicePlaceholder: {
        id: 'gui.aiLogicCoach.q18VoicePlaceholder',
        defaultMessage: 'Example: Welcome to my calculator.',
        description: 'Placeholder for Q18 voice text'
    },
    q18CreateVoice: {
        id: 'gui.aiLogicCoach.q18CreateVoice',
        defaultMessage: 'Make voice card',
        description: 'Button label for Q18 voice draft'
    },
    q18VoiceResult: {
        id: 'gui.aiLogicCoach.q18VoiceResult',
        defaultMessage: 'Voice card: {characters} characters / {actions} actions',
        description: 'Q18 voice result summary'
    },
    q18VoiceFallback: {
        id: 'gui.aiLogicCoach.q18VoiceFallback',
        defaultMessage: 'Use Scratch say or sound library.',
        description: 'Q18 voice fallback text'
    },
    q18OneLine: {
        id: 'gui.aiLogicCoach.q18OneLine',
        defaultMessage: 'One-line project',
        description: 'Heading for Q18 one-line project skeleton tool'
    },
    q18OneLineLabel: {
        id: 'gui.aiLogicCoach.q18OneLineLabel',
        defaultMessage: 'Project idea',
        description: 'Label for Q18 one-line project input'
    },
    q18OneLinePlaceholder: {
        id: 'gui.aiLogicCoach.q18OneLinePlaceholder',
        defaultMessage: 'Example: A helper that asks two numbers and shows the sum.',
        description: 'Placeholder for Q18 one-line project input'
    },
    q18CreateSkeleton: {
        id: 'gui.aiLogicCoach.q18CreateSkeleton',
        defaultMessage: 'Make skeleton',
        description: 'Button label for Q18 one-line project skeleton'
    },
    q18SkeletonResult: {
        id: 'gui.aiLogicCoach.q18SkeletonResult',
        defaultMessage: 'Skeleton: {targets} targets / {variables} variables / {steps} steps',
        description: 'Q18 skeleton result summary'
    },
    q18SkeletonProof: {
        id: 'gui.aiLogicCoach.q18SkeletonProof',
        defaultMessage: 'Blocks empty: {empty}. Scripts generated: {scripts}.',
        description: 'Q18 skeleton proof summary'
    },
    q18Addition: {
        id: 'gui.aiLogicCoach.q18Addition',
        defaultMessage: 'Addition template',
        description: 'Heading for Q18 addition template tool'
    },
    q18AdditionLabel: {
        id: 'gui.aiLogicCoach.q18AdditionLabel',
        defaultMessage: 'Math goal',
        description: 'Label for Q18 addition template input'
    },
    q18AdditionPlaceholder: {
        id: 'gui.aiLogicCoach.q18AdditionPlaceholder',
        defaultMessage: 'Example: Add two numbers and show the result.',
        description: 'Placeholder for Q18 addition template input'
    },
    q18CreateAddition: {
        id: 'gui.aiLogicCoach.q18CreateAddition',
        defaultMessage: 'Make addition card',
        description: 'Button label for Q18 addition template'
    },
    q18AdditionResult: {
        id: 'gui.aiLogicCoach.q18AdditionResult',
        defaultMessage: 'Template: {variables} variables / {questions} questions',
        description: 'Q18 addition template result summary'
    },
    q18AdditionProof: {
        id: 'gui.aiLogicCoach.q18AdditionProof',
        defaultMessage: 'Complete answer script: {script}.',
        description: 'Q18 addition template proof summary'
    },
    q18EmptyResult: {
        id: 'gui.aiLogicCoach.q18EmptyResult',
        defaultMessage: 'No starter yet.',
        description: 'Empty Q18 tool result'
    },
    q18Safety: {
        id: 'gui.aiLogicCoach.q18Safety',
        defaultMessage: 'Preview only. No workspace insertion or complete script.',
        description: 'Q18 safety boundary'
    },
    q18BoolYes: {
        id: 'gui.aiLogicCoach.q18BoolYes',
        defaultMessage: 'yes',
        description: 'Boolean yes in Q18 proof'
    },
    q18BoolNo: {
        id: 'gui.aiLogicCoach.q18BoolNo',
        defaultMessage: 'no',
        description: 'Boolean no in Q18 proof'
    },
    logModelReplyPathSelected: {
        id: 'gui.aiLogicCoach.logModelReplyPathSelected',
        defaultMessage: 'You looked at {path}.',
        description: 'Process log entry for selecting a model reply path alias'
    },
    logScriptExplanationCreated: {
        id: 'gui.aiLogicCoach.logScriptExplanationCreated',
        defaultMessage: 'You explained script {script}.',
        description: 'Process log entry for creating a local script explanation'
    },
    logBlockDraftCreated: {
        id: 'gui.aiLogicCoach.logBlockDraftCreated',
        defaultMessage: 'You made a block draft with {steps} steps.',
        description: 'Process log entry for creating a natural language to blocks draft'
    },
    logAssetJobSent: {
        id: 'gui.aiLogicCoach.logAssetJobSent',
        defaultMessage: 'Your asset draft request was sent.',
        description: 'Process log entry for sending an AI asset mock request'
    },
    logAssetJobReceived: {
        id: 'gui.aiLogicCoach.logAssetJobReceived',
        defaultMessage: 'A mock asset draft came back.',
        description: 'Process log entry for receiving an AI asset mock response'
    },
    logAssetJobBlocked: {
        id: 'gui.aiLogicCoach.logAssetJobBlocked',
        defaultMessage: 'The safety check stopped this asset draft.',
        description: 'Process log entry for a blocked AI asset mock request'
    },
    logAssetJobCanceled: {
        id: 'gui.aiLogicCoach.logAssetJobCanceled',
        defaultMessage: 'You canceled the asset draft request.',
        description: 'Process log entry for a canceled AI asset mock request'
    },
    logAssetJobTimeout: {
        id: 'gui.aiLogicCoach.logAssetJobTimeout',
        defaultMessage: 'The asset draft request timed out.',
        description: 'Process log entry for a timed-out AI asset mock request'
    },
    logAssetJobFailed: {
        id: 'gui.aiLogicCoach.logAssetJobFailed',
        defaultMessage: 'The asset draft did not answer.',
        description: 'Process log entry for a failed AI asset mock request'
    },
    logAssetDraftReviewed: {
        id: 'gui.aiLogicCoach.logAssetDraftReviewed',
        defaultMessage: 'You reviewed the asset draft.',
        description: 'Process log entry for reviewing an AI asset draft'
    },
    logAssetImportedToCostumeEditor: {
        id: 'gui.aiLogicCoach.logAssetImportedToCostumeEditor',
        defaultMessage: 'The asset draft was added to {target}.',
        description: 'Process log entry for importing an AI asset draft'
    },
    logAssetImportFailed: {
        id: 'gui.aiLogicCoach.logAssetImportFailed',
        defaultMessage: 'The asset draft could not be added.',
        description: 'Process log entry for a failed AI asset import'
    },
    logAssetVisualEditRecorded: {
        id: 'gui.aiLogicCoach.logAssetVisualEditRecorded',
        defaultMessage: 'You recorded asset edit {edits}.',
        description: 'Process log entry for recording an AI asset visual edit'
    },
    logAssetDraftAdopted: {
        id: 'gui.aiLogicCoach.logAssetDraftAdopted',
        defaultMessage: 'You marked the edited asset as adopted.',
        description: 'Process log entry for adopting an AI asset draft'
    },
    logTeacherSessionSent: {
        id: 'gui.aiLogicCoach.logTeacherSessionSent',
        defaultMessage: 'Teacher sign in was sent.',
        description: 'Process log entry for sending teacher session request'
    },
    logTeacherSessionReceived: {
        id: 'gui.aiLogicCoach.logTeacherSessionReceived',
        defaultMessage: 'Teacher sign in came back.',
        description: 'Process log entry for receiving teacher session request'
    },
    logTeacherSessionBlocked: {
        id: 'gui.aiLogicCoach.logTeacherSessionBlocked',
        defaultMessage: 'Teacher sign in was stopped.',
        description: 'Process log entry for blocked teacher session request'
    },
    logTeacherSessionFailed: {
        id: 'gui.aiLogicCoach.logTeacherSessionFailed',
        defaultMessage: 'Teacher sign in did not answer.',
        description: 'Process log entry for failed teacher session request'
    },
    logTeacherSessionSignedOut: {
        id: 'gui.aiLogicCoach.logTeacherSessionSignedOut',
        defaultMessage: 'Teacher account signed out.',
        description: 'Process log entry for ending teacher account session'
    },
    logTeacherAccountAdminSent: {
        id: 'gui.aiLogicCoach.logTeacherAccountAdminSent',
        defaultMessage: 'Teacher account admin was sent.',
        description: 'Process log entry for sending teacher account admin request'
    },
    logTeacherAccountAdminReceived: {
        id: 'gui.aiLogicCoach.logTeacherAccountAdminReceived',
        defaultMessage: 'Teacher account admin came back.',
        description: 'Process log entry for receiving teacher account admin request'
    },
    logTeacherAccountAdminBlocked: {
        id: 'gui.aiLogicCoach.logTeacherAccountAdminBlocked',
        defaultMessage: 'Teacher account admin was stopped.',
        description: 'Process log entry for blocked teacher account admin request'
    },
    logTeacherAccountAdminFailed: {
        id: 'gui.aiLogicCoach.logTeacherAccountAdminFailed',
        defaultMessage: 'Teacher account admin did not answer.',
        description: 'Process log entry for failed teacher account admin request'
    },
    logActiveTeacherLockSent: {
        id: 'gui.aiLogicCoach.logActiveTeacherLockSent',
        defaultMessage: 'Class knowledge lock was requested.',
        description: 'Process log entry for requesting active class knowledge lock'
    },
    logActiveTeacherLockReceived: {
        id: 'gui.aiLogicCoach.logActiveTeacherLockReceived',
        defaultMessage: 'Class knowledge lock is active.',
        description: 'Process log entry for active class knowledge lock'
    },
    logActiveTeacherLockEmpty: {
        id: 'gui.aiLogicCoach.logActiveTeacherLockEmpty',
        defaultMessage: 'No class knowledge lock is active.',
        description: 'Process log entry for missing active class knowledge lock'
    },
    logActiveTeacherLockFailed: {
        id: 'gui.aiLogicCoach.logActiveTeacherLockFailed',
        defaultMessage: 'Class knowledge lock did not answer.',
        description: 'Process log entry for failed active class knowledge lock request'
    },
    logTeacherLockSent: {
        id: 'gui.aiLogicCoach.logTeacherLockSent',
        defaultMessage: 'Knowledge lock draft was sent.',
        description: 'Process log entry for sending teacher knowledge lock draft'
    },
    logTeacherLockReceived: {
        id: 'gui.aiLogicCoach.logTeacherLockReceived',
        defaultMessage: 'Knowledge lock draft came back.',
        description: 'Process log entry for receiving teacher knowledge lock draft'
    },
    logTeacherLockBlocked: {
        id: 'gui.aiLogicCoach.logTeacherLockBlocked',
        defaultMessage: 'Knowledge lock draft was stopped.',
        description: 'Process log entry for blocked teacher knowledge lock draft'
    },
    logTeacherLockFailed: {
        id: 'gui.aiLogicCoach.logTeacherLockFailed',
        defaultMessage: 'Knowledge lock draft did not answer.',
        description: 'Process log entry for failed teacher knowledge lock draft'
    },
    logLessonPrepSent: {
        id: 'gui.aiLogicCoach.logLessonPrepSent',
        defaultMessage: 'Lesson prep draft was sent.',
        description: 'Process log entry for sending teacher lesson prep draft'
    },
    logLessonPrepReceived: {
        id: 'gui.aiLogicCoach.logLessonPrepReceived',
        defaultMessage: 'Lesson prep draft came back.',
        description: 'Process log entry for receiving teacher lesson prep draft'
    },
    logLessonPrepBlocked: {
        id: 'gui.aiLogicCoach.logLessonPrepBlocked',
        defaultMessage: 'Lesson prep draft was stopped.',
        description: 'Process log entry for blocked teacher lesson prep draft'
    },
    logLessonPrepFailed: {
        id: 'gui.aiLogicCoach.logLessonPrepFailed',
        defaultMessage: 'Lesson prep draft did not answer.',
        description: 'Process log entry for failed teacher lesson prep draft'
    },
    logReleaseDraftFieldCompleted: {
        id: 'gui.aiLogicCoach.logReleaseDraftFieldCompleted',
        defaultMessage: 'You filled in {field}.',
        description: 'Process log entry for completing one release draft field'
    },
    logReleaseDraftFieldCleared: {
        id: 'gui.aiLogicCoach.logReleaseDraftFieldCleared',
        defaultMessage: 'You cleared {field}.',
        description: 'Process log entry for clearing one release draft field'
    },
    logReleaseDraftReady: {
        id: 'gui.aiLogicCoach.logReleaseDraftReady',
        defaultMessage: 'Your version 1.1 draft is ready for a test.',
        description: 'Process log entry for a ready release draft'
    },
    logReleaseHtmlExported: {
        id: 'gui.aiLogicCoach.logReleaseHtmlExported',
        defaultMessage: 'You made a page draft.',
        description: 'Process log entry for exporting a release HTML draft'
    },
    logStudentReportExported: {
        id: 'gui.aiLogicCoach.logStudentReportExported',
        defaultMessage: 'You made a student report draft.',
        description: 'Process log entry for exporting a student report HTML draft'
    },
    logStudentReportPdfExported: {
        id: 'gui.aiLogicCoach.logStudentReportPdfExported',
        defaultMessage: 'You made a PDF report draft.',
        description: 'Process log entry for exporting a student report PDF draft'
    },
    logReleaseHostingSent: {
        id: 'gui.aiLogicCoach.logReleaseHostingSent',
        defaultMessage: 'Release page hosting was sent.',
        description: 'Process log entry for sending hosted release page request'
    },
    logReleaseHostingReceived: {
        id: 'gui.aiLogicCoach.logReleaseHostingReceived',
        defaultMessage: 'Release page was hosted.',
        description: 'Process log entry for hosted release page success'
    },
    logReleaseHostingBlocked: {
        id: 'gui.aiLogicCoach.logReleaseHostingBlocked',
        defaultMessage: 'Release page hosting was stopped.',
        description: 'Process log entry for blocked hosted release page request'
    },
    logReleaseHostingFailed: {
        id: 'gui.aiLogicCoach.logReleaseHostingFailed',
        defaultMessage: 'Release page hosting did not save.',
        description: 'Process log entry for failed hosted release page request'
    },
    logTeacherReviewSent: {
        id: 'gui.aiLogicCoach.logTeacherReviewSent',
        defaultMessage: 'Teacher review was checked.',
        description: 'Process log entry for sending teacher review request'
    },
    logTeacherReviewReceived: {
        id: 'gui.aiLogicCoach.logTeacherReviewReceived',
        defaultMessage: 'Teacher review was saved.',
        description: 'Process log entry for saved teacher review'
    },
    logTeacherReviewBlocked: {
        id: 'gui.aiLogicCoach.logTeacherReviewBlocked',
        defaultMessage: 'Teacher review is locked.',
        description: 'Process log entry for token-gated teacher review'
    },
    logTeacherReviewFailed: {
        id: 'gui.aiLogicCoach.logTeacherReviewFailed',
        defaultMessage: 'Teacher review did not answer.',
        description: 'Process log entry for failed teacher review'
    },
    logReleaseAuditSent: {
        id: 'gui.aiLogicCoach.logReleaseAuditSent',
        defaultMessage: 'Release audit was sent.',
        description: 'Process log entry for sending the release audit'
    },
    logReleaseAuditReceived: {
        id: 'gui.aiLogicCoach.logReleaseAuditReceived',
        defaultMessage: 'Release audit was saved.',
        description: 'Process log entry for saving the release audit'
    },
    logReleaseAuditBlocked: {
        id: 'gui.aiLogicCoach.logReleaseAuditBlocked',
        defaultMessage: 'Release audit was stopped.',
        description: 'Process log entry for a blocked release audit'
    },
    logReleaseAuditFailed: {
        id: 'gui.aiLogicCoach.logReleaseAuditFailed',
        defaultMessage: 'Release audit did not save.',
        description: 'Process log entry for a failed release audit'
    },
    logReleaseAuditPolicySent: {
        id: 'gui.aiLogicCoach.logReleaseAuditPolicySent',
        defaultMessage: 'Audit policy was checked.',
        description: 'Process log entry for checking release audit policy'
    },
    logReleaseAuditPolicyReceived: {
        id: 'gui.aiLogicCoach.logReleaseAuditPolicyReceived',
        defaultMessage: 'Audit policy came back.',
        description: 'Process log entry for receiving release audit policy'
    },
    logReleaseAuditPolicyFailed: {
        id: 'gui.aiLogicCoach.logReleaseAuditPolicyFailed',
        defaultMessage: 'Audit policy did not answer.',
        description: 'Process log entry for failed release audit policy'
    },
    logReleaseResearchDatasetSent: {
        id: 'gui.aiLogicCoach.logReleaseResearchDatasetSent',
        defaultMessage: 'Research data was checked.',
        description: 'Process log entry for checking anonymous research dataset status'
    },
    logReleaseResearchDatasetReceived: {
        id: 'gui.aiLogicCoach.logReleaseResearchDatasetReceived',
        defaultMessage: 'Research data came back.',
        description: 'Process log entry for receiving anonymous research dataset status'
    },
    logReleaseResearchDatasetFailed: {
        id: 'gui.aiLogicCoach.logReleaseResearchDatasetFailed',
        defaultMessage: 'Research data did not answer.',
        description: 'Process log entry for failed anonymous research dataset status'
    },
    logReleaseApprovalQueueTargetSelected: {
        id: 'gui.aiLogicCoach.logReleaseApprovalQueueTargetSelected',
        defaultMessage: 'Review target selected: {releaseId}.',
        description: 'Process log entry for selecting an approval queue review target'
    },
    logQ18VoiceDraftCreated: {
        id: 'gui.aiLogicCoach.logQ18VoiceDraftCreated',
        defaultMessage: 'You made a voice starter.',
        description: 'Process log entry for Q18 voice draft'
    },
    logQ18ProjectSkeletonCreated: {
        id: 'gui.aiLogicCoach.logQ18ProjectSkeletonCreated',
        defaultMessage: 'You made a project skeleton with {targets} empty targets.',
        description: 'Process log entry for Q18 one-line project skeleton'
    },
    logQ18AdditionTemplateCreated: {
        id: 'gui.aiLogicCoach.logQ18AdditionTemplateCreated',
        defaultMessage: 'You made an addition template with {variables} variables.',
        description: 'Process log entry for Q18 addition template'
    },
    logExtensionPanelOpened: {
        id: 'gui.aiLogicCoach.logExtensionPanelOpened',
        defaultMessage: 'AI extension opened the thinking helper.',
        description: 'Process log entry when the AI extension command opens the coach panel'
    },
    logExtensionExplanationRecorded: {
        id: 'gui.aiLogicCoach.logExtensionExplanationRecorded',
        defaultMessage: 'AI extension recorded {field}.',
        description: 'Process log entry when the AI extension command records student explanation text'
    },
    logExtensionQ18Action: {
        id: 'gui.aiLogicCoach.logExtensionQ18Action',
        defaultMessage: 'AI extension opened {tool}.',
        description: 'Process log entry when a Q18 extension command opens a starter tool'
    }
});

const QUESTION_MESSAGE_BY_RULE_ID = Object.freeze({
    'gate.goal.missing': messages.questionGoalMissing,
    'gate.logic.missing': messages.questionLogicMissing,
    'gate.evidence.missing': messages.questionEvidenceMissing,
    'logic.flows.missing': messages.questionNoLogicFlows,
    'logic.flow.explain': messages.questionFlowExplain,
    'logic.broadcast.unmatchedSend': messages.questionUnmatchedBroadcastSend,
    'logic.broadcast.unmatchedReceive': messages.questionUnmatchedBroadcastReceive,
    'logic.broadcast.trace': messages.questionTraceBroadcast,
    'logic.flow.output': messages.questionScriptOutput,
    'gate.evidence.detail': messages.questionEvidenceDetail,
    'gate.ready.check': messages.questionReadyCheck,
    'gate.reviewed.transfer': messages.questionReviewedTransfer
});

const CHECKLIST_MESSAGE_BY_ID = Object.freeze({
    'gate.goal': messages.checkGoal,
    'gate.logic': messages.checkLogic,
    'gate.evidence': messages.checkEvidence,
    'logic.eventEntry': messages.checkEventEntry,
    'logic.broadcastClosure': messages.checkBroadcastClosure
});

const CHECKLIST_DETAIL_MESSAGE_BY_ID_AND_STATUS = Object.freeze({
    'gate.goal': {
        [EVIDENCE_CHECK_STATUSES.PASS]: messages.checkGoalPass,
        [EVIDENCE_CHECK_STATUSES.PARTIAL]: messages.checkGoalPartial,
        [EVIDENCE_CHECK_STATUSES.MISSING]: messages.checkGoalMissing
    },
    'gate.logic': {
        [EVIDENCE_CHECK_STATUSES.PASS]: messages.checkLogicPass,
        [EVIDENCE_CHECK_STATUSES.PARTIAL]: messages.checkLogicPartial,
        [EVIDENCE_CHECK_STATUSES.MISSING]: messages.checkLogicMissing
    },
    'gate.evidence': {
        [EVIDENCE_CHECK_STATUSES.PASS]: messages.checkEvidencePass,
        [EVIDENCE_CHECK_STATUSES.PARTIAL]: messages.checkEvidencePartial,
        [EVIDENCE_CHECK_STATUSES.MISSING]: messages.checkEvidenceMissing
    },
    'logic.eventEntry': {
        [EVIDENCE_CHECK_STATUSES.PASS]: messages.checkEventEntryPass,
        [EVIDENCE_CHECK_STATUSES.MISSING]: messages.checkEventEntryMissing
    },
    'logic.broadcastClosure': {
        [EVIDENCE_CHECK_STATUSES.PASS]: messages.checkBroadcastClosurePass,
        [EVIDENCE_CHECK_STATUSES.MISSING]: messages.checkBroadcastClosureMissing
    }
});

const SAFETY_FEEDBACK_MESSAGE_BY_TYPE = Object.freeze({
    [SAFETY_FEEDBACK_TYPES.MISSING_CONSENT]: messages.modelBlockedMissingConsent,
    [SAFETY_FEEDBACK_TYPES.TOO_MUCH_PROJECT]: messages.modelBlockedTooMuchProject,
    [SAFETY_FEEDBACK_TYPES.PRIVATE_INFO]: messages.modelBlockedPrivateInfo,
    [SAFETY_FEEDBACK_TYPES.UNKNOWN]: messages.modelBlockedUnknown
});

const BLOCK_DRAFT_CONCEPT_MESSAGE_BY_ID = Object.freeze({
    'gui.aiLogicCoach.blockDraftConcept.event': messages.blockDraftConceptEvent,
    'gui.aiLogicCoach.blockDraftConcept.sequence': messages.blockDraftConceptSequence,
    'gui.aiLogicCoach.blockDraftConcept.input': messages.blockDraftConceptInput,
    'gui.aiLogicCoach.blockDraftConcept.condition': messages.blockDraftConceptCondition,
    'gui.aiLogicCoach.blockDraftConcept.loop': messages.blockDraftConceptLoop,
    'gui.aiLogicCoach.blockDraftConcept.variable': messages.blockDraftConceptVariable,
    'gui.aiLogicCoach.blockDraftConcept.broadcast': messages.blockDraftConceptBroadcast,
    'gui.aiLogicCoach.blockDraftConcept.output': messages.blockDraftConceptOutput
});

const BLOCK_DRAFT_STEP_MESSAGE_BY_ID = Object.freeze({
    'gui.aiLogicCoach.blockDraftStep.event': messages.blockDraftStepEvent,
    'gui.aiLogicCoach.blockDraftStep.sequence': messages.blockDraftStepSequence,
    'gui.aiLogicCoach.blockDraftStep.input': messages.blockDraftStepInput,
    'gui.aiLogicCoach.blockDraftStep.condition': messages.blockDraftStepCondition,
    'gui.aiLogicCoach.blockDraftStep.loop': messages.blockDraftStepLoop,
    'gui.aiLogicCoach.blockDraftStep.variable': messages.blockDraftStepVariable,
    'gui.aiLogicCoach.blockDraftStep.broadcast': messages.blockDraftStepBroadcast,
    'gui.aiLogicCoach.blockDraftStep.output': messages.blockDraftStepOutput
});

const PROJECT_PLAN_ITEM_MESSAGE_BY_ID = Object.freeze({
    'gui.aiLogicCoach.projectPlanItem.goal': messages.projectPlanItemGoal,
    'gui.aiLogicCoach.projectPlanItem.logic': messages.projectPlanItemLogic,
    'gui.aiLogicCoach.projectPlanItem.evidence': messages.projectPlanItemEvidence,
    'gui.aiLogicCoach.projectPlanItem.review': messages.projectPlanItemReview,
    'gui.aiLogicCoach.projectPlanItem.script': messages.projectPlanItemScript,
    'gui.aiLogicCoach.projectPlanItem.concepts': messages.projectPlanItemConcepts
});

const createEmptyGateDraft = () => ({
    goal: '',
    logic: '',
    evidence: ''
});

const EXPLAIN_GATE_PATH_IDS = Object.freeze({
    goal: createExplainGatePath('goal').pathId,
    logic: createExplainGatePath('logic').pathId,
    evidence: createExplainGatePath('evidence').pathId
});

const LOGIC_EVENT_ENTRY_PATH_ID = createLogicGraphPath(LOGIC_GRAPH_PATH_KINDS.EVENT_ENTRY).pathId;

const mergeClassNames = classNames => classNames.filter(Boolean).join(' ');

const getSummaryLogic = projectSummary => projectSummary.logic || {
    flows: [],
    broadcastLinks: []
};

const createProjectSummarySignature = projectSummary => {
    const logic = getSummaryLogic(projectSummary);
    const flowSignature = logic.flows.map(flow => (
        `${flow.id}:${flow.blockCount}:${flow.broadcastSends.map(message => (
            `${message.name}:${message.count}`
        )).join(',')}`
    )).join('|');

    return [
        projectSummary.targets.total,
        projectSummary.targets.sprites,
        projectSummary.blocks.visible,
        projectSummary.blocks.scripts,
        projectSummary.events.hats,
        projectSummary.broadcasts.sends,
        projectSummary.broadcasts.receives,
        flowSignature
    ].join(';');
};

const createSummaryLogValues = projectSummary => ({
    sprites: projectSummary.targets.sprites,
    blocks: projectSummary.blocks.visible,
    events: projectSummary.events.hats,
    broadcasts: projectSummary.broadcasts.messages.length
});

const isTextComplete = value => typeof value === 'string' && value.trim().length > 0;

const normalizeExtensionExplanationField = field => {
    const normalized = typeof field === 'string' ? field.trim().toLowerCase() : '';
    return AI_LOGIC_COACH_EXTENSION_FIELDS.has(normalized) ? normalized : 'goal';
};

const normalizeExtensionExplanationText = text => {
    if (typeof text !== 'string') return '';
    return text.trim().slice(0, AI_LOGIC_COACH_EXTENSION_TEXT_LIMIT);
};

const downloadFile = ({
    content,
    filename,
    type
}) => {
    const blob = new Blob([content], {
        type
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const downloadHtmlFile = ({
    content,
    filename
}) => downloadFile({
    content,
    filename,
    type: 'text/html;charset=utf-8'
});

const broadcastSendShape = PropTypes.shape({
    count: PropTypes.number,
    name: PropTypes.string
});

const scriptReferenceShape = PropTypes.shape({
    blockCount: PropTypes.number,
    count: PropTypes.number,
    id: PropTypes.string,
    scriptIndex: PropTypes.number,
    targetName: PropTypes.string,
    triggerDetail: PropTypes.string,
    triggerLabel: PropTypes.string
});

const processLogValuesShape = PropTypes.shape({
    blocks: PropTypes.number,
    broadcasts: PropTypes.number,
    concepts: PropTypes.number,
    events: PropTypes.number,
    field: PropTypes.string,
    model: PropTypes.string,
    path: PropTypes.string,
    provider: PropTypes.string,
    script: PropTypes.number,
    sprites: PropTypes.number,
    steps: PropTypes.number,
    targets: PropTypes.number,
    tool: PropTypes.string,
    variables: PropTypes.number
});

const aiLogicPathShape = PropTypes.shape({
    entry: PropTypes.string,
    field: PropTypes.string,
    flowId: PropTypes.string,
    kind: PropTypes.string,
    message: PropTypes.string,
    pathId: PropTypes.string,
    targetName: PropTypes.string,
    type: PropTypes.string
});

const socraticQuestionValuesShape = PropTypes.objectOf(PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.string
]));

const socraticQuestionShape = PropTypes.shape({
    category: PropTypes.string,
    defaultMessage: PropTypes.string,
    id: PropTypes.string,
    messageId: PropTypes.string,
    path: aiLogicPathShape,
    ruleId: PropTypes.string,
    text: PropTypes.string,
    values: socraticQuestionValuesShape
});

const evidenceChecklistItemShape = PropTypes.shape({
    defaultMessage: PropTypes.string,
    id: PropTypes.string,
    messageId: PropTypes.string,
    path: aiLogicPathShape,
    score: PropTypes.number,
    status: PropTypes.string,
    values: PropTypes.objectOf(PropTypes.oneOfType([
        PropTypes.number,
        PropTypes.string
    ]))
});

const evidenceChecklistShape = PropTypes.shape({
    items: PropTypes.arrayOf(evidenceChecklistItemShape),
    maxScore: PropTypes.number,
    missingCount: PropTypes.number,
    partialCount: PropTypes.number,
    passedCount: PropTypes.number,
    score: PropTypes.number
});

const modelReplyShape = PropTypes.shape({
    blocked: PropTypes.bool,
    model: PropTypes.string,
    modelEnabled: PropTypes.bool,
    provider: PropTypes.string,
    safetyGate: PropTypes.shape({
        allowed: PropTypes.bool,
        blockedReasons: PropTypes.arrayOf(PropTypes.string),
        redactionApplied: PropTypes.bool
    }),
    text: PropTypes.string
});

const assetJobReplyShape = PropTypes.shape({
    blocked: PropTypes.bool,
    proxied: PropTypes.bool,
    safetyGate: PropTypes.shape({
        allowed: PropTypes.bool,
        blockedReasons: PropTypes.arrayOf(PropTypes.string),
        redactionApplied: PropTypes.bool
    }),
    text: PropTypes.string,
    worker: PropTypes.shape({
        job: PropTypes.shape({
            id: PropTypes.string,
            mode: PropTypes.string,
            promptLength: PropTypes.number,
            result: PropTypes.shape({
                asset: PropTypes.shape({
                    aiGenerated: PropTypes.bool,
                    dataUri: PropTypes.string,
                    format: PropTypes.string,
                    height: PropTypes.number,
                    mimeType: PropTypes.string,
                    transparentBackground: PropTypes.shape({
                        originalReason: PropTypes.string,
                        passed: PropTypes.bool,
                        repairAttempted: PropTypes.bool,
                        repaired: PropTypes.bool,
                        repairMethod: PropTypes.string,
                        repairSucceeded: PropTypes.bool,
                        required: PropTypes.bool,
                        serverValidated: PropTypes.bool
                    }),
                    width: PropTypes.number
                }),
                message: PropTypes.string,
                placeholder: PropTypes.shape({
                    format: PropTypes.string,
                    height: PropTypes.number,
                    width: PropTypes.number
                }),
                transparentBackground: PropTypes.shape({
                    originalReason: PropTypes.string,
                    passed: PropTypes.bool,
                    repairAttempted: PropTypes.bool,
                    repairMethod: PropTypes.string,
                    repairSucceeded: PropTypes.bool,
                    required: PropTypes.bool,
                    serverValidated: PropTypes.bool
                })
            }),
            review: PropTypes.shape({
                required: PropTypes.bool,
                status: PropTypes.string
            }),
            audit: PropTypes.shape({
                providerId: PropTypes.string,
                reviewState: PropTypes.string
            }),
            status: PropTypes.string,
            type: PropTypes.string
        })
    })
});

const q18ToolShape = PropTypes.shape({
    actions: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        label: PropTypes.string
    })),
    proof: PropTypes.shape({
        allTargetBlocksEmpty: PropTypes.bool,
        completeAnswerScript: PropTypes.bool,
        completeScriptGenerated: PropTypes.bool,
        executableBlocksGenerated: PropTypes.bool,
        executableScriptsGenerated: PropTypes.bool,
        opcodes: PropTypes.arrayOf(PropTypes.string),
        targetCount: PropTypes.number,
        targetsWithBlocks: PropTypes.number,
        variablesOnly: PropTypes.bool
    }),
    safeguards: PropTypes.shape({
        completeScriptGenerated: PropTypes.bool,
        externalNetwork: PropTypes.bool,
        modelCalled: PropTypes.bool,
        previewOnly: PropTypes.bool,
        projectMutated: PropTypes.bool,
        reason: PropTypes.string,
        scratchProjectMutated: PropTypes.bool,
        soundAssetGenerated: PropTypes.bool,
        studentAudioUploaded: PropTypes.bool
    }),
    schemaVersion: PropTypes.string,
    skeleton: PropTypes.shape({
        broadcasts: PropTypes.arrayOf(PropTypes.string),
        comments: PropTypes.arrayOf(PropTypes.string),
        stage: PropTypes.string,
        targets: PropTypes.arrayOf(PropTypes.shape({
            blocks: PropTypes.objectOf(PropTypes.shape({})),
            isStage: PropTypes.bool,
            name: PropTypes.string,
            role: PropTypes.string
        })),
        title: PropTypes.string,
        variables: PropTypes.arrayOf(PropTypes.string)
    }),
    status: PropTypes.string,
    steps: PropTypes.arrayOf(PropTypes.string),
    template: PropTypes.shape({
        comments: PropTypes.arrayOf(PropTypes.string),
        explainQuestions: PropTypes.arrayOf(PropTypes.string),
        operation: PropTypes.string,
        variables: PropTypes.arrayOf(PropTypes.shape({
            id: PropTypes.string,
            label: PropTypes.string
        }))
    }),
    toolId: PropTypes.string,
    values: PropTypes.objectOf(PropTypes.oneOfType([
        PropTypes.bool,
        PropTypes.number,
        PropTypes.string
    ]))
});

const assetAdoptionSummaryShape = PropTypes.shape({
    adopted: PropTypes.bool,
    canAdopt: PropTypes.bool,
    canImport: PropTypes.bool,
    canRecordVisualEdit: PropTypes.bool,
    canReview: PropTypes.bool,
    hasAsset: PropTypes.bool,
    imported: PropTypes.bool,
    importTarget: PropTypes.string,
    requiredVisualEdits: PropTypes.number,
    reviewed: PropTypes.bool,
    status: PropTypes.string,
    visualEditCount: PropTypes.number,
    visualEditsComplete: PropTypes.bool
});

const knowledgePointShape = PropTypes.shape({
    id: PropTypes.string,
    label: PropTypes.string
});

const knowledgeLockReplyShape = PropTypes.shape({
    active: PropTypes.bool,
    blocked: PropTypes.bool,
    classSession: PropTypes.shape({
        active: PropTypes.bool,
        id: PropTypes.string
    }),
    knowledgeLock: PropTypes.shape({
        aiWhitelist: PropTypes.arrayOf(PropTypes.shape({
            id: PropTypes.string,
            label: PropTypes.string
        })),
        classroomPhrase: PropTypes.string,
        persisted: PropTypes.bool,
        promptContract: PropTypes.arrayOf(PropTypes.string),
        questionRules: PropTypes.arrayOf(PropTypes.shape({
            knowledgePointId: PropTypes.string,
            text: PropTypes.string
        })),
        rubricFocus: PropTypes.arrayOf(PropTypes.shape({
            focus: PropTypes.string,
            label: PropTypes.string
        })),
        selectedKnowledgePoints: PropTypes.arrayOf(knowledgePointShape)
    }),
    persisted: PropTypes.bool,
    safetyGate: PropTypes.shape({
        allowed: PropTypes.bool,
        blockedReasons: PropTypes.arrayOf(PropTypes.string)
    })
});

const teacherSessionReplyShape = PropTypes.shape({
    blocked: PropTypes.bool,
    teacherSessionToken: PropTypes.string,
    teacher: PropTypes.shape({
        classSessionIds: PropTypes.arrayOf(PropTypes.string),
        displayName: PropTypes.string,
        role: PropTypes.string,
        teacherId: PropTypes.string
    }),
    session: PropTypes.shape({
        expiresAt: PropTypes.string,
        ttlSeconds: PropTypes.number
    }),
    safetyGate: PropTypes.shape({
        allowed: PropTypes.bool,
        blockedReasons: PropTypes.arrayOf(PropTypes.string)
    })
});

const teacherAccountAdminReplyShape = PropTypes.shape({
    action: PropTypes.string,
    accounts: PropTypes.arrayOf(PropTypes.shape({
        active: PropTypes.bool,
        classSessionIds: PropTypes.arrayOf(PropTypes.string),
        displayName: PropTypes.string,
        role: PropTypes.string,
        teacherId: PropTypes.string,
        updatedAt: PropTypes.string
    })),
    blocked: PropTypes.bool,
    reason: PropTypes.string,
    schemaVersion: PropTypes.string,
    targetTeacherId: PropTypes.string,
    totals: PropTypes.shape({
        accounts: PropTypes.number,
        activeAccounts: PropTypes.number,
        admins: PropTypes.number,
        classSessions: PropTypes.number
    })
});

const lessonPrepReplyShape = PropTypes.shape({
    blocked: PropTypes.bool,
    lessonPrep: PropTypes.shape({
        aiWhitelist: PropTypes.shape({
            allowedHelp: PropTypes.arrayOf(PropTypes.string),
            disallowedHelp: PropTypes.arrayOf(PropTypes.string)
        }),
        explainGateQuestions: PropTypes.arrayOf(PropTypes.string),
        lockedKnowledgePoints: PropTypes.arrayOf(knowledgePointShape),
        persistence: PropTypes.shape({
            persisted: PropTypes.bool
        }),
        recommendedKnowledgePoints: PropTypes.arrayOf(knowledgePointShape),
        rubric: PropTypes.arrayOf(PropTypes.shape({
            criteria: PropTypes.string,
            label: PropTypes.string
        })),
        taskCard: PropTypes.shape({
            deliverable: PropTypes.string,
            steps: PropTypes.arrayOf(PropTypes.string),
            studentGoal: PropTypes.string
        }),
        title: PropTypes.string
    }),
    persisted: PropTypes.bool,
    safetyGate: PropTypes.shape({
        allowed: PropTypes.bool,
        blockedReasons: PropTypes.arrayOf(PropTypes.string)
    })
});

const modelReplyPathAliasShape = PropTypes.shape({
    aliasPathId: PropTypes.string,
    entry: PropTypes.string,
    pathId: PropTypes.string,
    scriptIndex: PropTypes.number,
    targetName: PropTypes.string
});

const scriptExplanationShape = PropTypes.shape({
    broadcastNames: PropTypes.arrayOf(PropTypes.string),
    hasBroadcasts: PropTypes.bool,
    path: aiLogicPathShape,
    status: PropTypes.string,
    values: PropTypes.objectOf(PropTypes.oneOfType([
        PropTypes.number,
        PropTypes.string
    ]))
});

const blockDraftConceptShape = PropTypes.shape({
    id: PropTypes.string,
    messageId: PropTypes.string
});

const blockDraftStepShape = PropTypes.shape({
    concept: PropTypes.string,
    id: PropTypes.string,
    messageId: PropTypes.string,
    values: PropTypes.objectOf(PropTypes.oneOfType([
        PropTypes.number,
        PropTypes.string
    ]))
});

const blockDraftShape = PropTypes.shape({
    blocklyOutline: PropTypes.string,
    concepts: PropTypes.arrayOf(blockDraftConceptShape),
    jsonPlan: PropTypes.string,
    status: PropTypes.string,
    steps: PropTypes.arrayOf(blockDraftStepShape),
    values: PropTypes.objectOf(PropTypes.oneOfType([
        PropTypes.number,
        PropTypes.string
    ]))
});

const scriptDraftShape = PropTypes.shape({
    concepts: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        label: PropTypes.string
    })),
    insertSummary: PropTypes.shape({
        blocksCreated: PropTypes.number,
        scriptsCreated: PropTypes.number
    }),
    inserted: PropTypes.bool,
    reviewQuestions: PropTypes.arrayOf(PropTypes.string),
    schemaVersion: PropTypes.string,
    scripts: PropTypes.arrayOf(PropTypes.shape({
        blocks: PropTypes.arrayOf(PropTypes.shape({
            opcode: PropTypes.string,
            ref: PropTypes.string
        })),
        ref: PropTypes.string
    })),
    status: PropTypes.string,
    teacherPolicyWarnings: PropTypes.arrayOf(PropTypes.shape({
        concept: PropTypes.string,
        message: PropTypes.string
    }))
});

const projectPlanItemShape = PropTypes.shape({
    id: PropTypes.string,
    messageId: PropTypes.string,
    status: PropTypes.string,
    values: PropTypes.objectOf(PropTypes.oneOfType([
        PropTypes.number,
        PropTypes.string
    ]))
});

const projectPlanScriptChoiceShape = PropTypes.shape({
    blockCount: PropTypes.number,
    broadcastCount: PropTypes.number,
    entry: PropTypes.string,
    id: PropTypes.string,
    path: aiLogicPathShape,
    script: PropTypes.number,
    target: PropTypes.string,
    values: PropTypes.objectOf(PropTypes.oneOfType([
        PropTypes.number,
        PropTypes.string
    ]))
});

const projectPlanConceptChoiceShape = PropTypes.shape({
    id: PropTypes.string,
    messageId: PropTypes.string,
    stepMessageId: PropTypes.string,
    stepValues: PropTypes.objectOf(PropTypes.oneOfType([
        PropTypes.number,
        PropTypes.string
    ]))
});

const projectPlanMessageLinkShape = PropTypes.shape({
    id: PropTypes.string,
    message: PropTypes.string,
    path: aiLogicPathShape,
    receives: PropTypes.number,
    sends: PropTypes.number,
    status: PropTypes.string,
    values: PropTypes.objectOf(PropTypes.oneOfType([
        PropTypes.number,
        PropTypes.string
    ]))
});

const projectPlanShape = PropTypes.shape({
    conceptChoices: PropTypes.arrayOf(projectPlanConceptChoiceShape),
    items: PropTypes.arrayOf(projectPlanItemShape),
    messageLinks: PropTypes.arrayOf(projectPlanMessageLinkShape),
    scriptChoices: PropTypes.arrayOf(projectPlanScriptChoiceShape),
    status: PropTypes.string,
    values: PropTypes.objectOf(PropTypes.oneOfType([
        PropTypes.number,
        PropTypes.string
    ]))
});

const releaseDraftShape = PropTypes.shape({
    iterationPlan: PropTypes.string,
    productLine: PropTypes.string,
    userFeedback: PropTypes.string
});

const releaseDraftSummaryShape = PropTypes.shape({
    checkMaxScore: PropTypes.number,
    checkScore: PropTypes.number,
    spriteCount: PropTypes.number,
    startCount: PropTypes.number,
    status: PropTypes.string,
    version: PropTypes.string
});

const releasePreviewShape = PropTypes.shape({
    aiSummary: PropTypes.shape({
        blocked: PropTypes.number,
        questions: PropTypes.number,
        replies: PropTypes.number
    }),
    iterationPlan: PropTypes.string,
    logicFlows: PropTypes.arrayOf(PropTypes.shape({
        blockCount: PropTypes.number,
        broadcastCount: PropTypes.number,
        id: PropTypes.string,
        scriptIndex: PropTypes.number,
        targetName: PropTypes.string,
        triggerLabel: PropTypes.string
    })),
    metrics: PropTypes.shape({
        blocks: PropTypes.number,
        checkMaxScore: PropTypes.number,
        checkScore: PropTypes.number,
        sprites: PropTypes.number,
        starts: PropTypes.number
    }),
    productLine: PropTypes.string,
    status: PropTypes.string,
    userFeedback: PropTypes.string,
    version: PropTypes.string
});

const releaseGateShape = PropTypes.shape({
    allowed: PropTypes.bool,
    checklist: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        ready: PropTypes.bool,
        reason: PropTypes.string
    })),
    reasons: PropTypes.arrayOf(PropTypes.string),
    schemaVersion: PropTypes.string
});

const releaseAuditReplyShape = PropTypes.shape({
    auditId: PropTypes.string,
    blocked: PropTypes.bool,
    persisted: PropTypes.bool,
    pureSb3: PropTypes.shape({
        aiLogWrittenToSb3: PropTypes.bool,
        metaAiWrittenToSb3: PropTypes.bool,
        scratchProjectMutated: PropTypes.bool
    }),
    safetyGate: PropTypes.shape({
        allowed: PropTypes.bool,
        blockedReasons: PropTypes.arrayOf(PropTypes.string)
    }),
    schemaVersion: PropTypes.string
});

const hostedReleaseShape = PropTypes.shape({
    blocked: PropTypes.bool,
    hostedPath: PropTypes.string,
    hostedReleaseId: PropTypes.string,
    persisted: PropTypes.bool,
    publicUrl: PropTypes.string,
    schemaVersion: PropTypes.string,
    teacherReview: PropTypes.shape({
        required: PropTypes.bool,
        route: PropTypes.string,
        status: PropTypes.string,
        tokenRequired: PropTypes.bool
    })
});

const teacherReviewShape = PropTypes.shape({
    blocked: PropTypes.bool,
    decision: PropTypes.string,
    persisted: PropTypes.bool,
    rubricReview: PropTypes.shape({
        summary: PropTypes.shape({
            maxScore: PropTypes.number,
            possibleCount: PropTypes.number,
            scoreTotal: PropTypes.number,
            scoredCount: PropTypes.number,
            status: PropTypes.string
        })
    }),
    reason: PropTypes.string,
    reviewId: PropTypes.string,
    schemaVersion: PropTypes.string
});

const teacherRubricReviewShape = PropTypes.shape({
    items: PropTypes.arrayOf(PropTypes.shape({
        criteria: PropTypes.string,
        evidence: PropTypes.string,
        id: PropTypes.string,
        knowledgePointId: PropTypes.string,
        label: PropTypes.string,
        level: PropTypes.string,
        levels: PropTypes.arrayOf(PropTypes.string)
    })),
    schemaVersion: PropTypes.string,
    source: PropTypes.string,
    title: PropTypes.string
});

const releaseAuditLifecycleShape = PropTypes.shape({
    adminOperations: PropTypes.shape({
        auditFile: PropTypes.shape({
            bytes: PropTypes.number,
            exists: PropTypes.bool,
            records: PropTypes.number
        }),
        file: PropTypes.string,
        pathRedacted: PropTypes.bool,
        schemaVersion: PropTypes.string
    }),
    auditFile: PropTypes.shape({
        bytes: PropTypes.number,
        exists: PropTypes.bool,
        records: PropTypes.number
    }),
    configured: PropTypes.bool,
    governance: PropTypes.shape({
        adminActionsConfigured: PropTypes.bool,
        backupRequiresAdminToken: PropTypes.bool,
        deletionRequiresAdminToken: PropTypes.bool,
        exportRequiresAdminToken: PropTypes.bool
    }),
    retention: PropTypes.shape({
        actualDeletionSupported: PropTypes.bool,
        days: PropTypes.number
    }),
    schemaVersion: PropTypes.string
});

const releaseAdminSummaryShape = PropTypes.shape({
    authorization: PropTypes.shape({
        classRosterIncluded: PropTypes.bool,
        classSessionScoped: PropTypes.bool,
        studentIdentityIncluded: PropTypes.bool
    }),
    deletion: PropTypes.shape({
        actualDeletionSupported: PropTypes.bool,
        mode: PropTypes.string,
        requiresAdminTokenForApply: PropTypes.bool
    }),
    governance: PropTypes.shape({
        readOnlyAdminSummary: PropTypes.bool,
        valuesRedacted: PropTypes.bool,
        rawProjectIncluded: PropTypes.bool,
        studentIdentityIncluded: PropTypes.bool
    }),
    schemaVersion: PropTypes.string,
    totals: PropTypes.shape({
        adminOperations: PropTypes.number,
        auditRecords: PropTypes.number,
        hostedPages: PropTypes.number,
        teacherReviews: PropTypes.number
    })
});

const releaseResearchDatasetShape = PropTypes.shape({
    dataset: PropTypes.shape({
        anonymousRows: PropTypes.number,
        fields: PropTypes.arrayOf(PropTypes.string),
        formats: PropTypes.arrayOf(PropTypes.string)
    }),
    governance: PropTypes.shape({
        adminActionsConfigured: PropTypes.bool,
        exportRequiresAdminToken: PropTypes.bool
    }),
    safeguards: PropTypes.shape({
        freeTextIncluded: PropTypes.bool,
        rawProjectIncluded: PropTypes.bool,
        studentIdentityIncluded: PropTypes.bool
    }),
    schemaVersion: PropTypes.string,
    summary: PropTypes.shape({
        readyRows: PropTypes.number,
        totalRows: PropTypes.number
    })
});

const releaseApprovalQueueShape = PropTypes.shape({
    items: PropTypes.arrayOf(PropTypes.shape({
        createdAt: PropTypes.string,
        hostedReleaseId: PropTypes.string,
        metrics: PropTypes.shape({
            checkMaxScore: PropTypes.number,
            checkScore: PropTypes.number
        }),
        publicUrl: PropTypes.string,
        release: PropTypes.shape({
            title: PropTypes.string,
            version: PropTypes.string
        }),
        teacherReview: PropTypes.shape({
            status: PropTypes.string
        })
    })),
    schemaVersion: PropTypes.string,
    totals: PropTypes.shape({
        approved: PropTypes.number,
        needsRevision: PropTypes.number,
        pending: PropTypes.number,
        queued: PropTypes.number
    })
});

const SummaryMetric = ({label, value}) => (
    <div className={styles.metric}>
        <div className={styles.metricValue}>{value}</div>
        <div className={styles.metricLabel}>{label}</div>
    </div>
);

SummaryMetric.propTypes = {
    label: PropTypes.node,
    value: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
};

const GateStatusBadge = ({state}) => {
    let className = styles.lockedBadge;
    let statusMessage = (
        <FormattedMessage
            id="gui.aiLogicCoach.gateEmpty"
            defaultMessage="Not started"
            description="Empty state for the explain gate"
        />
    );

    if (state === EXPLAIN_GATE_STATES.DRAFTING) {
        className = styles.draftingBadge;
        statusMessage = (
            <FormattedMessage
                id="gui.aiLogicCoach.gateDrafting"
                defaultMessage="Writing"
                description="Drafting state for the explain gate"
            />
        );
    } else if (state === EXPLAIN_GATE_STATES.READY) {
        className = styles.readyBadge;
        statusMessage = (
            <FormattedMessage
                id="gui.aiLogicCoach.gateReady"
                defaultMessage="Ready to check"
                description="Ready state for the explain gate"
            />
        );
    } else if (state === EXPLAIN_GATE_STATES.REVIEWED) {
        className = styles.reviewedBadge;
        statusMessage = (
            <FormattedMessage
                id="gui.aiLogicCoach.gateReviewed"
                defaultMessage="Checked"
                description="Reviewed state for the explain gate"
            />
        );
    }

    return (
        <span
            className={className}
            data-testid="ai-logic-coach-gate-status"
        >
            {statusMessage}
        </span>
    );
};

GateStatusBadge.propTypes = {
    state: PropTypes.string.isRequired
};

const SocraticQuestionCategoryBadge = ({category}) => {
    if (category === SOCRATIC_QUESTION_CATEGORIES.CHECK) {
        return (
            <span className={styles.questionCategory}>
                <FormattedMessage
                    id="gui.aiLogicCoach.questionCategoryCheck"
                    defaultMessage="Check"
                    description="Category label for local Socratic check questions"
                />
            </span>
        );
    }
    if (category === SOCRATIC_QUESTION_CATEGORIES.EVIDENCE) {
        return (
            <span className={styles.questionCategory}>
                <FormattedMessage
                    id="gui.aiLogicCoach.questionCategoryEvidence"
                    defaultMessage="Try"
                    description="Category label for local Socratic evidence questions"
                />
            </span>
        );
    }
    return (
        <span className={styles.questionCategory}>
            <FormattedMessage
                id="gui.aiLogicCoach.questionCategoryExplain"
                defaultMessage="Tell"
                description="Category label for local Socratic explanation questions"
            />
        </span>
    );
};

SocraticQuestionCategoryBadge.propTypes = {
    category: PropTypes.string
};

const SocraticQuestionText = ({question}) => {
    const intl = useIntl();
    if (question && question.text) return question.text;
    const message = QUESTION_MESSAGE_BY_RULE_ID[question.ruleId] || messages.questionGoalMissing;
    return intl.formatMessage(message, question.values);
};

SocraticQuestionText.propTypes = {
    question: socraticQuestionShape
};

const LogicPathText = ({path}) => {
    if (!path) return null;

    if (path.type === AI_LOGIC_PATH_TYPES.EXPLAIN_GATE) {
        if (path.field === 'logic') return <FormattedMessage {...messages.pathExplainGateLogic} />;
        if (path.field === 'evidence') return <FormattedMessage {...messages.pathExplainGateEvidence} />;
        return <FormattedMessage {...messages.pathExplainGateGoal} />;
    }

    if (path.type === AI_LOGIC_PATH_TYPES.LOGIC_FLOW) {
        return (
            <FormattedMessage
                {...messages.pathLogicFlow}
                values={{
                    target: path.targetName,
                    entry: path.entry
                }}
            />
        );
    }

    if (path.type === AI_LOGIC_PATH_TYPES.BROADCAST_LINK) {
        return (
            <FormattedMessage
                {...messages.pathBroadcastLink}
                values={{
                    message: path.message
                }}
            />
        );
    }

    if (path.type === AI_LOGIC_PATH_TYPES.REVIEW_BRIDGE) {
        return <FormattedMessage {...messages.pathReviewBridge} />;
    }

    if (path.kind === LOGIC_GRAPH_PATH_KINDS.BROADCAST_CLOSURE) {
        return <FormattedMessage {...messages.pathLogicBroadcastClosure} />;
    }

    return <FormattedMessage {...messages.pathLogicEventEntry} />;
};

LogicPathText.propTypes = {
    path: aiLogicPathShape
};

const handlePathKeyDown = (event, pathId, onPathSelect) => {
    if (!pathId || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onPathSelect(pathId);
};

const LogicCoachQuestion = ({
    activePathId,
    onPathSelect,
    question
}) => {
    const pathId = question.path && question.path.pathId;
    const hasPath = Boolean(pathId);
    const isActive = hasPath && pathId === activePathId;
    const handleClick = useCallback(() => {
        onPathSelect(pathId);
    }, [onPathSelect, pathId]);
    const handleKeyDown = useCallback(event => {
        handlePathKeyDown(event, pathId, onPathSelect);
    }, [onPathSelect, pathId]);

    return (
        <li
            aria-pressed={isActive}
            className={mergeClassNames([
                styles.questionItem,
                pathId ? styles.pathSelectable : null,
                isActive ? styles.pathActive : null
            ])}
            data-active-path={isActive ? true : null}
            data-path-id={pathId || null}
            role={hasPath ? 'button' : null}
            tabIndex={hasPath ? 0 : null}
            onClick={hasPath ? handleClick : null}
            onKeyDown={hasPath ? handleKeyDown : null}
        >
            <div className={styles.questionHeader}>
                <SocraticQuestionCategoryBadge category={question.category} />
                {isActive ? (
                    <span className={styles.selectedPathBadge}>
                        <FormattedMessage {...messages.selectedPathLabel} />
                    </span>
                ) : null}
            </div>
            <span className={styles.questionText}>
                <SocraticQuestionText question={question} />
            </span>
            {question.path ? (
                <span className={styles.questionPath}>
                    <LogicPathText path={question.path} />
                </span>
            ) : null}
        </li>
    );
};

LogicCoachQuestion.propTypes = {
    activePathId: PropTypes.string,
    onPathSelect: PropTypes.func.isRequired,
    question: socraticQuestionShape
};

const EvidenceStatusBadge = ({status}) => {
    let message = messages.evidenceStatusMissing;
    let className = styles.evidenceStatusMissing;

    if (status === EVIDENCE_CHECK_STATUSES.PASS) {
        message = messages.evidenceStatusPass;
        className = styles.evidenceStatusPass;
    } else if (status === EVIDENCE_CHECK_STATUSES.PARTIAL) {
        message = messages.evidenceStatusPartial;
        className = styles.evidenceStatusPartial;
    }

    return (
        <span className={className}>
            <FormattedMessage {...message} />
        </span>
    );
};

EvidenceStatusBadge.propTypes = {
    status: PropTypes.string
};

const EvidenceChecklistItemText = ({item}) => {
    const intl = useIntl();
    const message = CHECKLIST_MESSAGE_BY_ID[item.id] || messages.checkGoal;
    return intl.formatMessage(message, item.values);
};

EvidenceChecklistItemText.propTypes = {
    item: evidenceChecklistItemShape
};

const EvidenceChecklistItemDetail = ({item}) => {
    const intl = useIntl();
    const statusMessages = CHECKLIST_DETAIL_MESSAGE_BY_ID_AND_STATUS[item.id] || {};
    const message = statusMessages[item.status] || messages.checkGoalMissing;
    return intl.formatMessage(message, item.values);
};

EvidenceChecklistItemDetail.propTypes = {
    item: evidenceChecklistItemShape
};

const EvidenceChecklistPathItem = ({
    activePathId,
    item,
    onPathSelect
}) => {
    const pathId = item.path && item.path.pathId;
    const hasPath = Boolean(pathId);
    const isActive = hasPath && pathId === activePathId;
    const handleClick = useCallback(() => {
        onPathSelect(pathId);
    }, [onPathSelect, pathId]);
    const handleKeyDown = useCallback(event => {
        handlePathKeyDown(event, pathId, onPathSelect);
    }, [onPathSelect, pathId]);

    return (
        <li
            aria-pressed={isActive}
            className={mergeClassNames([
                styles.evidenceChecklistItem,
                hasPath ? styles.pathSelectable : null,
                isActive ? styles.pathActive : null
            ])}
            data-active-path={isActive ? true : null}
            data-path-id={pathId || null}
            key={item.id}
            role={hasPath ? 'button' : null}
            tabIndex={hasPath ? 0 : null}
            onClick={hasPath ? handleClick : null}
            onKeyDown={hasPath ? handleKeyDown : null}
        >
            <div className={styles.evidenceChecklistItemHeader}>
                <span className={styles.evidenceChecklistItemTitle}>
                    <EvidenceChecklistItemText item={item} />
                </span>
                <span className={styles.evidenceStatusGroup}>
                    {isActive ? (
                        <span className={styles.selectedPathBadge}>
                            <FormattedMessage {...messages.selectedPathLabel} />
                        </span>
                    ) : null}
                    <EvidenceStatusBadge status={item.status} />
                </span>
            </div>
            <span className={styles.evidenceChecklistItemDetail}>
                <EvidenceChecklistItemDetail item={item} />
            </span>
            <span className={styles.evidencePath}>
                <LogicPathText path={item.path} />
            </span>
        </li>
    );
};

EvidenceChecklistPathItem.propTypes = {
    activePathId: PropTypes.string,
    item: evidenceChecklistItemShape,
    onPathSelect: PropTypes.func.isRequired
};

const EvidenceChecklist = ({
    activePathId,
    checklist,
    onPathSelect
}) => (
    <div
        className={styles.evidenceChecklist}
        data-testid="ai-logic-coach-evidence-checklist"
    >
        <div className={styles.evidenceScoreRow}>
            <span className={styles.evidenceScoreLabel}>
                <FormattedMessage {...messages.evidenceScoreLabel} />
            </span>
            <span
                className={styles.evidenceScore}
                data-testid="ai-logic-coach-evidence-score"
            >
                <FormattedMessage
                    {...messages.evidenceScore}
                    values={{
                        score: checklist.score,
                        maxScore: checklist.maxScore
                    }}
                />
            </span>
        </div>
        <ol className={styles.evidenceChecklistItems}>
            {checklist.items.map(item => (
                <EvidenceChecklistPathItem
                    activePathId={activePathId}
                    item={item}
                    key={item.id}
                    onPathSelect={onPathSelect}
                />
            ))}
        </ol>
    </div>
);

EvidenceChecklist.propTypes = {
    activePathId: PropTypes.string,
    checklist: evidenceChecklistShape,
    onPathSelect: PropTypes.func.isRequired
};

const SafetyFeedbackList = ({safetyGate}) => {
    const feedbackTypes = getSafetyFeedbackTypes(safetyGate);

    return (
        <ul
            className={styles.safetyFeedbackList}
            data-testid="ai-logic-coach-safety-feedback"
        >
            {feedbackTypes.map(feedbackType => (
                <li
                    className={styles.safetyFeedbackItem}
                    key={feedbackType}
                >
                    <FormattedMessage
                        {...(SAFETY_FEEDBACK_MESSAGE_BY_TYPE[feedbackType] || messages.modelBlockedUnknown)}
                    />
                </li>
            ))}
        </ul>
    );
};

SafetyFeedbackList.propTypes = {
    safetyGate: PropTypes.shape({
        blockedReasons: PropTypes.arrayOf(PropTypes.string),
        redactionApplied: PropTypes.bool
    })
};

const ModelReplyPathAliasButton = ({
    activePathId,
    alias,
    onPathSelect
}) => {
    const isActive = alias.pathId === activePathId;
    const handleClick = useCallback(() => {
        onPathSelect(alias.pathId, alias);
    }, [alias, onPathSelect]);

    return (
        <button
            type="button"
            aria-pressed={isActive}
            className={mergeClassNames([
                styles.modelPathButton,
                isActive ? styles.modelPathButtonActive : null
            ])}
            data-active-path={isActive ? true : null}
            data-path-alias={alias.aliasPathId}
            data-path-id={alias.pathId}
            onClick={handleClick}
        >
            <FormattedMessage
                {...messages.modelReplyPathButton}
                values={{
                    script: alias.scriptIndex
                }}
            />
        </button>
    );
};

ModelReplyPathAliasButton.propTypes = {
    activePathId: PropTypes.string,
    alias: modelReplyPathAliasShape,
    onPathSelect: PropTypes.func.isRequired
};

const ModelReplyPathAliases = ({
    activePathId,
    aliases,
    onPathSelect
}) => (
    aliases.length ? (
        <div
            className={styles.modelReplyPaths}
            data-testid="ai-logic-coach-model-reply-paths"
        >
            <span className={styles.modelReplyPathsLabel}>
                <FormattedMessage {...messages.modelReplyPaths} />
            </span>
            <div className={styles.modelReplyPathButtons}>
                {aliases.map(alias => (
                    <ModelReplyPathAliasButton
                        activePathId={activePathId}
                        alias={alias}
                        key={alias.aliasPathId}
                        onPathSelect={onPathSelect}
                    />
                ))}
            </div>
        </div>
    ) : null
);

ModelReplyPathAliases.propTypes = {
    activePathId: PropTypes.string,
    aliases: PropTypes.arrayOf(modelReplyPathAliasShape),
    onPathSelect: PropTypes.func.isRequired
};

const ScriptExplanationPanel = ({
    explanation,
    generationGateAllowed,
    selectedExplanation,
    onExplain
}) => {
    const hasScript = Boolean(
        selectedExplanation &&
        selectedExplanation.status === SCRIPT_EXPLANATION_STATUS.READY
    );
    const selectedValues = selectedExplanation && selectedExplanation.values ?
        selectedExplanation.values :
        {};
    const hasExplanation = Boolean(
        explanation &&
        explanation.status === SCRIPT_EXPLANATION_STATUS.READY
    );
    const explanationValues = hasExplanation && explanation.values ? explanation.values : {};
    const hasBroadcasts = Boolean(hasExplanation && explanation.hasBroadcasts);

    return (
        <div
            className={styles.scriptExplanation}
            data-testid="ai-logic-coach-script-explanation"
        >
            <div className={styles.scriptExplanationSelected}>
                {hasScript ? (
                    <FormattedMessage
                        {...messages.scriptExplanationSelected}
                        values={selectedValues}
                    />
                ) : (
                    <FormattedMessage {...messages.scriptExplanationNoScript} />
                )}
            </div>
            {generationGateAllowed ? null : (
                <div className={styles.generationGateNotice}>
                    <FormattedMessage {...messages.scriptExplanationGateLocked} />
                </div>
            )}
            <div className={styles.scriptExplanationActions}>
                <button
                    type="button"
                    className={styles.scriptExplanationButton}
                    disabled={!generationGateAllowed || !hasScript}
                    data-testid="ai-logic-coach-script-explain"
                    onClick={onExplain}
                >
                    <FormattedMessage {...messages.explainSelectedScript} />
                </button>
            </div>
            <div
                className={styles.scriptExplanationResult}
                data-testid="ai-logic-coach-script-explanation-result"
            >
                <div className={styles.scriptExplanationResultTitle}>
                    <FormattedMessage {...messages.scriptExplanationResult} />
                </div>
                {hasExplanation ? (
                    <div className={styles.scriptExplanationBody}>
                        <p className={styles.scriptExplanationSummary}>
                            <FormattedMessage
                                {...messages.scriptExplanationSummary}
                                values={explanationValues}
                            />
                        </p>
                        <ol className={styles.scriptExplanationSteps}>
                            <li>
                                <FormattedMessage
                                    {...messages.scriptExplanationCauseStart}
                                    values={explanationValues}
                                />
                            </li>
                            <li>
                                <FormattedMessage
                                    {...messages.scriptExplanationCauseSequence}
                                    values={explanationValues}
                                />
                            </li>
                            <li>
                                <FormattedMessage
                                    {...(
                                        hasBroadcasts ?
                                            messages.scriptExplanationCauseBroadcasts :
                                            messages.scriptExplanationCauseNoBroadcasts
                                    )}
                                    values={explanationValues}
                                />
                            </li>
                        </ol>
                        <p className={styles.scriptExplanationEvidence}>
                            <FormattedMessage {...messages.scriptExplanationEvidence} />
                        </p>
                        <ul className={styles.scriptExplanationQuestions}>
                            <li>
                                <FormattedMessage {...messages.scriptExplanationQuestionVisible} />
                            </li>
                            {hasBroadcasts ? (
                                <li>
                                    <FormattedMessage
                                        {...messages.scriptExplanationQuestionBroadcast}
                                        values={explanationValues}
                                    />
                                </li>
                            ) : null}
                            <li>
                                <FormattedMessage {...messages.scriptExplanationQuestionEvidence} />
                            </li>
                        </ul>
                        <div className={styles.scriptExplanationSafety}>
                            <FormattedMessage {...messages.scriptExplanationSafety} />
                        </div>
                    </div>
                ) : (
                    <div className={styles.scriptExplanationEmpty}>
                        <FormattedMessage {...messages.scriptExplanationEmptyResult} />
                    </div>
                )}
            </div>
        </div>
    );
};

ScriptExplanationPanel.propTypes = {
    explanation: scriptExplanationShape,
    generationGateAllowed: PropTypes.bool,
    selectedExplanation: scriptExplanationShape,
    onExplain: PropTypes.func.isRequired
};

const BlockDraftConceptChip = ({concept}) => {
    const message = BLOCK_DRAFT_CONCEPT_MESSAGE_BY_ID[concept.messageId] || messages.blockDraftConceptSequence;

    return (
        <span className={styles.blockDraftConceptChip}>
            <FormattedMessage {...message} />
        </span>
    );
};

BlockDraftConceptChip.propTypes = {
    concept: blockDraftConceptShape
};

const BlockDraftStep = ({step}) => {
    const message = BLOCK_DRAFT_STEP_MESSAGE_BY_ID[step.messageId] || messages.blockDraftStepSequence;

    return (
        <li>
            <FormattedMessage
                {...message}
                values={step.values}
            />
        </li>
    );
};

BlockDraftStep.propTypes = {
    step: blockDraftStepShape
};

const BlockDraftCodeBlock = ({
    testId,
    text,
    title
}) => (
    <div className={styles.blockDraftCodeBlock}>
        <div className={styles.blockDraftCodeTitle}>{title}</div>
        <pre
            className={styles.blockDraftCode}
            data-testid={testId}
        >{text}</pre>
    </div>
);

BlockDraftCodeBlock.propTypes = {
    testId: PropTypes.string,
    text: PropTypes.string,
    title: PropTypes.node
};

const countScriptDraftBlocks = draft => (
    draft && Array.isArray(draft.scripts) ?
        draft.scripts.reduce((sum, script) => (
            sum + (script && Array.isArray(script.blocks) ? script.blocks.length : 0)
        ), 0) :
        0
);

const createScriptDraftPreviewText = draft => {
    if (!draft) return '';
    return JSON.stringify({
        schemaVersion: draft.schemaVersion,
        completeScript: draft.completeScript,
        insertIntoWorkspace: draft.insertIntoWorkspace,
        target: draft.target,
        concepts: draft.concepts,
        scripts: draft.scripts,
        teacherPolicyWarnings: draft.teacherPolicyWarnings,
        reviewQuestions: draft.reviewQuestions
    }, null, 2);
};

const BlockDraftPanel = ({
    draft,
    generationGateAllowed,
    isScriptDraftLoading,
    modelConsent,
    onConsentChange,
    selectedDraft,
    scriptDraft,
    scriptDraftError,
    scriptDraftStatus,
    onCreate,
    onCreateScriptDraft,
    onInsertScriptDraft
}) => {
    const hasDraftInput = Boolean(
        selectedDraft &&
        selectedDraft.status === BLOCK_DRAFT_STATUS.READY
    );
    const selectedValues = selectedDraft && selectedDraft.values ? selectedDraft.values : {};
    const hasDraft = Boolean(
        draft &&
        draft.status === BLOCK_DRAFT_STATUS.READY
    );
    const draftValues = hasDraft && draft.values ? draft.values : {};
    const concepts = hasDraft && Array.isArray(draft.concepts) ? draft.concepts : [];
    const steps = hasDraft && Array.isArray(draft.steps) ? draft.steps : [];
    const hasScriptDraft = Boolean(scriptDraft && scriptDraft.status === 'ready');
    const scriptCount = hasScriptDraft && Array.isArray(scriptDraft.scripts) ? scriptDraft.scripts.length : 0;
    const scriptBlockCount = countScriptDraftBlocks(scriptDraft);
    const scriptConceptCount = hasScriptDraft && Array.isArray(scriptDraft.concepts) ? scriptDraft.concepts.length : 0;
    const teacherPolicyWarnings = hasScriptDraft && Array.isArray(scriptDraft.teacherPolicyWarnings) ?
        scriptDraft.teacherPolicyWarnings :
        [];
    const reviewQuestions = hasScriptDraft && Array.isArray(scriptDraft.reviewQuestions) ?
        scriptDraft.reviewQuestions :
        [];
    const insertSummary = scriptDraft && scriptDraft.insertSummary ? scriptDraft.insertSummary : null;
    const scriptDraftCreateButton = getScriptDraftCreateButtonState({
        generationGateAllowed,
        hasDraftInput,
        isLoading: isScriptDraftLoading,
        modelConsent
    });
    const scriptDraftInsertButton = getScriptDraftInsertButtonState({
        hasScriptDraft,
        inserted: Boolean(scriptDraft && scriptDraft.inserted),
        ready: scriptDraftStatus === MODEL_REPLY_STATUSES.READY
    });
    const scriptDraftResultVisibility = getScriptDraftResultVisibility({
        hasScriptDraft,
        isLoading: isScriptDraftLoading,
        scriptDraftError
    });

    return (
        <div
            className={styles.blockDraft}
            data-testid="ai-logic-coach-block-draft"
        >
            <div className={styles.blockDraftSource}>
                {hasDraftInput ? (
                    <FormattedMessage
                        {...messages.blockDraftSourceReady}
                        values={selectedValues}
                    />
                ) : (
                    <FormattedMessage {...messages.blockDraftSourceMissing} />
                )}
            </div>
            {generationGateAllowed ? null : (
                <div className={styles.generationGateNotice}>
                    <FormattedMessage {...messages.blockDraftGateLocked} />
                </div>
            )}
            <label className={styles.modelConsent}>
                <input
                    type="checkbox"
                    checked={modelConsent}
                    onChange={onConsentChange}
                />
                <span>
                    <FormattedMessage {...messages.modelConsentLabel} />
                </span>
            </label>
            <div className={styles.blockDraftActions}>
                <button
                    type="button"
                    className={styles.blockDraftButton}
                    disabled={!generationGateAllowed || !hasDraftInput}
                    data-testid="ai-logic-coach-block-draft-make"
                    onClick={onCreate}
                >
                    <FormattedMessage {...messages.makeBlockDraft} />
                </button>
                <button
                    type="button"
                    className={styles.blockDraftButton}
                    disabled={scriptDraftCreateButton.disabled}
                    data-testid="ai-logic-coach-script-draft-make"
                    onClick={onCreateScriptDraft}
                >
                    <FormattedMessage {...messages.makeScriptDraft} />
                </button>
            </div>
            {!modelConsent ? (
                <div className={styles.blockDraftSafety}>
                    <FormattedMessage {...messages.scriptDraftConsentRequired} />
                </div>
            ) : null}
            <div
                className={styles.blockDraftResult}
                data-testid="ai-logic-coach-block-draft-result"
            >
                <div className={styles.blockDraftResultTitle}>
                    <FormattedMessage {...messages.blockDraftResult} />
                </div>
                {hasDraft ? (
                    <div className={styles.blockDraftBody}>
                        <div className={styles.blockDraftSummary}>
                            <FormattedMessage
                                {...messages.blockDraftSummary}
                                values={draftValues}
                            />
                        </div>
                        <div>
                            <div className={styles.blockDraftSubhead}>
                                <FormattedMessage {...messages.blockDraftConcepts} />
                            </div>
                            <div className={styles.blockDraftConcepts}>
                                {concepts.map(concept => (
                                    <BlockDraftConceptChip
                                        concept={concept}
                                        key={concept.id}
                                    />
                                ))}
                            </div>
                        </div>
                        <ol className={styles.blockDraftSteps}>
                            {steps.map(step => (
                                <BlockDraftStep
                                    key={step.id}
                                    step={step}
                                />
                            ))}
                        </ol>
                        <BlockDraftCodeBlock
                            testId="ai-logic-coach-block-draft-json"
                            text={draft.jsonPlan}
                            title={<FormattedMessage {...messages.blockDraftJsonPreview} />}
                        />
                        <BlockDraftCodeBlock
                            testId="ai-logic-coach-block-draft-blockly"
                            text={draft.blocklyOutline}
                            title={<FormattedMessage {...messages.blockDraftBlocklyPreview} />}
                        />
                        <div className={styles.blockDraftSafety}>
                            <FormattedMessage {...messages.blockDraftSafety} />
                        </div>
                    </div>
                ) : (
                    <div className={styles.blockDraftEmpty}>
                        <FormattedMessage {...messages.blockDraftEmptyResult} />
                    </div>
                )}
            </div>
            <div
                className={styles.blockDraftResult}
                data-testid="ai-logic-coach-script-draft-result"
            >
                <div className={styles.blockDraftResultTitle}>
                    <FormattedMessage {...messages.makeScriptDraft} />
                </div>
                {scriptDraftResultVisibility.showLoading ? (
                    <span className={styles.blockDraftEmpty}>
                        <FormattedMessage {...messages.scriptDraftLoading} />
                    </span>
                ) : null}
                {scriptDraftResultVisibility.showError ? (
                    <span className={styles.modelError}>{scriptDraftError}</span>
                ) : null}
                {scriptDraftResultVisibility.showReadyDraft ? (
                    <div className={styles.blockDraftBody}>
                        <div className={styles.blockDraftSummary}>
                            <FormattedMessage
                                {...messages.scriptDraftSummary}
                                values={{
                                    blocks: scriptBlockCount,
                                    concepts: scriptConceptCount,
                                    scripts: scriptCount
                                }}
                            />
                        </div>
                        {teacherPolicyWarnings.length ? (
                            <div>
                                <div className={styles.blockDraftSubhead}>
                                    <FormattedMessage {...messages.scriptDraftWarnings} />
                                </div>
                                <ul className={styles.blockDraftNoticeList}>
                                    {teacherPolicyWarnings.map(warning => (
                                        <li key={`${warning.concept}-${warning.message}`}>
                                            {warning.message}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        {reviewQuestions.length ? (
                            <div>
                                <div className={styles.blockDraftSubhead}>
                                    <FormattedMessage {...messages.scriptDraftReviewQuestions} />
                                </div>
                                <ol className={styles.blockDraftSteps}>
                                    {reviewQuestions.map(question => (
                                        <li key={question}>{question}</li>
                                    ))}
                                </ol>
                            </div>
                        ) : null}
                        <BlockDraftCodeBlock
                            testId="ai-logic-coach-script-draft-json"
                            text={createScriptDraftPreviewText(scriptDraft)}
                            title={<FormattedMessage {...messages.blockDraftJsonPreview} />}
                        />
                        <div className={styles.blockDraftSafety}>
                            <FormattedMessage {...messages.scriptDraftSafety} />
                        </div>
                        {insertSummary ? (
                            <div className={styles.blockDraftInserted}>
                                <FormattedMessage
                                    {...messages.scriptDraftInserted}
                                    values={{
                                        blocks: insertSummary.blocksCreated || 0,
                                        scripts: insertSummary.scriptsCreated || 0
                                    }}
                                />
                            </div>
                        ) : (
                            <div className={styles.blockDraftActions}>
                                <button
                                    type="button"
                                    className={styles.blockDraftButton}
                                    disabled={scriptDraftInsertButton.disabled}
                                    data-testid="ai-logic-coach-script-draft-insert"
                                    onClick={onInsertScriptDraft}
                                >
                                    <FormattedMessage {...messages.insertScriptDraft} />
                                </button>
                            </div>
                        )}
                    </div>
                ) : null}
                {scriptDraftResultVisibility.showEmpty ? (
                    <span className={styles.blockDraftEmpty}>
                        <FormattedMessage {...messages.blockDraftEmptyResult} />
                    </span>
                ) : null}
            </div>
        </div>
    );
};

BlockDraftPanel.propTypes = {
    draft: blockDraftShape,
    generationGateAllowed: PropTypes.bool,
    isScriptDraftLoading: PropTypes.bool,
    modelConsent: PropTypes.bool,
    onConsentChange: PropTypes.func.isRequired,
    selectedDraft: blockDraftShape,
    scriptDraft: scriptDraftShape,
    scriptDraftError: PropTypes.string,
    scriptDraftStatus: PropTypes.string,
    onCreate: PropTypes.func.isRequired,
    onCreateScriptDraft: PropTypes.func.isRequired,
    onInsertScriptDraft: PropTypes.func.isRequired
};

const ProjectPlanStatusBadge = ({status}) => {
    const isDone = status === PROJECT_PLAN_ITEM_STATUSES.DONE;
    return (
        <span className={isDone ? styles.projectPlanDoneBadge : styles.projectPlanTodoBadge}>
            <FormattedMessage {...(isDone ? messages.projectPlanDone : messages.projectPlanTodo)} />
        </span>
    );
};

ProjectPlanStatusBadge.propTypes = {
    status: PropTypes.string
};

const ProjectPlanItem = ({item}) => {
    const message = PROJECT_PLAN_ITEM_MESSAGE_BY_ID[item.messageId] || messages.projectPlanItemGoal;
    return (
        <li className={styles.projectPlanItem}>
            <span className={styles.projectPlanItemText}>
                <FormattedMessage
                    {...message}
                    values={item.values}
                />
            </span>
            <ProjectPlanStatusBadge status={item.status} />
        </li>
    );
};

ProjectPlanItem.propTypes = {
    item: projectPlanItemShape
};

const ProjectPlanScriptChoice = ({
    activePathId,
    choice,
    onPathSelect
}) => {
    const pathId = choice.path && choice.path.pathId;
    const isActive = pathId && activePathId === pathId;
    const handleClick = useCallback(() => {
        onPathSelect(pathId);
    }, [onPathSelect, pathId]);
    const handleKeyDown = useCallback(event => {
        handlePathKeyDown(event, pathId, onPathSelect);
    }, [onPathSelect, pathId]);

    return (
        <button
            type="button"
            className={mergeClassNames([
                styles.projectPlanChoiceButton,
                isActive ? styles.projectPlanChoiceButtonActive : null
            ])}
            data-active-path={isActive ? true : null}
            data-path-id={pathId || null}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            <FormattedMessage
                {...messages.projectPlanScriptChoice}
                values={choice.values}
            />
        </button>
    );
};

ProjectPlanScriptChoice.propTypes = {
    activePathId: PropTypes.string,
    choice: projectPlanScriptChoiceShape,
    onPathSelect: PropTypes.func.isRequired
};

const ProjectPlanConceptChoice = ({
    activeConceptId,
    choice,
    onConceptSelect
}) => {
    const message = BLOCK_DRAFT_CONCEPT_MESSAGE_BY_ID[choice.messageId] || messages.blockDraftConceptSequence;
    const stepMessage = BLOCK_DRAFT_STEP_MESSAGE_BY_ID[choice.stepMessageId] || null;
    const isActive = choice.id === activeConceptId;
    const handleClick = useCallback(() => {
        onConceptSelect(choice.id);
    }, [choice.id, onConceptSelect]);

    return (
        <button
            type="button"
            className={mergeClassNames([
                styles.projectPlanChoiceButton,
                isActive ? styles.projectPlanChoiceButtonActive : null
            ])}
            aria-pressed={isActive}
            data-concept-id={choice.id}
            onClick={handleClick}
        >
            <span className={styles.projectPlanChoiceTitle}>
                <FormattedMessage {...message} />
            </span>
            {stepMessage ? (
                <span className={styles.projectPlanChoiceDetail}>
                    <FormattedMessage
                        {...stepMessage}
                        values={choice.stepValues}
                    />
                </span>
            ) : null}
            {isActive ? (
                <span className={styles.projectPlanSelectedNote}>
                    <FormattedMessage {...messages.projectPlanConceptSelected} />
                </span>
            ) : null}
        </button>
    );
};

ProjectPlanConceptChoice.propTypes = {
    activeConceptId: PropTypes.string,
    choice: projectPlanConceptChoiceShape,
    onConceptSelect: PropTypes.func.isRequired
};

const ProjectPlanMessageLink = ({
    activePathId,
    link,
    onPathSelect
}) => {
    const pathId = link.path && link.path.pathId;
    const isActive = pathId && activePathId === pathId;
    const handleClick = useCallback(() => {
        onPathSelect(pathId);
    }, [onPathSelect, pathId]);
    const handleKeyDown = useCallback(event => {
        handlePathKeyDown(event, pathId, onPathSelect);
    }, [onPathSelect, pathId]);

    return (
        <button
            type="button"
            className={mergeClassNames([
                styles.projectPlanChoiceButton,
                isActive ? styles.projectPlanChoiceButtonActive : null
            ])}
            data-active-path={isActive ? true : null}
            data-path-id={pathId || null}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            <FormattedMessage
                {...messages.projectPlanMessageLink}
                values={link.values}
            />
            <ProjectPlanStatusBadge status={link.status} />
        </button>
    );
};

ProjectPlanMessageLink.propTypes = {
    activePathId: PropTypes.string,
    link: projectPlanMessageLinkShape,
    onPathSelect: PropTypes.func.isRequired
};

const ProjectPlanPanel = ({
    activeConceptId,
    activePathId,
    plan,
    onConceptSelect,
    onPathSelect
}) => {
    const isEmpty = !plan || plan.status === PROJECT_PLAN_STATUS.EMPTY;
    const values = plan && plan.values ? plan.values : {};
    const items = plan && Array.isArray(plan.items) ? plan.items : [];
    const scriptChoices = plan && Array.isArray(plan.scriptChoices) ? plan.scriptChoices : [];
    const conceptChoices = plan && Array.isArray(plan.conceptChoices) ? plan.conceptChoices : [];
    const messageLinks = plan && Array.isArray(plan.messageLinks) ? plan.messageLinks : [];

    return (
        <div
            className={styles.projectPlan}
            data-testid="ai-logic-coach-project-plan"
        >
            <div className={styles.projectPlanSummary}>
                {isEmpty ? (
                    <FormattedMessage {...messages.projectPlanEmpty} />
                ) : (
                    <FormattedMessage
                        {...messages.projectPlanSummary}
                        values={values}
                    />
                )}
            </div>
            <div className={styles.projectPlanGroup}>
                <div className={styles.projectPlanSubhead}>
                    <FormattedMessage {...messages.projectPlanChecklist} />
                </div>
                <ul className={styles.projectPlanItems}>
                    {items.map(item => (
                        <ProjectPlanItem
                            item={item}
                            key={item.id}
                        />
                    ))}
                </ul>
            </div>
            <div className={styles.projectPlanGroup}>
                <div className={styles.projectPlanSubhead}>
                    <FormattedMessage {...messages.projectPlanScripts} />
                </div>
                {scriptChoices.length ? (
                    <div className={styles.projectPlanChoiceList}>
                        {scriptChoices.map(choice => (
                            <ProjectPlanScriptChoice
                                activePathId={activePathId}
                                choice={choice}
                                key={choice.id}
                                onPathSelect={onPathSelect}
                            />
                        ))}
                    </div>
                ) : (
                    <div className={styles.projectPlanEmptyInline}>
                        <FormattedMessage {...messages.projectPlanNoScripts} />
                    </div>
                )}
            </div>
            <div className={styles.projectPlanGroup}>
                <div className={styles.projectPlanSubhead}>
                    <FormattedMessage {...messages.projectPlanConcepts} />
                </div>
                {conceptChoices.length ? (
                    <div className={styles.projectPlanChoiceList}>
                        {conceptChoices.map(choice => (
                            <ProjectPlanConceptChoice
                                activeConceptId={activeConceptId}
                                choice={choice}
                                key={choice.id}
                                onConceptSelect={onConceptSelect}
                            />
                        ))}
                    </div>
                ) : (
                    <div className={styles.projectPlanEmptyInline}>
                        <FormattedMessage {...messages.projectPlanNoConcepts} />
                    </div>
                )}
            </div>
            <div className={styles.projectPlanGroup}>
                <div className={styles.projectPlanSubhead}>
                    <FormattedMessage {...messages.projectPlanMessages} />
                </div>
                {messageLinks.length ? (
                    <div className={styles.projectPlanChoiceList}>
                        {messageLinks.map(link => (
                            <ProjectPlanMessageLink
                                activePathId={activePathId}
                                key={link.id}
                                link={link}
                                onPathSelect={onPathSelect}
                            />
                        ))}
                    </div>
                ) : (
                    <div className={styles.projectPlanEmptyInline}>
                        <FormattedMessage {...messages.projectPlanNoMessages} />
                    </div>
                )}
            </div>
        </div>
    );
};

ProjectPlanPanel.propTypes = {
    activeConceptId: PropTypes.string,
    activePathId: PropTypes.string,
    plan: projectPlanShape,
    onConceptSelect: PropTypes.func.isRequired,
    onPathSelect: PropTypes.func.isRequired
};

const ModelCoach = ({
    activePathId,
    consentChecked,
    generationGateAllowed,
    isLoading,
    modelError,
    modelReply,
    modelReplyPathAliases,
    modelStatus,
    questionText,
    onCancel,
    onConsentChange,
    onPathSelect,
    onQuestionChange,
    onSubmit
}) => {
    const intl = useIntl();
    const hasQuestion = isTextComplete(questionText);
    const hasReply = Boolean(modelReply && modelReply.text);
    const isBlocked = Boolean(modelReply && (
        modelReply.blocked ||
        (modelReply.safetyGate && modelReply.safetyGate.allowed === false && modelReply.modelEnabled)
    ));
    const isCanceled = modelStatus === MODEL_REPLY_STATUSES.CANCELED;
    const isTimeout = modelStatus === MODEL_REPLY_STATUSES.TIMEOUT;

    return (
        <div
            className={styles.modelCoach}
            data-testid="ai-logic-coach-model-coach"
        >
            <label
                className={styles.modelQuestionLabel}
                htmlFor="ai-logic-coach-model-question"
            >
                <FormattedMessage {...messages.modelQuestionLabel} />
            </label>
            <textarea
                id="ai-logic-coach-model-question"
                className={styles.modelQuestionInput}
                data-testid="ai-logic-coach-model-question"
                placeholder={intl.formatMessage(messages.modelQuestionPlaceholder)}
                rows="2"
                value={questionText}
                onChange={onQuestionChange}
            />
            <label className={styles.modelConsent}>
                <input
                    checked={consentChecked}
                    type="checkbox"
                    onChange={onConsentChange}
                />
                <span>
                    <FormattedMessage {...messages.modelConsentLabel} />
                </span>
            </label>
            {generationGateAllowed ? null : (
                <div className={styles.generationGateNotice}>
                    <FormattedMessage {...messages.generationGateLocked} />
                </div>
            )}
            <div className={styles.modelAskRow}>
                <button
                    type="button"
                    className={styles.modelAskButton}
                    disabled={!generationGateAllowed || !hasQuestion || !consentChecked || isLoading}
                    data-testid="ai-logic-coach-model-ask"
                    onClick={onSubmit}
                >
                    {isLoading ? (
                        <FormattedMessage {...messages.askingModel} />
                    ) : (
                        <FormattedMessage {...messages.askModel} />
                    )}
                </button>
                {isLoading ? (
                    <button
                        type="button"
                        className={styles.modelCancelButton}
                        data-testid="ai-logic-coach-model-cancel"
                        onClick={onCancel}
                    >
                        <FormattedMessage {...messages.cancelModelRequest} />
                    </button>
                ) : null}
            </div>
            <div
                className={styles.modelReply}
                data-testid="ai-logic-coach-model-reply"
            >
                <div className={styles.modelReplyHeader}>
                    <span className={styles.modelReplyTitle}>
                        <FormattedMessage {...messages.modelReply} />
                    </span>
                    {modelReply && modelReply.provider ? (
                        <span className={styles.modelReplyMeta}>
                            <FormattedMessage
                                {...messages.modelReplyProvider}
                                values={{
                                    provider: modelReply.provider,
                                    model: modelReply.model || ''
                                }}
                            />
                        </span>
                    ) : null}
                </div>
                {isLoading ? (
                    <span className={styles.modelReplyEmpty}>
                        <FormattedMessage {...messages.modelPending} />
                    </span>
                ) : isCanceled ? (
                    <span className={styles.modelReplyEmpty}>
                        <FormattedMessage {...messages.modelCanceled} />
                    </span>
                ) : isTimeout ? (
                    <span className={styles.modelError}>
                        <FormattedMessage {...messages.modelTimeout} />
                    </span>
                ) : modelError ? (
                    <span className={styles.modelError}>
                        <FormattedMessage {...messages.modelError} />
                    </span>
                ) : hasReply ? (
                    <div className={styles.modelReplyText}>
                        {isBlocked ? (
                            <div className={styles.modelBlockedMessage}>
                                <strong>
                                    <FormattedMessage {...messages.modelBlocked} />
                                </strong>
                                <SafetyFeedbackList safetyGate={modelReply.safetyGate} />
                            </div>
                        ) : null}
                        {modelReply.text}
                        <ModelReplyPathAliases
                            activePathId={activePathId}
                            aliases={modelReplyPathAliases}
                            onPathSelect={onPathSelect}
                        />
                    </div>
                ) : (
                    <span className={styles.modelReplyEmpty}>
                        <FormattedMessage {...messages.modelEmptyReply} />
                    </span>
                )}
            </div>
        </div>
    );
};

ModelCoach.propTypes = {
    activePathId: PropTypes.string,
    consentChecked: PropTypes.bool,
    generationGateAllowed: PropTypes.bool,
    isLoading: PropTypes.bool,
    modelError: PropTypes.string,
    modelReply: modelReplyShape,
    modelReplyPathAliases: PropTypes.arrayOf(modelReplyPathAliasShape),
    modelStatus: PropTypes.string,
    onCancel: PropTypes.func.isRequired,
    onConsentChange: PropTypes.func.isRequired,
    onPathSelect: PropTypes.func.isRequired,
    onQuestionChange: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    questionText: PropTypes.string
};

const AssetTypeButton = ({
    active,
    children,
    type,
    onSelect
}) => {
    const handleClick = useCallback(() => {
        onSelect(type);
    }, [onSelect, type]);

    return (
        <button
            type="button"
            aria-pressed={active}
            className={mergeClassNames([
                styles.assetTypeButton,
                active ? styles.assetTypeButtonActive : null
            ])}
            onClick={handleClick}
        >
            {children}
        </button>
    );
};

AssetTypeButton.propTypes = {
    active: PropTypes.bool,
    children: PropTypes.node,
    onSelect: PropTypes.func.isRequired,
    type: PropTypes.string
};

const AssetAdoptionItem = ({
    complete,
    children
}) => (
    <span
        className={mergeClassNames([
            styles.assetAdoptionItem,
            complete ? styles.assetAdoptionItemComplete : null
        ])}
    >
        {children}
    </span>
);

AssetAdoptionItem.propTypes = {
    children: PropTypes.node,
    complete: PropTypes.bool
};

const AssetAdoptionChecklist = ({
    summary,
    onAdopt,
    onImport,
    onRecordEdit,
    onReview
}) => {
    if (!summary || !summary.hasAsset) return null;

    return (
        <div
            className={styles.assetAdoption}
            data-testid="ai-logic-coach-asset-adoption"
        >
            <div className={styles.assetAdoptionHeader}>
                <span className={styles.assetAdoptionTitle}>
                    <FormattedMessage {...messages.assetAdoption} />
                </span>
                <span className={styles.assetResultMeta}>
                    {summary.status}
                </span>
            </div>
            <div className={styles.assetAdoptionChecklist}>
                <AssetAdoptionItem complete={summary.reviewed}>
                    <FormattedMessage {...messages.assetAdoptionReview} />
                </AssetAdoptionItem>
                <AssetAdoptionItem complete={summary.imported}>
                    <FormattedMessage {...messages.assetAdoptionImport} />
                </AssetAdoptionItem>
                <AssetAdoptionItem complete={summary.visualEditsComplete}>
                    <FormattedMessage
                        {...messages.assetAdoptionEdits}
                        values={{
                            count: summary.visualEditCount,
                            required: summary.requiredVisualEdits
                        }}
                    />
                </AssetAdoptionItem>
                <AssetAdoptionItem complete={summary.adopted}>
                    <FormattedMessage {...messages.assetAdoptionAdopted} />
                </AssetAdoptionItem>
            </div>
            {summary.importTarget ? (
                <span className={styles.assetMockMeta}>
                    <FormattedMessage
                        {...messages.assetImportedTarget}
                        values={{target: summary.importTarget}}
                    />
                </span>
            ) : null}
            <div className={styles.assetAdoptionActions}>
                <button
                    type="button"
                    className={styles.assetCancelButton}
                    disabled={!summary.canReview}
                    data-testid="ai-logic-coach-asset-review"
                    onClick={onReview}
                >
                    <FormattedMessage {...messages.assetReviewButton} />
                </button>
                <button
                    type="button"
                    className={styles.assetCancelButton}
                    disabled={!summary.canImport}
                    data-testid="ai-logic-coach-asset-import"
                    onClick={onImport}
                >
                    <FormattedMessage {...messages.assetImportButton} />
                </button>
                <button
                    type="button"
                    className={styles.assetCancelButton}
                    disabled={!summary.canRecordVisualEdit}
                    data-testid="ai-logic-coach-asset-edit"
                    onClick={onRecordEdit}
                >
                    <FormattedMessage {...messages.assetRecordEditButton} />
                </button>
                <button
                    type="button"
                    className={styles.assetSubmitButton}
                    disabled={!summary.canAdopt}
                    data-testid="ai-logic-coach-asset-adopt"
                    onClick={onAdopt}
                >
                    <FormattedMessage {...messages.assetAdoptButton} />
                </button>
            </div>
        </div>
    );
};

AssetAdoptionChecklist.propTypes = {
    onAdopt: PropTypes.func.isRequired,
    onImport: PropTypes.func.isRequired,
    onRecordEdit: PropTypes.func.isRequired,
    onReview: PropTypes.func.isRequired,
    summary: assetAdoptionSummaryShape
};

const AssetDraftResult = ({
    adoptionSummary,
    error,
    onAdopt,
    onImport,
    onRecordEdit,
    onReview,
    reply,
    status
}) => {
    const isBlocked = Boolean(reply && reply.blocked);
    const isCanceled = status === ASSET_JOB_STATUSES.CANCELED;
    const isLoading = status === ASSET_JOB_STATUSES.LOADING;
    const isTimeout = status === ASSET_JOB_STATUSES.TIMEOUT;
    const job = reply && reply.worker && reply.worker.job;
    const asset = job && job.result && job.result.asset;
    const dataUri = asset && asset.dataUri;
    const placeholder = job && job.result && job.result.placeholder;
    const resultMessage = job && job.result && job.result.message;
    const transparentBackground = asset && asset.transparentBackground ?
        asset.transparentBackground :
        job && job.result && job.result.transparentBackground;
    const wasServerRepaired = Boolean(transparentBackground && transparentBackground.repaired);
    const repairFailed = Boolean(transparentBackground && (
        transparentBackground.repairAttempted || transparentBackground.originalReason
    ) && transparentBackground.passed === false);
    const reviewState = job && job.audit && job.audit.reviewState;

    return (
        <div
            className={styles.assetResult}
            data-testid="ai-logic-coach-asset-result"
        >
            <div className={styles.assetResultHeader}>
                <span className={styles.assetResultTitle}>
                    <FormattedMessage {...messages.assetResult} />
                </span>
                {job ? (
                    <span className={styles.assetResultMeta}>
                        {job.mode} / {job.status}
                    </span>
                ) : null}
            </div>
            {isLoading ? (
                <span className={styles.assetEmptyResult}>
                    <FormattedMessage {...messages.assetPending} />
                </span>
            ) : isCanceled ? (
                <span className={styles.assetEmptyResult}>
                    <FormattedMessage {...messages.assetCanceled} />
                </span>
            ) : isTimeout ? (
                <span className={styles.assetError}>
                    <FormattedMessage {...messages.assetTimeout} />
                </span>
            ) : error ? (
                <span className={styles.assetError}>
                    <FormattedMessage {...(repairFailed ? messages.assetTransparentRepairFailed : messages.assetError)} />
                </span>
            ) : isBlocked ? (
                <span className={styles.assetError}>
                    <FormattedMessage {...messages.assetBlocked} />
                </span>
            ) : job ? (
                <div className={styles.assetMockCard}>
                    {dataUri ? (
                        <img
                            alt=""
                            className={styles.assetPreviewImage}
                            src={dataUri}
                        />
                    ) : (
                        <div className={styles.assetPlaceholder}>
                            <span>AI</span>
                        </div>
                    )}
                    <div className={styles.assetMockText}>
                        <strong>
                            <FormattedMessage {...messages.assetMockReady} />
                        </strong>
                        <span>
                            {resultMessage || <FormattedMessage {...messages.assetMockMessage} />}
                        </span>
                        {wasServerRepaired ? (
                            <span className={styles.assetMockMeta}>
                                <FormattedMessage {...messages.assetTransparentRepairNotice} />
                            </span>
                        ) : null}
                        {placeholder ? (
                            <span className={styles.assetMockMeta}>
                                {placeholder.width} x {placeholder.height} {placeholder.format}
                            </span>
                        ) : null}
                        {reviewState ? (
                            <span className={styles.assetMockMeta}>
                                {reviewState}
                            </span>
                        ) : null}
                    </div>
                    <AssetAdoptionChecklist
                        summary={adoptionSummary}
                        onAdopt={onAdopt}
                        onImport={onImport}
                        onRecordEdit={onRecordEdit}
                        onReview={onReview}
                    />
                </div>
            ) : (
                <span className={styles.assetEmptyResult}>
                    <FormattedMessage {...messages.assetEmptyResult} />
                </span>
            )}
        </div>
    );
};

AssetDraftResult.propTypes = {
    adoptionSummary: assetAdoptionSummaryShape,
    error: PropTypes.string,
    onAdopt: PropTypes.func.isRequired,
    onImport: PropTypes.func.isRequired,
    onRecordEdit: PropTypes.func.isRequired,
    onReview: PropTypes.func.isRequired,
    reply: assetJobReplyShape,
    status: PropTypes.string
};

const AssetJobDraft = ({
    assetAdoptionSummary,
    assetConsent,
    assetError,
    assetPrompt,
    assetReply,
    assetStatus,
    assetType,
    generationGateAllowed,
    onCancel,
    onAdoptAsset,
    onAssetConsentChange,
    onAssetPromptChange,
    onAssetTypeSelect,
    onImportAsset,
    onRecordAssetEdit,
    onReviewAsset,
    onSubmit
}) => {
    const intl = useIntl();
    const hasPrompt = isTextComplete(assetPrompt);
    const isLoading = assetStatus === ASSET_JOB_STATUSES.LOADING;

    return (
        <div
            className={styles.assetJob}
            data-testid="ai-logic-coach-asset-generator"
        >
            <div className={styles.assetTypeGroup}>
                <span className={styles.assetTypeLabel}>
                    <FormattedMessage {...messages.assetTypeLabel} />
                </span>
                <div className={styles.assetTypeButtons}>
                    <AssetTypeButton
                        active={assetType === ASSET_TYPES.CHARACTER}
                        type={ASSET_TYPES.CHARACTER}
                        onSelect={onAssetTypeSelect}
                    >
                        <FormattedMessage {...messages.assetTypeCharacter} />
                    </AssetTypeButton>
                    <AssetTypeButton
                        active={assetType === ASSET_TYPES.BACKDROP}
                        type={ASSET_TYPES.BACKDROP}
                        onSelect={onAssetTypeSelect}
                    >
                        <FormattedMessage {...messages.assetTypeBackdrop} />
                    </AssetTypeButton>
                </div>
            </div>
            <label
                className={styles.assetPromptField}
                htmlFor="ai-logic-coach-asset-prompt"
            >
                <span className={styles.assetPromptLabel}>
                    <FormattedMessage {...messages.assetPromptLabel} />
                </span>
                <textarea
                    id="ai-logic-coach-asset-prompt"
                    className={styles.assetPromptInput}
                    data-testid="ai-logic-coach-asset-prompt"
                    maxLength="240"
                    placeholder={intl.formatMessage(messages.assetPromptPlaceholder)}
                    rows="2"
                    value={assetPrompt}
                    onChange={onAssetPromptChange}
                />
            </label>
            <label className={styles.assetConsent}>
                <input
                    checked={assetConsent}
                    data-testid="ai-logic-coach-asset-consent"
                    type="checkbox"
                    onChange={onAssetConsentChange}
                />
                <span>
                    <FormattedMessage {...messages.assetConsentLabel} />
                </span>
            </label>
            {generationGateAllowed ? null : (
                <div className={styles.generationGateNotice}>
                    <FormattedMessage {...messages.assetGenerationGateHint} />
                </div>
            )}
            <div className={styles.assetSubmitRow}>
                <button
                    type="button"
                    className={styles.assetSubmitButton}
                    disabled={!hasPrompt || !assetConsent || isLoading}
                    data-testid="ai-logic-coach-asset-submit"
                    onClick={onSubmit}
                >
                    {isLoading ? (
                        <FormattedMessage {...messages.assetSubmitting} />
                    ) : (
                        <FormattedMessage {...messages.assetSubmit} />
                    )}
                </button>
                {isLoading ? (
                    <button
                        type="button"
                        className={styles.assetCancelButton}
                        data-testid="ai-logic-coach-asset-cancel"
                        onClick={onCancel}
                    >
                        <FormattedMessage {...messages.cancelAssetRequest} />
                    </button>
                ) : null}
            </div>
            <AssetDraftResult
                adoptionSummary={assetAdoptionSummary}
                error={assetError}
                onAdopt={onAdoptAsset}
                onImport={onImportAsset}
                onRecordEdit={onRecordAssetEdit}
                onReview={onReviewAsset}
                reply={assetReply}
                status={assetStatus}
            />
        </div>
    );
};

AssetJobDraft.propTypes = {
    assetAdoptionSummary: assetAdoptionSummaryShape,
    assetConsent: PropTypes.bool,
    assetError: PropTypes.string,
    assetPrompt: PropTypes.string,
    assetReply: assetJobReplyShape,
    assetStatus: PropTypes.string,
    assetType: PropTypes.string,
    generationGateAllowed: PropTypes.bool,
    onAdoptAsset: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    onAssetConsentChange: PropTypes.func.isRequired,
    onAssetPromptChange: PropTypes.func.isRequired,
    onAssetTypeSelect: PropTypes.func.isRequired,
    onImportAsset: PropTypes.func.isRequired,
    onRecordAssetEdit: PropTypes.func.isRequired,
    onReviewAsset: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired
};

const Q18ProofBoolean = ({value}) => (
    <FormattedMessage {...(value ? messages.q18BoolYes : messages.q18BoolNo)} />
);

Q18ProofBoolean.propTypes = {
    value: PropTypes.bool
};

const Q18VoiceResult = ({result}) => (
    <div className={styles.q18ResultBody}>
        <div className={styles.q18ResultSummary}>
            <FormattedMessage
                {...messages.q18VoiceResult}
                values={result.values}
            />
        </div>
        <div className={styles.q18Proof}>
            <FormattedMessage {...messages.q18VoiceFallback} />
        </div>
        <div className={styles.q18Safety}>
            <FormattedMessage {...messages.q18Safety} />
        </div>
    </div>
);

Q18VoiceResult.propTypes = {
    result: q18ToolShape
};

const Q18OneLineResult = ({result}) => (
    <div className={styles.q18ResultBody}>
        <div className={styles.q18ResultSummary}>
            <FormattedMessage
                {...messages.q18SkeletonResult}
                values={result.values}
            />
        </div>
        <div className={styles.q18Proof}>
            <FormattedMessage
                {...messages.q18SkeletonProof}
                values={{
                    empty: (
                        <Q18ProofBoolean
                            value={Boolean(result.proof && result.proof.allTargetBlocksEmpty)}
                        />
                    ),
                    scripts: (
                        <Q18ProofBoolean
                            value={Boolean(result.proof && result.proof.executableScriptsGenerated)}
                        />
                    )
                }}
            />
        </div>
        <ul className={styles.q18List}>
            {(result.steps || []).map(step => (
                <li key={step}>{step}</li>
            ))}
        </ul>
        <div className={styles.q18Safety}>
            <FormattedMessage {...messages.q18Safety} />
        </div>
    </div>
);

Q18OneLineResult.propTypes = {
    result: q18ToolShape
};

const Q18AdditionResult = ({result}) => (
    <div className={styles.q18ResultBody}>
        <div className={styles.q18ResultSummary}>
            <FormattedMessage
                {...messages.q18AdditionResult}
                values={result.values}
            />
        </div>
        <div className={styles.q18ChipList}>
            {result.template.variables.map(variable => (
                <span
                    className={styles.q18Chip}
                    key={variable.id}
                >
                    {variable.label}
                </span>
            ))}
        </div>
        <ul className={styles.q18List}>
            {result.template.explainQuestions.map(question => (
                <li key={question}>{question}</li>
            ))}
        </ul>
        <div className={styles.q18Proof}>
            <FormattedMessage
                {...messages.q18AdditionProof}
                values={{
                    script: (
                        <Q18ProofBoolean
                            value={Boolean(result.proof && result.proof.completeAnswerScript)}
                        />
                    )
                }}
            />
        </div>
        <div className={styles.q18Safety}>
            <FormattedMessage {...messages.q18Safety} />
        </div>
    </div>
);

Q18AdditionResult.propTypes = {
    result: q18ToolShape
};

const Q18TextTool = ({
    buttonMessage,
    inputId,
    labelMessage,
    placeholderMessage,
    result,
    ResultComponent,
    titleMessage,
    value,
    generationGateAllowed,
    onChange,
    onCreate
}) => {
    const intl = useIntl();
    const hasText = isTextComplete(value);
    const hasResult = result && result.status === Q18_TOOL_STATUS.READY;

    return (
        <div className={styles.q18ToolCard}>
            <h4 className={styles.q18ToolTitle}>
                <FormattedMessage {...titleMessage} />
            </h4>
            <label
                className={styles.q18Field}
                htmlFor={inputId}
            >
                <span className={styles.q18FieldLabel}>
                    <FormattedMessage {...labelMessage} />
                </span>
                <textarea
                    id={inputId}
                    className={styles.q18Input}
                    maxLength="240"
                    placeholder={intl.formatMessage(placeholderMessage)}
                    rows="2"
                    value={value}
                    onChange={onChange}
                />
            </label>
            <button
                type="button"
                className={styles.q18Button}
                disabled={!generationGateAllowed || !hasText}
                onClick={onCreate}
            >
                <FormattedMessage {...buttonMessage} />
            </button>
            <div className={styles.q18Result}>
                {hasResult ? (
                    <ResultComponent result={result} />
                ) : (
                    <span className={styles.q18Empty}>
                        <FormattedMessage {...messages.q18EmptyResult} />
                    </span>
                )}
            </div>
        </div>
    );
};

Q18TextTool.propTypes = {
    buttonMessage: PropTypes.object,
    generationGateAllowed: PropTypes.bool,
    inputId: PropTypes.string,
    labelMessage: PropTypes.object,
    onChange: PropTypes.func.isRequired,
    onCreate: PropTypes.func.isRequired,
    placeholderMessage: PropTypes.object,
    result: q18ToolShape,
    ResultComponent: PropTypes.elementType.isRequired,
    titleMessage: PropTypes.object,
    value: PropTypes.string
};

const Q18PreviewTools = ({
    additionDraft,
    additionGoal,
    generationGateAllowed,
    oneLineDraft,
    oneLineGoal,
    voiceDraft,
    voiceText,
    voiceEnabled,
    oneLineEnabled,
    additionEnabled,
    onAdditionGoalChange,
    onCreateAddition,
    onCreateOneLine,
    onCreateVoice,
    onOneLineGoalChange,
    onVoiceTextChange
}) => (
    <div
        className={styles.q18Tools}
        data-testid="ai-logic-coach-q18-tools"
    >
        {generationGateAllowed ? null : (
            <div className={styles.generationGateNotice}>
                <FormattedMessage {...messages.q18GateLocked} />
            </div>
        )}
        {voiceEnabled ? (
            <Q18TextTool
                buttonMessage={messages.q18CreateVoice}
                generationGateAllowed={generationGateAllowed}
                inputId="ai-logic-coach-q18-voice"
                labelMessage={messages.q18VoiceTextLabel}
                placeholderMessage={messages.q18VoicePlaceholder}
                result={voiceDraft}
                ResultComponent={Q18VoiceResult}
                titleMessage={messages.q18Voice}
                value={voiceText}
                onChange={onVoiceTextChange}
                onCreate={onCreateVoice}
            />
        ) : null}
        {oneLineEnabled ? (
            <Q18TextTool
                buttonMessage={messages.q18CreateSkeleton}
                generationGateAllowed={generationGateAllowed}
                inputId="ai-logic-coach-q18-one-line"
                labelMessage={messages.q18OneLineLabel}
                placeholderMessage={messages.q18OneLinePlaceholder}
                result={oneLineDraft}
                ResultComponent={Q18OneLineResult}
                titleMessage={messages.q18OneLine}
                value={oneLineGoal}
                onChange={onOneLineGoalChange}
                onCreate={onCreateOneLine}
            />
        ) : null}
        {additionEnabled ? (
            <Q18TextTool
                buttonMessage={messages.q18CreateAddition}
                generationGateAllowed={generationGateAllowed}
                inputId="ai-logic-coach-q18-addition"
                labelMessage={messages.q18AdditionLabel}
                placeholderMessage={messages.q18AdditionPlaceholder}
                result={additionDraft}
                ResultComponent={Q18AdditionResult}
                titleMessage={messages.q18Addition}
                value={additionGoal}
                onChange={onAdditionGoalChange}
                onCreate={onCreateAddition}
            />
        ) : null}
    </div>
);

Q18PreviewTools.propTypes = {
    additionDraft: q18ToolShape,
    additionEnabled: PropTypes.bool,
    additionGoal: PropTypes.string,
    generationGateAllowed: PropTypes.bool,
    oneLineDraft: q18ToolShape,
    oneLineEnabled: PropTypes.bool,
    oneLineGoal: PropTypes.string,
    onAdditionGoalChange: PropTypes.func.isRequired,
    onCreateAddition: PropTypes.func.isRequired,
    onCreateOneLine: PropTypes.func.isRequired,
    onCreateVoice: PropTypes.func.isRequired,
    onOneLineGoalChange: PropTypes.func.isRequired,
    onVoiceTextChange: PropTypes.func.isRequired,
    voiceDraft: q18ToolShape,
    voiceEnabled: PropTypes.bool,
    voiceText: PropTypes.string
};

const DraftList = ({items}) => (
    <ul className={styles.teacherDraftList}>
        {(items || []).map((item, index) => (
            <li key={`${index}-${item}`}>
                {item}
            </li>
        ))}
    </ul>
);

DraftList.propTypes = {
    items: PropTypes.arrayOf(PropTypes.string)
};

const KnowledgePointButton = ({
    active,
    point,
    onToggle
}) => {
    const handleClick = useCallback(() => {
        onToggle(point.id);
    }, [onToggle, point.id]);

    return (
        <button
            type="button"
            aria-pressed={active}
            className={mergeClassNames([
                styles.knowledgePointButton,
                active ? styles.knowledgePointButtonActive : null
            ])}
            onClick={handleClick}
        >
            {point.label}
        </button>
    );
};

KnowledgePointButton.propTypes = {
    active: PropTypes.bool,
    onToggle: PropTypes.func.isRequired,
    point: knowledgePointShape
};

const TeacherDraftStatus = ({
    blocked,
    error,
    persisted
}) => {
    if (error) {
        return (
            <span className={styles.teacherDraftError}>
                <FormattedMessage {...messages.teacherDraftError} />
            </span>
        );
    }
    if (blocked) {
        return (
            <span className={styles.teacherDraftError}>
                <FormattedMessage {...messages.teacherDraftBlocked} />
            </span>
        );
    }
    if (persisted) {
        return (
            <span className={styles.teacherDraftSavedBadge}>
                <FormattedMessage {...messages.teacherDraftSaved} />
            </span>
        );
    }
    return (
        <span className={styles.teacherDraftBadge}>
            <FormattedMessage {...messages.teacherDraftNotSaved} />
        </span>
    );
};

TeacherDraftStatus.propTypes = {
    blocked: PropTypes.bool,
    error: PropTypes.string,
    persisted: PropTypes.bool
};

const KnowledgeLockResult = ({
    error,
    reply
}) => {
    const lock = reply && reply.knowledgeLock;

    return (
        <div
            className={styles.teacherDraftResult}
            data-testid="ai-logic-coach-knowledge-lock-result"
        >
            <div className={styles.teacherDraftResultHeader}>
                <span className={styles.teacherDraftResultTitle}>
                    <FormattedMessage {...messages.knowledgeLockDraft} />
                </span>
                <TeacherDraftStatus
                    blocked={Boolean(reply && reply.blocked)}
                    error={error}
                    persisted={Boolean(reply && (
                        reply.persisted ||
                        (reply.knowledgeLock && reply.knowledgeLock.persisted)
                    ))}
                />
            </div>
            {error || (reply && reply.blocked) ? null : lock ? (
                <div className={styles.teacherDraftBody}>
                    <p className={styles.teacherDraftPhrase}>
                        {lock.classroomPhrase}
                    </p>
                    <div className={styles.teacherChipList}>
                        {lock.selectedKnowledgePoints.map(point => (
                            <span
                                className={styles.teacherChip}
                                key={point.id}
                            >
                                {point.label}
                            </span>
                        ))}
                    </div>
                    <h4 className={styles.teacherDraftSubhead}>
                        <FormattedMessage {...messages.teacherExplainGateQuestions} />
                    </h4>
                    <DraftList items={lock.questionRules.slice(0, 6).map(item => item.text)} />
                    <h4 className={styles.teacherDraftSubhead}>
                        <FormattedMessage {...messages.teacherRubric} />
                    </h4>
                    <DraftList items={lock.rubricFocus.map(item => `${item.label}: ${item.focus}`)} />
                </div>
            ) : (
                <span className={styles.teacherDraftEmpty}>
                    <FormattedMessage {...messages.noKnowledgeLockDraft} />
                </span>
            )}
        </div>
    );
};

KnowledgeLockResult.propTypes = {
    error: PropTypes.string,
    reply: knowledgeLockReplyShape
};

const LessonPrepResult = ({
    error,
    reply
}) => {
    const prep = reply && reply.lessonPrep;

    return (
        <div
            className={styles.teacherDraftResult}
            data-testid="ai-logic-coach-lesson-prep-result"
        >
            <div className={styles.teacherDraftResultHeader}>
                <span className={styles.teacherDraftResultTitle}>
                    <FormattedMessage {...messages.lessonPrepDraft} />
                </span>
                <TeacherDraftStatus
                    blocked={Boolean(reply && reply.blocked)}
                    error={error}
                />
            </div>
            {error || (reply && reply.blocked) ? null : prep ? (
                <div className={styles.teacherDraftBody}>
                    <h4 className={styles.teacherDraftSubhead}>
                        <FormattedMessage {...messages.teacherTaskCard} />
                    </h4>
                    <p className={styles.teacherDraftPhrase}>
                        {prep.taskCard.studentGoal}
                    </p>
                    <DraftList items={prep.taskCard.steps} />
                    <div className={styles.teacherChipList}>
                        {prep.lockedKnowledgePoints.map(point => (
                            <span
                                className={styles.teacherChip}
                                key={point.id}
                            >
                                {point.label}
                            </span>
                        ))}
                    </div>
                    <h4 className={styles.teacherDraftSubhead}>
                        <FormattedMessage {...messages.teacherExplainGateQuestions} />
                    </h4>
                    <DraftList items={prep.explainGateQuestions} />
                    <h4 className={styles.teacherDraftSubhead}>
                        <FormattedMessage {...messages.teacherAIWhitelist} />
                    </h4>
                    <DraftList items={prep.aiWhitelist.allowedHelp.concat(prep.aiWhitelist.disallowedHelp)} />
                    <h4 className={styles.teacherDraftSubhead}>
                        <FormattedMessage {...messages.teacherRubric} />
                    </h4>
                    <DraftList items={prep.rubric.map(item => `${item.label}: ${item.criteria}`)} />
                </div>
            ) : (
                <span className={styles.teacherDraftEmpty}>
                    <FormattedMessage {...messages.noLessonPrepDraft} />
                </span>
            )}
        </div>
    );
};

LessonPrepResult.propTypes = {
    error: PropTypes.string,
    reply: lessonPrepReplyShape
};

const TeacherClassSessionButton = ({
    active,
    classSessionId,
    onSelect
}) => {
    const handleSelect = useCallback(() => {
        onSelect(classSessionId);
    }, [
        classSessionId,
        onSelect
    ]);

    return (
        <button
            aria-pressed={active}
            className={mergeClassNames([
                styles.teacherClassSessionButton,
                active ? styles.teacherClassSessionButtonActive : null
            ])}
            title={classSessionId}
            type="button"
            onClick={handleSelect}
        >
            <span className={styles.teacherClassSessionName}>
                {classSessionId}
            </span>
            {active ? (
                <span className={styles.teacherClassSessionActiveBadge}>
                    <FormattedMessage {...messages.teacherClassActive} />
                </span>
            ) : null}
        </button>
    );
};

TeacherClassSessionButton.propTypes = {
    active: PropTypes.bool,
    classSessionId: PropTypes.string.isRequired,
    onSelect: PropTypes.func.isRequired
};

const TeacherAccountAdminRow = ({
    account,
    onSelect
}) => {
    const intl = useIntl();
    const handleSelect = useCallback(() => {
        onSelect(account);
    }, [
        account,
        onSelect
    ]);

    return (
        <div className={styles.teacherAdminAccountRow}>
            <div className={styles.teacherAccountIdentity}>
                <span className={styles.teacherAccountName}>
                    {account.displayName || account.teacherId}
                </span>
                <span className={styles.teacherAccountMeta}>
                    {account.teacherId} / {account.role} / {account.active === false ?
                        intl.formatMessage(messages.teacherAdminInactive) :
                        intl.formatMessage(messages.teacherAdminActive)}
                </span>
            </div>
            <button
                className={styles.teacherSecondaryButton}
                type="button"
                onClick={handleSelect}
            >
                <FormattedMessage {...messages.teacherAdminEdit} />
            </button>
        </div>
    );
};

TeacherAccountAdminRow.propTypes = {
    account: PropTypes.shape({
        active: PropTypes.bool,
        displayName: PropTypes.string,
        role: PropTypes.string,
        teacherId: PropTypes.string
    }).isRequired,
    onSelect: PropTypes.func.isRequired
};

const TeacherAccountAdminPanel = ({
    accountDisplayName,
    accountPassword,
    accountRole,
    accountClassSessionIdsText,
    accountTeacherId,
    reply,
    status,
    error,
    onAccountClassSessionIdsTextChange,
    onAccountDisplayNameChange,
    onAccountPasswordChange,
    onAccountRoleChange,
    onAccountTeacherIdChange,
    onAccountSelect,
    onActivateAccount,
    onCreateAccount,
    onDeactivateAccount,
    onRefreshAccounts,
    onResetAccountPassword,
    onUpdateAccount
}) => {
    const intl = useIntl();
    const accounts = reply && Array.isArray(reply.accounts) ? reply.accounts : [];
    const isLoading = status === TEACHER_DRAFT_STATUSES.LOADING;
    const hasSelectedAccount = accounts.some(account => account.teacherId === accountTeacherId);
    const canCreate = !isLoading &&
        isTextComplete(accountTeacherId) &&
        isTextComplete(accountPassword) &&
        isTextComplete(accountClassSessionIdsText);
    const canUpdate = !isLoading &&
        hasSelectedAccount &&
        isTextComplete(accountClassSessionIdsText);
    const canResetPassword = !isLoading && hasSelectedAccount && isTextComplete(accountPassword);
    const canToggleActive = !isLoading && hasSelectedAccount;
    const isSelectedAccountActive = hasSelectedAccount ?
        accounts.find(account => account.teacherId === accountTeacherId).active !== false :
        false;

    return (
        <div
            className={styles.teacherAdminPanel}
            data-schema={TEACHER_ACCOUNT_ADMIN_UI_SCHEMA_ID}
            data-testid="ai-logic-coach-teacher-account-admin"
        >
            <div className={styles.teacherAccountHeader}>
                <div className={styles.teacherAccountIdentity}>
                    <h5 className={styles.teacherAccountTitle}>
                        <FormattedMessage {...messages.teacherAdminAccounts} />
                    </h5>
                    {reply && !reply.blocked ? (
                        <span className={styles.teacherAccountMeta}>
                            <FormattedMessage
                                {...messages.teacherAdminReady}
                                values={{
                                    count: accounts.length
                                }}
                            />
                        </span>
                    ) : null}
                </div>
                <button
                    className={styles.teacherSecondaryButton}
                    data-testid="ai-logic-coach-teacher-admin-refresh"
                    disabled={isLoading}
                    type="button"
                    onClick={onRefreshAccounts}
                >
                    {isLoading ? (
                        <FormattedMessage {...messages.teacherAdminLoading} />
                    ) : (
                        <FormattedMessage {...messages.teacherAdminRefresh} />
                    )}
                </button>
            </div>
            {error ? (
                <span className={styles.teacherDraftError}>
                    <FormattedMessage {...messages.teacherAdminError} />
                </span>
            ) : null}
            {reply && reply.blocked ? (
                <span className={styles.teacherDraftError}>
                    <FormattedMessage {...messages.teacherAdminBlocked} />
                </span>
            ) : null}
            {accounts.length ? (
                <div className={styles.teacherAdminAccountList}>
                    {accounts.map(account => (
                        <TeacherAccountAdminRow
                            account={account}
                            key={account.teacherId}
                            onSelect={onAccountSelect}
                        />
                    ))}
                </div>
            ) : null}
            <div className={styles.teacherAdminFormGrid}>
                <label
                    className={styles.teacherField}
                    htmlFor="ai-logic-coach-admin-teacher-id"
                >
                    <span className={styles.teacherFieldLabel}>
                        <FormattedMessage {...messages.teacherAdminTeacherId} />
                    </span>
                    <input
                        id="ai-logic-coach-admin-teacher-id"
                        className={styles.teacherInput}
                        data-testid="ai-logic-coach-admin-teacher-id"
                        maxLength="80"
                        value={accountTeacherId}
                        onChange={onAccountTeacherIdChange}
                    />
                </label>
                <label
                    className={styles.teacherField}
                    htmlFor="ai-logic-coach-admin-display-name"
                >
                    <span className={styles.teacherFieldLabel}>
                        <FormattedMessage {...messages.teacherAdminDisplayName} />
                    </span>
                    <input
                        id="ai-logic-coach-admin-display-name"
                        className={styles.teacherInput}
                        data-testid="ai-logic-coach-admin-display-name"
                        maxLength="80"
                        value={accountDisplayName}
                        onChange={onAccountDisplayNameChange}
                    />
                </label>
                <label
                    className={styles.teacherField}
                    htmlFor="ai-logic-coach-admin-role"
                >
                    <span className={styles.teacherFieldLabel}>
                        <FormattedMessage {...messages.teacherAdminRole} />
                    </span>
                    <select
                        id="ai-logic-coach-admin-role"
                        className={styles.teacherSelect}
                        data-testid="ai-logic-coach-admin-role"
                        value={accountRole}
                        onChange={onAccountRoleChange}
                    >
                        <option value="teacher">
                            <FormattedMessage {...messages.teacherRoleTeacher} />
                        </option>
                        <option value="admin">
                            <FormattedMessage {...messages.teacherRoleAdmin} />
                        </option>
                    </select>
                </label>
                <label
                    className={styles.teacherField}
                    htmlFor="ai-logic-coach-admin-password"
                >
                    <span className={styles.teacherFieldLabel}>
                        <FormattedMessage {...messages.teacherAdminNewPassword} />
                    </span>
                    <input
                        id="ai-logic-coach-admin-password"
                        className={styles.teacherInput}
                        data-testid="ai-logic-coach-admin-password"
                        maxLength="160"
                        type="password"
                        value={accountPassword}
                        onChange={onAccountPasswordChange}
                    />
                </label>
            </div>
            <label
                className={styles.teacherField}
                htmlFor="ai-logic-coach-admin-class-sessions"
            >
                <span className={styles.teacherFieldLabel}>
                    <FormattedMessage {...messages.teacherAdminClasses} />
                </span>
                <textarea
                    id="ai-logic-coach-admin-class-sessions"
                    className={styles.teacherTextarea}
                    data-testid="ai-logic-coach-admin-class-sessions"
                    maxLength="240"
                    placeholder={intl.formatMessage(messages.teacherAdminClassesPlaceholder)}
                    value={accountClassSessionIdsText}
                    onChange={onAccountClassSessionIdsTextChange}
                />
            </label>
            <div className={styles.teacherActionRow}>
                <button
                    className={styles.teacherActionButton}
                    disabled={!canCreate}
                    type="button"
                    onClick={onCreateAccount}
                >
                    <FormattedMessage {...messages.teacherAdminCreate} />
                </button>
                <button
                    className={styles.teacherSecondaryButton}
                    disabled={!canUpdate}
                    type="button"
                    onClick={onUpdateAccount}
                >
                    <FormattedMessage {...messages.teacherAdminUpdate} />
                </button>
                <button
                    className={styles.teacherSecondaryButton}
                    disabled={!canResetPassword}
                    type="button"
                    onClick={onResetAccountPassword}
                >
                    <FormattedMessage {...messages.teacherAdminResetPassword} />
                </button>
                {isSelectedAccountActive ? (
                    <button
                        className={styles.teacherSecondaryButton}
                        disabled={!canToggleActive}
                        type="button"
                        onClick={onDeactivateAccount}
                    >
                        <FormattedMessage {...messages.teacherAdminDeactivate} />
                    </button>
                ) : (
                    <button
                        className={styles.teacherSecondaryButton}
                        disabled={!canToggleActive}
                        type="button"
                        onClick={onActivateAccount}
                    >
                        <FormattedMessage {...messages.teacherAdminActivate} />
                    </button>
                )}
            </div>
        </div>
    );
};

TeacherAccountAdminPanel.propTypes = {
    accountClassSessionIdsText: PropTypes.string,
    accountDisplayName: PropTypes.string,
    accountPassword: PropTypes.string,
    accountRole: PropTypes.string,
    accountTeacherId: PropTypes.string,
    error: PropTypes.string,
    reply: teacherAccountAdminReplyShape,
    status: PropTypes.string,
    onAccountClassSessionIdsTextChange: PropTypes.func.isRequired,
    onAccountDisplayNameChange: PropTypes.func.isRequired,
    onAccountPasswordChange: PropTypes.func.isRequired,
    onAccountRoleChange: PropTypes.func.isRequired,
    onAccountSelect: PropTypes.func.isRequired,
    onAccountTeacherIdChange: PropTypes.func.isRequired,
    onActivateAccount: PropTypes.func.isRequired,
    onCreateAccount: PropTypes.func.isRequired,
    onDeactivateAccount: PropTypes.func.isRequired,
    onRefreshAccounts: PropTypes.func.isRequired,
    onResetAccountPassword: PropTypes.func.isRequired,
    onUpdateAccount: PropTypes.func.isRequired
};

const TeacherTools = ({
    activeClassSessionId,
    activeKnowledgeLockError,
    activeKnowledgeLockReply,
    activeKnowledgeLockStatus,
    gradeBand,
    knowledgeLockError,
    knowledgeLockReply,
    knowledgeLockStatus,
    lessonDuration,
    lessonGoal,
    lessonPrepError,
    lessonPrepReply,
    lessonPrepStatus,
    lessonTitle,
    persistKnowledgeLock,
    selectedKnowledgePointIds,
    teacherClassSessionId,
    teacherConsent,
    teacherId,
    teacherPassword,
    teacherAccountAdminReply,
    teacherAccountAdminStatus,
    teacherAccountAdminError,
    teacherAdminClassSessionIdsText,
    teacherAdminDisplayName,
    teacherAdminPassword,
    teacherAdminRole,
    teacherAdminTeacherId,
    teacherSessionError,
    teacherSessionReply,
    teacherSessionStatus,
    onActiveClassSessionChange,
    onClassSessionChange,
    onGradeBandChange,
    onKnowledgePointToggle,
    onLessonDurationChange,
    onLessonGoalChange,
    onLessonTitleChange,
    onPersistKnowledgeLockChange,
    onSubmitKnowledgeLock,
    onSubmitLessonPrep,
    onTeacherConsentChange,
    onTeacherAccountSelect,
    onTeacherAdminActivateAccount,
    onTeacherAdminClassSessionIdsTextChange,
    onTeacherAdminCreateAccount,
    onTeacherAdminDeactivateAccount,
    onTeacherAdminDisplayNameChange,
    onTeacherAdminPasswordChange,
    onTeacherAdminRefreshAccounts,
    onTeacherAdminResetPassword,
    onTeacherAdminRoleChange,
    onTeacherAdminTeacherIdChange,
    onTeacherAdminUpdateAccount,
    onTeacherIdChange,
    onTeacherLogin,
    onTeacherLogout,
    onTeacherPasswordChange,
    onRefreshActiveKnowledgeLock,
    onClassSessionSelect
}) => {
    const intl = useIntl();
    const isKnowledgeLockLoading = knowledgeLockStatus === TEACHER_DRAFT_STATUSES.LOADING;
    const isLessonPrepLoading = lessonPrepStatus === TEACHER_DRAFT_STATUSES.LOADING;
    const isTeacherSessionLoading = teacherSessionStatus === TEACHER_DRAFT_STATUSES.LOADING;
    const isActiveKnowledgeLockLoading = activeKnowledgeLockStatus === TEACHER_DRAFT_STATUSES.LOADING;
    const teacherClassSessionIds = teacherSessionReply &&
        teacherSessionReply.teacher &&
        Array.isArray(teacherSessionReply.teacher.classSessionIds) ?
        teacherSessionReply.teacher.classSessionIds :
        [];
    const hasTeacherSession = Boolean(
        teacherSessionReply &&
        !teacherSessionReply.blocked &&
        teacherSessionReply.teacherSessionToken &&
        teacherClassSessionIds.length
    );
    const canSubmitTeacherLogin = teacherConsent &&
        isTextComplete(teacherId) &&
        isTextComplete(teacherPassword) &&
        !isTeacherSessionLoading;
    const canLoadActiveKnowledgeLock = isTextComplete(activeClassSessionId) && !isActiveKnowledgeLockLoading;
    const canPersistKnowledgeLock = !persistKnowledgeLock || (hasTeacherSession && teacherClassSessionId);
    const canSubmitKnowledgeLock = teacherConsent &&
        selectedKnowledgePointIds.length > 0 &&
        canPersistKnowledgeLock &&
        !isKnowledgeLockLoading;
    const canSubmitLessonPrep = teacherConsent && isTextComplete(lessonGoal) && !isLessonPrepLoading;
    const teacherDisplayName = teacherSessionReply &&
        teacherSessionReply.teacher &&
        (teacherSessionReply.teacher.displayName || teacherSessionReply.teacher.teacherId);
    const teacherAccountId = teacherSessionReply &&
        teacherSessionReply.teacher &&
        teacherSessionReply.teacher.teacherId;
    const teacherRole = teacherSessionReply &&
        teacherSessionReply.teacher &&
        teacherSessionReply.teacher.role === 'admin' ?
        intl.formatMessage(messages.teacherRoleAdmin) :
        intl.formatMessage(messages.teacherRoleTeacher);
    const hasTeacherAdminSession = Boolean(
        hasTeacherSession &&
        teacherSessionReply &&
        teacherSessionReply.teacher &&
        teacherSessionReply.teacher.role === 'admin'
    );
    const teacherSessionExpiresAt = teacherSessionReply &&
        teacherSessionReply.session &&
        formatTeacherSessionExpiresAt(intl, teacherSessionReply.session.expiresAt);
    const activeKnowledgeLock = activeKnowledgeLockReply &&
        activeKnowledgeLockReply.active !== false &&
        activeKnowledgeLockReply.knowledgeLock;
    const activeKnowledgeLockPointLabels = activeKnowledgeLock &&
        Array.isArray(activeKnowledgeLock.selectedKnowledgePoints) ?
        activeKnowledgeLock.selectedKnowledgePoints
            .map(point => point && point.label)
            .filter(Boolean)
            .join(', ') :
        '';

    return (
        <div
            className={styles.teacherTools}
            data-testid="ai-logic-coach-teacher-tools"
        >
            <label className={styles.teacherConsent}>
                <input
                    checked={teacherConsent}
                    data-testid="ai-logic-coach-teacher-consent"
                    type="checkbox"
                    onChange={onTeacherConsentChange}
                />
                <span>
                    <FormattedMessage {...messages.teacherConsentLabel} />
                </span>
            </label>
            <div className={styles.teacherToolBlock}>
                <h4 className={styles.teacherToolTitle}>
                    <FormattedMessage {...messages.teacherSession} />
                </h4>
                <label
                    className={styles.teacherField}
                    htmlFor="ai-logic-coach-teacher-id"
                >
                    <span className={styles.teacherFieldLabel}>
                        <FormattedMessage {...messages.teacherIdLabel} />
                    </span>
                    <input
                        id="ai-logic-coach-teacher-id"
                        className={styles.teacherInput}
                        data-testid="ai-logic-coach-teacher-id"
                        maxLength="80"
                        placeholder={intl.formatMessage(messages.teacherIdPlaceholder)}
                        value={teacherId}
                        onChange={onTeacherIdChange}
                    />
                </label>
                <label
                    className={styles.teacherField}
                    htmlFor="ai-logic-coach-teacher-password"
                >
                    <span className={styles.teacherFieldLabel}>
                        <FormattedMessage {...messages.teacherPasswordLabel} />
                    </span>
                    <input
                        id="ai-logic-coach-teacher-password"
                        className={styles.teacherInput}
                        data-testid="ai-logic-coach-teacher-password"
                        maxLength="160"
                        placeholder={intl.formatMessage(messages.teacherPasswordPlaceholder)}
                        type="password"
                        value={teacherPassword}
                        onChange={onTeacherPasswordChange}
                    />
                </label>
                <div className={styles.teacherActionRow}>
                    <button
                        type="button"
                        className={styles.teacherActionButton}
                        disabled={!canSubmitTeacherLogin}
                        data-testid="ai-logic-coach-teacher-login"
                        onClick={onTeacherLogin}
                    >
                        {isTeacherSessionLoading ? (
                            <FormattedMessage {...messages.teacherLoggingIn} />
                        ) : (
                            <FormattedMessage {...messages.teacherLogin} />
                        )}
                    </button>
                    {teacherSessionError ? (
                        <span className={styles.teacherDraftError}>
                            <FormattedMessage {...messages.teacherLoginError} />
                        </span>
                    ) : null}
                    {teacherSessionReply && teacherSessionReply.blocked ? (
                        <span className={styles.teacherDraftError}>
                            <FormattedMessage {...messages.teacherLoginBlocked} />
                        </span>
                    ) : null}
                    {hasTeacherSession ? (
                        <span className={styles.teacherDraftSavedBadge}>
                            <FormattedMessage
                                {...messages.teacherLoginReady}
                                values={{
                                    teacher: teacherDisplayName
                                }}
                            />
                        </span>
                    ) : null}
                </div>
                {hasTeacherSession ? (
                    <div
                        className={styles.teacherAccountPanel}
                        data-schema={TEACHER_ACCOUNT_MANAGEMENT_UI_SCHEMA_ID}
                        data-testid="ai-logic-coach-teacher-account-panel"
                    >
                        <div className={styles.teacherAccountHeader}>
                            <div className={styles.teacherAccountIdentity}>
                                <h5 className={styles.teacherAccountTitle}>
                                    <FormattedMessage {...messages.teacherAccountSummary} />
                                </h5>
                                <span className={styles.teacherAccountName}>
                                    {teacherDisplayName}
                                </span>
                                {teacherAccountId ? (
                                    <span className={styles.teacherAccountMeta}>
                                        <FormattedMessage
                                            {...messages.teacherAccountTeacherId}
                                            values={{
                                                teacherId: teacherAccountId
                                            }}
                                        />
                                    </span>
                                ) : null}
                            </div>
                            <button
                                className={styles.teacherSecondaryButton}
                                data-testid="ai-logic-coach-teacher-logout"
                                type="button"
                                onClick={onTeacherLogout}
                            >
                                <FormattedMessage {...messages.teacherSignOut} />
                            </button>
                        </div>
                        <div className={styles.teacherAccountStats}>
                            <span className={styles.teacherAccountStat}>
                                <FormattedMessage
                                    {...messages.teacherAccountRole}
                                    values={{
                                        role: teacherRole
                                    }}
                                />
                            </span>
                            <span className={styles.teacherAccountStat}>
                                <FormattedMessage
                                    {...messages.teacherAccountClasses}
                                    values={{
                                        count: teacherClassSessionIds.length
                                    }}
                                />
                            </span>
                            {teacherSessionExpiresAt ? (
                                <span className={styles.teacherAccountStat}>
                                    <FormattedMessage
                                        {...messages.teacherSessionExpiresAt}
                                        values={{
                                            expiresAt: teacherSessionExpiresAt
                                        }}
                                    />
                                </span>
                            ) : null}
                        </div>
                        <div className={styles.teacherAssignedClassList}>
                            <span className={styles.teacherFieldLabel}>
                                <FormattedMessage {...messages.teacherAssignedClasses} />
                            </span>
                            <div className={styles.teacherClassSessionList}>
                                {teacherClassSessionIds.map(classSessionId => (
                                    <TeacherClassSessionButton
                                        active={classSessionId === teacherClassSessionId}
                                        classSessionId={classSessionId}
                                        key={classSessionId}
                                        onSelect={onClassSessionSelect}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}
                {hasTeacherSession ? (
                    <label
                        className={styles.teacherField}
                        htmlFor="ai-logic-coach-class-session"
                    >
                        <span className={styles.teacherFieldLabel}>
                            <FormattedMessage {...messages.teacherClassSessionLabel} />
                        </span>
                        <select
                            id="ai-logic-coach-class-session"
                            className={styles.teacherSelect}
                            data-testid="ai-logic-coach-class-session"
                            value={teacherClassSessionId}
                            onChange={onClassSessionChange}
                        >
                            {teacherClassSessionIds.map(classSessionId => (
                                <option
                                    key={classSessionId}
                                    value={classSessionId}
                                >
                                    {classSessionId}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}
                {hasTeacherAdminSession ? (
                    <TeacherAccountAdminPanel
                        accountClassSessionIdsText={teacherAdminClassSessionIdsText}
                        accountDisplayName={teacherAdminDisplayName}
                        accountPassword={teacherAdminPassword}
                        accountRole={teacherAdminRole}
                        accountTeacherId={teacherAdminTeacherId}
                        error={teacherAccountAdminError}
                        reply={teacherAccountAdminReply}
                        status={teacherAccountAdminStatus}
                        onAccountClassSessionIdsTextChange={onTeacherAdminClassSessionIdsTextChange}
                        onAccountDisplayNameChange={onTeacherAdminDisplayNameChange}
                        onAccountPasswordChange={onTeacherAdminPasswordChange}
                        onAccountRoleChange={onTeacherAdminRoleChange}
                        onAccountSelect={onTeacherAccountSelect}
                        onAccountTeacherIdChange={onTeacherAdminTeacherIdChange}
                        onActivateAccount={onTeacherAdminActivateAccount}
                        onCreateAccount={onTeacherAdminCreateAccount}
                        onDeactivateAccount={onTeacherAdminDeactivateAccount}
                        onRefreshAccounts={onTeacherAdminRefreshAccounts}
                        onResetAccountPassword={onTeacherAdminResetPassword}
                        onUpdateAccount={onTeacherAdminUpdateAccount}
                    />
                ) : null}
            </div>
            <div className={styles.teacherToolBlock}>
                <h4 className={styles.teacherToolTitle}>
                    <FormattedMessage {...messages.activeKnowledgeLock} />
                </h4>
                <label
                    className={styles.teacherField}
                    htmlFor="ai-logic-coach-active-class-session"
                >
                    <span className={styles.teacherFieldLabel}>
                        <FormattedMessage {...messages.activeClassSessionLabel} />
                    </span>
                    <input
                        id="ai-logic-coach-active-class-session"
                        className={styles.teacherInput}
                        data-testid="ai-logic-coach-active-class-session"
                        maxLength="80"
                        placeholder={intl.formatMessage(messages.activeClassSessionPlaceholder)}
                        value={activeClassSessionId}
                        onChange={onActiveClassSessionChange}
                    />
                </label>
                <div className={styles.teacherActionRow}>
                    <button
                        type="button"
                        className={styles.teacherActionButton}
                        disabled={!canLoadActiveKnowledgeLock}
                        data-testid="ai-logic-coach-active-lock-load"
                        onClick={onRefreshActiveKnowledgeLock}
                    >
                        {isActiveKnowledgeLockLoading ? (
                            <FormattedMessage {...messages.loadingActiveKnowledgeLock} />
                        ) : (
                            <FormattedMessage {...messages.loadActiveKnowledgeLock} />
                        )}
                    </button>
                    {activeKnowledgeLockError ? (
                        <span className={styles.teacherDraftError}>
                            <FormattedMessage {...messages.activeKnowledgeLockError} />
                        </span>
                    ) : null}
                    {!activeKnowledgeLockError &&
                        activeKnowledgeLockStatus === TEACHER_DRAFT_STATUSES.READY &&
                        !activeKnowledgeLock ? (
                            <span className={styles.teacherDraftBadge}>
                                <FormattedMessage {...messages.activeKnowledgeLockEmpty} />
                            </span>
                        ) : null}
                    {activeKnowledgeLock ? (
                        <span className={styles.teacherDraftSavedBadge}>
                            <FormattedMessage
                                {...messages.activeKnowledgeLockReady}
                                values={{
                                    points: activeKnowledgeLockPointLabels || activeKnowledgeLock.title
                                }}
                            />
                        </span>
                    ) : null}
                </div>
            </div>
            <label
                className={styles.teacherField}
                htmlFor="ai-logic-coach-teacher-grade"
            >
                <span className={styles.teacherFieldLabel}>
                    <FormattedMessage {...messages.teacherGradeLabel} />
                </span>
                <select
                    id="ai-logic-coach-teacher-grade"
                    className={styles.teacherSelect}
                    value={gradeBand}
                    onChange={onGradeBandChange}
                >
                    <option value={GRADE_BANDS.LOWER_PRIMARY}>
                        {intl.formatMessage(messages.teacherGradeLower)}
                    </option>
                    <option value={GRADE_BANDS.UPPER_PRIMARY}>
                        {intl.formatMessage(messages.teacherGradeUpper)}
                    </option>
                    <option value={GRADE_BANDS.MIDDLE_SCHOOL}>
                        {intl.formatMessage(messages.teacherGradeMiddle)}
                    </option>
                </select>
            </label>
            {aiFeatureFlags.scratchAIKnowledgeLockEnabled ? (
                <div className={styles.teacherToolBlock}>
                    <h4 className={styles.teacherToolTitle}>
                        <FormattedMessage {...messages.knowledgeLock} />
                    </h4>
                    <label
                        className={styles.teacherField}
                        htmlFor="ai-logic-coach-lesson-title"
                    >
                        <span className={styles.teacherFieldLabel}>
                            <FormattedMessage {...messages.lessonTitleLabel} />
                        </span>
                        <input
                            id="ai-logic-coach-lesson-title"
                            className={styles.teacherInput}
                            data-testid="ai-logic-coach-lesson-title"
                            maxLength="80"
                            placeholder={intl.formatMessage(messages.lessonTitlePlaceholder)}
                            value={lessonTitle}
                            onChange={onLessonTitleChange}
                        />
                    </label>
                    <span className={styles.teacherFieldLabel}>
                        <FormattedMessage {...messages.knowledgePointsLabel} />
                    </span>
                    <div className={styles.knowledgePointGrid}>
                        {TEACHER_KNOWLEDGE_POINTS.map(point => (
                            <KnowledgePointButton
                                active={selectedKnowledgePointIds.includes(point.id)}
                                key={point.id}
                                point={point}
                                onToggle={onKnowledgePointToggle}
                            />
                        ))}
                    </div>
                    <label className={styles.teacherConsent}>
                        <input
                            checked={persistKnowledgeLock}
                            data-testid="ai-logic-coach-persist-knowledge-lock"
                            disabled={!hasTeacherSession}
                            type="checkbox"
                            onChange={onPersistKnowledgeLockChange}
                        />
                        <span>
                            <FormattedMessage {...messages.teacherSaveToClass} />
                        </span>
                    </label>
                    {persistKnowledgeLock && !hasTeacherSession ? (
                        <span className={styles.teacherDraftError}>
                            <FormattedMessage {...messages.teacherSaveRequiresSession} />
                        </span>
                    ) : null}
                    <div className={styles.teacherActionRow}>
                        <button
                            type="button"
                            className={styles.teacherActionButton}
                            disabled={!canSubmitKnowledgeLock}
                            data-testid="ai-logic-coach-knowledge-lock-submit"
                            onClick={onSubmitKnowledgeLock}
                        >
                            {isKnowledgeLockLoading ? (
                                <FormattedMessage {...messages.savingKnowledgeLockDraft} />
                            ) : persistKnowledgeLock ? (
                                <FormattedMessage {...messages.saveKnowledgeLockToClass} />
                            ) : (
                                <FormattedMessage {...messages.saveKnowledgeLockDraft} />
                            )}
                        </button>
                    </div>
                    <KnowledgeLockResult
                        error={knowledgeLockError}
                        reply={knowledgeLockReply}
                    />
                </div>
            ) : null}
            {aiFeatureFlags.scratchAILessonPrepEnabled ? (
                <div className={styles.teacherToolBlock}>
                    <h4 className={styles.teacherToolTitle}>
                        <FormattedMessage {...messages.lessonPrep} />
                    </h4>
                    <label
                        className={styles.teacherField}
                        htmlFor="ai-logic-coach-lesson-goal"
                    >
                        <span className={styles.teacherFieldLabel}>
                            <FormattedMessage {...messages.lessonGoalLabel} />
                        </span>
                        <textarea
                            id="ai-logic-coach-lesson-goal"
                            className={styles.teacherTextarea}
                            data-testid="ai-logic-coach-lesson-goal"
                            maxLength="360"
                            placeholder={intl.formatMessage(messages.lessonGoalPlaceholder)}
                            rows="2"
                            value={lessonGoal}
                            onChange={onLessonGoalChange}
                        />
                    </label>
                    <label
                        className={styles.teacherField}
                        htmlFor="ai-logic-coach-lesson-duration"
                    >
                        <span className={styles.teacherFieldLabel}>
                            <FormattedMessage {...messages.lessonDurationLabel} />
                        </span>
                        <input
                            id="ai-logic-coach-lesson-duration"
                            className={styles.teacherInput}
                            max="120"
                            min="20"
                            type="number"
                            value={lessonDuration}
                            onChange={onLessonDurationChange}
                        />
                    </label>
                    <div className={styles.teacherActionRow}>
                        <button
                            type="button"
                            className={styles.teacherActionButton}
                            disabled={!canSubmitLessonPrep}
                            data-testid="ai-logic-coach-lesson-prep-submit"
                            onClick={onSubmitLessonPrep}
                        >
                            {isLessonPrepLoading ? (
                                <FormattedMessage {...messages.makingLessonPrepDraft} />
                            ) : (
                                <FormattedMessage {...messages.makeLessonPrepDraft} />
                            )}
                        </button>
                    </div>
                    <LessonPrepResult
                        error={lessonPrepError}
                        reply={lessonPrepReply}
                    />
                </div>
            ) : null}
        </div>
    );
};

TeacherTools.propTypes = {
    activeClassSessionId: PropTypes.string,
    activeKnowledgeLockError: PropTypes.string,
    activeKnowledgeLockReply: knowledgeLockReplyShape,
    activeKnowledgeLockStatus: PropTypes.string,
    gradeBand: PropTypes.string,
    knowledgeLockError: PropTypes.string,
    knowledgeLockReply: knowledgeLockReplyShape,
    knowledgeLockStatus: PropTypes.string,
    lessonDuration: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    lessonGoal: PropTypes.string,
    lessonPrepError: PropTypes.string,
    lessonPrepReply: lessonPrepReplyShape,
    lessonPrepStatus: PropTypes.string,
    lessonTitle: PropTypes.string,
    onActiveClassSessionChange: PropTypes.func.isRequired,
    onClassSessionChange: PropTypes.func.isRequired,
    onClassSessionSelect: PropTypes.func.isRequired,
    onGradeBandChange: PropTypes.func.isRequired,
    onKnowledgePointToggle: PropTypes.func.isRequired,
    onLessonDurationChange: PropTypes.func.isRequired,
    onLessonGoalChange: PropTypes.func.isRequired,
    onLessonTitleChange: PropTypes.func.isRequired,
    onPersistKnowledgeLockChange: PropTypes.func.isRequired,
    onSubmitKnowledgeLock: PropTypes.func.isRequired,
    onSubmitLessonPrep: PropTypes.func.isRequired,
    onTeacherAccountSelect: PropTypes.func.isRequired,
    onTeacherAdminActivateAccount: PropTypes.func.isRequired,
    onTeacherAdminClassSessionIdsTextChange: PropTypes.func.isRequired,
    onTeacherAdminCreateAccount: PropTypes.func.isRequired,
    onTeacherAdminDeactivateAccount: PropTypes.func.isRequired,
    onTeacherAdminDisplayNameChange: PropTypes.func.isRequired,
    onTeacherAdminPasswordChange: PropTypes.func.isRequired,
    onTeacherAdminRefreshAccounts: PropTypes.func.isRequired,
    onTeacherAdminResetPassword: PropTypes.func.isRequired,
    onTeacherAdminRoleChange: PropTypes.func.isRequired,
    onTeacherAdminTeacherIdChange: PropTypes.func.isRequired,
    onTeacherAdminUpdateAccount: PropTypes.func.isRequired,
    onTeacherConsentChange: PropTypes.func.isRequired,
    onTeacherIdChange: PropTypes.func.isRequired,
    onTeacherLogin: PropTypes.func.isRequired,
    onTeacherLogout: PropTypes.func.isRequired,
    onTeacherPasswordChange: PropTypes.func.isRequired,
    onRefreshActiveKnowledgeLock: PropTypes.func.isRequired,
    persistKnowledgeLock: PropTypes.bool,
    selectedKnowledgePointIds: PropTypes.arrayOf(PropTypes.string),
    teacherClassSessionId: PropTypes.string,
    teacherConsent: PropTypes.bool,
    teacherId: PropTypes.string,
    teacherPassword: PropTypes.string,
    teacherAccountAdminError: PropTypes.string,
    teacherAccountAdminReply: teacherAccountAdminReplyShape,
    teacherAccountAdminStatus: PropTypes.string,
    teacherAdminClassSessionIdsText: PropTypes.string,
    teacherAdminDisplayName: PropTypes.string,
    teacherAdminPassword: PropTypes.string,
    teacherAdminRole: PropTypes.string,
    teacherAdminTeacherId: PropTypes.string,
    teacherSessionError: PropTypes.string,
    teacherSessionReply: teacherSessionReplyShape,
    teacherSessionStatus: PropTypes.string
};

const ExplainGateField = ({
    id,
    isActive,
    label,
    onPathSelect,
    pathId,
    placeholder,
    value,
    onChange
}) => {
    const handleFocus = useCallback(() => {
        onPathSelect(pathId);
    }, [onPathSelect, pathId]);

    return (
        <label
            className={mergeClassNames([
                styles.gateField,
                isActive ? styles.pathActive : null
            ])}
            data-active-path={isActive ? true : null}
            data-path-id={pathId || null}
            htmlFor={id}
        >
            <span className={styles.gateLabel}>{label}</span>
            <textarea
                id={id}
                className={styles.gateTextarea}
                placeholder={placeholder}
                rows="2"
                value={value}
                onChange={onChange}
                onFocus={pathId ? handleFocus : null}
            />
        </label>
    );
};

ExplainGateField.propTypes = {
    id: PropTypes.string.isRequired,
    isActive: PropTypes.bool,
    label: PropTypes.node,
    onChange: PropTypes.func.isRequired,
    onPathSelect: PropTypes.func.isRequired,
    pathId: PropTypes.string,
    placeholder: PropTypes.string,
    value: PropTypes.string
};

const ReleaseDraftField = ({
    id,
    label,
    placeholder,
    value,
    onChange
}) => (
    <label
        className={styles.releaseField}
        htmlFor={id}
    >
        <span className={styles.releaseFieldLabel}>{label}</span>
        <textarea
            id={id}
            className={styles.releaseTextarea}
            placeholder={placeholder}
            rows="2"
            value={value}
            onChange={onChange}
        />
    </label>
);

ReleaseDraftField.propTypes = {
    id: PropTypes.string.isRequired,
    label: PropTypes.node,
    onChange: PropTypes.func.isRequired,
    placeholder: PropTypes.string,
    value: PropTypes.string
};

const ReleaseDraft = ({
    draft,
    summary,
    onFieldChange
}) => {
    const intl = useIntl();
    const isReady = summary.status === RELEASE_DRAFT_STATUSES.READY;

    return (
        <div
            className={styles.releaseDraft}
            data-testid="ai-logic-coach-release-draft"
        >
            <div className={styles.releaseSummaryRow}>
                <span className={styles.releaseVersion}>
                    <FormattedMessage {...messages.releaseDraftVersion} />
                </span>
                <span className={isReady ? styles.releaseReadyBadge : styles.releaseDraftingBadge}>
                    {isReady ? (
                        <FormattedMessage {...messages.releaseDraftReady} />
                    ) : (
                        <FormattedMessage {...messages.releaseDraftDrafting} />
                    )}
                </span>
            </div>
            <div
                className={styles.releaseSummary}
                data-testid="ai-logic-coach-release-summary"
            >
                <FormattedMessage
                    {...messages.releaseSummary}
                    values={{
                        sprites: summary.spriteCount,
                        starts: summary.startCount,
                        score: summary.checkScore,
                        maxScore: summary.checkMaxScore
                    }}
                />
            </div>
            <ReleaseDraftField
                id="ai-logic-coach-release-product-line"
                label={<FormattedMessage {...messages.releaseProductLine} />}
                placeholder={intl.formatMessage(messages.releaseProductLinePlaceholder)}
                value={draft.productLine}
                onChange={onFieldChange(RELEASE_DRAFT_FIELDS.PRODUCT_LINE)}
            />
            <ReleaseDraftField
                id="ai-logic-coach-release-user-feedback"
                label={<FormattedMessage {...messages.releaseUserFeedback} />}
                placeholder={intl.formatMessage(messages.releaseUserFeedbackPlaceholder)}
                value={draft.userFeedback}
                onChange={onFieldChange(RELEASE_DRAFT_FIELDS.USER_FEEDBACK)}
            />
            <ReleaseDraftField
                id="ai-logic-coach-release-iteration-plan"
                label={<FormattedMessage {...messages.releaseIterationPlan} />}
                placeholder={intl.formatMessage(messages.releaseIterationPlanPlaceholder)}
                value={draft.iterationPlan}
                onChange={onFieldChange(RELEASE_DRAFT_FIELDS.ITERATION_PLAN)}
            />
        </div>
    );
};

ReleaseDraft.propTypes = {
    draft: releaseDraftShape,
    onFieldChange: PropTypes.func.isRequired,
    summary: releaseDraftSummaryShape
};

const ReleasePreviewMetric = ({
    label,
    value
}) => (
    <div className={styles.releasePreviewMetric}>
        <span className={styles.releasePreviewMetricValue}>{value}</span>
        <span className={styles.releasePreviewMetricLabel}>{label}</span>
    </div>
);

ReleasePreviewMetric.propTypes = {
    label: PropTypes.node,
    value: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
};

const ReleasePreviewTextBlock = ({
    fallback,
    label,
    value
}) => (
    <div className={styles.releasePreviewTextBlock}>
        <span className={styles.releasePreviewLabel}>{label}</span>
        <span className={value ? styles.releasePreviewText : styles.releasePreviewPlaceholder}>
            {value || fallback}
        </span>
    </div>
);

ReleasePreviewTextBlock.propTypes = {
    fallback: PropTypes.node,
    label: PropTypes.node,
    value: PropTypes.string
};

const ReleasePreviewLogicFlow = ({flow}) => (
    <li className={styles.releasePreviewLogicItem}>
        <span>
            <FormattedMessage
                {...messages.releasePreviewLogicFlow}
                values={{
                    blocks: flow.blockCount,
                    entry: flow.triggerLabel,
                    script: flow.scriptIndex,
                    target: flow.targetName
                }}
            />
        </span>
        {flow.broadcastCount > 0 ? (
            <span className={styles.releasePreviewLogicMeta}>
                <FormattedMessage
                    {...messages.releasePreviewLogicBroadcasts}
                    values={{
                        count: flow.broadcastCount
                    }}
                />
            </span>
        ) : null}
    </li>
);

ReleasePreviewLogicFlow.propTypes = {
    flow: PropTypes.shape({
        blockCount: PropTypes.number,
        broadcastCount: PropTypes.number,
        scriptIndex: PropTypes.number,
        targetName: PropTypes.string,
        triggerLabel: PropTypes.string
    })
};

const ReleaseGateItemLabel = ({itemId}) => {
    switch (itemId) {
    case 'publishing':
        return <FormattedMessage {...messages.releaseGateItemPublishing} />;
    case 'explain-gate':
        return <FormattedMessage {...messages.releaseGateItemExplainGate} />;
    case 'release-draft':
        return <FormattedMessage {...messages.releaseGateItemReleaseDraft} />;
    case 'asset-adoption':
        return <FormattedMessage {...messages.releaseGateItemAssetAdoption} />;
    default:
        return itemId;
    }
};

ReleaseGateItemLabel.propTypes = {
    itemId: PropTypes.string
};

const ReleaseGateChecklist = ({releaseGate}) => (
    <div className={releaseGate.allowed ? styles.releaseGateReady : styles.releaseGateBlocked}>
        <div className={styles.releaseGateStatus}>
            {releaseGate.allowed ? (
                <FormattedMessage {...messages.releaseGateReady} />
            ) : (
                <FormattedMessage {...messages.releaseGateBlocked} />
            )}
        </div>
        <ul className={styles.releaseGateList}>
            {releaseGate.checklist.map(item => (
                <li
                    className={item.ready ? styles.releaseGateItemReady : styles.releaseGateItemBlocked}
                    key={item.id}
                >
                    <span className={styles.releaseGateMark}>
                        {item.ready ? 'OK' : '!'}
                    </span>
                    <span>
                        <ReleaseGateItemLabel itemId={item.id} />
                    </span>
                </li>
            ))}
        </ul>
    </div>
);

ReleaseGateChecklist.propTypes = {
    releaseGate: releaseGateShape
};

const TeacherRubricScoreItem = ({
    item,
    onEvidenceChange,
    onLevelChange
}) => {
    const handleLevelChange = useCallback(event => {
        onLevelChange(item.id, event.target.value);
    }, [item.id, onLevelChange]);
    const handleEvidenceChange = useCallback(event => {
        onEvidenceChange(item.id, event.target.value);
    }, [item.id, onEvidenceChange]);

    return (
        <div className={styles.teacherRubricReviewItem}>
            <div className={styles.teacherRubricReviewItemHeader}>
                <div className={styles.teacherRubricReviewItemText}>
                    <span className={styles.teacherRubricReviewItemTitle}>
                        {item.label}
                    </span>
                    <span className={styles.teacherRubricReviewCriteria}>
                        {item.criteria}
                    </span>
                </div>
                <label className={styles.teacherRubricScoreField}>
                    <span className={styles.teacherFieldLabel}>
                        <FormattedMessage {...messages.teacherRubricReviewScore} />
                    </span>
                    <select
                        className={styles.teacherSelect}
                        value={item.level}
                        onChange={handleLevelChange}
                    >
                        <option value="">
                            <FormattedMessage {...messages.teacherRubricReviewUnscored} />
                        </option>
                        {getTeacherRubricLevelOptions(item).map(option => (
                            <option
                                key={option.level}
                                value={option.level}
                            >
                                {option.level}: {option.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <label className={styles.teacherField}>
                <span className={styles.teacherFieldLabel}>
                    <FormattedMessage {...messages.teacherRubricReviewEvidence} />
                </span>
                <textarea
                    className={styles.teacherTextarea}
                    maxLength="120"
                    rows="2"
                    value={item.evidence}
                    onChange={handleEvidenceChange}
                />
            </label>
        </div>
    );
};

TeacherRubricScoreItem.propTypes = {
    item: PropTypes.shape({
        criteria: PropTypes.string,
        evidence: PropTypes.string,
        id: PropTypes.string,
        label: PropTypes.string,
        level: PropTypes.string,
        levels: PropTypes.arrayOf(PropTypes.string)
    }),
    onEvidenceChange: PropTypes.func.isRequired,
    onLevelChange: PropTypes.func.isRequired
};

const TeacherRubricReviewPanel = ({
    decision,
    notes,
    review,
    onDecisionChange,
    onEvidenceChange,
    onLevelChange,
    onNotesChange
}) => {
    const items = review && Array.isArray(review.items) ? review.items : [];
    const scoredCount = items.filter(item => item && item.level !== '').length;

    if (!items.length) return null;

    return (
        <div
            className={styles.teacherRubricReviewPanel}
            data-testid="ai-logic-coach-teacher-rubric-review"
        >
            <div className={styles.teacherRubricReviewHeader}>
                <h4 className={styles.releasePreviewGroupTitle}>
                    <FormattedMessage {...messages.teacherRubricReview} />
                </h4>
                <span className={styles.teacherRubricReviewProgress}>
                    <FormattedMessage
                        {...messages.teacherRubricReviewProgress}
                        values={{
                            scored: scoredCount,
                            total: items.length
                        }}
                    />
                </span>
            </div>
            <label className={styles.teacherField}>
                <span className={styles.teacherFieldLabel}>
                    <FormattedMessage {...messages.teacherRubricReviewDecision} />
                </span>
                <select
                    className={styles.teacherSelect}
                    value={decision}
                    onChange={onDecisionChange}
                >
                    <option value="approved">
                        <FormattedMessage {...messages.teacherRubricReviewApproved} />
                    </option>
                    <option value="needs-revision">
                        <FormattedMessage {...messages.teacherRubricReviewNeedsRevision} />
                    </option>
                </select>
            </label>
            <div className={styles.teacherRubricReviewItems}>
                {items.map(item => (
                    <TeacherRubricScoreItem
                        item={item}
                        key={item.id}
                        onEvidenceChange={onEvidenceChange}
                        onLevelChange={onLevelChange}
                    />
                ))}
            </div>
            <label className={styles.teacherField}>
                <span className={styles.teacherFieldLabel}>
                    <FormattedMessage {...messages.teacherRubricReviewNotes} />
                </span>
                <textarea
                    className={styles.teacherTextarea}
                    maxLength="120"
                    rows="2"
                    value={notes}
                    onChange={onNotesChange}
                />
            </label>
        </div>
    );
};

TeacherRubricReviewPanel.propTypes = {
    decision: PropTypes.string,
    notes: PropTypes.string,
    onDecisionChange: PropTypes.func.isRequired,
    onEvidenceChange: PropTypes.func.isRequired,
    onLevelChange: PropTypes.func.isRequired,
    onNotesChange: PropTypes.func.isRequired,
    review: teacherRubricReviewShape
};

const ReleaseApprovalStatus = ({status}) => {
    const normalizedStatus = status === 'approved' || status === 'needs-revision' ? status : 'pending';
    const statusMessage = normalizedStatus === 'approved' ? messages.releaseApprovalStatusApproved : (
        normalizedStatus === 'needs-revision' ?
            messages.releaseApprovalStatusNeedsRevision :
            messages.releaseApprovalStatusPending
    );

    return (
        <span
            className={mergeClassNames([
                styles.releaseApprovalStatus,
                normalizedStatus === 'approved' ? styles.releaseApprovalStatusApproved : null,
                normalizedStatus === 'needs-revision' ? styles.releaseApprovalStatusNeedsRevision : null,
                normalizedStatus === 'pending' ? styles.releaseApprovalStatusPending : null
            ])}
        >
            <FormattedMessage {...statusMessage} />
        </span>
    );
};

ReleaseApprovalStatus.propTypes = {
    status: PropTypes.string
};

const ReleaseApprovalQueueItem = ({
    currentHostedReleaseId,
    item,
    onSelect,
    selected
}) => {
    const checkValue = `${item.metrics.checkScore}/${item.metrics.checkMaxScore}`;
    const isCurrentHostedRelease = Boolean(currentHostedReleaseId && item.hostedReleaseId === currentHostedReleaseId);
    const handleSelect = useCallback(() => {
        onSelect(item);
    }, [
        item,
        onSelect
    ]);

    return (
        <li
            className={mergeClassNames([
                styles.releaseApprovalQueueItem,
                selected ? styles.releaseApprovalQueueItemSelected : null
            ])}
        >
            <div className={styles.releaseApprovalQueueTopline}>
                <ReleaseApprovalStatus status={item.teacherReview.status} />
                <span className={styles.releaseApprovalQueueVersion}>
                    {item.release.version}
                </span>
            </div>
            <span className={styles.releaseApprovalQueueTitle}>
                {item.release.title}
            </span>
            <span className={styles.releaseApprovalQueueMeta}>
                {item.hostedReleaseId} / {checkValue}
            </span>
            <div className={styles.releaseApprovalQueueActions}>
                {isCurrentHostedRelease ? (
                    <span className={styles.releaseApprovalCurrentBadge}>
                        <FormattedMessage {...messages.releaseApprovalQueueCurrentTarget} />
                    </span>
                ) : null}
                {item.publicUrl ? (
                    <a
                        className={styles.releaseApprovalQueueLink}
                        href={item.publicUrl}
                        rel="noreferrer"
                        target="_blank"
                    >
                        <FormattedMessage {...messages.releaseApprovalQueueOpen} />
                    </a>
                ) : null}
                <button
                    className={styles.releaseApprovalQueueButton}
                    type="button"
                    onClick={handleSelect}
                >
                    <FormattedMessage {...messages.releaseApprovalQueueScore} />
                </button>
            </div>
        </li>
    );
};

ReleaseApprovalQueueItem.propTypes = {
    currentHostedReleaseId: PropTypes.string,
    item: PropTypes.shape({
        hostedReleaseId: PropTypes.string,
        metrics: PropTypes.shape({
            checkMaxScore: PropTypes.number,
            checkScore: PropTypes.number
        }),
        publicUrl: PropTypes.string,
        release: PropTypes.shape({
            title: PropTypes.string,
            version: PropTypes.string
        }),
        teacherReview: PropTypes.shape({
            status: PropTypes.string
        })
    }),
    onSelect: PropTypes.func.isRequired,
    selected: PropTypes.bool
};

const ReleaseApprovalQueuePanel = ({
    currentHostedReleaseId,
    error,
    filterStatus,
    onFilterChange,
    onSearchChange,
    onSelectReviewTarget,
    queue,
    searchText,
    selectedHostedReleaseId
}) => {
    const intl = useIntl();

    if (error) {
        return (
            <div
                className={styles.releaseAuditError}
                data-testid="ai-logic-coach-release-approval-queue-result"
            >
                <FormattedMessage {...messages.releaseApprovalQueueError} />
            </div>
        );
    }

    if (!queue) return null;

    const workflow = createReleaseApprovalQueueWorkflow({
        filterStatus,
        queue,
        searchText,
        selectedHostedReleaseId
    });
    const items = Array.isArray(workflow.items) ? workflow.items : [];
    const totals = queue.totals || {};
    const workflowTotals = workflow.totals || {};
    const reviewTarget = workflow.reviewTarget;

    return (
        <div
            className={styles.releaseApprovalQueuePanel}
            data-schema={workflow.schemaVersion}
            data-testid="ai-logic-coach-release-approval-queue-result"
        >
            <div className={styles.teacherRubricReviewHeader}>
                <h4 className={styles.releasePreviewGroupTitle}>
                    <FormattedMessage {...messages.releaseApprovalQueue} />
                </h4>
                <span className={styles.teacherRubricReviewProgress}>
                    <FormattedMessage
                        {...messages.releaseApprovalQueueReady}
                        values={{
                            approved: totals.approved || 0,
                            needsRevision: totals.needsRevision || 0,
                            pending: totals.pending || 0
                        }}
                    />
                </span>
            </div>
            <div className={styles.releaseApprovalQueueControls}>
                <label
                    className={styles.releaseApprovalQueueField}
                    htmlFor="ai-logic-coach-release-approval-search"
                >
                    <span className={styles.teacherFieldLabel}>
                        <FormattedMessage {...messages.releaseApprovalQueueSearchLabel} />
                    </span>
                    <input
                        id="ai-logic-coach-release-approval-search"
                        className={styles.teacherInput}
                        maxLength="160"
                        placeholder={intl.formatMessage(messages.releaseApprovalQueueSearchPlaceholder)}
                        value={searchText}
                        onChange={onSearchChange}
                    />
                </label>
                <label
                    className={styles.releaseApprovalQueueField}
                    htmlFor="ai-logic-coach-release-approval-status"
                >
                    <span className={styles.teacherFieldLabel}>
                        <FormattedMessage {...messages.releaseApprovalQueueStatusFilter} />
                    </span>
                    <select
                        id="ai-logic-coach-release-approval-status"
                        className={styles.teacherSelect}
                        value={filterStatus}
                        onChange={onFilterChange}
                    >
                        <option value={RELEASE_APPROVAL_QUEUE_FILTERS.ALL}>
                            {intl.formatMessage(messages.releaseApprovalQueueStatusAll)}
                        </option>
                        <option value={RELEASE_APPROVAL_QUEUE_FILTERS.PENDING}>
                            {intl.formatMessage(messages.releaseApprovalStatusPending)}
                        </option>
                        <option value={RELEASE_APPROVAL_QUEUE_FILTERS.NEEDS_REVISION}>
                            {intl.formatMessage(messages.releaseApprovalStatusNeedsRevision)}
                        </option>
                        <option value={RELEASE_APPROVAL_QUEUE_FILTERS.APPROVED}>
                            {intl.formatMessage(messages.releaseApprovalStatusApproved)}
                        </option>
                    </select>
                </label>
            </div>
            <span className={styles.releaseApprovalQueueMeta}>
                <FormattedMessage
                    {...messages.releaseApprovalQueueFiltered}
                    values={{
                        queued: workflowTotals.queued || 0,
                        shown: workflowTotals.filtered || 0
                    }}
                />
            </span>
            {reviewTarget ? (
                <div className={styles.releaseApprovalQueueTarget}>
                    <span className={styles.releaseApprovalQueueTitle}>
                        <FormattedMessage
                            {...messages.releaseApprovalQueueSelected}
                            values={{
                                releaseId: reviewTarget.hostedReleaseId
                            }}
                        />
                    </span>
                    <span className={styles.releaseApprovalQueueMeta}>
                        {reviewTarget.releaseTitle}
                    </span>
                </div>
            ) : null}
            {items.length ? (
                <ol className={styles.releaseApprovalQueueList}>
                    {items.slice(0, 12).map(item => (
                        <ReleaseApprovalQueueItem
                            currentHostedReleaseId={currentHostedReleaseId}
                            item={item}
                            key={item.hostedReleaseId}
                            selected={item.hostedReleaseId === workflow.selectedHostedReleaseId}
                            onSelect={onSelectReviewTarget}
                        />
                    ))}
                </ol>
            ) : (
                <div className={styles.releasePreviewPlaceholder}>
                    <FormattedMessage {...messages.releaseApprovalQueueEmpty} />
                </div>
            )}
        </div>
    );
};

ReleaseApprovalQueuePanel.propTypes = {
    currentHostedReleaseId: PropTypes.string,
    error: PropTypes.string,
    filterStatus: PropTypes.string,
    onFilterChange: PropTypes.func.isRequired,
    onSearchChange: PropTypes.func.isRequired,
    onSelectReviewTarget: PropTypes.func.isRequired,
    queue: releaseApprovalQueueShape,
    searchText: PropTypes.string,
    selectedHostedReleaseId: PropTypes.string
};

const ReleasePreview = ({
    adminSummary,
    adminSummaryError,
    adminSummaryStatus,
    approvalQueue,
    approvalQueueError,
    approvalQueueFilterStatus,
    approvalQueueSearchText,
    approvalQueueSelectedHostedReleaseId,
    approvalQueueStatus,
    auditError,
    auditLifecycle,
    auditLifecycleError,
    auditLifecycleStatus,
    auditReply,
    auditStatus,
    hostedRelease,
    hostedReleaseError,
    hostedReleaseStatus,
    onAudit,
    onAuditLifecycle,
    onAdminSummary,
    onExport,
    onExportPdf,
    onHostPage,
    onApprovalQueue,
    onApprovalQueueFilterChange,
    onApprovalQueueSearchChange,
    onApprovalQueueSelectReviewTarget,
    onResearchDataset,
    onStudentReport,
    onTeacherReview,
    onTeacherReviewDecisionChange,
    onTeacherReviewNotesChange,
    onTeacherRubricEvidenceChange,
    onTeacherRubricLevelChange,
    preview,
    releaseGate,
    researchDataset,
    researchDatasetError,
    researchDatasetStatus,
    teacherReviewDecision,
    teacherReview,
    teacherReviewError,
    teacherReviewNotes,
    teacherRubricReview,
    teacherReviewStatus
}) => {
    const isReady = preview.status === RELEASE_PREVIEW_STATUS.READY;
    const isReleaseGateAllowed = releaseGate && releaseGate.allowed === true;
    const isAuditLoading = auditStatus === RELEASE_AUDIT_STATUSES.LOADING;
    const isAdminSummaryLoading = adminSummaryStatus === RELEASE_AUDIT_STATUSES.LOADING;
    const isApprovalQueueLoading = approvalQueueStatus === RELEASE_AUDIT_STATUSES.LOADING;
    const isAuditLifecycleLoading = auditLifecycleStatus === RELEASE_AUDIT_STATUSES.LOADING;
    const isHostedReleaseLoading = hostedReleaseStatus === RELEASE_AUDIT_STATUSES.LOADING;
    const isResearchDatasetLoading = researchDatasetStatus === RELEASE_AUDIT_STATUSES.LOADING;
    const isTeacherReviewLoading = teacherReviewStatus === RELEASE_AUDIT_STATUSES.LOADING;
    const hasTeacherRubricReview = Boolean(
        teacherRubricReview &&
        Array.isArray(teacherRubricReview.items) &&
        teacherRubricReview.items.length
    );
    const teacherRubricReviewReady = isTeacherRubricReviewComplete(teacherRubricReview);
    const checkValue = `${preview.metrics.checkScore}/${preview.metrics.checkMaxScore}`;
    const showAuditResult = Boolean(auditReply || auditError);
    const showAdminSummary = Boolean(adminSummary || adminSummaryError);
    const showApprovalQueue = Boolean(approvalQueue || approvalQueueError);
    const showAuditLifecycle = Boolean(auditLifecycle || auditLifecycleError);
    const showHostedRelease = Boolean(hostedRelease || hostedReleaseError);
    const showResearchDataset = Boolean(researchDataset || researchDatasetError);
    const showTeacherReview = Boolean(teacherReview || teacherReviewError);
    const auditResultMessage = auditError ? (
        <FormattedMessage {...messages.releaseAuditError} />
    ) : auditReply && auditReply.blocked ? (
        <FormattedMessage {...messages.releaseAuditBlocked} />
    ) : auditReply && auditReply.persisted ? (
        <FormattedMessage
            {...messages.releaseAuditSaved}
            values={{
                auditId: auditReply.auditId
            }}
        />
    ) : (
        <FormattedMessage {...messages.releaseAuditDraft} />
    );
    const auditLifecycleRecords = auditLifecycle && auditLifecycle.auditFile ?
        auditLifecycle.auditFile.records :
        0;
    const auditAdminOperationRecords = auditLifecycle &&
        auditLifecycle.adminOperations &&
        auditLifecycle.adminOperations.auditFile ?
        auditLifecycle.adminOperations.auditFile.records :
        0;
    const auditLifecycleDays = auditLifecycle && auditLifecycle.retention ?
        auditLifecycle.retention.days :
        30;
    const adminSummaryTotals = adminSummary && adminSummary.totals ? adminSummary.totals : {};
    const adminSummaryAuditRecords = adminSummaryTotals.auditRecords || 0;
    const adminSummaryHostedPages = adminSummaryTotals.hostedPages || 0;
    const adminSummaryTeacherReviews = adminSummaryTotals.teacherReviews || 0;
    const adminSummaryAdminOperations = adminSummaryTotals.adminOperations || 0;
    const researchDatasetRows = researchDataset && researchDataset.dataset ?
        researchDataset.dataset.anonymousRows :
        0;
    const researchDatasetFields = researchDataset && researchDataset.dataset && researchDataset.dataset.fields ?
        researchDataset.dataset.fields.length :
        0;
    const hostedReleaseQrSvg = hostedRelease && hostedRelease.publicUrl ? createQrPreviewSvg({
        url: hostedRelease.publicUrl
    }) : '';
    const hostedReleaseQrDataUri = hostedReleaseQrSvg ?
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(hostedReleaseQrSvg)}` :
        '';
    const currentHostedReleaseId = hostedRelease && hostedRelease.hostedReleaseId ? hostedRelease.hostedReleaseId : '';
    const teacherReviewMessage = teacherReviewError ? (
        <FormattedMessage {...messages.teacherReviewError} />
    ) : teacherReview && teacherReview.blocked ? (
        <FormattedMessage {...messages.teacherReviewLocked} />
    ) : teacherReview && teacherReview.persisted ? (
        <FormattedMessage
            {...messages.teacherReviewReady}
            values={{
                decision: teacherReview.decision
            }}
        />
    ) : (
        <FormattedMessage {...messages.teacherReviewLocked} />
    );

    return (
        <div
            className={styles.releasePreview}
            data-testid="ai-logic-coach-release-preview"
        >
            <div className={styles.releasePreviewHero}>
                <div>
                    <span className={styles.releasePreviewVersion}>
                        {preview.version}
                    </span>
                    <h4 className={styles.releasePreviewTitle}>
                        {preview.productLine || (
                            <FormattedMessage {...messages.releasePreviewEmptyProduct} />
                        )}
                    </h4>
                </div>
                <div className={styles.releasePreviewActions}>
                    <span className={isReady ? styles.releasePreviewReadyBadge : styles.releasePreviewDraftingBadge}>
                        {isReady ? (
                            <FormattedMessage {...messages.releasePreviewReady} />
                        ) : (
                            <FormattedMessage {...messages.releasePreviewDrafting} />
                        )}
                    </span>
                    <button
                        type="button"
                        className={styles.releaseExportButton}
                        data-testid="ai-logic-coach-release-export-html"
                        disabled={!isReleaseGateAllowed}
                        onClick={onExport}
                    >
                        <FormattedMessage {...messages.releaseExportHtml} />
                    </button>
                    <button
                        type="button"
                        className={styles.releaseExportButton}
                        data-testid="ai-logic-coach-release-export-student-report"
                        disabled={!isReleaseGateAllowed}
                        onClick={onStudentReport}
                    >
                        <FormattedMessage {...messages.releaseExportStudentReport} />
                    </button>
                    <button
                        type="button"
                        className={styles.releaseExportButton}
                        data-testid="ai-logic-coach-release-export-student-report-pdf"
                        disabled={!isReleaseGateAllowed}
                        onClick={onExportPdf}
                    >
                        <FormattedMessage {...messages.releaseExportStudentReportPdf} />
                    </button>
                    <button
                        type="button"
                        className={styles.releaseExportButton}
                        data-testid="ai-logic-coach-release-host-page"
                        disabled={!isReleaseGateAllowed || isHostedReleaseLoading}
                        onClick={onHostPage}
                    >
                        {isHostedReleaseLoading ? (
                            <FormattedMessage {...messages.releaseHostingLoading} />
                        ) : (
                            <FormattedMessage {...messages.releaseHostPage} />
                        )}
                    </button>
                    <button
                        type="button"
                        className={styles.releaseExportButton}
                        data-testid="ai-logic-coach-release-teacher-review"
                        disabled={
                            !isReleaseGateAllowed ||
                            !hostedRelease ||
                            hostedRelease.blocked ||
                            (hasTeacherRubricReview && !teacherRubricReviewReady) ||
                            isTeacherReviewLoading
                        }
                        onClick={onTeacherReview}
                    >
                        {isTeacherReviewLoading ? (
                            <FormattedMessage {...messages.teacherReviewLoading} />
                        ) : (
                            <FormattedMessage {...messages.teacherReviewRequest} />
                        )}
                    </button>
                    <button
                        type="button"
                        className={styles.releaseExportButton}
                        data-testid="ai-logic-coach-release-save-audit"
                        disabled={!isReleaseGateAllowed || isAuditLoading}
                        onClick={onAudit}
                    >
                        {isAuditLoading ? (
                            <FormattedMessage {...messages.releaseAuditSaving} />
                        ) : (
                            <FormattedMessage {...messages.releaseAuditSave} />
                        )}
                    </button>
                    <button
                        type="button"
                        className={styles.releaseExportButton}
                        data-testid="ai-logic-coach-release-audit-policy"
                        disabled={isAuditLifecycleLoading}
                        onClick={onAuditLifecycle}
                    >
                        {isAuditLifecycleLoading ? (
                            <FormattedMessage {...messages.releaseAuditPolicyLoading} />
                        ) : (
                            <FormattedMessage {...messages.releaseAuditPolicy} />
                        )}
                    </button>
                    <button
                        type="button"
                        className={styles.releaseExportButton}
                        data-testid="ai-logic-coach-release-admin-summary"
                        disabled={isAdminSummaryLoading}
                        onClick={onAdminSummary}
                    >
                        {isAdminSummaryLoading ? (
                            <FormattedMessage {...messages.releaseAdminSummaryLoading} />
                        ) : (
                            <FormattedMessage {...messages.releaseAdminSummary} />
                        )}
                    </button>
                    <button
                        type="button"
                        className={styles.releaseExportButton}
                        data-testid="ai-logic-coach-release-approval-queue"
                        disabled={isApprovalQueueLoading}
                        onClick={onApprovalQueue}
                    >
                        {isApprovalQueueLoading ? (
                            <FormattedMessage {...messages.releaseApprovalQueueLoading} />
                        ) : (
                            <FormattedMessage {...messages.releaseApprovalQueue} />
                        )}
                    </button>
                    <button
                        type="button"
                        className={styles.releaseExportButton}
                        data-testid="ai-logic-coach-release-research-dataset"
                        disabled={isResearchDatasetLoading}
                        onClick={onResearchDataset}
                    >
                        {isResearchDatasetLoading ? (
                            <FormattedMessage {...messages.releaseResearchDatasetLoading} />
                        ) : (
                            <FormattedMessage {...messages.releaseResearchDataset} />
                        )}
                    </button>
                </div>
            </div>
            <ReleaseGateChecklist releaseGate={releaseGate} />
            <ReleasePreviewTextBlock
                label={<FormattedMessage {...messages.releasePreviewProduct} />}
                fallback={<FormattedMessage {...messages.releasePreviewEmptyProduct} />}
                value={preview.productLine}
            />
            <ReleasePreviewTextBlock
                label={<FormattedMessage {...messages.releasePreviewFeedback} />}
                fallback={<FormattedMessage {...messages.releasePreviewEmptyFeedback} />}
                value={preview.userFeedback}
            />
            <ReleasePreviewTextBlock
                label={<FormattedMessage {...messages.releasePreviewNext} />}
                fallback={<FormattedMessage {...messages.releasePreviewEmptyNext} />}
                value={preview.iterationPlan}
            />
            <div className={styles.releasePreviewGroup}>
                <h4 className={styles.releasePreviewGroupTitle}>
                    <FormattedMessage {...messages.releasePreviewStats} />
                </h4>
                <div className={styles.releasePreviewMetrics}>
                    <ReleasePreviewMetric
                        label={<FormattedMessage {...messages.releasePreviewMetricSprites} />}
                        value={preview.metrics.sprites}
                    />
                    <ReleasePreviewMetric
                        label={<FormattedMessage {...messages.releasePreviewMetricStarts} />}
                        value={preview.metrics.starts}
                    />
                    <ReleasePreviewMetric
                        label={<FormattedMessage {...messages.releasePreviewMetricBlocks} />}
                        value={preview.metrics.blocks}
                    />
                    <ReleasePreviewMetric
                        label={<FormattedMessage {...messages.releasePreviewMetricCheck} />}
                        value={checkValue}
                    />
                </div>
            </div>
            <div className={styles.releasePreviewGroup}>
                <h4 className={styles.releasePreviewGroupTitle}>
                    <FormattedMessage {...messages.releasePreviewLogic} />
                </h4>
                {preview.logicFlows.length ? (
                    <ol className={styles.releasePreviewLogicList}>
                        {preview.logicFlows.map(flow => (
                            <ReleasePreviewLogicFlow
                                flow={flow}
                                key={flow.id}
                            />
                        ))}
                    </ol>
                ) : (
                    <div className={styles.releasePreviewPlaceholder}>
                        <FormattedMessage {...messages.releasePreviewLogicEmpty} />
                    </div>
                )}
            </div>
            <div className={styles.releasePreviewGroup}>
                <h4 className={styles.releasePreviewGroupTitle}>
                    <FormattedMessage {...messages.releasePreviewAI} />
                </h4>
                <div className={styles.releasePreviewAI}>
                    <FormattedMessage
                        {...messages.releasePreviewAISummary}
                        values={preview.aiSummary}
                    />
                </div>
            </div>
            <TeacherRubricReviewPanel
                decision={teacherReviewDecision}
                notes={teacherReviewNotes}
                review={teacherRubricReview}
                onDecisionChange={onTeacherReviewDecisionChange}
                onEvidenceChange={onTeacherRubricEvidenceChange}
                onLevelChange={onTeacherRubricLevelChange}
                onNotesChange={onTeacherReviewNotesChange}
            />
            {showHostedRelease ? (
                <div
                    className={hostedReleaseError || (hostedRelease && hostedRelease.blocked) ?
                        styles.releaseAuditError :
                        styles.releaseAuditResult}
                    data-testid="ai-logic-coach-release-hosting-result"
                >
                    {hostedReleaseError ? (
                        <FormattedMessage {...messages.releaseHostingError} />
                    ) : hostedRelease && hostedRelease.blocked ? (
                        <FormattedMessage {...messages.releaseHostingBlocked} />
                    ) : (
                        <React.Fragment>
                            <FormattedMessage
                                {...messages.releaseHostingReady}
                                values={{
                                    url: hostedRelease.publicUrl
                                }}
                            />
                            {hostedReleaseQrDataUri ? (
                                <img
                                    alt=""
                                    className={styles.releaseQrPreview}
                                    src={hostedReleaseQrDataUri}
                                />
                            ) : null}
                        </React.Fragment>
                    )}
                </div>
            ) : null}
            {showTeacherReview ? (
                <div
                    className={teacherReviewError || (teacherReview && teacherReview.blocked) ?
                        styles.releaseAuditError :
                        styles.releaseAuditResult}
                    data-testid="ai-logic-coach-teacher-review-result"
                >
                    {teacherReviewMessage}
                </div>
            ) : null}
            {showAuditResult ? (
                <div
                    className={auditError || (auditReply && auditReply.blocked) ?
                        styles.releaseAuditError :
                        styles.releaseAuditResult}
                    data-testid="ai-logic-coach-release-audit-result"
                >
                    {auditResultMessage}
                </div>
            ) : null}
            {showAuditLifecycle ? (
                <div
                    className={auditLifecycleError ? styles.releaseAuditError : styles.releaseAuditResult}
                    data-testid="ai-logic-coach-release-audit-policy-result"
                >
                    {auditLifecycleError ? (
                        <FormattedMessage {...messages.releaseAuditPolicyError} />
                    ) : (
                        <React.Fragment>
                            <FormattedMessage
                                {...messages.releaseAuditPolicyReady}
                                values={{
                                    days: auditLifecycleDays,
                                    records: auditLifecycleRecords
                                }}
                            />
                            <span className={styles.releaseAuditPolicyLock}>
                                <FormattedMessage
                                    {...messages.releaseAuditAdminOperations}
                                    values={{
                                        records: auditAdminOperationRecords
                                    }}
                                />
                            </span>
                            <span className={styles.releaseAuditPolicyLock}>
                                <FormattedMessage {...messages.releaseAuditPolicyLocked} />
                            </span>
                        </React.Fragment>
                    )}
                </div>
            ) : null}
            {showAdminSummary ? (
                <div
                    className={adminSummaryError ? styles.releaseAuditError : styles.releaseAuditResult}
                    data-testid="ai-logic-coach-release-admin-summary-result"
                >
                    {adminSummaryError ? (
                        <FormattedMessage {...messages.releaseAdminSummaryError} />
                    ) : (
                        <React.Fragment>
                            <FormattedMessage
                                {...messages.releaseAdminSummaryReady}
                                values={{
                                    auditRecords: adminSummaryAuditRecords,
                                    hostedPages: adminSummaryHostedPages,
                                    teacherReviews: adminSummaryTeacherReviews
                                }}
                            />
                            <span className={styles.releaseAuditPolicyLock}>
                                <FormattedMessage
                                    {...messages.releaseAdminSummaryOperations}
                                    values={{
                                        adminOperations: adminSummaryAdminOperations
                                    }}
                                />
                            </span>
                            <span className={styles.releaseAuditPolicyLock}>
                                <FormattedMessage {...messages.releaseAdminSummaryGovernance} />
                            </span>
                        </React.Fragment>
                    )}
                </div>
            ) : null}
            {showApprovalQueue ? (
                <ReleaseApprovalQueuePanel
                    currentHostedReleaseId={currentHostedReleaseId}
                    error={approvalQueueError}
                    filterStatus={approvalQueueFilterStatus}
                    queue={approvalQueue}
                    searchText={approvalQueueSearchText}
                    selectedHostedReleaseId={approvalQueueSelectedHostedReleaseId}
                    onFilterChange={onApprovalQueueFilterChange}
                    onSearchChange={onApprovalQueueSearchChange}
                    onSelectReviewTarget={onApprovalQueueSelectReviewTarget}
                />
            ) : null}
            {showResearchDataset ? (
                <div
                    className={researchDatasetError ? styles.releaseAuditError : styles.releaseAuditResult}
                    data-testid="ai-logic-coach-release-research-dataset-result"
                >
                    {researchDatasetError ? (
                        <FormattedMessage {...messages.releaseResearchDatasetError} />
                    ) : (
                        <React.Fragment>
                            <FormattedMessage
                                {...messages.releaseResearchDatasetReady}
                                values={{
                                    fields: researchDatasetFields,
                                    rows: researchDatasetRows
                                }}
                            />
                            <span className={styles.releaseAuditPolicyLock}>
                                <FormattedMessage {...messages.releaseResearchDatasetLocked} />
                            </span>
                        </React.Fragment>
                    )}
                </div>
            ) : null}
        </div>
    );
};

ReleasePreview.propTypes = {
    adminSummary: releaseAdminSummaryShape,
    adminSummaryError: PropTypes.string,
    adminSummaryStatus: PropTypes.string,
    approvalQueue: releaseApprovalQueueShape,
    approvalQueueError: PropTypes.string,
    approvalQueueFilterStatus: PropTypes.string,
    approvalQueueSearchText: PropTypes.string,
    approvalQueueSelectedHostedReleaseId: PropTypes.string,
    approvalQueueStatus: PropTypes.string,
    auditError: PropTypes.string,
    auditLifecycle: releaseAuditLifecycleShape,
    auditLifecycleError: PropTypes.string,
    auditLifecycleStatus: PropTypes.string,
    auditReply: releaseAuditReplyShape,
    auditStatus: PropTypes.string,
    hostedRelease: hostedReleaseShape,
    hostedReleaseError: PropTypes.string,
    hostedReleaseStatus: PropTypes.string,
    onAudit: PropTypes.func.isRequired,
    onAuditLifecycle: PropTypes.func.isRequired,
    onAdminSummary: PropTypes.func.isRequired,
    onExport: PropTypes.func.isRequired,
    onExportPdf: PropTypes.func.isRequired,
    onHostPage: PropTypes.func.isRequired,
    onApprovalQueue: PropTypes.func.isRequired,
    onApprovalQueueFilterChange: PropTypes.func.isRequired,
    onApprovalQueueSearchChange: PropTypes.func.isRequired,
    onApprovalQueueSelectReviewTarget: PropTypes.func.isRequired,
    onResearchDataset: PropTypes.func.isRequired,
    onStudentReport: PropTypes.func.isRequired,
    onTeacherReview: PropTypes.func.isRequired,
    onTeacherReviewDecisionChange: PropTypes.func.isRequired,
    onTeacherReviewNotesChange: PropTypes.func.isRequired,
    onTeacherRubricEvidenceChange: PropTypes.func.isRequired,
    onTeacherRubricLevelChange: PropTypes.func.isRequired,
    preview: releasePreviewShape,
    releaseGate: releaseGateShape,
    researchDataset: releaseResearchDatasetShape,
    researchDatasetError: PropTypes.string,
    researchDatasetStatus: PropTypes.string,
    teacherReview: teacherReviewShape,
    teacherReviewDecision: PropTypes.string,
    teacherReviewError: PropTypes.string,
    teacherReviewNotes: PropTypes.string,
    teacherRubricReview: teacherRubricReviewShape,
    teacherReviewStatus: PropTypes.string
};

const TargetSummaryList = ({targets}) => (
    <div
        className={styles.targetList}
        data-testid="ai-logic-coach-target-list"
    >
        {targets.length ? targets.slice(0, 4).map(target => (
            <div
                className={styles.targetItem}
                key={target.id}
            >
                <span className={styles.targetName}>
                    {target.isStage ? (
                        <FormattedMessage
                            id="gui.aiLogicCoach.stageTargetPrefix"
                            defaultMessage="Stage"
                            description="Stage label in AI project summary"
                        />
                    ) : target.name}
                </span>
                <span className={styles.targetStats}>
                    <FormattedMessage
                        id="gui.aiLogicCoach.targetStats"
                        defaultMessage="{blocks} blocks / {scripts} scripts / {hats} starts"
                        description="Target stats in AI project summary"
                        values={{
                            blocks: target.blocks,
                            scripts: target.scripts,
                            hats: target.eventHats
                        }}
                    />
                </span>
            </div>
        )) : (
            <div className={styles.emptyInline}>
                <FormattedMessage
                    id="gui.aiLogicCoach.noTargets"
                    defaultMessage="No sprites yet."
                    description="Empty state for project targets in AI project summary"
                />
            </div>
        )}
    </div>
);

TargetSummaryList.propTypes = {
    targets: PropTypes.arrayOf(PropTypes.shape({
        blocks: PropTypes.number,
        eventHats: PropTypes.number,
        id: PropTypes.string,
        isStage: PropTypes.bool,
        name: PropTypes.string,
        scripts: PropTypes.number
    }))
};

const EventSummaryList = ({events}) => (
    <div
        className={styles.compactList}
        data-testid="ai-logic-coach-event-summary"
    >
        {events.length ? events.map(eventInfo => (
            <div
                className={styles.compactRow}
                key={eventInfo.opcode}
            >
                <span>{eventInfo.label}</span>
                <span>{eventInfo.count}</span>
            </div>
        )) : (
            <div className={styles.emptyInline}>
                <FormattedMessage
                    id="gui.aiLogicCoach.noEventHats"
                    defaultMessage="No starting block yet."
                    description="Empty state for event hats in AI project summary"
                />
            </div>
        )}
    </div>
);

EventSummaryList.propTypes = {
    events: PropTypes.arrayOf(PropTypes.shape({
        count: PropTypes.number,
        label: PropTypes.string,
        opcode: PropTypes.string
    }))
};

const BroadcastSummaryList = ({broadcasts}) => (
    <div
        className={styles.compactList}
        data-testid="ai-logic-coach-broadcast-summary"
    >
        {broadcasts.length ? broadcasts.slice(0, 4).map(broadcastInfo => (
            <div
                className={styles.compactRow}
                key={broadcastInfo.name}
            >
                <span>{broadcastInfo.name}</span>
                <span>
                    <FormattedMessage
                        id="gui.aiLogicCoach.broadcastStats"
                        defaultMessage="{sends} send / {receives} receive"
                        description="Broadcast send and receive counts in AI project summary"
                        values={{
                            sends: broadcastInfo.sends,
                            receives: broadcastInfo.receives
                        }}
                    />
                </span>
            </div>
        )) : (
            <div className={styles.emptyInline}>
                <FormattedMessage
                    id="gui.aiLogicCoach.noBroadcasts"
                    defaultMessage="No messages yet."
                    description="Empty state for broadcasts in AI project summary"
                />
            </div>
        )}
    </div>
);

BroadcastSummaryList.propTypes = {
    broadcasts: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string,
        receives: PropTypes.number,
        sends: PropTypes.number
    }))
};

const LogicGraphNode = ({detail, label, value}) => (
    <div className={styles.logicNode}>
        <span className={styles.logicNodeLabel}>{label}</span>
        <span className={styles.logicNodeValue}>{value}</span>
        {detail ? (
            <span className={styles.logicNodeDetail}>{detail}</span>
        ) : null}
    </div>
);

LogicGraphNode.propTypes = {
    detail: PropTypes.node,
    label: PropTypes.node,
    value: PropTypes.node
};

const LogicFlowBroadcasts = ({broadcasts}) => (
    <div className={styles.broadcastChipList}>
        {broadcasts.length ? broadcasts.map(message => (
            <span
                className={styles.broadcastChip}
                key={message.name}
            >
                {message.name}
                {message.count > 1 ? ` x${message.count}` : null}
            </span>
        )) : (
            <span className={styles.mutedText}>
                <FormattedMessage
                    id="gui.aiLogicCoach.noBroadcastOutput"
                    defaultMessage="No message sent"
                    description="Empty broadcast output in logic graph"
                />
            </span>
        )}
    </div>
);

LogicFlowBroadcasts.propTypes = {
    broadcasts: PropTypes.arrayOf(PropTypes.shape({
        count: PropTypes.number,
        name: PropTypes.string
    }))
};

const BroadcastLinkRow = ({
    activePathId,
    link,
    onPathSelect
}) => {
    const pathId = createBroadcastLinkPath(link.name).pathId;
    const isActive = activePathId === pathId;
    const handleClick = useCallback(() => {
        onPathSelect(pathId);
    }, [onPathSelect, pathId]);
    const handleKeyDown = useCallback(event => {
        handlePathKeyDown(event, pathId, onPathSelect);
    }, [onPathSelect, pathId]);

    return (
        <div
            className={mergeClassNames([
                styles.compactRow,
                styles.pathSelectable,
                isActive ? styles.pathActive : null
            ])}
            data-active-path={isActive ? true : null}
            data-path-id={pathId}
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            <span>{link.name}</span>
            <span>
                <FormattedMessage
                    id="gui.aiLogicCoach.broadcastLinkStats"
                    defaultMessage="{sends} sends / {receives} catches"
                    description="Sender and receiver counts in broadcast link summary"
                    values={{
                        sends: link.sends.length,
                        receives: link.receives.length
                    }}
                />
            </span>
        </div>
    );
};

BroadcastLinkRow.propTypes = {
    activePathId: PropTypes.string,
    link: PropTypes.shape({
        name: PropTypes.string,
        receives: PropTypes.arrayOf(scriptReferenceShape),
        sends: PropTypes.arrayOf(scriptReferenceShape)
    }),
    onPathSelect: PropTypes.func.isRequired
};

const BroadcastLinkList = ({
    activePathId,
    links,
    onPathSelect
}) => (
    links.length ? (
        <div
            className={styles.broadcastLinkList}
            data-testid="ai-logic-coach-broadcast-links"
        >
            <h4 className={styles.subsectionTitle}>
                <FormattedMessage
                    id="gui.aiLogicCoach.broadcastLinks"
                    defaultMessage="Message checks"
                    description="Heading for broadcast links in logic graph"
                />
            </h4>
            {links.slice(0, 4).map(link => (
                <BroadcastLinkRow
                    activePathId={activePathId}
                    key={link.name}
                    link={link}
                    onPathSelect={onPathSelect}
                />
            ))}
        </div>
    ) : null
);

BroadcastLinkList.propTypes = {
    activePathId: PropTypes.string,
    links: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string,
        receives: PropTypes.arrayOf(scriptReferenceShape),
        sends: PropTypes.arrayOf(scriptReferenceShape)
    })),
    onPathSelect: PropTypes.func.isRequired
};

const LogicFlowRow = ({
    activePathId,
    flow,
    onPathSelect
}) => {
    const pathId = createLogicFlowPath(flow).pathId;
    const isActive = activePathId === pathId;
    const handleClick = useCallback(() => {
        onPathSelect(pathId);
    }, [onPathSelect, pathId]);
    const handleKeyDown = useCallback(event => {
        handlePathKeyDown(event, pathId, onPathSelect);
    }, [onPathSelect, pathId]);

    return (
        <div
            className={mergeClassNames([
                styles.logicFlow,
                styles.pathSelectable,
                isActive ? styles.pathActive : null
            ])}
            data-active-path={isActive ? true : null}
            data-path-id={pathId}
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            <LogicGraphNode
                label={(
                    <FormattedMessage
                        id="gui.aiLogicCoach.logicEntry"
                        defaultMessage="Start"
                        description="Entry node label in logic graph"
                    />
                )}
                value={flow.trigger.label}
                detail={flow.trigger.detail}
            />
            <span className={styles.logicArrow}>{'>'}</span>
            <LogicGraphNode
                label={(
                    <FormattedMessage
                        id="gui.aiLogicCoach.logicScript"
                        defaultMessage="Script"
                        description="Script node label in logic graph"
                    />
                )}
                value={(
                    <FormattedMessage
                        id="gui.aiLogicCoach.logicScriptName"
                        defaultMessage="#{script}"
                        description="Script index label in logic graph"
                        values={{
                            script: flow.scriptIndex
                        }}
                    />
                )}
                detail={(
                    <FormattedMessage
                        id="gui.aiLogicCoach.logicScriptDetail"
                        defaultMessage="{target} / {blocks} blocks"
                        description="Script target and block count in logic graph"
                        values={{
                            target: flow.targetName,
                            blocks: flow.blockCount
                        }}
                    />
                )}
            />
            <span className={styles.logicArrow}>{'>'}</span>
            <LogicGraphNode
                label={(
                    <FormattedMessage
                        id="gui.aiLogicCoach.logicBroadcast"
                        defaultMessage="Message"
                        description="Broadcast node label in logic graph"
                    />
                )}
                value={<LogicFlowBroadcasts broadcasts={flow.broadcastSends} />}
            />
        </div>
    );
};

LogicFlowRow.propTypes = {
    activePathId: PropTypes.string,
    flow: PropTypes.shape({
        blockCount: PropTypes.number,
        broadcastSends: PropTypes.arrayOf(broadcastSendShape),
        id: PropTypes.string,
        scriptIndex: PropTypes.number,
        targetName: PropTypes.string,
        trigger: PropTypes.shape({
            detail: PropTypes.string,
            label: PropTypes.string
        })
    }),
    onPathSelect: PropTypes.func.isRequired
};

const LogicFlowGraph = ({
    activePathId,
    broadcastLinks,
    flows,
    onPathSelect
}) => {
    const isEventEntryActive = activePathId === LOGIC_EVENT_ENTRY_PATH_ID;
    const handleEventEntryClick = useCallback(() => {
        onPathSelect(LOGIC_EVENT_ENTRY_PATH_ID);
    }, [onPathSelect]);
    const handleEventEntryKeyDown = useCallback(event => {
        handlePathKeyDown(event, LOGIC_EVENT_ENTRY_PATH_ID, onPathSelect);
    }, [onPathSelect]);

    return (
        <div className={styles.logicGraph}>
            {flows.length ? (
                <div className={styles.logicFlowList}>
                    {flows.slice(0, 5).map(flow => (
                        <LogicFlowRow
                            activePathId={activePathId}
                            flow={flow}
                            key={flow.id}
                            onPathSelect={onPathSelect}
                        />
                    ))}
                </div>
            ) : (
                <div
                    className={mergeClassNames([
                        styles.emptyInline,
                        styles.pathSelectable,
                        isEventEntryActive ? styles.pathActive : null
                    ])}
                    data-active-path={isEventEntryActive ? true : null}
                    data-path-id={LOGIC_EVENT_ENTRY_PATH_ID}
                    role="button"
                    tabIndex={0}
                    onClick={handleEventEntryClick}
                    onKeyDown={handleEventEntryKeyDown}
                >
                    <FormattedMessage
                        id="gui.aiLogicCoach.noLogicFlows"
                        defaultMessage="Add a starting block to see the program path."
                        description="Empty state for logic graph"
                    />
                </div>
            )}
            <BroadcastLinkList
                activePathId={activePathId}
                links={broadcastLinks}
                onPathSelect={onPathSelect}
            />
        </div>
    );
};

LogicFlowGraph.propTypes = {
    activePathId: PropTypes.string,
    broadcastLinks: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string,
        receives: PropTypes.arrayOf(scriptReferenceShape),
        sends: PropTypes.arrayOf(scriptReferenceShape)
    })),
    flows: PropTypes.arrayOf(PropTypes.shape({
        blockCount: PropTypes.number,
        broadcastSends: PropTypes.arrayOf(broadcastSendShape),
        id: PropTypes.string,
        scriptIndex: PropTypes.number,
        targetName: PropTypes.string,
        trigger: PropTypes.shape({
            detail: PropTypes.string,
            label: PropTypes.string
        })
    })),
    onPathSelect: PropTypes.func.isRequired
};

const ProcessLogText = ({entry}) => {
    switch (entry.type) {
    case LOG_TYPES.PANEL_OPENED:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logPanelOpened"
                defaultMessage="Thinking helper opened."
                description="Process log entry for opening the logic coach"
            />
        );
    case LOG_TYPES.EXTENSION_PANEL_OPENED:
        return (
            <FormattedMessage {...messages.logExtensionPanelOpened} />
        );
    case LOG_TYPES.EXTENSION_EXPLANATION_RECORDED:
        return (
            <FormattedMessage
                {...messages.logExtensionExplanationRecorded}
                values={entry.values}
            />
        );
    case LOG_TYPES.SUMMARY_REFRESHED:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logSummaryRefreshed"
                defaultMessage="Project updated: {sprites} sprites, {blocks} blocks, {events} starts."
                description="Process log entry for refreshing the project summary"
                values={entry.values}
            />
        );
    case LOG_TYPES.GATE_FIELD_COMPLETED:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logGateFieldCompleted"
                defaultMessage="You filled in {field}."
                description="Process log entry for completing one explain gate field"
                values={entry.values}
            />
        );
    case LOG_TYPES.GATE_FIELD_CLEARED:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logGateFieldCleared"
                defaultMessage="You cleared {field}."
                description="Process log entry for clearing one explain gate field"
                values={entry.values}
            />
        );
    case LOG_TYPES.GATE_STATE_DRAFTING:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logGateDrafting"
                defaultMessage="You started writing your idea."
                description="Process log entry for drafting explain gate state"
            />
        );
    case LOG_TYPES.GATE_STATE_READY:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logGateReady"
                defaultMessage="Your idea is ready to check."
                description="Process log entry for ready explain gate state"
            />
        );
    case LOG_TYPES.GATE_STATE_REVIEWED:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logGateReviewed"
                defaultMessage="You checked your idea."
                description="Process log entry for reviewed explain gate state"
            />
        );
    case LOG_TYPES.MODEL_QUESTION_SENT:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logModelQuestionSent"
                defaultMessage="Your hint question was sent."
                description="Process log entry for sending a model-backed question"
            />
        );
    case LOG_TYPES.MODEL_REPLY_RECEIVED:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logModelReplyReceived"
                defaultMessage="AI sent back a hint."
                description="Process log entry for receiving a model-backed answer"
                values={entry.values}
            />
        );
    case LOG_TYPES.MODEL_REQUEST_BLOCKED:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logModelRequestBlocked"
                defaultMessage="The safety check stopped this question."
                description="Process log entry for a blocked model-backed request"
            />
        );
    case LOG_TYPES.MODEL_REQUEST_CANCELED:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logModelRequestCanceled"
                defaultMessage="You canceled the AI hint request."
                description="Process log entry for a canceled model-backed request"
            />
        );
    case LOG_TYPES.MODEL_REQUEST_TIMEOUT:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logModelRequestTimeout"
                defaultMessage="The AI hint request timed out."
                description="Process log entry for a timed-out model-backed request"
            />
        );
    case LOG_TYPES.MODEL_REQUEST_FAILED:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logModelRequestFailed"
                defaultMessage="The AI helper did not answer."
                description="Process log entry for a failed model-backed request"
            />
        );
    case LOG_TYPES.MODEL_REPLY_PATH_SELECTED:
        return (
            <FormattedMessage
                {...messages.logModelReplyPathSelected}
                values={entry.values}
            />
        );
    case LOG_TYPES.SCRIPT_EXPLANATION_CREATED:
        return (
            <FormattedMessage
                {...messages.logScriptExplanationCreated}
                values={entry.values}
            />
        );
    case LOG_TYPES.BLOCK_DRAFT_CREATED:
        return (
            <FormattedMessage
                {...messages.logBlockDraftCreated}
                values={entry.values}
            />
        );
    case LOG_TYPES.ASSET_JOB_SENT:
        return (
            <FormattedMessage {...messages.logAssetJobSent} />
        );
    case LOG_TYPES.ASSET_JOB_RECEIVED:
        return (
            <FormattedMessage {...messages.logAssetJobReceived} />
        );
    case LOG_TYPES.ASSET_JOB_BLOCKED:
        return (
            <FormattedMessage {...messages.logAssetJobBlocked} />
        );
    case LOG_TYPES.ASSET_JOB_CANCELED:
        return (
            <FormattedMessage {...messages.logAssetJobCanceled} />
        );
    case LOG_TYPES.ASSET_JOB_TIMEOUT:
        return (
            <FormattedMessage {...messages.logAssetJobTimeout} />
        );
    case LOG_TYPES.ASSET_JOB_FAILED:
        return (
            <FormattedMessage {...messages.logAssetJobFailed} />
        );
    case LOG_TYPES.ASSET_DRAFT_REVIEWED:
        return (
            <FormattedMessage {...messages.logAssetDraftReviewed} />
        );
    case LOG_TYPES.ASSET_IMPORTED_TO_COSTUME_EDITOR:
        return (
            <FormattedMessage
                {...messages.logAssetImportedToCostumeEditor}
                values={entry.values}
            />
        );
    case LOG_TYPES.ASSET_IMPORT_FAILED:
        return (
            <FormattedMessage {...messages.logAssetImportFailed} />
        );
    case LOG_TYPES.ASSET_VISUAL_EDIT_RECORDED:
        return (
            <FormattedMessage
                {...messages.logAssetVisualEditRecorded}
                values={entry.values}
            />
        );
    case LOG_TYPES.ASSET_DRAFT_ADOPTED:
        return (
            <FormattedMessage {...messages.logAssetDraftAdopted} />
        );
    case LOG_TYPES.TEACHER_SESSION_SENT:
        return (
            <FormattedMessage {...messages.logTeacherSessionSent} />
        );
    case LOG_TYPES.TEACHER_SESSION_RECEIVED:
        return (
            <FormattedMessage {...messages.logTeacherSessionReceived} />
        );
    case LOG_TYPES.TEACHER_SESSION_BLOCKED:
        return (
            <FormattedMessage {...messages.logTeacherSessionBlocked} />
        );
    case LOG_TYPES.TEACHER_SESSION_FAILED:
        return (
            <FormattedMessage {...messages.logTeacherSessionFailed} />
        );
    case LOG_TYPES.TEACHER_SESSION_SIGNED_OUT:
        return (
            <FormattedMessage {...messages.logTeacherSessionSignedOut} />
        );
    case LOG_TYPES.TEACHER_ACCOUNT_ADMIN_SENT:
        return (
            <FormattedMessage {...messages.logTeacherAccountAdminSent} />
        );
    case LOG_TYPES.TEACHER_ACCOUNT_ADMIN_RECEIVED:
        return (
            <FormattedMessage {...messages.logTeacherAccountAdminReceived} />
        );
    case LOG_TYPES.TEACHER_ACCOUNT_ADMIN_BLOCKED:
        return (
            <FormattedMessage {...messages.logTeacherAccountAdminBlocked} />
        );
    case LOG_TYPES.TEACHER_ACCOUNT_ADMIN_FAILED:
        return (
            <FormattedMessage {...messages.logTeacherAccountAdminFailed} />
        );
    case LOG_TYPES.ACTIVE_TEACHER_LOCK_SENT:
        return (
            <FormattedMessage {...messages.logActiveTeacherLockSent} />
        );
    case LOG_TYPES.ACTIVE_TEACHER_LOCK_RECEIVED:
        return (
            <FormattedMessage {...messages.logActiveTeacherLockReceived} />
        );
    case LOG_TYPES.ACTIVE_TEACHER_LOCK_EMPTY:
        return (
            <FormattedMessage {...messages.logActiveTeacherLockEmpty} />
        );
    case LOG_TYPES.ACTIVE_TEACHER_LOCK_FAILED:
        return (
            <FormattedMessage {...messages.logActiveTeacherLockFailed} />
        );
    case LOG_TYPES.TEACHER_LOCK_SENT:
        return (
            <FormattedMessage {...messages.logTeacherLockSent} />
        );
    case LOG_TYPES.TEACHER_LOCK_RECEIVED:
        return (
            <FormattedMessage {...messages.logTeacherLockReceived} />
        );
    case LOG_TYPES.TEACHER_LOCK_BLOCKED:
        return (
            <FormattedMessage {...messages.logTeacherLockBlocked} />
        );
    case LOG_TYPES.TEACHER_LOCK_FAILED:
        return (
            <FormattedMessage {...messages.logTeacherLockFailed} />
        );
    case LOG_TYPES.LESSON_PREP_SENT:
        return (
            <FormattedMessage {...messages.logLessonPrepSent} />
        );
    case LOG_TYPES.LESSON_PREP_RECEIVED:
        return (
            <FormattedMessage {...messages.logLessonPrepReceived} />
        );
    case LOG_TYPES.LESSON_PREP_BLOCKED:
        return (
            <FormattedMessage {...messages.logLessonPrepBlocked} />
        );
    case LOG_TYPES.LESSON_PREP_FAILED:
        return (
            <FormattedMessage {...messages.logLessonPrepFailed} />
        );
    case LOG_TYPES.RELEASE_DRAFT_FIELD_COMPLETED:
        return (
            <FormattedMessage
                {...messages.logReleaseDraftFieldCompleted}
                values={entry.values}
            />
        );
    case LOG_TYPES.RELEASE_DRAFT_FIELD_CLEARED:
        return (
            <FormattedMessage
                {...messages.logReleaseDraftFieldCleared}
                values={entry.values}
            />
        );
    case LOG_TYPES.RELEASE_DRAFT_READY:
        return (
            <FormattedMessage {...messages.logReleaseDraftReady} />
        );
    case LOG_TYPES.RELEASE_HTML_EXPORTED:
        return (
            <FormattedMessage {...messages.logReleaseHtmlExported} />
        );
    case LOG_TYPES.STUDENT_REPORT_EXPORTED:
        return (
            <FormattedMessage {...messages.logStudentReportExported} />
        );
    case LOG_TYPES.STUDENT_REPORT_PDF_EXPORTED:
        return (
            <FormattedMessage {...messages.logStudentReportPdfExported} />
        );
    case LOG_TYPES.RELEASE_HOSTING_SENT:
        return (
            <FormattedMessage {...messages.logReleaseHostingSent} />
        );
    case LOG_TYPES.RELEASE_HOSTING_RECEIVED:
        return (
            <FormattedMessage {...messages.logReleaseHostingReceived} />
        );
    case LOG_TYPES.RELEASE_HOSTING_BLOCKED:
        return (
            <FormattedMessage {...messages.logReleaseHostingBlocked} />
        );
    case LOG_TYPES.RELEASE_HOSTING_FAILED:
        return (
            <FormattedMessage {...messages.logReleaseHostingFailed} />
        );
    case LOG_TYPES.TEACHER_REVIEW_SENT:
        return (
            <FormattedMessage {...messages.logTeacherReviewSent} />
        );
    case LOG_TYPES.TEACHER_REVIEW_RECEIVED:
        return (
            <FormattedMessage {...messages.logTeacherReviewReceived} />
        );
    case LOG_TYPES.TEACHER_REVIEW_BLOCKED:
        return (
            <FormattedMessage {...messages.logTeacherReviewBlocked} />
        );
    case LOG_TYPES.TEACHER_REVIEW_FAILED:
        return (
            <FormattedMessage {...messages.logTeacherReviewFailed} />
        );
    case LOG_TYPES.RELEASE_AUDIT_SENT:
        return (
            <FormattedMessage {...messages.logReleaseAuditSent} />
        );
    case LOG_TYPES.RELEASE_AUDIT_RECEIVED:
        return (
            <FormattedMessage {...messages.logReleaseAuditReceived} />
        );
    case LOG_TYPES.RELEASE_AUDIT_BLOCKED:
        return (
            <FormattedMessage {...messages.logReleaseAuditBlocked} />
        );
    case LOG_TYPES.RELEASE_AUDIT_FAILED:
        return (
            <FormattedMessage {...messages.logReleaseAuditFailed} />
        );
    case LOG_TYPES.RELEASE_AUDIT_POLICY_SENT:
        return (
            <FormattedMessage {...messages.logReleaseAuditPolicySent} />
        );
    case LOG_TYPES.RELEASE_AUDIT_POLICY_RECEIVED:
        return (
            <FormattedMessage {...messages.logReleaseAuditPolicyReceived} />
        );
    case LOG_TYPES.RELEASE_AUDIT_POLICY_FAILED:
        return (
            <FormattedMessage {...messages.logReleaseAuditPolicyFailed} />
        );
    case LOG_TYPES.RELEASE_RESEARCH_DATASET_SENT:
        return (
            <FormattedMessage {...messages.logReleaseResearchDatasetSent} />
        );
    case LOG_TYPES.RELEASE_RESEARCH_DATASET_RECEIVED:
        return (
            <FormattedMessage {...messages.logReleaseResearchDatasetReceived} />
        );
    case LOG_TYPES.RELEASE_RESEARCH_DATASET_FAILED:
        return (
            <FormattedMessage {...messages.logReleaseResearchDatasetFailed} />
        );
    case LOG_TYPES.RELEASE_APPROVAL_QUEUE_TARGET_SELECTED:
        return (
            <FormattedMessage
                {...messages.logReleaseApprovalQueueTargetSelected}
                values={entry.values}
            />
        );
    case LOG_TYPES.Q18_VOICE_DRAFT_CREATED:
        return (
            <FormattedMessage {...messages.logQ18VoiceDraftCreated} />
        );
    case LOG_TYPES.Q18_PROJECT_SKELETON_CREATED:
        return (
            <FormattedMessage
                {...messages.logQ18ProjectSkeletonCreated}
                values={entry.values}
            />
        );
    case LOG_TYPES.Q18_ADDITION_TEMPLATE_CREATED:
        return (
            <FormattedMessage
                {...messages.logQ18AdditionTemplateCreated}
                values={entry.values}
            />
        );
    case LOG_TYPES.EXTENSION_Q18_ACTION:
        return (
            <FormattedMessage
                {...messages.logExtensionQ18Action}
                values={entry.values}
            />
        );
    default:
        return (
            <FormattedMessage
                id="gui.aiLogicCoach.logGateEmpty"
                defaultMessage="The idea card is empty again."
                description="Process log entry for empty explain gate state"
            />
        );
    }
};

ProcessLogText.propTypes = {
    entry: PropTypes.shape({
        type: PropTypes.string,
        values: processLogValuesShape
    })
};

const ProcessLogList = ({entries}) => (
    <div
        className={styles.processLog}
        role="status"
        aria-live="polite"
        data-testid="ai-logic-coach-process-log"
    >
        {entries.length ? (
            <ol className={styles.logList}>
                {entries.map(entry => (
                    <li
                        className={styles.logEntry}
                        key={entry.id}
                    >
                        <span className={styles.logIndex}>{entry.index}</span>
                        <span className={styles.logText}>
                            <ProcessLogText entry={entry} />
                        </span>
                    </li>
                ))}
            </ol>
        ) : (
            <div
                className={styles.emptyLog}
                data-testid="ai-logic-coach-empty-log"
            >
                <FormattedMessage
                    id="gui.aiLogicCoach.emptyLog"
                    defaultMessage="Nothing here yet."
                    description="Empty state for the AI logic coach process log"
                />
            </div>
        )}
    </div>
);

ProcessLogList.propTypes = {
    entries: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.number,
        index: PropTypes.number,
        type: PropTypes.string,
        values: processLogValuesShape
    }))
};

const AILogicCoach = ({onActivateCostumesTab, vm}) => {
    const intl = useIntl();
    const [isOpen, setIsOpen] = useState(false);
    const [projectSummary, setProjectSummary] = useState(() => summarizeScratchProject(vm));
    const [gateDraft, setGateDraft] = useState(createEmptyGateDraft);
    const [gateReviewed, setGateReviewed] = useState(false);
    const [processLog, setProcessLog] = useState([]);
    const [activePathId, setActivePathId] = useState('');
    const [scriptExplanation, setScriptExplanation] = useState(null);
    const [blockDraft, setBlockDraft] = useState(null);
    const [scriptDraft, setScriptDraft] = useState(null);
    const [scriptDraftStatus, setScriptDraftStatus] = useState(MODEL_REPLY_STATUSES.IDLE);
    const [scriptDraftError, setScriptDraftError] = useState('');
    const [activePlanConceptId, setActivePlanConceptId] = useState('');
    const [modelQuestion, setModelQuestion] = useState('');
    const [modelConsent, setModelConsent] = useState(false);
    const [modelReply, setModelReply] = useState(null);
    const [modelStatus, setModelStatus] = useState(MODEL_REPLY_STATUSES.IDLE);
    const [modelError, setModelError] = useState('');
    const [assetType, setAssetType] = useState(ASSET_TYPES.CHARACTER);
    const [assetPrompt, setAssetPrompt] = useState('');
    const [assetConsent, setAssetConsent] = useState(false);
    const [assetReply, setAssetReply] = useState(null);
    const [assetStatus, setAssetStatus] = useState(ASSET_JOB_STATUSES.IDLE);
    const [assetError, setAssetError] = useState('');
    const [assetAdoptionState, setAssetAdoptionState] = useState(createEmptyAssetAdoptionState);
    const [teacherConsent, setTeacherConsent] = useState(false);
    const [teacherId, setTeacherId] = useState('');
    const [teacherPassword, setTeacherPassword] = useState('');
    const [teacherSessionReply, setTeacherSessionReply] = useState(null);
    const [teacherSessionStatus, setTeacherSessionStatus] = useState(TEACHER_DRAFT_STATUSES.IDLE);
    const [teacherSessionError, setTeacherSessionError] = useState('');
    const [teacherClassSessionId, setTeacherClassSessionId] = useState('');
    const [teacherAccountAdminReply, setTeacherAccountAdminReply] = useState(null);
    const [teacherAccountAdminStatus, setTeacherAccountAdminStatus] = useState(TEACHER_DRAFT_STATUSES.IDLE);
    const [teacherAccountAdminError, setTeacherAccountAdminError] = useState('');
    const [teacherAdminTeacherId, setTeacherAdminTeacherId] = useState('');
    const [teacherAdminDisplayName, setTeacherAdminDisplayName] = useState('');
    const [teacherAdminRole, setTeacherAdminRole] = useState('teacher');
    const [teacherAdminClassSessionIdsText, setTeacherAdminClassSessionIdsText] = useState('');
    const [teacherAdminPassword, setTeacherAdminPassword] = useState('');
    const [persistKnowledgeLock, setPersistKnowledgeLock] = useState(false);
    const [activeClassSessionId, setActiveClassSessionId] = useState(readInitialClassSessionId);
    const [activeKnowledgeLockReply, setActiveKnowledgeLockReply] = useState(null);
    const [activeKnowledgeLockStatus, setActiveKnowledgeLockStatus] = useState(TEACHER_DRAFT_STATUSES.IDLE);
    const [activeKnowledgeLockError, setActiveKnowledgeLockError] = useState('');
    const [teacherGradeBand, setTeacherGradeBand] = useState(GRADE_BANDS.UPPER_PRIMARY);
    const [lessonTitle, setLessonTitle] = useState('');
    const [selectedKnowledgePointIds, setSelectedKnowledgePointIds] = useState(['events', 'variables', 'addition']);
    const [knowledgeLockReply, setKnowledgeLockReply] = useState(null);
    const [knowledgeLockStatus, setKnowledgeLockStatus] = useState(TEACHER_DRAFT_STATUSES.IDLE);
    const [knowledgeLockError, setKnowledgeLockError] = useState('');
    const [lessonGoal, setLessonGoal] = useState('');
    const [lessonDuration, setLessonDuration] = useState(40);
    const [lessonPrepReply, setLessonPrepReply] = useState(null);
    const [lessonPrepStatus, setLessonPrepStatus] = useState(TEACHER_DRAFT_STATUSES.IDLE);
    const [lessonPrepError, setLessonPrepError] = useState('');
    const [releaseDraft, setReleaseDraft] = useState(createEmptyReleaseDraft);
    const [releaseAuditReply, setReleaseAuditReply] = useState(null);
    const [releaseAuditStatus, setReleaseAuditStatus] = useState(RELEASE_AUDIT_STATUSES.IDLE);
    const [releaseAuditError, setReleaseAuditError] = useState('');
    const [releaseAuditLifecycle, setReleaseAuditLifecycle] = useState(null);
    const [releaseAuditLifecycleStatus, setReleaseAuditLifecycleStatus] = useState(RELEASE_AUDIT_STATUSES.IDLE);
    const [releaseAuditLifecycleError, setReleaseAuditLifecycleError] = useState('');
    const [releaseAdminSummary, setReleaseAdminSummary] = useState(null);
    const [releaseAdminSummaryStatus, setReleaseAdminSummaryStatus] = useState(RELEASE_AUDIT_STATUSES.IDLE);
    const [releaseAdminSummaryError, setReleaseAdminSummaryError] = useState('');
    const [releaseApprovalQueue, setReleaseApprovalQueue] = useState(null);
    const [releaseApprovalQueueStatus, setReleaseApprovalQueueStatus] = useState(RELEASE_AUDIT_STATUSES.IDLE);
    const [releaseApprovalQueueError, setReleaseApprovalQueueError] = useState('');
    const [releaseApprovalQueueFilterStatus, setReleaseApprovalQueueFilterStatus] = useState(
        RELEASE_APPROVAL_QUEUE_FILTERS.ALL
    );
    const [releaseApprovalQueueSearchText, setReleaseApprovalQueueSearchText] = useState('');
    const [releaseApprovalQueueSelectedHostedReleaseId, setReleaseApprovalQueueSelectedHostedReleaseId] = useState('');
    const [releaseResearchDataset, setReleaseResearchDataset] = useState(null);
    const [releaseResearchDatasetStatus, setReleaseResearchDatasetStatus] = useState(RELEASE_AUDIT_STATUSES.IDLE);
    const [releaseResearchDatasetError, setReleaseResearchDatasetError] = useState('');
    const [hostedReleaseReply, setHostedReleaseReply] = useState(null);
    const [hostedReleaseStatus, setHostedReleaseStatus] = useState(RELEASE_AUDIT_STATUSES.IDLE);
    const [hostedReleaseError, setHostedReleaseError] = useState('');
    const [teacherReviewReply, setTeacherReviewReply] = useState(null);
    const [teacherReviewStatus, setTeacherReviewStatus] = useState(RELEASE_AUDIT_STATUSES.IDLE);
    const [teacherReviewError, setTeacherReviewError] = useState('');
    const [teacherReviewDecision, setTeacherReviewDecision] = useState('approved');
    const [teacherReviewNotes, setTeacherReviewNotes] = useState('');
    const [teacherRubricReview, setTeacherRubricReview] = useState(createTeacherRubricReviewState);
    const [q18VoiceText, setQ18VoiceText] = useState('');
    const [q18VoiceDraft, setQ18VoiceDraft] = useState(null);
    const [q18OneLineGoal, setQ18OneLineGoal] = useState('');
    const [q18OneLineDraft, setQ18OneLineDraft] = useState(null);
    const [q18AdditionGoal, setQ18AdditionGoal] = useState('');
    const [q18AdditionDraft, setQ18AdditionDraft] = useState(null);
    const gateState = getExplainGateState(gateDraft, gateReviewed);
    const isGateComplete = isExplainGateComplete(gateDraft);
    const generationGate = getGenerationGate({
        gateDraft,
        gateReviewed
    });
    const isLogicVisEnabled = aiFeatureFlags.scratchAILogicVisEnabled;
    const isProjectPlannerEnabled = aiFeatureFlags.scratchAIProjectPlannerEnabled;
    const isPublishingEnabled = aiFeatureFlags.scratchAIPublishingEnabled;
    const isQ18VoiceEnabled = aiFeatureFlags.scratchAIVoiceBlocksEnabled;
    const isQ18OneLineEnabled = aiFeatureFlags.scratchAIOneLineProjectEnabled;
    const isQ18AdditionEnabled = aiFeatureFlags.scratchAIAdditionTemplateEnabled;
    const isQ18ToolsEnabled = isQ18VoiceEnabled || isQ18OneLineEnabled || isQ18AdditionEnabled;
    const logic = getSummaryLogic(projectSummary);
    const selectedScriptExplanation = createScriptExplanation({
        activePathId,
        projectSummary
    });
    const selectedBlockDraft = createNlBlocksDraft({
        gateDraft,
        projectSummary
    });
    const projectPlan = isProjectPlannerEnabled ? createProjectPlan({
        blockDraft,
        gateDraft,
        gateReviewed,
        projectSummary
    }) : null;
    const evidenceChecklist = scoreEvidenceChecklist({
        gateDraft,
        gateState,
        projectSummary
    });
    const releaseDraftSummary = createReleaseDraftSummary({
        evidenceChecklist,
        projectSummary,
        releaseDraft
    });
    const releasePreview = createReleasePreview({
        processLog,
        projectSummary,
        releaseDraftSummary
    });
    const teacherPolicySummary = useMemo(() => createTeacherPolicySummary({
        activeKnowledgeLockReply,
        knowledgeLockReply,
        lessonPrepReply
    }), [
        activeKnowledgeLockReply,
        knowledgeLockReply,
        lessonPrepReply
    ]);
    useEffect(() => {
        setTeacherRubricReview(createTeacherRubricReviewState({
            teacherPolicy: teacherPolicySummary
        }));
    }, [teacherPolicySummary]);
    const assetAdoptionSummary = createAssetAdoptionSummary({
        adoptionState: assetAdoptionState,
        assetReply
    });
    const releaseGate = createReleaseGate({
        assetAdoptionSummary,
        generationGateAllowed: generationGate.allowed,
        publishingEnabled: isPublishingEnabled,
        releasePreview
    });
    const studentReport = createStudentReport({
        assetAdoptionSummary,
        releaseGate,
        releasePreview,
        teacherPolicy: teacherPolicySummary
    });
    const modelReplyPathAliasTable = createModelReplyPathAliasTable(projectSummary);
    const modelReplyPathAliases = findModelReplyPathAliases(
        modelReply && modelReply.text,
        modelReplyPathAliasTable
    );
    const socraticQuestions = generateSocraticQuestions({
        gateDraft,
        gateState,
        projectSummary,
        teacherPolicy: teacherPolicySummary
    });
    const logSequenceRef = useRef(0);
    const initialActiveClassSessionIdRef = useRef(activeClassSessionId);
    const summarySignatureRef = useRef('');
    const previousGateStateRef = useRef(gateState);
    const previousReleaseDraftStatusRef = useRef(releaseDraftSummary.status);
    const modelRequestControllerRef = useRef(null);
    const scriptDraftRequestControllerRef = useRef(null);
    const assetRequestControllerRef = useRef(null);

    const addProcessLog = useCallback((type, values) => {
        logSequenceRef.current++;
        const nextEntry = {
            id: logSequenceRef.current,
            index: logSequenceRef.current,
            type: type,
            values: values || {}
        };
        setProcessLog(currentLog => [nextEntry].concat(currentLog).slice(0, PROCESS_LOG_MAX_ENTRIES));
    }, []);

    const fetchActiveKnowledgeLock = useCallback(async classSessionId => {
        const normalizedClassSessionId = normalizeClassSessionId(classSessionId);
        if (!normalizedClassSessionId || !aiFeatureFlags.scratchAIKnowledgeLockEnabled) {
            setActiveKnowledgeLockReply(null);
            setActiveKnowledgeLockStatus(TEACHER_DRAFT_STATUSES.IDLE);
            setActiveKnowledgeLockError('');
            return null;
        }

        setActiveClassSessionId(normalizedClassSessionId);
        setActiveKnowledgeLockStatus(TEACHER_DRAFT_STATUSES.LOADING);
        setActiveKnowledgeLockError('');
        addProcessLog(LOG_TYPES.ACTIVE_TEACHER_LOCK_SENT);

        try {
            const reply = await requestActiveKnowledgeLock({
                classSessionId: normalizedClassSessionId,
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl
            });
            const isActive = Boolean(reply && reply.active && reply.knowledgeLock);

            setActiveKnowledgeLockReply(reply);
            setActiveKnowledgeLockStatus(TEACHER_DRAFT_STATUSES.READY);
            addProcessLog(isActive ? LOG_TYPES.ACTIVE_TEACHER_LOCK_RECEIVED : LOG_TYPES.ACTIVE_TEACHER_LOCK_EMPTY);
            return reply;
        } catch (error) {
            setActiveKnowledgeLockError(error && error.message ? error.message : 'request failed');
            setActiveKnowledgeLockStatus(TEACHER_DRAFT_STATUSES.ERROR);
            addProcessLog(LOG_TYPES.ACTIVE_TEACHER_LOCK_FAILED);
            return null;
        }
    }, [addProcessLog]);

    useEffect(() => {
        const initialActiveClassSessionId = initialActiveClassSessionIdRef.current;
        if (!initialActiveClassSessionId) return;

        initialActiveClassSessionIdRef.current = '';
        fetchActiveKnowledgeLock(initialActiveClassSessionId);
    }, [fetchActiveKnowledgeLock]);

    const refreshProjectSummary = useCallback(() => {
        const nextProjectSummary = summarizeScratchProject(vm);
        const nextSignature = createProjectSummarySignature(nextProjectSummary);
        setProjectSummary(nextProjectSummary);
        if (summarySignatureRef.current !== nextSignature) {
            summarySignatureRef.current = nextSignature;
            addProcessLog(LOG_TYPES.SUMMARY_REFRESHED, createSummaryLogValues(nextProjectSummary));
        }
    }, [addProcessLog, vm]);

    useEffect(() => {
        refreshProjectSummary();
        if (!vm || typeof vm.on !== 'function' || typeof vm.removeListener !== 'function') {
            return () => {};
        }
        SUMMARY_EVENTS.forEach(eventName => vm.on(eventName, refreshProjectSummary));
        return () => {
            SUMMARY_EVENTS.forEach(eventName => vm.removeListener(eventName, refreshProjectSummary));
        };
    }, [refreshProjectSummary, vm]);

    useEffect(() => {
        if (previousGateStateRef.current === gateState) return;

        if (gateState === EXPLAIN_GATE_STATES.EMPTY) {
            addProcessLog(LOG_TYPES.GATE_STATE_EMPTY);
        } else if (gateState === EXPLAIN_GATE_STATES.DRAFTING) {
            addProcessLog(LOG_TYPES.GATE_STATE_DRAFTING);
        } else if (gateState === EXPLAIN_GATE_STATES.READY) {
            addProcessLog(LOG_TYPES.GATE_STATE_READY);
        } else if (gateState === EXPLAIN_GATE_STATES.REVIEWED) {
            addProcessLog(LOG_TYPES.GATE_STATE_REVIEWED);
        }

        previousGateStateRef.current = gateState;
    }, [addProcessLog, gateState]);

    useEffect(() => {
        if (
            previousReleaseDraftStatusRef.current !== releaseDraftSummary.status &&
            releaseDraftSummary.status === RELEASE_DRAFT_STATUSES.READY
        ) {
            addProcessLog(LOG_TYPES.RELEASE_DRAFT_READY);
        }
        previousReleaseDraftStatusRef.current = releaseDraftSummary.status;
    }, [addProcessLog, releaseDraftSummary.status]);

    useEffect(() => {
        const conceptChoices = projectPlan && Array.isArray(projectPlan.conceptChoices) ?
            projectPlan.conceptChoices :
            [];
        if (!activePlanConceptId) return;
        if (!conceptChoices.some(choice => choice.id === activePlanConceptId)) {
            setActivePlanConceptId('');
        }
    }, [activePlanConceptId, projectPlan]);

    useEffect(() => () => {
        if (modelRequestControllerRef.current) {
            modelRequestControllerRef.current.abort();
        }
        if (scriptDraftRequestControllerRef.current) {
            scriptDraftRequestControllerRef.current.abort();
        }
        if (assetRequestControllerRef.current) {
            assetRequestControllerRef.current.abort();
        }
    }, []);

    const getGateFieldLabel = useCallback(field => {
        if (field === 'goal') return intl.formatMessage(messages.goal);
        if (field === 'logic') return intl.formatMessage(messages.logic);
        return intl.formatMessage(messages.evidence);
    }, [intl]);

    const getQ18ToolLabel = useCallback(action => {
        if (action === 'q18-voice-draft') return intl.formatMessage(messages.q18Voice);
        if (action === 'q18-one-line-project') return intl.formatMessage(messages.q18OneLine);
        return intl.formatMessage(messages.q18Addition);
    }, [intl]);

    const createAndStoreQ18VoiceDraft = useCallback(text => {
        const draft = createVoiceDraft({
            enabled: isQ18VoiceEnabled,
            gateReviewed: generationGate.allowed,
            text
        });
        setQ18VoiceDraft(draft);
        if (draft.status === Q18_TOOL_STATUS.READY) {
            addProcessLog(LOG_TYPES.Q18_VOICE_DRAFT_CREATED);
        }
        return draft;
    }, [
        addProcessLog,
        generationGate.allowed,
        isQ18VoiceEnabled
    ]);

    const createAndStoreQ18OneLineDraft = useCallback(description => {
        const draft = createOneLineProjectSkeleton({
            description,
            enabled: isQ18OneLineEnabled,
            gateReviewed: generationGate.allowed,
            projectSummary
        });
        setQ18OneLineDraft(draft);
        if (draft.status === Q18_TOOL_STATUS.READY) {
            addProcessLog(LOG_TYPES.Q18_PROJECT_SKELETON_CREATED, {
                targets: draft.values.targets
            });
        }
        return draft;
    }, [
        addProcessLog,
        generationGate.allowed,
        isQ18OneLineEnabled,
        projectSummary
    ]);

    const createAndStoreQ18AdditionDraft = useCallback(description => {
        const draft = createAdditionTemplate({
            description,
            enabled: isQ18AdditionEnabled,
            gateReviewed: generationGate.allowed
        });
        setQ18AdditionDraft(draft);
        if (draft.status === Q18_TOOL_STATUS.READY) {
            addProcessLog(LOG_TYPES.Q18_ADDITION_TEMPLATE_CREATED, {
                variables: draft.values.variables
            });
        }
        return draft;
    }, [
        addProcessLog,
        generationGate.allowed,
        isQ18AdditionEnabled
    ]);

    const handleExtensionAction = useCallback(payload => {
        if (!payload || payload.extensionId !== 'scratchai') return;

        if (payload.action === 'open-panel') {
            setIsOpen(true);
            addProcessLog(LOG_TYPES.EXTENSION_PANEL_OPENED);
            return;
        }

        if (payload.action === 'q18-voice-draft') {
            const text = normalizeExtensionExplanationText(payload.text);
            if (!text) return;
            setIsOpen(true);
            setQ18VoiceText(text);
            addProcessLog(LOG_TYPES.EXTENSION_Q18_ACTION, {
                tool: getQ18ToolLabel(payload.action)
            });
            createAndStoreQ18VoiceDraft(text);
            return;
        }

        if (payload.action === 'q18-one-line-project') {
            const text = normalizeExtensionExplanationText(payload.text);
            if (!text) return;
            setIsOpen(true);
            setQ18OneLineGoal(text);
            addProcessLog(LOG_TYPES.EXTENSION_Q18_ACTION, {
                tool: getQ18ToolLabel(payload.action)
            });
            createAndStoreQ18OneLineDraft(text);
            return;
        }

        if (payload.action === 'q18-addition-template') {
            const text = normalizeExtensionExplanationText(payload.text);
            if (!text) return;
            setIsOpen(true);
            setQ18AdditionGoal(text);
            addProcessLog(LOG_TYPES.EXTENSION_Q18_ACTION, {
                tool: getQ18ToolLabel(payload.action)
            });
            createAndStoreQ18AdditionDraft(text);
            return;
        }

        if (payload.action !== 'record-explanation') return;

        const text = normalizeExtensionExplanationText(payload.text);
        if (!text) return;

        const field = normalizeExtensionExplanationField(payload.field);
        setIsOpen(true);
        setGateReviewed(false);
        setGateDraft(currentDraft => Object.assign({}, currentDraft, {
            [field]: text
        }));
        addProcessLog(LOG_TYPES.EXTENSION_EXPLANATION_RECORDED, {
            field: getGateFieldLabel(field)
        });
    }, [
        addProcessLog,
        createAndStoreQ18AdditionDraft,
        createAndStoreQ18OneLineDraft,
        createAndStoreQ18VoiceDraft,
        getGateFieldLabel,
        getQ18ToolLabel
    ]);

    useEffect(() => {
        const runtime = vm && vm.runtime;
        if (!runtime || typeof runtime.on !== 'function' || typeof runtime.removeListener !== 'function') {
            return () => {};
        }

        runtime.on(AI_LOGIC_COACH_EXTENSION_EVENT, handleExtensionAction);
        return () => {
            runtime.removeListener(AI_LOGIC_COACH_EXTENSION_EVENT, handleExtensionAction);
        };
    }, [handleExtensionAction, vm]);

    const getReleaseDraftFieldLabel = useCallback(field => {
        if (field === RELEASE_DRAFT_FIELDS.PRODUCT_LINE) {
            return intl.formatMessage(messages.releaseProductLine);
        }
        if (field === RELEASE_DRAFT_FIELDS.USER_FEEDBACK) {
            return intl.formatMessage(messages.releaseUserFeedback);
        }
        return intl.formatMessage(messages.releaseIterationPlan);
    }, [intl]);

    const updateGateField = useCallback((field, value) => {
        const wasFieldComplete = isTextComplete(gateDraft[field]);
        const isFieldComplete = isTextComplete(value);
        setGateReviewed(false);
        setGateDraft(Object.assign({}, gateDraft, {
            [field]: value
        }));
        if (wasFieldComplete !== isFieldComplete) {
            addProcessLog(
                isFieldComplete ? LOG_TYPES.GATE_FIELD_COMPLETED : LOG_TYPES.GATE_FIELD_CLEARED,
                {field: getGateFieldLabel(field)}
            );
        }
    }, [addProcessLog, gateDraft, getGateFieldLabel]);

    const updateReleaseDraftField = useCallback((field, value) => {
        const wasFieldComplete = isTextComplete(releaseDraft[field]);
        const isFieldComplete = isTextComplete(value);
        setReleaseDraft(Object.assign({}, releaseDraft, {
            [field]: value
        }));
        if (wasFieldComplete !== isFieldComplete) {
            addProcessLog(
                isFieldComplete ? LOG_TYPES.RELEASE_DRAFT_FIELD_COMPLETED : LOG_TYPES.RELEASE_DRAFT_FIELD_CLEARED,
                {field: getReleaseDraftFieldLabel(field)}
            );
        }
    }, [addProcessLog, getReleaseDraftFieldLabel, releaseDraft]);

    const handleReleaseDraftFieldChange = useCallback(field => event => {
        updateReleaseDraftField(field, event.target.value);
    }, [updateReleaseDraftField]);

    const handleTeacherReviewDecisionChange = useCallback(event => {
        setTeacherReviewDecision(event.target.value === 'approved' ? 'approved' : 'needs-revision');
    }, []);

    const handleTeacherReviewNotesChange = useCallback(event => {
        setTeacherReviewNotes(event.target.value.slice(0, 120));
    }, []);

    const handleTeacherRubricLevelChange = useCallback((itemId, level) => {
        setTeacherRubricReview(currentReview => updateTeacherRubricReviewLevel(currentReview, itemId, level));
    }, []);

    const handleTeacherRubricEvidenceChange = useCallback((itemId, evidence) => {
        setTeacherRubricReview(currentReview => updateTeacherRubricReviewEvidence(currentReview, itemId, evidence));
    }, []);

    const handleGoalChange = useCallback(event => {
        updateGateField('goal', event.target.value);
    }, [updateGateField]);

    const handleLogicChange = useCallback(event => {
        updateGateField('logic', event.target.value);
    }, [updateGateField]);

    const handleEvidenceChange = useCallback(event => {
        updateGateField('evidence', event.target.value);
    }, [updateGateField]);

    const handleReviewGate = useCallback(() => {
        if (!isGateComplete) return;
        setGateReviewed(true);
    }, [isGateComplete]);

    const handleToggle = useCallback(() => {
        const nextIsOpen = !isOpen;
        setIsOpen(nextIsOpen);
        if (nextIsOpen) {
            addProcessLog(LOG_TYPES.PANEL_OPENED);
        }
    }, [addProcessLog, isOpen]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
    }, []);

    const handlePathSelect = useCallback(pathId => {
        const nextPathId = pathId || '';
        setActivePathId(nextPathId);
        focusScratchWorkspacePath({
            activePathId: nextPathId,
            projectSummary,
            vm
        });
    }, [projectSummary, vm]);

    const handleModelReplyPathSelect = useCallback((pathId, alias) => {
        handlePathSelect(pathId);
        addProcessLog(LOG_TYPES.MODEL_REPLY_PATH_SELECTED, {
            path: alias && alias.aliasPathId ? alias.aliasPathId : pathId
        });
    }, [addProcessLog, handlePathSelect]);

    const handleExplainScript = useCallback(() => {
        if (!generationGate.allowed) return;
        const explanation = createScriptExplanation({
            activePathId,
            projectSummary
        });
        if (explanation.status !== SCRIPT_EXPLANATION_STATUS.READY) return;

        setScriptExplanation(explanation);
        if (explanation.path && explanation.path.pathId) {
            handlePathSelect(explanation.path.pathId);
        }
        addProcessLog(LOG_TYPES.SCRIPT_EXPLANATION_CREATED, {
            script: explanation.values && explanation.values.script ? explanation.values.script : 1
        });
    }, [
        activePathId,
        addProcessLog,
        generationGate.allowed,
        handlePathSelect,
        projectSummary
    ]);

    const handleCreateBlockDraft = useCallback(() => {
        if (!generationGate.allowed) return;
        const draft = createNlBlocksDraft({
            gateDraft,
            projectSummary
        });
        if (draft.status !== BLOCK_DRAFT_STATUS.READY) return;

        setBlockDraft(draft);
        addProcessLog(LOG_TYPES.BLOCK_DRAFT_CREATED, {
            concepts: draft.values && draft.values.concepts ? draft.values.concepts : 0,
            steps: draft.values && draft.values.steps ? draft.values.steps : 0
        });
    }, [
        addProcessLog,
        gateDraft,
        generationGate.allowed,
        projectSummary
    ]);

    const handleCreateScriptDraft = useCallback(async () => {
        if (!shouldRequestScriptDraft({
            generationGateAllowed: generationGate.allowed,
            modelConsent
        })) return;
        if (scriptDraftRequestControllerRef.current) {
            scriptDraftRequestControllerRef.current.abort();
        }

        const requestController = typeof AbortController === 'undefined' ? null : new AbortController();
        scriptDraftRequestControllerRef.current = requestController;
        setScriptDraft(null);
        setScriptDraftError('');
        setScriptDraftStatus(MODEL_REPLY_STATUSES.LOADING);

        try {
            const reply = await requestNlBlocksScriptDraft({
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl,
                payload: createNlBlocksScriptDraftPayload({
                    evidenceChecklist,
                    gateDraft,
                    gateReviewed,
                    modelConsent,
                    projectSummary,
                    studentText: `${gateDraft.goal}\n${gateDraft.logic}\n${gateDraft.evidence}`,
                    teacherPolicy: teacherPolicySummary
                }),
                signal: requestController ? requestController.signal : undefined,
                timeoutMs: DEFAULT_NL_BLOCKS_SCRIPT_DRAFT_TIMEOUT_MS
            });
            setScriptDraft(reply);
            setScriptDraftStatus(MODEL_REPLY_STATUSES.READY);
        } catch (error) {
            if (isScratchAIRequestCanceled(error)) {
                setScriptDraftStatus(MODEL_REPLY_STATUSES.CANCELED);
                setScriptDraftError('');
            } else if (isScratchAIRequestTimeout(error)) {
                setScriptDraftStatus(MODEL_REPLY_STATUSES.TIMEOUT);
                setScriptDraftError(intl.formatMessage(messages.modelTimeout));
            } else {
                setScriptDraftStatus(MODEL_REPLY_STATUSES.ERROR);
                setScriptDraftError(error && error.message ? error.message : intl.formatMessage(messages.modelFailed));
            }
        } finally {
            if (scriptDraftRequestControllerRef.current === requestController) {
                scriptDraftRequestControllerRef.current = null;
            }
        }
    }, [
        evidenceChecklist,
        gateDraft,
        gateReviewed,
        generationGate.allowed,
        intl,
        modelConsent,
        projectSummary,
        teacherPolicySummary
    ]);

    const handleInsertScriptDraft = useCallback(() => {
        if (!scriptDraft || !vm || typeof vm.insertScratchAIScriptDraft !== 'function') return;
        try {
            const insertSummary = vm.insertScratchAIScriptDraft(scriptDraft);
            setScriptDraft(Object.assign({}, scriptDraft, {
                insertSummary,
                inserted: true
            }));
            setProjectSummary(summarizeScratchProject(vm));
        } catch (error) {
            setScriptDraftStatus(MODEL_REPLY_STATUSES.ERROR);
            setScriptDraftError(error && error.message ? error.message : intl.formatMessage(messages.modelFailed));
        }
    }, [
        intl,
        scriptDraft,
        vm
    ]);

    const handleProjectPlanConceptSelect = useCallback(conceptId => {
        setActivePlanConceptId(conceptId || '');
    }, []);

    const handleModelQuestionChange = useCallback(event => {
        setModelQuestion(event.target.value);
    }, []);

    const handleQ18VoiceTextChange = useCallback(event => {
        setQ18VoiceText(event.target.value);
    }, []);

    const handleQ18OneLineGoalChange = useCallback(event => {
        setQ18OneLineGoal(event.target.value);
    }, []);

    const handleQ18AdditionGoalChange = useCallback(event => {
        setQ18AdditionGoal(event.target.value);
    }, []);

    const handleCreateQ18VoiceDraft = useCallback(() => {
        if (!isTextComplete(q18VoiceText)) return;
        createAndStoreQ18VoiceDraft(q18VoiceText);
    }, [createAndStoreQ18VoiceDraft, q18VoiceText]);

    const handleCreateQ18OneLineDraft = useCallback(() => {
        if (!isTextComplete(q18OneLineGoal)) return;
        createAndStoreQ18OneLineDraft(q18OneLineGoal);
    }, [createAndStoreQ18OneLineDraft, q18OneLineGoal]);

    const handleCreateQ18AdditionDraft = useCallback(() => {
        if (!isTextComplete(q18AdditionGoal)) return;
        createAndStoreQ18AdditionDraft(q18AdditionGoal);
    }, [createAndStoreQ18AdditionDraft, q18AdditionGoal]);

    const handleModelConsentChange = useCallback(event => {
        setModelConsent(event.target.checked);
    }, []);

    const handleAssetTypeSelect = useCallback(nextAssetType => {
        setAssetType(nextAssetType);
    }, []);

    const handleAssetPromptChange = useCallback(event => {
        setAssetPrompt(event.target.value);
    }, []);

    const handleAssetConsentChange = useCallback(event => {
        setAssetConsent(event.target.checked);
    }, []);

    const handleCancelModelRequest = useCallback(() => {
        if (modelRequestControllerRef.current) {
            modelRequestControllerRef.current.abort();
        }
    }, []);

    const handleCancelAssetRequest = useCallback(() => {
        if (assetRequestControllerRef.current) {
            assetRequestControllerRef.current.abort();
        }
    }, []);

    const updateAssetAdoption = useCallback((action, values) => {
        setAssetAdoptionState(currentState => getNextAssetAdoptionState({
            action,
            assetReply,
            currentState,
            values
        }));
    }, [assetReply]);

    const handleReviewAssetDraft = useCallback(() => {
        if (!createAssetAdoptionSummary({
            adoptionState: assetAdoptionState,
            assetReply
        }).canReview) return;

        updateAssetAdoption(ASSET_ADOPTION_ACTIONS.REVIEW);
        addProcessLog(LOG_TYPES.ASSET_DRAFT_REVIEWED);
    }, [
        addProcessLog,
        assetAdoptionState,
        assetReply,
        updateAssetAdoption
    ]);

    const handleImportAssetDraft = useCallback(() => {
        const summary = createAssetAdoptionSummary({
            adoptionState: assetAdoptionState,
            assetReply
        });
        const importData = createAssetImportData(assetReply);
        const storage = vm && vm.runtime && vm.runtime.storage;

        if (!summary.canImport || !importData.ready || !storage) return;

        const targetName = importData.assetType === ASSET_TYPES.BACKDROP ?
            'Stage' :
            importData.name;
        const finishImport = () => {
            updateAssetAdoption(ASSET_ADOPTION_ACTIONS.IMPORT, {
                importTarget: targetName
            });
            addProcessLog(LOG_TYPES.ASSET_IMPORTED_TO_COSTUME_EDITOR, {
                target: targetName
            });
            if (typeof onActivateCostumesTab === 'function') {
                onActivateCostumesTab();
            }
            refreshProjectSummary();
        };
        const failImport = error => {
            setAssetError(error && error.message ? error.message : 'asset import failed');
            addProcessLog(LOG_TYPES.ASSET_IMPORT_FAILED);
        };

        if (importData.assetType === ASSET_TYPES.BACKDROP) {
            costumeUpload(importData.fileData, importData.mimeType, storage, vmCostumes => {
                Promise.all((vmCostumes || []).map((costume, index) => {
                    costume.name = `${importData.name}${index ? index + 1 : ''}`;
                    return vm.addBackdrop(costume.md5, costume);
                }))
                    .then(finishImport)
                    .catch(failImport);
            }, failImport);
            return;
        }

        spriteUpload(
            importData.fileData,
            importData.mimeType,
            importData.name,
            storage,
            spriteJSONString => {
                vm.addSprite(spriteJSONString)
                    .then(finishImport)
                    .catch(failImport);
            },
            failImport
        );
    }, [
        addProcessLog,
        assetAdoptionState,
        assetReply,
        onActivateCostumesTab,
        refreshProjectSummary,
        updateAssetAdoption,
        vm
    ]);

    const handleRecordAssetEdit = useCallback(() => {
        const summary = createAssetAdoptionSummary({
            adoptionState: assetAdoptionState,
            assetReply
        });
        if (!summary.canRecordVisualEdit) return;

        updateAssetAdoption(ASSET_ADOPTION_ACTIONS.RECORD_VISUAL_EDIT);
        addProcessLog(LOG_TYPES.ASSET_VISUAL_EDIT_RECORDED, {
            edits: summary.visualEditCount + 1
        });
    }, [
        addProcessLog,
        assetAdoptionState,
        assetReply,
        updateAssetAdoption
    ]);

    const handleAdoptAssetDraft = useCallback(() => {
        if (!createAssetAdoptionSummary({
            adoptionState: assetAdoptionState,
            assetReply
        }).canAdopt) return;

        updateAssetAdoption(ASSET_ADOPTION_ACTIONS.ADOPT);
        addProcessLog(LOG_TYPES.ASSET_DRAFT_ADOPTED);
    }, [
        addProcessLog,
        assetAdoptionState,
        assetReply,
        updateAssetAdoption
    ]);

    const handleTeacherConsentChange = useCallback(event => {
        setTeacherConsent(event.target.checked);
    }, []);

    const handleTeacherIdChange = useCallback(event => {
        setTeacherId(event.target.value);
    }, []);

    const handleTeacherPasswordChange = useCallback(event => {
        setTeacherPassword(event.target.value);
    }, []);

    const handleTeacherAdminTeacherIdChange = useCallback(event => {
        setTeacherAdminTeacherId(event.target.value);
    }, []);

    const handleTeacherAdminDisplayNameChange = useCallback(event => {
        setTeacherAdminDisplayName(event.target.value);
    }, []);

    const handleTeacherAdminRoleChange = useCallback(event => {
        setTeacherAdminRole(event.target.value === 'admin' ? 'admin' : 'teacher');
    }, []);

    const handleTeacherAdminClassSessionIdsTextChange = useCallback(event => {
        setTeacherAdminClassSessionIdsText(event.target.value);
    }, []);

    const handleTeacherAdminPasswordChange = useCallback(event => {
        setTeacherAdminPassword(event.target.value);
    }, []);

    const handleTeacherAccountSelect = useCallback(account => {
        if (!account) return;
        setTeacherAdminTeacherId(account.teacherId || '');
        setTeacherAdminDisplayName(account.displayName || '');
        setTeacherAdminRole(account.role === 'admin' ? 'admin' : 'teacher');
        setTeacherAdminClassSessionIdsText(Array.isArray(account.classSessionIds) ?
            account.classSessionIds.join(', ') :
            '');
        setTeacherAdminPassword('');
    }, []);

    const handleActiveClassSessionChange = useCallback(event => {
        const nextClassSessionId = normalizeClassSessionId(event.target.value);
        setActiveClassSessionId(nextClassSessionId);
        if (!nextClassSessionId) {
            setActiveKnowledgeLockReply(null);
            setActiveKnowledgeLockStatus(TEACHER_DRAFT_STATUSES.IDLE);
            setActiveKnowledgeLockError('');
        }
    }, []);

    const selectTeacherClassSession = useCallback(classSessionId => {
        const nextClassSessionId = normalizeClassSessionId(classSessionId);
        setTeacherClassSessionId(nextClassSessionId);
        setActiveClassSessionId(nextClassSessionId);
        fetchActiveKnowledgeLock(nextClassSessionId);
    }, [fetchActiveKnowledgeLock]);

    const handleTeacherClassSessionChange = useCallback(event => {
        selectTeacherClassSession(event.target.value);
    }, [selectTeacherClassSession]);

    const handlePersistKnowledgeLockChange = useCallback(event => {
        setPersistKnowledgeLock(event.target.checked);
    }, []);

    const handleRefreshActiveKnowledgeLock = useCallback(() => {
        fetchActiveKnowledgeLock(activeClassSessionId);
    }, [
        activeClassSessionId,
        fetchActiveKnowledgeLock
    ]);

    const handleTeacherGradeBandChange = useCallback(event => {
        setTeacherGradeBand(event.target.value);
    }, []);

    const handleLessonTitleChange = useCallback(event => {
        setLessonTitle(event.target.value);
    }, []);

    const handleLessonGoalChange = useCallback(event => {
        setLessonGoal(event.target.value);
    }, []);

    const handleLessonDurationChange = useCallback(event => {
        setLessonDuration(event.target.value);
    }, []);

    const handleKnowledgePointToggle = useCallback(pointId => {
        setSelectedKnowledgePointIds(currentIds => {
            if (currentIds.includes(pointId)) {
                return currentIds.filter(id => id !== pointId);
            }
            return currentIds.concat(pointId).slice(0, 8);
        });
    }, []);

    const handleTeacherLogin = useCallback(async () => {
        if (!teacherConsent || !isTextComplete(teacherId) || !isTextComplete(teacherPassword)) return;

        setTeacherSessionStatus(TEACHER_DRAFT_STATUSES.LOADING);
        setTeacherSessionError('');
        addProcessLog(LOG_TYPES.TEACHER_SESSION_SENT);

        try {
            const reply = await requestTeacherSession({
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl,
                payload: createTeacherSessionPayload({
                    password: teacherPassword,
                    teacherConsent,
                    teacherId
                })
            });
            const isBlocked = Boolean(reply && (
                reply.blocked ||
                (reply.safetyGate && reply.safetyGate.allowed === false)
            ));
            const classSessionIds = reply &&
                reply.teacher &&
                Array.isArray(reply.teacher.classSessionIds) ?
                reply.teacher.classSessionIds :
                [];

            setTeacherSessionReply(reply);
            setTeacherSessionStatus(TEACHER_DRAFT_STATUSES.READY);
            if (isBlocked) {
                setPersistKnowledgeLock(false);
            } else {
                const nextClassSessionId = classSessionIds.includes(teacherClassSessionId) ?
                    teacherClassSessionId :
                    classSessionIds[0] || '';

                setTeacherPassword('');
                setTeacherClassSessionId(nextClassSessionId);
                if (nextClassSessionId) {
                    setActiveClassSessionId(nextClassSessionId);
                    fetchActiveKnowledgeLock(nextClassSessionId);
                }
            }
            addProcessLog(isBlocked ? LOG_TYPES.TEACHER_SESSION_BLOCKED : LOG_TYPES.TEACHER_SESSION_RECEIVED);
        } catch (error) {
            setTeacherSessionError(error && error.message ? error.message : 'request failed');
            setTeacherSessionStatus(TEACHER_DRAFT_STATUSES.ERROR);
            setPersistKnowledgeLock(false);
            addProcessLog(LOG_TYPES.TEACHER_SESSION_FAILED);
        }
    }, [
        addProcessLog,
        fetchActiveKnowledgeLock,
        teacherClassSessionId,
        teacherConsent,
        teacherId,
        teacherPassword
    ]);

    const handleTeacherLogout = useCallback(() => {
        setTeacherPassword('');
        setTeacherSessionReply(null);
        setTeacherSessionStatus(TEACHER_DRAFT_STATUSES.IDLE);
        setTeacherSessionError('');
        setTeacherClassSessionId('');
        setTeacherAccountAdminReply(null);
        setTeacherAccountAdminStatus(TEACHER_DRAFT_STATUSES.IDLE);
        setTeacherAccountAdminError('');
        setTeacherAdminTeacherId('');
        setTeacherAdminDisplayName('');
        setTeacherAdminRole('teacher');
        setTeacherAdminClassSessionIdsText('');
        setTeacherAdminPassword('');
        setPersistKnowledgeLock(false);
        addProcessLog(LOG_TYPES.TEACHER_SESSION_SIGNED_OUT);
    }, [addProcessLog]);

    const refreshTeacherAccounts = useCallback(async () => {
        const teacherSessionToken = teacherSessionReply && teacherSessionReply.teacherSessionToken;
        if (!teacherSessionToken) return;

        setTeacherAccountAdminStatus(TEACHER_DRAFT_STATUSES.LOADING);
        setTeacherAccountAdminError('');
        addProcessLog(LOG_TYPES.TEACHER_ACCOUNT_ADMIN_SENT);

        try {
            const reply = await requestTeacherAccounts({
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl,
                teacherSessionToken
            });
            setTeacherAccountAdminReply(reply);
            setTeacherAccountAdminStatus(TEACHER_DRAFT_STATUSES.READY);
            addProcessLog(reply && reply.blocked ?
                LOG_TYPES.TEACHER_ACCOUNT_ADMIN_BLOCKED :
                LOG_TYPES.TEACHER_ACCOUNT_ADMIN_RECEIVED);
        } catch (error) {
            setTeacherAccountAdminError(error && error.message ? error.message : 'request failed');
            setTeacherAccountAdminStatus(TEACHER_DRAFT_STATUSES.ERROR);
            addProcessLog(LOG_TYPES.TEACHER_ACCOUNT_ADMIN_FAILED);
        }
    }, [
        addProcessLog,
        teacherSessionReply
    ]);

    const submitTeacherAccountAdminAction = useCallback(async action => {
        const teacherSessionToken = teacherSessionReply && teacherSessionReply.teacherSessionToken;
        if (!teacherSessionToken) return;

        const normalizedTargetId = createTeacherAccountAdminPayload({
            teacherId: teacherAdminTeacherId
        }).teacherId;
        const accounts = teacherAccountAdminReply && Array.isArray(teacherAccountAdminReply.accounts) ?
            teacherAccountAdminReply.accounts :
            [];
        const selectedAccount = accounts.find(account => account.teacherId === normalizedTargetId);
        const shouldSendFullProfile = action === 'create' || action === 'update';
        const shouldSendPassword = action === 'create' || action === 'reset-password';
        const payload = createTeacherAccountAdminPayload({
            action,
            active: selectedAccount ? selectedAccount.active !== false : true,
            classSessionIds: shouldSendFullProfile ? teacherAdminClassSessionIdsText : [],
            displayName: shouldSendFullProfile ? teacherAdminDisplayName : '',
            password: shouldSendPassword ? teacherAdminPassword : '',
            role: shouldSendFullProfile ? teacherAdminRole : '',
            teacherId: teacherAdminTeacherId
        });

        setTeacherAccountAdminStatus(TEACHER_DRAFT_STATUSES.LOADING);
        setTeacherAccountAdminError('');
        addProcessLog(LOG_TYPES.TEACHER_ACCOUNT_ADMIN_SENT);

        try {
            const reply = await requestTeacherAccountAdminAction({
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl,
                payload,
                teacherSessionToken
            });
            setTeacherAccountAdminReply(reply);
            setTeacherAccountAdminStatus(TEACHER_DRAFT_STATUSES.READY);
            if (!reply || !reply.blocked) {
                setTeacherAdminPassword('');
                const updatedAccounts = reply && Array.isArray(reply.accounts) ? reply.accounts : [];
                const updatedAccount = updatedAccounts.find(account => account.teacherId === normalizedTargetId);
                if (updatedAccount) handleTeacherAccountSelect(updatedAccount);
            }
            addProcessLog(reply && reply.blocked ?
                LOG_TYPES.TEACHER_ACCOUNT_ADMIN_BLOCKED :
                LOG_TYPES.TEACHER_ACCOUNT_ADMIN_RECEIVED);
        } catch (error) {
            setTeacherAccountAdminError(error && error.message ? error.message : 'request failed');
            setTeacherAccountAdminStatus(TEACHER_DRAFT_STATUSES.ERROR);
            addProcessLog(LOG_TYPES.TEACHER_ACCOUNT_ADMIN_FAILED);
        }
    }, [
        addProcessLog,
        handleTeacherAccountSelect,
        teacherAccountAdminReply,
        teacherAdminClassSessionIdsText,
        teacherAdminDisplayName,
        teacherAdminPassword,
        teacherAdminRole,
        teacherAdminTeacherId,
        teacherSessionReply
    ]);

    const handleTeacherAdminCreateAccount = useCallback(() => {
        submitTeacherAccountAdminAction('create');
    }, [submitTeacherAccountAdminAction]);

    const handleTeacherAdminUpdateAccount = useCallback(() => {
        submitTeacherAccountAdminAction('update');
    }, [submitTeacherAccountAdminAction]);

    const handleTeacherAdminResetPassword = useCallback(() => {
        submitTeacherAccountAdminAction('reset-password');
    }, [submitTeacherAccountAdminAction]);

    const handleTeacherAdminDeactivateAccount = useCallback(() => {
        submitTeacherAccountAdminAction('deactivate');
    }, [submitTeacherAccountAdminAction]);

    const handleTeacherAdminActivateAccount = useCallback(() => {
        submitTeacherAccountAdminAction('activate');
    }, [submitTeacherAccountAdminAction]);

    useEffect(() => {
        if (
            teacherSessionReply &&
            teacherSessionReply.teacher &&
            teacherSessionReply.teacher.role === 'admin' &&
            teacherSessionReply.teacherSessionToken &&
            !teacherAccountAdminReply &&
            teacherAccountAdminStatus === TEACHER_DRAFT_STATUSES.IDLE
        ) {
            refreshTeacherAccounts();
        }
    }, [
        refreshTeacherAccounts,
        teacherAccountAdminReply,
        teacherAccountAdminStatus,
        teacherSessionReply
    ]);

    const handleAskModel = useCallback(async () => {
        if (!isTextComplete(modelQuestion) || !modelConsent) return;
        if (!generationGate.allowed) return;

        const requestController = typeof AbortController === 'undefined' ?
            null :
            new AbortController();
        modelRequestControllerRef.current = requestController;
        setModelStatus(MODEL_REPLY_STATUSES.LOADING);
        setModelError('');
        addProcessLog(LOG_TYPES.MODEL_QUESTION_SENT);

        try {
            const requestOptions = {
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl,
                payload: createSocraticChatPayload({
                    evidenceChecklist,
                    gateDraft,
                    modelConsent,
                    projectSummary,
                    studentText: modelQuestion,
                    teacherPolicy: teacherPolicySummary
                }),
                timeoutMs: AI_MODEL_REQUEST_TIMEOUT_MS
            };
            if (requestController) {
                requestOptions.signal = requestController.signal;
            }
            const reply = await requestSocraticChat(requestOptions);
            const isBlocked = Boolean(reply && (
                reply.blocked ||
                (reply.safetyGate && reply.safetyGate.allowed === false && reply.modelEnabled)
            ));

            setModelReply(reply);
            setModelStatus(MODEL_REPLY_STATUSES.READY);
            addProcessLog(
                isBlocked ? LOG_TYPES.MODEL_REQUEST_BLOCKED : LOG_TYPES.MODEL_REPLY_RECEIVED,
                {
                    provider: reply && reply.provider ? reply.provider : 'local middleware',
                    model: reply && reply.model ? reply.model : ''
                }
            );
        } catch (error) {
            if (isScratchAIRequestCanceled(error)) {
                setModelError('');
                setModelStatus(MODEL_REPLY_STATUSES.CANCELED);
                addProcessLog(LOG_TYPES.MODEL_REQUEST_CANCELED);
            } else if (isScratchAIRequestTimeout(error)) {
                setModelError(error && error.message ? error.message : 'request timed out');
                setModelStatus(MODEL_REPLY_STATUSES.TIMEOUT);
                addProcessLog(LOG_TYPES.MODEL_REQUEST_TIMEOUT);
            } else {
                setModelError(error && error.message ? error.message : 'request failed');
                setModelStatus(MODEL_REPLY_STATUSES.ERROR);
                addProcessLog(LOG_TYPES.MODEL_REQUEST_FAILED);
            }
        } finally {
            if (modelRequestControllerRef.current === requestController) {
                modelRequestControllerRef.current = null;
            }
        }
    }, [
        addProcessLog,
        evidenceChecklist,
        gateDraft,
        generationGate.allowed,
        modelConsent,
        modelQuestion,
        projectSummary,
        teacherPolicySummary
    ]);

    const handleSubmitAssetJob = useCallback(async () => {
        if (!isTextComplete(assetPrompt) || !assetConsent) return;

        const requestController = typeof AbortController === 'undefined' ?
            null :
            new AbortController();
        assetRequestControllerRef.current = requestController;
        setAssetStatus(ASSET_JOB_STATUSES.LOADING);
        setAssetError('');
        setAssetAdoptionState(createEmptyAssetAdoptionState());
        addProcessLog(LOG_TYPES.ASSET_JOB_SENT);

        try {
            const requestOptions = {
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl,
                payload: createAssetImageJobPayload({
                    assetConsent,
                    prompt: assetPrompt,
                    style: 'Scratch classroom draft',
                    type: assetType
                }),
                timeoutMs: AI_ASSET_REQUEST_TIMEOUT_MS
            };
            if (requestController) {
                requestOptions.signal = requestController.signal;
            }
            const reply = await requestAssetImageJob(requestOptions);
            const isBlocked = Boolean(reply && (
                reply.blocked ||
                (reply.safetyGate && reply.safetyGate.allowed === false)
            ));
            const job = reply && reply.worker && reply.worker.job;
            const result = job && job.result;
            const asset = result && result.asset;
            const providerFailed = !isBlocked && (
                !job ||
                job.status !== 'completed' ||
                result.generated !== true ||
                !asset ||
                !asset.dataUri
            );

            setAssetReply(reply);
            setAssetAdoptionState(createAssetAdoptionState(reply));
            if (isBlocked) {
                setAssetStatus(ASSET_JOB_STATUSES.READY);
                addProcessLog(LOG_TYPES.ASSET_JOB_BLOCKED);
            } else if (providerFailed) {
                setAssetError(result && result.message ? result.message : 'asset generation failed');
                setAssetStatus(ASSET_JOB_STATUSES.ERROR);
                addProcessLog(LOG_TYPES.ASSET_JOB_FAILED);
            } else {
                setAssetStatus(ASSET_JOB_STATUSES.READY);
                addProcessLog(LOG_TYPES.ASSET_JOB_RECEIVED);
            }
        } catch (error) {
            if (isScratchAIRequestCanceled(error)) {
                setAssetError('');
                setAssetStatus(ASSET_JOB_STATUSES.CANCELED);
                addProcessLog(LOG_TYPES.ASSET_JOB_CANCELED);
            } else if (isScratchAIRequestTimeout(error)) {
                setAssetError(error && error.message ? error.message : 'request timed out');
                setAssetStatus(ASSET_JOB_STATUSES.TIMEOUT);
                addProcessLog(LOG_TYPES.ASSET_JOB_TIMEOUT);
            } else {
                setAssetError(error && error.message ? error.message : 'request failed');
                setAssetStatus(ASSET_JOB_STATUSES.ERROR);
                addProcessLog(LOG_TYPES.ASSET_JOB_FAILED);
            }
        } finally {
            if (assetRequestControllerRef.current === requestController) {
                assetRequestControllerRef.current = null;
            }
        }
    }, [
        addProcessLog,
        assetConsent,
        assetPrompt,
        assetType
    ]);

    const handleSubmitKnowledgeLock = useCallback(async () => {
        if (!teacherConsent || !selectedKnowledgePointIds.length) return;
        const teacherSessionToken = teacherSessionReply && teacherSessionReply.teacherSessionToken;
        if (persistKnowledgeLock && (!teacherSessionToken || !teacherClassSessionId)) return;

        setKnowledgeLockStatus(TEACHER_DRAFT_STATUSES.LOADING);
        setKnowledgeLockError('');
        addProcessLog(LOG_TYPES.TEACHER_LOCK_SENT);

        try {
            const reply = await requestKnowledgeLockDraft({
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl,
                payload: createKnowledgeLockPayload({
                    classSessionId: teacherClassSessionId,
                    gradeBand: teacherGradeBand,
                    lessonTitle,
                    persist: persistKnowledgeLock,
                    selectedKnowledgePointIds,
                    teacherConsent
                }),
                teacherSessionToken: persistKnowledgeLock ? teacherSessionToken : ''
            });
            const isBlocked = Boolean(reply && (
                reply.blocked ||
                (reply.safetyGate && reply.safetyGate.allowed === false)
            ));

            setKnowledgeLockReply(reply);
            if (reply && !isBlocked && reply.persisted && reply.classSession && reply.classSession.id) {
                setActiveClassSessionId(reply.classSession.id);
                setActiveKnowledgeLockReply(Object.assign({}, reply, {
                    active: true
                }));
                setActiveKnowledgeLockStatus(TEACHER_DRAFT_STATUSES.READY);
                setActiveKnowledgeLockError('');
            }
            setKnowledgeLockStatus(TEACHER_DRAFT_STATUSES.READY);
            addProcessLog(isBlocked ? LOG_TYPES.TEACHER_LOCK_BLOCKED : LOG_TYPES.TEACHER_LOCK_RECEIVED);
        } catch (error) {
            setKnowledgeLockError(error && error.message ? error.message : 'request failed');
            setKnowledgeLockStatus(TEACHER_DRAFT_STATUSES.ERROR);
            addProcessLog(LOG_TYPES.TEACHER_LOCK_FAILED);
        }
    }, [
        addProcessLog,
        lessonTitle,
        persistKnowledgeLock,
        selectedKnowledgePointIds,
        teacherClassSessionId,
        teacherConsent,
        teacherGradeBand,
        teacherSessionReply
    ]);

    const handleSubmitLessonPrep = useCallback(async () => {
        if (!teacherConsent || !isTextComplete(lessonGoal)) return;

        setLessonPrepStatus(TEACHER_DRAFT_STATUSES.LOADING);
        setLessonPrepError('');
        addProcessLog(LOG_TYPES.LESSON_PREP_SENT);

        try {
            const reply = await requestLessonPrepDraft({
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl,
                payload: createLessonPrepPayload({
                    durationMinutes: lessonDuration,
                    gradeBand: teacherGradeBand,
                    lessonGoal,
                    lockedKnowledgePointIds: selectedKnowledgePointIds,
                    teacherConsent
                })
            });
            const isBlocked = Boolean(reply && (
                reply.blocked ||
                (reply.safetyGate && reply.safetyGate.allowed === false)
            ));

            setLessonPrepReply(reply);
            setLessonPrepStatus(TEACHER_DRAFT_STATUSES.READY);
            addProcessLog(isBlocked ? LOG_TYPES.LESSON_PREP_BLOCKED : LOG_TYPES.LESSON_PREP_RECEIVED);
        } catch (error) {
            setLessonPrepError(error && error.message ? error.message : 'request failed');
            setLessonPrepStatus(TEACHER_DRAFT_STATUSES.ERROR);
            addProcessLog(LOG_TYPES.LESSON_PREP_FAILED);
        }
    }, [
        addProcessLog,
        lessonDuration,
        lessonGoal,
        selectedKnowledgePointIds,
        teacherConsent,
        teacherGradeBand
    ]);

    const createReleaseHtmlLabels = useCallback(() => ({
        aiHelp: intl.formatMessage(messages.releasePreviewAI),
        aiSummary: intl.formatMessage(messages.releasePreviewAISummary, {
            blocked: '{blocked}',
            questions: '{questions}',
            replies: '{replies}'
        }),
        blocks: intl.formatMessage(messages.releasePreviewMetricBlocks),
        check: intl.formatMessage(messages.releasePreviewMetricCheck),
        draftStatus: intl.formatMessage(messages.releasePreviewDrafting),
        feedback: intl.formatMessage(messages.releasePreviewFeedback),
        logic: intl.formatMessage(messages.releasePreviewLogic),
        logicEmpty: intl.formatMessage(messages.releasePreviewLogicEmpty),
        logicFlow: intl.formatMessage(messages.releasePreviewLogicFlow, {
            blocks: '{blocks}',
            entry: '{entry}',
            script: '{script}',
            target: '{target}'
        }),
        logicFlowBroadcasts: intl.formatMessage(messages.releasePreviewLogicBroadcasts, {
            count: '{count}'
        }),
        next: intl.formatMessage(messages.releasePreviewNext),
        product: intl.formatMessage(messages.releasePreviewProduct),
        readyStatus: intl.formatMessage(messages.releasePreviewReady),
        sprites: intl.formatMessage(messages.releasePreviewMetricSprites),
        starts: intl.formatMessage(messages.releasePreviewMetricStarts),
        stats: intl.formatMessage(messages.releasePreviewStats),
        title: intl.formatMessage(messages.releasePreview)
    }), [intl]);

    const createStudentReportHtmlLabels = useCallback(() => ({
        aiHelp: intl.formatMessage(messages.releasePreviewAI),
        asset: intl.formatMessage(messages.assetAdoption),
        assetEmpty: intl.formatMessage(messages.studentReportAssetEmpty),
        assetSummary: intl.formatMessage(messages.studentReportAssetSummary, {
            adopted: '{adopted}',
            edits: '{edits}',
            imported: '{imported}'
        }),
        blocked: intl.formatMessage(messages.studentReportBlocked),
        check: intl.formatMessage(messages.releasePreviewMetricCheck),
        logic: intl.formatMessage(messages.releasePreviewLogic),
        logicEmpty: intl.formatMessage(messages.releasePreviewLogicEmpty),
        logicFlow: intl.formatMessage(messages.releasePreviewLogicFlow, {
            blocks: '{blocks}',
            entry: '{entry}',
            script: '{script}',
            target: '{target}'
        }),
        next: intl.formatMessage(messages.releasePreviewNext),
        product: intl.formatMessage(messages.releasePreviewProduct),
        ready: intl.formatMessage(messages.releasePreviewReady),
        safeguards: intl.formatMessage(messages.studentReportSafeguards),
        teacherPolicy: intl.formatMessage(messages.studentReportTeacherPolicy),
        teacherPolicyEmpty: intl.formatMessage(messages.studentReportTeacherPolicyEmpty),
        teacherQuestion: intl.formatMessage(messages.studentReportTeacherQuestion),
        teacherRubric: intl.formatMessage(messages.studentReportTeacherRubric),
        title: intl.formatMessage(messages.releaseExportStudentReport),
        userFeedback: intl.formatMessage(messages.releasePreviewFeedback)
    }), [intl]);

    const handleExportReleaseHtml = useCallback(() => {
        if (!releaseGate.allowed) return;

        downloadHtmlFile({
            content: createReleasePreviewHtml({
                labels: createReleaseHtmlLabels(),
                preview: releasePreview
            }),
            filename: createReleasePreviewHtmlFilename(releasePreview)
        });
        addProcessLog(LOG_TYPES.RELEASE_HTML_EXPORTED);
    }, [addProcessLog, createReleaseHtmlLabels, releaseGate.allowed, releasePreview]);

    const handleExportStudentReportHtml = useCallback(() => {
        if (!releaseGate.allowed) return;

        downloadHtmlFile({
            content: createStudentReportHtml({
                labels: createStudentReportHtmlLabels(),
                report: studentReport
            }),
            filename: createStudentReportHtmlFilename(studentReport)
        });
        addProcessLog(LOG_TYPES.STUDENT_REPORT_EXPORTED);
    }, [
        addProcessLog,
        createStudentReportHtmlLabels,
        releaseGate.allowed,
        studentReport
    ]);

    const handleExportStudentReportPdf = useCallback(() => {
        if (!releaseGate.allowed) return;

        const pdfDraft = createStudentReportPdfDraft({
            hostedRelease: hostedReleaseReply,
            report: studentReport,
            teacherReview: teacherReviewReply
        });
        downloadFile({
            content: pdfDraft.pdf,
            filename: pdfDraft.filename,
            type: pdfDraft.mimeType
        });
        addProcessLog(LOG_TYPES.STUDENT_REPORT_PDF_EXPORTED);
    }, [
        addProcessLog,
        hostedReleaseReply,
        releaseGate.allowed,
        studentReport,
        teacherReviewReply
    ]);

    const handleHostReleasePage = useCallback(async () => {
        if (!releaseGate.allowed) return;

        setHostedReleaseStatus(RELEASE_AUDIT_STATUSES.LOADING);
        setHostedReleaseError('');
        addProcessLog(LOG_TYPES.RELEASE_HOSTING_SENT);

        try {
            const reply = await requestHostedReleasePage({
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl,
                payload: createHostedReleasePayload({
                    classSessionId: teacherClassSessionId || activeClassSessionId,
                    publicBaseUrl: globalThis && globalThis.location ? globalThis.location.origin : '',
                    projectSnapshot: {
                        assets: vm && Array.isArray(vm.assets) ? vm.assets : [],
                        projectJson: vm && typeof vm.toJSON === 'function' ? vm.toJSON() : null
                    },
                    releaseGate,
                    releasePreview
                })
            });
            setHostedReleaseReply(reply);
            setHostedReleaseStatus(RELEASE_AUDIT_STATUSES.READY);
            addProcessLog(reply && reply.blocked ?
                LOG_TYPES.RELEASE_HOSTING_BLOCKED :
                LOG_TYPES.RELEASE_HOSTING_RECEIVED);
        } catch (error) {
            setHostedReleaseError(error && error.message ? error.message : 'request failed');
            setHostedReleaseStatus(RELEASE_AUDIT_STATUSES.ERROR);
            addProcessLog(LOG_TYPES.RELEASE_HOSTING_FAILED);
        }
    }, [
        addProcessLog,
        activeClassSessionId,
        releaseGate,
        releasePreview,
        teacherClassSessionId,
        vm
    ]);

    const handleTeacherReview = useCallback(async () => {
        if (!releaseGate.allowed || !hostedReleaseReply) return;

        setTeacherReviewStatus(RELEASE_AUDIT_STATUSES.LOADING);
        setTeacherReviewError('');
        addProcessLog(LOG_TYPES.TEACHER_REVIEW_SENT);

        try {
            const reply = await requestTeacherReview({
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl,
                payload: createTeacherReviewPayload({
                    classSessionId: teacherClassSessionId || activeClassSessionId,
                    decision: teacherReviewDecision,
                    hostedRelease: hostedReleaseReply,
                    notes: teacherReviewNotes,
                    releaseGate,
                    releasePreview,
                    rubricReview: teacherRubricReview
                })
            });
            setTeacherReviewReply(reply);
            setTeacherReviewStatus(RELEASE_AUDIT_STATUSES.READY);
            addProcessLog(reply && reply.blocked ?
                LOG_TYPES.TEACHER_REVIEW_BLOCKED :
                LOG_TYPES.TEACHER_REVIEW_RECEIVED);
        } catch (error) {
            setTeacherReviewError(error && error.message ? error.message : 'request failed');
            setTeacherReviewStatus(RELEASE_AUDIT_STATUSES.ERROR);
            addProcessLog(LOG_TYPES.TEACHER_REVIEW_FAILED);
        }
    }, [
        addProcessLog,
        activeClassSessionId,
        hostedReleaseReply,
        releaseGate,
        releasePreview,
        teacherClassSessionId,
        teacherReviewDecision,
        teacherReviewNotes,
        teacherRubricReview
    ]);

    const handleSubmitReleaseAudit = useCallback(async () => {
        if (!releaseGate.allowed) return;

        setReleaseAuditStatus(RELEASE_AUDIT_STATUSES.LOADING);
        setReleaseAuditError('');
        addProcessLog(LOG_TYPES.RELEASE_AUDIT_SENT);

        try {
            const reply = await requestReleaseAudit({
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl,
                payload: createReleaseAuditPayload({
                    assetAdoptionState,
                    assetReply,
                    processLog,
                    releaseGate,
                    releasePreview
                })
            });

            setReleaseAuditReply(reply);
            setReleaseAuditStatus(RELEASE_AUDIT_STATUSES.READY);
            addProcessLog(reply && reply.blocked ? LOG_TYPES.RELEASE_AUDIT_BLOCKED : LOG_TYPES.RELEASE_AUDIT_RECEIVED);
        } catch (error) {
            setReleaseAuditError(error && error.message ? error.message : 'request failed');
            setReleaseAuditStatus(RELEASE_AUDIT_STATUSES.ERROR);
            addProcessLog(LOG_TYPES.RELEASE_AUDIT_FAILED);
        }
    }, [
        addProcessLog,
        assetAdoptionState,
        assetReply,
        releaseGate,
        processLog,
        releasePreview
    ]);

    const handleCheckReleaseAuditLifecycle = useCallback(async () => {
        setReleaseAuditLifecycleStatus(RELEASE_AUDIT_STATUSES.LOADING);
        setReleaseAuditLifecycleError('');
        addProcessLog(LOG_TYPES.RELEASE_AUDIT_POLICY_SENT);

        try {
            const reply = await requestReleaseAuditLifecycle({
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl
            });
            setReleaseAuditLifecycle(reply);
            setReleaseAuditLifecycleStatus(RELEASE_AUDIT_STATUSES.READY);
            addProcessLog(LOG_TYPES.RELEASE_AUDIT_POLICY_RECEIVED);
        } catch (error) {
            setReleaseAuditLifecycleError(error && error.message ? error.message : 'request failed');
            setReleaseAuditLifecycleStatus(RELEASE_AUDIT_STATUSES.ERROR);
            addProcessLog(LOG_TYPES.RELEASE_AUDIT_POLICY_FAILED);
        }
    }, [addProcessLog]);

    const handleCheckReleaseAdminSummary = useCallback(async () => {
        setReleaseAdminSummaryStatus(RELEASE_AUDIT_STATUSES.LOADING);
        setReleaseAdminSummaryError('');
        addProcessLog(LOG_TYPES.RELEASE_ADMIN_SUMMARY_SENT);

        try {
            const reply = await requestReleaseAdminSummary({
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl
            });
            setReleaseAdminSummary(reply);
            setReleaseAdminSummaryStatus(RELEASE_AUDIT_STATUSES.READY);
            addProcessLog(LOG_TYPES.RELEASE_ADMIN_SUMMARY_RECEIVED);
        } catch (error) {
            setReleaseAdminSummaryError(error && error.message ? error.message : 'request failed');
            setReleaseAdminSummaryStatus(RELEASE_AUDIT_STATUSES.ERROR);
            addProcessLog(LOG_TYPES.RELEASE_ADMIN_SUMMARY_FAILED);
        }
    }, [addProcessLog]);

    const handleReleaseApprovalQueueFilterChange = useCallback(event => {
        setReleaseApprovalQueueFilterStatus(event.target.value);
    }, []);

    const handleReleaseApprovalQueueSearchChange = useCallback(event => {
        setReleaseApprovalQueueSearchText(event.target.value.slice(0, 160));
    }, []);

    const handleReleaseApprovalQueueSelectReviewTarget = useCallback(item => {
        const releaseId = item && item.hostedReleaseId ? item.hostedReleaseId : '';
        if (!releaseId) return;

        setReleaseApprovalQueueSelectedHostedReleaseId(releaseId);
        if (item.teacherReview && item.teacherReview.status === 'needs-revision') {
            setTeacherReviewDecision('needs-revision');
        } else if (item.teacherReview && item.teacherReview.status === 'approved') {
            setTeacherReviewDecision('approved');
        }
        addProcessLog(LOG_TYPES.RELEASE_APPROVAL_QUEUE_TARGET_SELECTED, {
            releaseId
        });

        if (typeof document !== 'undefined' && document.querySelector) {
            const rubricPanel = document.querySelector('[data-testid="ai-logic-coach-teacher-rubric-review"]');
            if (rubricPanel && typeof rubricPanel.scrollIntoView === 'function') {
                rubricPanel.scrollIntoView({
                    block: 'start',
                    behavior: 'smooth'
                });
            }
        }
    }, [addProcessLog]);

    const handleJumpToAssetGenerator = useCallback(() => {
        if (typeof document === 'undefined' || !document.querySelector) return;

        const assetGenerator = document.querySelector('[data-testid="ai-logic-coach-asset-generator"]');
        if (assetGenerator && typeof assetGenerator.scrollIntoView === 'function') {
            assetGenerator.scrollIntoView({
                block: 'start',
                behavior: 'smooth'
            });
        }

        const assetPromptInput = document.querySelector('[data-testid="ai-logic-coach-asset-prompt"]');
        if (assetPromptInput && typeof assetPromptInput.focus === 'function') {
            assetPromptInput.focus();
        }
    }, []);

    const handleCheckReleaseApprovalQueue = useCallback(async () => {
        setReleaseApprovalQueueStatus(RELEASE_AUDIT_STATUSES.LOADING);
        setReleaseApprovalQueueError('');
        addProcessLog(LOG_TYPES.RELEASE_APPROVAL_QUEUE_SENT);

        try {
            const reply = await requestReleaseApprovalQueue({
                classSessionId: teacherClassSessionId || activeClassSessionId,
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl
            });
            setReleaseApprovalQueue(reply);
            setReleaseApprovalQueueSelectedHostedReleaseId(currentId => {
                const itemIds = reply && Array.isArray(reply.items) ?
                    reply.items.map(item => item.hostedReleaseId) :
                    [];
                return currentId && itemIds.includes(currentId) ? currentId : '';
            });
            setReleaseApprovalQueueStatus(RELEASE_AUDIT_STATUSES.READY);
            addProcessLog(LOG_TYPES.RELEASE_APPROVAL_QUEUE_RECEIVED);
        } catch (error) {
            setReleaseApprovalQueueError(error && error.message ? error.message : 'request failed');
            setReleaseApprovalQueueStatus(RELEASE_AUDIT_STATUSES.ERROR);
            addProcessLog(LOG_TYPES.RELEASE_APPROVAL_QUEUE_FAILED);
        }
    }, [
        activeClassSessionId,
        addProcessLog,
        teacherClassSessionId
    ]);

    const handleCheckReleaseResearchDataset = useCallback(async () => {
        setReleaseResearchDatasetStatus(RELEASE_AUDIT_STATUSES.LOADING);
        setReleaseResearchDatasetError('');
        addProcessLog(LOG_TYPES.RELEASE_RESEARCH_DATASET_SENT);

        try {
            const reply = await requestReleaseResearchDataset({
                middlewareUrl: aiFeatureFlags.scratchAIMiddlewareUrl
            });
            setReleaseResearchDataset(reply);
            setReleaseResearchDatasetStatus(RELEASE_AUDIT_STATUSES.READY);
            addProcessLog(LOG_TYPES.RELEASE_RESEARCH_DATASET_RECEIVED);
        } catch (error) {
            setReleaseResearchDatasetError(error && error.message ? error.message : 'request failed');
            setReleaseResearchDatasetStatus(RELEASE_AUDIT_STATUSES.ERROR);
            addProcessLog(LOG_TYPES.RELEASE_RESEARCH_DATASET_FAILED);
        }
    }, [addProcessLog]);

    return (
        <div className={styles.logicCoachRoot}>
            <button
                type="button"
                className={styles.toggleButton}
                title={intl.formatMessage(isOpen ? messages.closeCoach : messages.openCoach)}
                aria-label={intl.formatMessage(isOpen ? messages.closeCoach : messages.openCoach)}
                aria-controls="ai-logic-coach-panel"
                aria-expanded={isOpen}
                data-testid="ai-logic-coach-toggle"
                onClick={handleToggle}
            >
                <span className={styles.toggleGlyph}>AI</span>
                <span className={styles.toggleText}>
                    <FormattedMessage
                        id="gui.aiLogicCoach.shortName"
                        defaultMessage="Thinking Helper"
                        description="Short label for the AI logic coach toggle"
                    />
                </span>
            </button>
            {isOpen ? (
                <aside
                    className={styles.panel}
                    id="ai-logic-coach-panel"
                    aria-label={intl.formatMessage(messages.panel)}
                    data-testid="ai-logic-coach-panel"
                >
                    <div className={styles.panelHeader}>
                        <div>
                            <div className={styles.kicker}>
                                <FormattedMessage
                                    id="gui.aiLogicCoach.kicker"
                                    defaultMessage="Think first"
                                    description="Short guardrail label for the AI logic coach"
                                />
                            </div>
                            <h2 className={styles.title}>
                                <FormattedMessage
                                    id="gui.aiLogicCoach.title"
                                    defaultMessage="AI Thinking Helper"
                                    description="Title for the AI logic coach panel"
                                />
                            </h2>
                        </div>
                        <button
                            type="button"
                            className={styles.closeButton}
                            title={intl.formatMessage(messages.closeCoach)}
                            aria-label={intl.formatMessage(messages.closeCoach)}
                            onClick={handleClose}
                        >
                            x
                        </button>
                    </div>
                    {aiFeatureFlags.scratchAIImageBlocksEnabled ? (
                        <div
                            className={styles.quickActions}
                            data-testid="ai-logic-coach-quick-actions"
                        >
                            <button
                                type="button"
                                className={styles.quickActionButton}
                                data-testid="ai-logic-coach-asset-jump"
                                onClick={handleJumpToAssetGenerator}
                            >
                                <FormattedMessage {...messages.assetQuickJump} />
                            </button>
                        </div>
                    ) : null}
                    <section
                        className={styles.section}
                        data-testid="ai-logic-coach-project-map"
                    >
                        <h3 className={styles.sectionTitle}>
                            <FormattedMessage
                                id="gui.aiLogicCoach.projectMap"
                                defaultMessage="My project"
                                description="Heading for read-only Scratch project summary"
                            />
                        </h3>
                        <div className={styles.metricGrid}>
                            <SummaryMetric
                                label={(
                                    <FormattedMessage
                                        id="gui.aiLogicCoach.sprites"
                                        defaultMessage="Sprites"
                                        description="Sprite count label in project summary"
                                    />
                                )}
                                value={projectSummary.targets.sprites}
                            />
                            <SummaryMetric
                                label={(
                                    <FormattedMessage
                                        id="gui.aiLogicCoach.blocks"
                                        defaultMessage="Blocks"
                                        description="Block count label in project summary"
                                    />
                                )}
                                value={projectSummary.blocks.visible}
                            />
                            <SummaryMetric
                                label={(
                                    <FormattedMessage
                                        id="gui.aiLogicCoach.eventHats"
                                        defaultMessage="Starts"
                                        description="Event hat count label in project summary"
                                    />
                                )}
                                value={projectSummary.events.hats}
                            />
                            <SummaryMetric
                                label={(
                                    <FormattedMessage
                                        id="gui.aiLogicCoach.broadcasts"
                                        defaultMessage="Messages"
                                        description="Broadcast count label in project summary"
                                    />
                                )}
                                value={projectSummary.broadcasts.messages.length}
                            />
                        </div>
                        <TargetSummaryList targets={projectSummary.targets.items} />
                        <EventSummaryList events={projectSummary.events.eventHatCounts} />
                        <BroadcastSummaryList broadcasts={projectSummary.broadcasts.messages} />
                    </section>
                    {isLogicVisEnabled ? (
                        <section
                            className={styles.section}
                            data-testid="ai-logic-coach-logic-graph"
                        >
                            <h3 className={styles.sectionTitle}>
                                <FormattedMessage
                                    id="gui.aiLogicCoach.logicGraph"
                                    defaultMessage="Program path"
                                    description="Heading for read-only logic graph"
                                />
                            </h3>
                            <LogicFlowGraph
                                activePathId={activePathId}
                                broadcastLinks={logic.broadcastLinks}
                                flows={logic.flows}
                                onPathSelect={handlePathSelect}
                            />
                        </section>
                    ) : null}
                    <section
                        className={styles.section}
                        data-testid="ai-logic-coach-explain-gate"
                    >
                        <div className={styles.sectionHeaderRow}>
                            <h3 className={styles.sectionTitle}>
                                <FormattedMessage
                                    id="gui.aiLogicCoach.explainGate"
                                    defaultMessage="Say it first"
                                    description="Heading for explain gate form"
                                />
                            </h3>
                            <GateStatusBadge state={gateState} />
                        </div>
                        <ExplainGateField
                            id="ai-logic-coach-goal"
                            isActive={activePathId === EXPLAIN_GATE_PATH_IDS.goal}
                            label={<FormattedMessage {...messages.goal} />}
                            pathId={EXPLAIN_GATE_PATH_IDS.goal}
                            placeholder={intl.formatMessage(messages.goalPlaceholder)}
                            value={gateDraft.goal}
                            onChange={handleGoalChange}
                            onPathSelect={handlePathSelect}
                        />
                        <ExplainGateField
                            id="ai-logic-coach-logic"
                            isActive={activePathId === EXPLAIN_GATE_PATH_IDS.logic}
                            label={<FormattedMessage {...messages.logic} />}
                            pathId={EXPLAIN_GATE_PATH_IDS.logic}
                            placeholder={intl.formatMessage(messages.logicPlaceholder)}
                            value={gateDraft.logic}
                            onChange={handleLogicChange}
                            onPathSelect={handlePathSelect}
                        />
                        <ExplainGateField
                            id="ai-logic-coach-evidence"
                            isActive={activePathId === EXPLAIN_GATE_PATH_IDS.evidence}
                            label={<FormattedMessage {...messages.evidence} />}
                            pathId={EXPLAIN_GATE_PATH_IDS.evidence}
                            placeholder={intl.formatMessage(messages.evidencePlaceholder)}
                            value={gateDraft.evidence}
                            onChange={handleEvidenceChange}
                            onPathSelect={handlePathSelect}
                        />
                        <button
                            type="button"
                            className={styles.reviewButton}
                            disabled={!isGateComplete || gateState === EXPLAIN_GATE_STATES.REVIEWED}
                            data-testid="ai-logic-coach-review-gate"
                            onClick={handleReviewGate}
                        >
                            {gateState === EXPLAIN_GATE_STATES.REVIEWED ? (
                                <FormattedMessage
                                    id="gui.aiLogicCoach.reviewedGate"
                                    defaultMessage="Checked"
                                    description="Reviewed button label in explain gate"
                                />
                            ) : (
                                <FormattedMessage
                                    id="gui.aiLogicCoach.reviewGate"
                                    defaultMessage="I checked it"
                                    description="Button label for marking the explain gate reviewed"
                                />
                            )}
                        </button>
                    </section>
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <FormattedMessage {...messages.evidenceChecklist} />
                        </h3>
                        <EvidenceChecklist
                            activePathId={activePathId}
                            checklist={evidenceChecklist}
                            onPathSelect={handlePathSelect}
                        />
                    </section>
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <FormattedMessage {...messages.scriptExplanation} />
                        </h3>
                        <ScriptExplanationPanel
                            explanation={scriptExplanation}
                            generationGateAllowed={generationGate.allowed}
                            selectedExplanation={selectedScriptExplanation}
                            onExplain={handleExplainScript}
                        />
                    </section>
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <FormattedMessage {...messages.blockDraft} />
                        </h3>
                        <BlockDraftPanel
                            draft={blockDraft}
                            generationGateAllowed={generationGate.allowed}
                            isScriptDraftLoading={scriptDraftStatus === MODEL_REPLY_STATUSES.LOADING}
                            modelConsent={modelConsent}
                            selectedDraft={selectedBlockDraft}
                            scriptDraft={scriptDraft}
                            scriptDraftError={scriptDraftError}
                            scriptDraftStatus={scriptDraftStatus}
                            onConsentChange={handleModelConsentChange}
                            onCreate={handleCreateBlockDraft}
                            onCreateScriptDraft={handleCreateScriptDraft}
                            onInsertScriptDraft={handleInsertScriptDraft}
                        />
                    </section>
                    {isProjectPlannerEnabled ? (
                        <section className={styles.section}>
                            <h3 className={styles.sectionTitle}>
                                <FormattedMessage {...messages.projectPlan} />
                            </h3>
                            <ProjectPlanPanel
                                activeConceptId={activePlanConceptId}
                                activePathId={activePathId}
                                plan={projectPlan}
                                onConceptSelect={handleProjectPlanConceptSelect}
                                onPathSelect={handlePathSelect}
                            />
                        </section>
                    ) : null}
                    {isQ18ToolsEnabled ? (
                        <section className={styles.section}>
                            <h3 className={styles.sectionTitle}>
                                <FormattedMessage {...messages.q18Tools} />
                            </h3>
                            <Q18PreviewTools
                                additionDraft={q18AdditionDraft}
                                additionEnabled={isQ18AdditionEnabled}
                                additionGoal={q18AdditionGoal}
                                generationGateAllowed={generationGate.allowed}
                                oneLineDraft={q18OneLineDraft}
                                oneLineEnabled={isQ18OneLineEnabled}
                                oneLineGoal={q18OneLineGoal}
                                voiceDraft={q18VoiceDraft}
                                voiceEnabled={isQ18VoiceEnabled}
                                voiceText={q18VoiceText}
                                onAdditionGoalChange={handleQ18AdditionGoalChange}
                                onCreateAddition={handleCreateQ18AdditionDraft}
                                onCreateOneLine={handleCreateQ18OneLineDraft}
                                onCreateVoice={handleCreateQ18VoiceDraft}
                                onOneLineGoalChange={handleQ18OneLineGoalChange}
                                onVoiceTextChange={handleQ18VoiceTextChange}
                            />
                        </section>
                    ) : null}
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <FormattedMessage
                                id="gui.aiLogicCoach.questionQueue"
                                defaultMessage="Think about this"
                                description="Heading for AI logic coach question prompts"
                            />
                        </h3>
                        <ol
                            className={styles.questionList}
                            data-testid="ai-logic-coach-question-list"
                        >
                            {socraticQuestions.map(question => (
                                <LogicCoachQuestion
                                    activePathId={activePathId}
                                    key={question.id}
                                    onPathSelect={handlePathSelect}
                                    question={question}
                                />
                            ))}
                        </ol>
                    </section>
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <FormattedMessage {...messages.modelCoach} />
                        </h3>
                        <ModelCoach
                            activePathId={activePathId}
                            consentChecked={modelConsent}
                            generationGateAllowed={generationGate.allowed}
                            isLoading={modelStatus === MODEL_REPLY_STATUSES.LOADING}
                            modelError={modelError}
                            modelReply={modelReply}
                            modelReplyPathAliases={modelReplyPathAliases}
                            modelStatus={modelStatus}
                            questionText={modelQuestion}
                            onCancel={handleCancelModelRequest}
                            onConsentChange={handleModelConsentChange}
                            onPathSelect={handleModelReplyPathSelect}
                            onQuestionChange={handleModelQuestionChange}
                            onSubmit={handleAskModel}
                        />
                    </section>
                    {aiFeatureFlags.scratchAIImageBlocksEnabled ? (
                        <section className={styles.section}>
                            <h3 className={styles.sectionTitle}>
                                <FormattedMessage {...messages.assetGenerator} />
                            </h3>
                            <AssetJobDraft
                                assetAdoptionSummary={assetAdoptionSummary}
                                assetConsent={assetConsent}
                                assetError={assetError}
                                assetPrompt={assetPrompt}
                                assetReply={assetReply}
                                assetStatus={assetStatus}
                                assetType={assetType}
                                generationGateAllowed={generationGate.allowed}
                                onCancel={handleCancelAssetRequest}
                                onAdoptAsset={handleAdoptAssetDraft}
                                onAssetConsentChange={handleAssetConsentChange}
                                onAssetPromptChange={handleAssetPromptChange}
                                onAssetTypeSelect={handleAssetTypeSelect}
                                onImportAsset={handleImportAssetDraft}
                                onRecordAssetEdit={handleRecordAssetEdit}
                                onReviewAsset={handleReviewAssetDraft}
                                onSubmit={handleSubmitAssetJob}
                            />
                        </section>
                    ) : null}
                    {aiFeatureFlags.scratchAITeacherPanelEnabled ? (
                        <section className={styles.section}>
                            <h3 className={styles.sectionTitle}>
                                <FormattedMessage {...messages.teacherTools} />
                            </h3>
                            <TeacherTools
                                activeClassSessionId={activeClassSessionId}
                                activeKnowledgeLockError={activeKnowledgeLockError}
                                activeKnowledgeLockReply={activeKnowledgeLockReply}
                                activeKnowledgeLockStatus={activeKnowledgeLockStatus}
                                gradeBand={teacherGradeBand}
                                knowledgeLockError={knowledgeLockError}
                                knowledgeLockReply={knowledgeLockReply}
                                knowledgeLockStatus={knowledgeLockStatus}
                                lessonDuration={lessonDuration}
                                lessonGoal={lessonGoal}
                                lessonPrepError={lessonPrepError}
                                lessonPrepReply={lessonPrepReply}
                                lessonPrepStatus={lessonPrepStatus}
                                lessonTitle={lessonTitle}
                                persistKnowledgeLock={persistKnowledgeLock}
                                selectedKnowledgePointIds={selectedKnowledgePointIds}
                                teacherClassSessionId={teacherClassSessionId}
                                teacherConsent={teacherConsent}
                                teacherId={teacherId}
                                teacherPassword={teacherPassword}
                                teacherAccountAdminError={teacherAccountAdminError}
                                teacherAccountAdminReply={teacherAccountAdminReply}
                                teacherAccountAdminStatus={teacherAccountAdminStatus}
                                teacherAdminClassSessionIdsText={teacherAdminClassSessionIdsText}
                                teacherAdminDisplayName={teacherAdminDisplayName}
                                teacherAdminPassword={teacherAdminPassword}
                                teacherAdminRole={teacherAdminRole}
                                teacherAdminTeacherId={teacherAdminTeacherId}
                                teacherSessionError={teacherSessionError}
                                teacherSessionReply={teacherSessionReply}
                                teacherSessionStatus={teacherSessionStatus}
                                onActiveClassSessionChange={handleActiveClassSessionChange}
                                onClassSessionChange={handleTeacherClassSessionChange}
                                onClassSessionSelect={selectTeacherClassSession}
                                onGradeBandChange={handleTeacherGradeBandChange}
                                onKnowledgePointToggle={handleKnowledgePointToggle}
                                onLessonDurationChange={handleLessonDurationChange}
                                onLessonGoalChange={handleLessonGoalChange}
                                onLessonTitleChange={handleLessonTitleChange}
                                onPersistKnowledgeLockChange={handlePersistKnowledgeLockChange}
                                onSubmitKnowledgeLock={handleSubmitKnowledgeLock}
                                onSubmitLessonPrep={handleSubmitLessonPrep}
                                onTeacherAccountSelect={handleTeacherAccountSelect}
                                onTeacherAdminActivateAccount={handleTeacherAdminActivateAccount}
                                onTeacherAdminClassSessionIdsTextChange={handleTeacherAdminClassSessionIdsTextChange}
                                onTeacherAdminCreateAccount={handleTeacherAdminCreateAccount}
                                onTeacherAdminDeactivateAccount={handleTeacherAdminDeactivateAccount}
                                onTeacherAdminDisplayNameChange={handleTeacherAdminDisplayNameChange}
                                onTeacherAdminPasswordChange={handleTeacherAdminPasswordChange}
                                onTeacherAdminRefreshAccounts={refreshTeacherAccounts}
                                onTeacherAdminResetPassword={handleTeacherAdminResetPassword}
                                onTeacherAdminRoleChange={handleTeacherAdminRoleChange}
                                onTeacherAdminTeacherIdChange={handleTeacherAdminTeacherIdChange}
                                onTeacherAdminUpdateAccount={handleTeacherAdminUpdateAccount}
                                onTeacherConsentChange={handleTeacherConsentChange}
                                onTeacherIdChange={handleTeacherIdChange}
                                onTeacherLogin={handleTeacherLogin}
                                onTeacherLogout={handleTeacherLogout}
                                onTeacherPasswordChange={handleTeacherPasswordChange}
                                onRefreshActiveKnowledgeLock={handleRefreshActiveKnowledgeLock}
                            />
                        </section>
                    ) : null}
                    {isPublishingEnabled ? (
                        <React.Fragment>
                            <section className={styles.section}>
                                <h3 className={styles.sectionTitle}>
                                    <FormattedMessage {...messages.releaseDraft} />
                                </h3>
                                <ReleaseDraft
                                    draft={releaseDraft}
                                    summary={releaseDraftSummary}
                                    onFieldChange={handleReleaseDraftFieldChange}
                                />
                            </section>
                            <section className={styles.section}>
                                <h3 className={styles.sectionTitle}>
                                    <FormattedMessage {...messages.releasePreview} />
                                </h3>
                                <ReleasePreview
                                    adminSummary={releaseAdminSummary}
                                    adminSummaryError={releaseAdminSummaryError}
                                    adminSummaryStatus={releaseAdminSummaryStatus}
                                    approvalQueue={releaseApprovalQueue}
                                    approvalQueueError={releaseApprovalQueueError}
                                    approvalQueueFilterStatus={releaseApprovalQueueFilterStatus}
                                    approvalQueueSearchText={releaseApprovalQueueSearchText}
                                    approvalQueueSelectedHostedReleaseId={releaseApprovalQueueSelectedHostedReleaseId}
                                    approvalQueueStatus={releaseApprovalQueueStatus}
                                    auditError={releaseAuditError}
                                    auditLifecycle={releaseAuditLifecycle}
                                    auditLifecycleError={releaseAuditLifecycleError}
                                    auditLifecycleStatus={releaseAuditLifecycleStatus}
                                    auditReply={releaseAuditReply}
                                    auditStatus={releaseAuditStatus}
                                    hostedRelease={hostedReleaseReply}
                                    hostedReleaseError={hostedReleaseError}
                                    hostedReleaseStatus={hostedReleaseStatus}
                                    preview={releasePreview}
                                    releaseGate={releaseGate}
                                    researchDataset={releaseResearchDataset}
                                    researchDatasetError={releaseResearchDatasetError}
                                    researchDatasetStatus={releaseResearchDatasetStatus}
                                    teacherReview={teacherReviewReply}
                                    teacherReviewDecision={teacherReviewDecision}
                                    teacherReviewError={teacherReviewError}
                                    teacherReviewNotes={teacherReviewNotes}
                                    teacherRubricReview={teacherRubricReview}
                                    teacherReviewStatus={teacherReviewStatus}
                                    onAudit={handleSubmitReleaseAudit}
                                    onAuditLifecycle={handleCheckReleaseAuditLifecycle}
                                    onAdminSummary={handleCheckReleaseAdminSummary}
                                    onExport={handleExportReleaseHtml}
                                    onExportPdf={handleExportStudentReportPdf}
                                    onHostPage={handleHostReleasePage}
                                    onApprovalQueue={handleCheckReleaseApprovalQueue}
                                    onApprovalQueueFilterChange={handleReleaseApprovalQueueFilterChange}
                                    onApprovalQueueSearchChange={handleReleaseApprovalQueueSearchChange}
                                    onApprovalQueueSelectReviewTarget={handleReleaseApprovalQueueSelectReviewTarget}
                                    onResearchDataset={handleCheckReleaseResearchDataset}
                                    onStudentReport={handleExportStudentReportHtml}
                                    onTeacherReview={handleTeacherReview}
                                    onTeacherReviewDecisionChange={handleTeacherReviewDecisionChange}
                                    onTeacherReviewNotesChange={handleTeacherReviewNotesChange}
                                    onTeacherRubricEvidenceChange={handleTeacherRubricEvidenceChange}
                                    onTeacherRubricLevelChange={handleTeacherRubricLevelChange}
                                />
                            </section>
                        </React.Fragment>
                    ) : null}
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <FormattedMessage
                                id="gui.aiLogicCoach.processLog"
                                defaultMessage="What I did"
                                description="Heading for AI logic coach process log"
                            />
                        </h3>
                        <ProcessLogList entries={processLog} />
                    </section>
                </aside>
            ) : null}
        </div>
    );
};

AILogicCoach.propTypes = {
    onActivateCostumesTab: PropTypes.func,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default AILogicCoach;

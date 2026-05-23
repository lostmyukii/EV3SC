/* eslint-disable arrow-parens, @stylistic/arrow-parens */
import {escapeHtml} from './release-html.js';
import {createTeacherPolicySummary} from './teacher-policy.js';

const DEFAULT_STUDENT_REPORT_LABELS = Object.freeze({
    aiHelp: 'AI help',
    asset: 'Asset adoption',
    assetEmpty: 'No AI asset draft was used.',
    assetSummary: 'Imported: {imported}. Edits: {edits}. Adopted: {adopted}.',
    blocked: 'Needs revision',
    check: 'Check score',
    logic: 'Program paths',
    logicEmpty: 'No started script was captured yet.',
    logicFlow: '{target} script {script}: {entry}, {blocks} blocks.',
    next: 'Next step',
    product: 'Product',
    ready: 'Ready',
    safeguards: 'Safeguards',
    teacherPolicy: 'Teacher lock',
    teacherPolicyEmpty: 'No teacher knowledge lock was attached.',
    teacherQuestion: 'Questions',
    teacherRubric: 'Rubric',
    title: 'Student report',
    userFeedback: 'User feedback'
});

const REPORT_FLOW_LIMIT = 5;
const DEFAULT_CLASS_SESSION_ID = 'default-class-session';
const DEFAULT_STUDENT_SCOPE_ID = 'anonymous-student';

const readArray = (value) => (Array.isArray(value) ? value : []);

const readNumber = (value) => (Number.isFinite(value) ? value : 0);

const readText = (value, fallback = '') => (
    typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const normalizeScopeId = (value, fallback) => readText(value)
    .replace(/[^A-Za-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;

const interpolate = (template, values = {}) => Object.keys(values).reduce((result, key) => (
    result.replace(new RegExp(`\\{${key}\\}`, 'g'), values[key])
), template);

const boolLabel = (value) => (value ? 'yes' : 'no');

const createStudentReportLogicFlows = (releasePreview) => readArray(releasePreview && releasePreview.logicFlows)
    .slice(0, REPORT_FLOW_LIMIT)
    .map((flow, index) => ({
        blockCount: readNumber(flow && flow.blockCount),
        broadcastCount: readNumber(flow && flow.broadcastCount),
        scriptIndex: readNumber(flow && flow.scriptIndex) || index + 1,
        targetLabel: readText(flow && flow.targetName, 'Sprite') === 'Stage' ? 'Stage' : 'Sprite',
        triggerLabel: readText(flow && flow.triggerLabel, 'start')
    }));

const createStudentReport = ({
    assetAdoptionSummary,
    classSessionId,
    releaseGate,
    releasePreview,
    studentScopeId,
    teacherPolicy
} = {}) => {
    const metrics = releasePreview && releasePreview.metrics ? releasePreview.metrics : {};
    const aiSummary = releasePreview && releasePreview.aiSummary ? releasePreview.aiSummary : {};
    const hasAssetDraft = assetAdoptionSummary && assetAdoptionSummary.hasAsset === true;
    const teacherPolicySummary = createTeacherPolicySummary({
        teacherPolicy
    });

    return {
        schemaVersion: 'scratch-ai-student-report-v1',
        status: releaseGate && releaseGate.allowed === true ? 'ready' : 'blocked',
        blockedReasons: readArray(releaseGate && releaseGate.reasons).slice(0, 8),
        scope: {
            classSession: {
                id: normalizeScopeId(classSessionId, DEFAULT_CLASS_SESSION_ID),
                scoped: true
            },
            student: {
                id: normalizeScopeId(studentScopeId, DEFAULT_STUDENT_SCOPE_ID),
                scoped: true
            },
            storage: 'browser-local-export'
        },
        release: {
            version: readText(releasePreview && releasePreview.version, '1.1'),
            productLine: readText(releasePreview && releasePreview.productLine),
            userFeedback: readText(releasePreview && releasePreview.userFeedback),
            iterationPlan: readText(releasePreview && releasePreview.iterationPlan)
        },
        metrics: {
            blocks: readNumber(metrics.blocks),
            checkMaxScore: readNumber(metrics.checkMaxScore),
            checkScore: readNumber(metrics.checkScore),
            sprites: readNumber(metrics.sprites),
            starts: readNumber(metrics.starts)
        },
        logicFlows: createStudentReportLogicFlows(releasePreview),
        aiSummary: {
            blocked: readNumber(aiSummary.blocked),
            questions: readNumber(aiSummary.questions),
            replies: readNumber(aiSummary.replies)
        },
        assetSummary: {
            adopted: hasAssetDraft && assetAdoptionSummary.adopted === true,
            importedToCostumeEditor: hasAssetDraft && assetAdoptionSummary.imported === true,
            present: hasAssetDraft,
            visualEditCount: hasAssetDraft ? readNumber(assetAdoptionSummary.visualEditCount) : 0
        },
        teacherPolicy: {
            active: teacherPolicySummary.active === true,
            title: readText(teacherPolicySummary.title),
            selectedKnowledgePoints: readArray(teacherPolicySummary.selectedKnowledgePoints).map(point => ({
                id: readText(point && point.id),
                label: readText(point && point.label)
            })),
            questionRules: readArray(teacherPolicySummary.questionRules).map(rule => ({
                knowledgePointId: readText(rule && rule.knowledgePointId),
                text: readText(rule && rule.text)
            })),
            rubric: readArray(teacherPolicySummary.rubric).map(item => ({
                knowledgePointId: readText(item && item.knowledgePointId),
                label: readText(item && item.label),
                criteria: readText(item && item.criteria),
                levels: readArray(item && item.levels)
                    .slice(0, 4)
                    .map(level => readText(level))
                    .filter(Boolean)
            }))
        },
        safeguards: {
            aiLogWrittenToSb3: false,
            classRosterIncluded: false,
            rawProjectIncluded: false,
            scratchProjectMutated: false,
            studentIdentityIncluded: false,
            studentScoped: true
        }
    };
};

const createStudentReportHtmlFilename = (report) => {
    const version = report && report.release && report.release.version ? String(report.release.version) : '1.1';
    const safeVersion = version.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || '1-1';
    return `scratch-ai-student-report-${safeVersion}.html`;
};

const createTeacherPolicyHtml = (report, labels) => {
    const teacherPolicy = report.teacherPolicy || {};
    if (!teacherPolicy.active) {
        return `<p class="empty">${escapeHtml(labels.teacherPolicyEmpty)}</p>`;
    }

    const selectedLabels = readArray(teacherPolicy.selectedKnowledgePoints)
        .map(point => point.label)
        .filter(Boolean)
        .join(', ');
    const questionItems = readArray(teacherPolicy.questionRules)
        .slice(0, REPORT_FLOW_LIMIT)
        .map(rule => `
          <li>${escapeHtml(rule.text)}</li>`)
        .join('\n');
    const rubricItems = readArray(teacherPolicy.rubric)
        .slice(0, REPORT_FLOW_LIMIT)
        .map(item => `
          <li>${escapeHtml(`${item.label}: ${item.criteria}`)}</li>`)
        .join('\n');

    return `
        <p class="text">${escapeHtml(selectedLabels || teacherPolicy.title)}</p>
        <div class="label">${escapeHtml(labels.teacherQuestion)}</div>
        <ol>
${questionItems || `          <li>${escapeHtml(labels.teacherPolicyEmpty)}</li>`}
        </ol>
        <div class="label">${escapeHtml(labels.teacherRubric)}</div>
        <ol>
${rubricItems || `          <li>${escapeHtml(labels.teacherPolicyEmpty)}</li>`}
        </ol>`;
};

const createLogicHtml = (report, labels) => {
    if (!report.logicFlows.length) {
        return `<p class="empty">${escapeHtml(labels.logicEmpty)}</p>`;
    }

    const createFlowText = flow => interpolate(labels.logicFlow, {
        blocks: flow.blockCount,
        entry: flow.triggerLabel,
        script: flow.scriptIndex,
        target: flow.targetLabel
    });
    const flowItems = report.logicFlows.map(flow => `
          <li>${escapeHtml(createFlowText(flow))}</li>`).join('\n');

    return `
        <ol>
${flowItems}
        </ol>`;
};

const createStudentReportHtml = ({
    labels = DEFAULT_STUDENT_REPORT_LABELS,
    report = createStudentReport()
} = {}) => {
    const mergedLabels = Object.assign({}, DEFAULT_STUDENT_REPORT_LABELS, labels);
    const statusLabel = report.status === 'ready' ? mergedLabels.ready : mergedLabels.blocked;
    const checkValue = `${report.metrics.checkScore}/${report.metrics.checkMaxScore}`;
    const assetText = report.assetSummary.present ?
        interpolate(mergedLabels.assetSummary, {
            adopted: boolLabel(report.assetSummary.adopted),
            edits: report.assetSummary.visualEditCount,
            imported: boolLabel(report.assetSummary.importedToCostumeEditor)
        }) :
        mergedLabels.assetEmpty;
    const blockedReasons = report.blockedReasons.length ? report.blockedReasons.join(', ') : 'none';
    const aiSummaryText = `${report.aiSummary.questions} questions / ` +
        `${report.aiSummary.replies} hints / ${report.aiSummary.blocked} stops`;
    const safeguardText = `rawProjectIncluded=false; studentIdentityIncluded=false; ` +
        `classRosterIncluded=false; ` +
        `studentScoped=true; ` +
        `blockedReasons=${blockedReasons}`;
    const title = report.release.productLine || mergedLabels.title;

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      background: #f7f9fc;
      color: #172033;
      font-family: Arial, "Helvetica Neue", sans-serif;
      line-height: 1.45;
    }
    main {
      width: min(860px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0;
    }
    header,
    section {
      margin-bottom: 14px;
      padding: 18px;
      border: 1px solid #d8e0ec;
      border-radius: 8px;
      background: #fff;
    }
    h1 {
      margin: 8px 0 0;
      font-size: 26px;
      line-height: 1.2;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 17px;
    }
    .status {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: #e8f6ef;
      color: #0b7d53;
      font-size: 13px;
      font-weight: 700;
    }
    .blocked {
      background: #fff2d6;
      color: #8a5a00;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .metric {
      padding: 12px;
      border-radius: 8px;
      background: #f7f9fc;
      text-align: center;
    }
    .metric strong {
      display: block;
      color: #0b72d9;
      font-size: 21px;
    }
    .label,
    .empty,
    .metric span {
      color: #5d6f91;
      font-size: 13px;
      font-weight: 700;
    }
    .text,
    li {
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <span class="status${report.status === 'ready' ? '' : ' blocked'}">${escapeHtml(statusLabel)}</span>
      <h1>${escapeHtml(title)}</h1>
    </header>
    <section>
      <div class="label">${escapeHtml(mergedLabels.product)}</div>
      <p class="text">${escapeHtml(report.release.productLine)}</p>
    </section>
    <section>
      <div class="label">${escapeHtml(mergedLabels.userFeedback)}</div>
      <p class="text">${escapeHtml(report.release.userFeedback)}</p>
    </section>
    <section>
      <div class="label">${escapeHtml(mergedLabels.next)}</div>
      <p class="text">${escapeHtml(report.release.iterationPlan)}</p>
    </section>
    <section>
      <h2>${escapeHtml(mergedLabels.check)}</h2>
      <div class="grid">
        <div class="metric"><strong>${escapeHtml(report.metrics.sprites)}</strong><span>sprites</span></div>
        <div class="metric"><strong>${escapeHtml(report.metrics.starts)}</strong><span>starts</span></div>
        <div class="metric"><strong>${escapeHtml(report.metrics.blocks)}</strong><span>blocks</span></div>
        <div class="metric"><strong>${escapeHtml(checkValue)}</strong><span>check</span></div>
      </div>
    </section>
    <section>
      <h2>${escapeHtml(mergedLabels.logic)}</h2>
${createLogicHtml(report, mergedLabels)}
    </section>
    <section>
      <h2>${escapeHtml(mergedLabels.aiHelp)}</h2>
      <p class="text">${escapeHtml(aiSummaryText)}</p>
    </section>
    <section>
      <h2>${escapeHtml(mergedLabels.asset)}</h2>
      <p class="text">${escapeHtml(assetText)}</p>
    </section>
    <section>
      <h2>${escapeHtml(mergedLabels.teacherPolicy)}</h2>
${createTeacherPolicyHtml(report, mergedLabels)}
    </section>
    <section>
      <h2>${escapeHtml(mergedLabels.safeguards)}</h2>
      <p class="text">${escapeHtml(safeguardText)}</p>
    </section>
  </main>
</body>
</html>`;
};

export {
    DEFAULT_STUDENT_REPORT_LABELS,
    createStudentReport,
    createStudentReportHtml,
    createStudentReportHtmlFilename
};

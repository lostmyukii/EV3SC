const DEFAULT_RELEASE_HTML_LABELS = Object.freeze({
    aiHelp: 'AI help',
    aiSummary: '{questions} questions / {replies} hints / {blocked} safety stops',
    blocks: 'blocks',
    check: 'check',
    draftStatus: 'Draft',
    feedback: 'What users said',
    logic: 'Program paths',
    logicEmpty: 'Add a starting block to show a program path.',
    logicFlow: '{target} script {script}: starts with {entry}, has {blocks} blocks.',
    logicFlowBroadcasts: 'sends {count} messages',
    next: 'Next in 1.1',
    product: 'What I made',
    readyStatus: 'Ready to show',
    sprites: 'sprites',
    starts: 'starts',
    stats: 'Project snapshot',
    title: 'Scratch AI release draft'
});

const escapeHtml = value => String(value === null || typeof value === 'undefined' ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const interpolate = (template, values = {}) => Object.keys(values).reduce((result, key) => (
    result.replace(new RegExp(`\\{${key}\\}`, 'g'), values[key])
), template);

const safeText = value => escapeHtml(value || '');

const createMetricHtml = (label, value) => `
        <div class="metric">
          <strong>${safeText(value)}</strong>
          <span>${safeText(label)}</span>
        </div>`;

const createLogicFlowHtml = (flow, labels) => {
    const mainText = interpolate(labels.logicFlow, {
        blocks: flow.blockCount,
        entry: flow.triggerLabel,
        script: flow.scriptIndex,
        target: flow.targetName
    });
    const broadcastText = interpolate(labels.logicFlowBroadcasts, {
        count: flow.broadcastCount
    });
    const broadcastHtml = flow.broadcastCount > 0 ? `
            <span>${safeText(broadcastText)}</span>` : '';

    return `
          <li>
            ${safeText(mainText)}
${broadcastHtml}
          </li>`;
};

const createLogicHtml = (preview, labels) => {
    if (!preview.logicFlows || !preview.logicFlows.length) {
        return `<p class="empty">${safeText(labels.logicEmpty)}</p>`;
    }
    return `
        <ol>
${preview.logicFlows.map(flow => createLogicFlowHtml(flow, labels)).join('\n')}
        </ol>`;
};

const createReleasePreviewHtmlFilename = preview => {
    const version = preview && preview.version ? String(preview.version) : '1.1';
    const safeVersion = version.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || '1-1';
    return `scratch-ai-release-${safeVersion}.html`;
};

const createReleasePreviewHtml = ({
    labels = DEFAULT_RELEASE_HTML_LABELS,
    preview = {}
} = {}) => {
    const mergedLabels = Object.assign({}, DEFAULT_RELEASE_HTML_LABELS, labels);
    const metrics = preview.metrics || {};
    const aiSummary = preview.aiSummary || {};
    const statusLabel = preview.status === 'ready' ? mergedLabels.readyStatus : mergedLabels.draftStatus;
    const title = preview.productLine || mergedLabels.title;
    const checkValue = `${metrics.checkScore || 0}/${metrics.checkMaxScore || 0}`;
    const aiText = interpolate(mergedLabels.aiSummary, {
        blocked: aiSummary.blocked || 0,
        questions: aiSummary.questions || 0,
        replies: aiSummary.replies || 0
    });
    const metricsHtml = [
        createMetricHtml(mergedLabels.sprites, metrics.sprites || 0),
        createMetricHtml(mergedLabels.starts, metrics.starts || 0),
        createMetricHtml(mergedLabels.blocks, metrics.blocks || 0),
        createMetricHtml(mergedLabels.check, checkValue)
    ].join('\n');

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeText(title)}</title>
  <style>
    body {
      margin: 0;
      background: #f5f8ff;
      color: #172033;
      font-family: Arial, "Helvetica Neue", sans-serif;
      line-height: 1.45;
    }
    main {
      width: min(880px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0;
    }
    header,
    section {
      margin-bottom: 16px;
      padding: 20px;
      border: 1px solid #d7e3ff;
      border-radius: 8px;
      background: #fff;
    }
    h1 {
      margin: 8px 0 0;
      font-size: 28px;
      line-height: 1.2;
    }
    h2 {
      margin: 0 0 10px;
      font-size: 18px;
    }
    .version,
    .status,
    .label,
    .metric span,
    li span,
    .empty {
      color: #5d6f91;
      font-size: 13px;
      font-weight: 700;
    }
    .status {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: #e8f6ef;
      color: #0b7d53;
    }
    .text {
      margin: 4px 0 0;
      white-space: pre-wrap;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .metric {
      padding: 12px;
      border-radius: 8px;
      background: #f5f8ff;
      text-align: center;
    }
    .metric strong {
      display: block;
      color: #0b72d9;
      font-size: 22px;
    }
    ol {
      margin: 0;
      padding-left: 22px;
    }
    li {
      margin: 8px 0;
      padding: 10px;
      border-radius: 8px;
      background: #f5f8ff;
    }
    li span {
      display: block;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <span class="version">${safeText(preview.version || '1.1')}</span>
      <h1>${safeText(title)}</h1>
      <span class="status">${safeText(statusLabel)}</span>
    </header>
    <section>
      <div class="label">${safeText(mergedLabels.product)}</div>
      <p class="text">${safeText(preview.productLine)}</p>
    </section>
    <section>
      <div class="label">${safeText(mergedLabels.feedback)}</div>
      <p class="text">${safeText(preview.userFeedback)}</p>
    </section>
    <section>
      <div class="label">${safeText(mergedLabels.next)}</div>
      <p class="text">${safeText(preview.iterationPlan)}</p>
    </section>
    <section>
      <h2>${safeText(mergedLabels.stats)}</h2>
      <div class="metrics">
${metricsHtml}
      </div>
    </section>
    <section>
      <h2>${safeText(mergedLabels.logic)}</h2>
${createLogicHtml(preview, mergedLabels)}
    </section>
    <section>
      <h2>${safeText(mergedLabels.aiHelp)}</h2>
      <p class="text">${safeText(aiText)}</p>
    </section>
  </main>
</body>
</html>`;
};

export {
    DEFAULT_RELEASE_HTML_LABELS,
    createReleasePreviewHtml,
    createReleasePreviewHtmlFilename,
    escapeHtml
};

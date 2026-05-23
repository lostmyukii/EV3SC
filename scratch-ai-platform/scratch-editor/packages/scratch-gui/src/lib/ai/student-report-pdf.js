/* eslint-disable arrow-parens */
const PDF_SCHEMA_VERSION = 'scratch-ai-student-report-pdf-v1';
const PDF_TEMPLATE_VERSION = 'scratch-ai-teacher-evaluation-pdf-template-v1';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN_X = 48;
const PAGE_MARGIN_Y = 46;
const MAX_TEXT_LENGTH = 180;
const RUBRIC_LIMIT = 8;

const PDF_STYLES = Object.freeze({
    body: {
        font: '/F1',
        lineHeight: 14,
        size: 10
    },
    heading: {
        font: '/F2',
        lineHeight: 18,
        size: 13
    },
    meta: {
        font: '/F1',
        lineHeight: 12,
        size: 9
    },
    title: {
        font: '/F2',
        lineHeight: 24,
        size: 17
    }
});

const readArray = value => (Array.isArray(value) ? value : []);

const readNumber = value => (Number.isFinite(value) ? value : 0);

const readText = (value, fallback = '') => (
    typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const asciiText = (value, limit = MAX_TEXT_LENGTH) => readText(value)
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\s+/g, ' ')
    .slice(0, limit);

const escapePdfText = value => asciiText(value, 240)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const boolLabel = value => (value === true ? 'yes' : 'no');

const boolLiteral = value => (value === true ? 'true' : 'false');

const createSafeVersion = report => {
    const version = report && report.release && report.release.version ? String(report.release.version) : '1.1';
    return version.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || '1-1';
};

const createStudentReportPdfFilename = report => `scratch-ai-student-report-${createSafeVersion(report)}.pdf`;

const createHostedReleaseSummary = hostedRelease => ({
    hostedReleaseId: asciiText(hostedRelease && hostedRelease.hostedReleaseId, 96) || 'not-hosted',
    persisted: hostedRelease && hostedRelease.persisted === true,
    publicUrlAvailable: Boolean(readText(hostedRelease && hostedRelease.publicUrl)),
    readOnlyPlayer: Boolean(hostedRelease && hostedRelease.player && hostedRelease.player.readOnly === true),
    projectAvailable: Boolean(hostedRelease && hostedRelease.player && hostedRelease.player.projectAvailable === true)
});

const createTeacherReviewSummary = teacherReview => {
    if (!teacherReview) {
        return {
            adminLocked: false,
            decision: 'pending',
            persisted: false,
            reviewId: '',
            status: 'pending'
        };
    }

    if (teacherReview.blocked) {
        return {
            adminLocked: teacherReview.reason === 'admin-token-required',
            decision: 'blocked',
            persisted: false,
            reviewId: '',
            status: teacherReview.reason || 'blocked'
        };
    }

    return {
        adminLocked: false,
        decision: asciiText(teacherReview.decision, 48) || 'pending',
        persisted: teacherReview.persisted === true,
        reviewId: asciiText(teacherReview.reviewId, 96),
        status: teacherReview.persisted === true ? asciiText(teacherReview.decision, 48) || 'saved' : 'pending'
    };
};

const wrapText = (value, limit) => {
    const text = asciiText(value, 240);
    if (!text) return [''];
    const words = text.split(' ');
    const lines = [];
    let current = '';

    words.forEach(word => {
        if (word.length > limit) {
            if (current) {
                lines.push(current);
                current = '';
            }
            for (let index = 0; index < word.length; index += limit) {
                lines.push(word.slice(index, index + limit));
            }
            return;
        }

        const next = current ? `${current} ${word}` : word;
        if (next.length > limit) {
            lines.push(current);
            current = word;
        } else {
            current = next;
        }
    });

    if (current) lines.push(current);
    return lines;
};

const getWrapLimit = ({indent = 0, style = 'body'} = {}) => {
    if (style === 'title') return 56;
    if (style === 'heading') return 70;
    return Math.max(38, 88 - Math.ceil(indent / 3));
};

const addLine = (lines, text, options = {}) => {
    const wrapLimit = getWrapLimit(options);
    wrapText(text, wrapLimit).forEach((wrappedText, index) => {
        lines.push(Object.assign({}, options, {
            gapBefore: index === 0 ? options.gapBefore || 0 : 0,
            pageBreakBefore: index === 0 && options.pageBreakBefore === true,
            text: wrappedText
        }));
    });
};

const addSection = (lines, title, options = {}) => {
    addLine(lines, title, Object.assign({
        gapBefore: lines.length ? 10 : 0,
        style: 'heading'
    }, options));
};

const createKnowledgePointText = teacherPolicy => {
    const points = readArray(teacherPolicy && teacherPolicy.selectedKnowledgePoints)
        .map(point => asciiText(point && point.label, 80))
        .filter(Boolean);
    return points.length ? points.join(', ') : 'none';
};

const createBlockedReasonsText = blockedReasons => {
    const reasons = readArray(blockedReasons)
        .slice(0, 8)
        .map(reason => asciiText(reason, 80))
        .filter(Boolean);
    return reasons.length ? reasons.join(', ') : 'none';
};

const createReviewDecisionText = review => {
    if (review.adminLocked) return 'admin locked';
    if (review.decision === 'approved') return 'approved';
    if (review.decision === 'needs-revision') return 'needs revision';
    return review.status || 'pending';
};

const addRubricItemLines = (lines, item, index) => {
    const label = asciiText(item && item.label, 80) || `Criteria ${index + 1}`;
    const criteria = asciiText(item && item.criteria, 180) || 'Teacher criteria not attached.';
    const levels = readArray(item && item.levels)
        .slice(0, 4)
        .map(level => asciiText(level, 120))
        .filter(Boolean);

    addLine(lines, `Rubric ${index + 1}: ${label}`, {
        gapBefore: index === 0 ? 0 : 6,
        indent: 8,
        style: 'heading'
    });
    addLine(lines, `Criteria: ${criteria}`, {
        indent: 16
    });

    if (levels.length) {
        levels.forEach((level, levelIndex) => {
            addLine(lines, `Level ${levelIndex + 1}: ${level}`, {
                indent: 16
            });
        });
    } else {
        addLine(lines, 'Levels: 1 needs support / 2 developing / 3 meets / 4 extends', {
            indent: 16
        });
    }

    addLine(lines, 'Evidence note: ______________________________________________', {
        indent: 16
    });
    addLine(lines, 'Teacher score: ____ / 4', {
        indent: 16
    });
    addLine(lines, 'Comment: ___________________________________________________', {
        indent: 16
    });
};

const createPdfLines = ({
    hostedRelease,
    report = {},
    teacherReview
} = {}) => {
    const release = report && report.release ? report.release : {};
    const metrics = report && report.metrics ? report.metrics : {};
    const aiSummary = report && report.aiSummary ? report.aiSummary : {};
    const assetSummary = report && report.assetSummary ? report.assetSummary : {};
    const teacherPolicy = report && report.teacherPolicy ? report.teacherPolicy : {};
    const safeguards = report && report.safeguards ? report.safeguards : {};
    const hosted = createHostedReleaseSummary(hostedRelease);
    const review = createTeacherReviewSummary(teacherReview);
    const rubric = readArray(teacherPolicy.rubric).slice(0, RUBRIC_LIMIT);
    const questions = readArray(teacherPolicy.questionRules).slice(0, RUBRIC_LIMIT);
    const status = report && report.status === 'ready' ? 'ready' : 'needs revision';
    const lockedPoints = teacherPolicy.active === true ? createKnowledgePointText(teacherPolicy) : 'none';
    const blockedReasons = createBlockedReasonsText(report.blockedReasons);
    const lines = [];

    addLine(lines, 'Scratch AI teacher evaluation report', {
        style: 'title'
    });
    addLine(lines, `Template: ${PDF_TEMPLATE_VERSION}`, {
        style: 'meta'
    });
    addLine(lines, `Schema: ${PDF_SCHEMA_VERSION}; Generated from minimized release report`, {
        style: 'meta'
    });

    addSection(lines, '1. Evaluation summary');
    addLine(lines, `Status: ${status}`);
    addLine(lines, `Version: ${asciiText(release.version, 60) || '1.1'}`);
    addLine(lines, `Product: ${asciiText(release.productLine, 160) || 'untitled'}`);
    addLine(lines, `User feedback: ${asciiText(release.userFeedback, 160) || 'none'}`);
    addLine(lines, `Next step: ${asciiText(release.iterationPlan, 160) || 'none'}`);
    addLine(lines, `Blocked reasons: ${blockedReasons}`);

    addSection(lines, '2. Release and hosted page');
    addLine(lines, `Hosted release: ${hosted.hostedReleaseId}`);
    addLine(lines, `Hosted persisted: ${boolLabel(hosted.persisted)}; public URL available: ` +
        `${boolLabel(hosted.publicUrlAvailable)}`);
    addLine(lines, `Read-only player: ${boolLabel(hosted.readOnlyPlayer)}; project snapshot available: ` +
        `${boolLabel(hosted.projectAvailable)}`);
    addLine(lines, `Teacher review: ${createReviewDecisionText(review)}; persisted: ${boolLabel(review.persisted)}`);
    addLine(lines, `Teacher review id: ${review.reviewId || 'none'}`);

    addSection(lines, '3. Project evidence');
    addLine(lines, `Project: ${readNumber(metrics.sprites)} sprites, ${readNumber(metrics.starts)} starts, ` +
        `${readNumber(metrics.blocks)} blocks`);
    addLine(lines, `Release check: ${readNumber(metrics.checkScore)}/${readNumber(metrics.checkMaxScore)}`);
    addLine(lines, `AI help: ${readNumber(aiSummary.questions)} questions, ${readNumber(aiSummary.replies)} hints, ` +
        `${readNumber(aiSummary.blocked)} stops`);
    addLine(lines, `Asset adoption: present=${boolLabel(assetSummary.present)}; ` +
        `imported=${boolLabel(assetSummary.importedToCostumeEditor)}; ` +
        `adopted=${boolLabel(assetSummary.adopted)}; visualEdits=${readNumber(assetSummary.visualEditCount)}`);

    addSection(lines, '4. Teacher knowledge lock');
    addLine(lines, `Teacher lock: ${lockedPoints}`);
    addLine(lines, `Teacher policy title: ${asciiText(teacherPolicy.title, 140) || 'none'}`);
    if (questions.length) {
        questions.forEach((question, index) => {
            addLine(lines, `Question ${index + 1}: ${asciiText(question && question.text, 160)}`, {
                indent: 12
            });
        });
    } else {
        addLine(lines, 'Questions: none attached', {
            indent: 12
        });
    }

    addSection(lines, '5. Rubric checklist', {
        pageBreakBefore: true
    });
    if (rubric.length) {
        rubric.forEach((item, index) => addRubricItemLines(lines, item, index));
    } else {
        addLine(lines, 'No teacher rubric was attached. Use the feedback area below for a provisional review.');
    }

    addSection(lines, '6. Teacher feedback template');
    addLine(lines, 'Strengths: __________________________________________________');
    addLine(lines, 'Revision focus: ______________________________________________');
    addLine(lines, 'Follow-up question: __________________________________________');
    addLine(lines, 'Teacher signature: ______________________  Date: ____________');

    addSection(lines, '7. Safeguards');
    addLine(lines, `rawProjectIncluded=${boolLiteral(safeguards.rawProjectIncluded)}; ` +
        `studentIdentityIncluded=${boolLiteral(safeguards.studentIdentityIncluded)}; ` +
        `classRosterIncluded=${boolLiteral(safeguards.classRosterIncluded)}`);
    addLine(lines, `scratchProjectMutated=${boolLiteral(safeguards.scratchProjectMutated)}; ` +
        `aiLogWrittenToSb3=${boolLiteral(safeguards.aiLogWrittenToSb3)}; adminTokenStored=false; ` +
        `teacherNotesIncluded=false`);

    return lines;
};

const paginateLines = lines => {
    const pages = [[]];
    let y = PAGE_HEIGHT - PAGE_MARGIN_Y;

    const createPage = () => {
        pages.push([]);
        y = PAGE_HEIGHT - PAGE_MARGIN_Y;
    };

    lines.forEach(line => {
        const style = PDF_STYLES[line.style] || PDF_STYLES.body;
        const gapBefore = line.gapBefore || 0;
        if (line.pageBreakBefore && pages[pages.length - 1].length) createPage();
        if (y - gapBefore - style.lineHeight < PAGE_MARGIN_Y) createPage();
        y -= gapBefore;
        pages[pages.length - 1].push({
            font: style.font,
            size: style.size,
            text: line.text,
            x: PAGE_MARGIN_X + (line.indent || 0),
            y
        });
        y -= style.lineHeight;
    });

    return pages;
};

const createPdfContentStream = pageLines => pageLines.map(line => `BT
${line.font} ${line.size} Tf
${line.x} ${line.y} Td
(${escapePdfText(line.text)}) Tj
ET`).join('\n');

const createPdfDocument = lines => {
    const pages = paginateLines(lines);
    const pageObjectIds = pages.map((page, index) => 3 + index);
    const regularFontObjectId = 3 + pages.length;
    const boldFontObjectId = regularFontObjectId + 1;
    const contentObjectIds = pages.map((page, index) => boldFontObjectId + 1 + index);
    const pageKids = pageObjectIds.map(id => `${id} 0 R`).join(' ');
    const objects = [
        {
            body: '<< /Type /Catalog /Pages 2 0 R >>',
            id: 1
        },
        {
            body: `<< /Type /Pages /Kids [${pageKids}] /Count ${pages.length} >>`,
            id: 2
        }
    ];

    pageObjectIds.forEach((id, index) => {
        objects.push({
            body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
                `/Resources << /Font << /F1 ${regularFontObjectId} 0 R /F2 ${boldFontObjectId} 0 R >> >> ` +
                `/Contents ${contentObjectIds[index]} 0 R >>`,
            id
        });
    });

    objects.push({
        body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        id: regularFontObjectId
    });
    objects.push({
        body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
        id: boldFontObjectId
    });

    pages.forEach((pageLines, index) => {
        const contentStream = createPdfContentStream(pageLines);
        objects.push({
            body: `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
            id: contentObjectIds[index]
        });
    });

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    objects.sort((left, right) => left.id - right.id).forEach(object => {
        offsets[object.id] = pdf.length;
        pdf += `${object.id} 0 obj\n${object.body}\nendobj\n`;
    });

    const xrefOffset = pdf.length;
    const maxObjectId = objects[objects.length - 1].id;
    pdf += `xref\n0 ${maxObjectId + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let id = 1; id <= maxObjectId; id++) {
        pdf += offsets[id] ?
            `${String(offsets[id]).padStart(10, '0')} 00000 n \n` :
            '0000000000 65535 f \n';
    }
    pdf += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return {
        pageCount: pages.length,
        pdf
    };
};

const createStudentReportPdfDraft = ({
    hostedRelease,
    report,
    teacherReview
} = {}) => {
    const lines = createPdfLines({
        hostedRelease,
        report: report || {},
        teacherReview
    });
    const document = createPdfDocument(lines);
    const teacherPolicy = report && report.teacherPolicy ? report.teacherPolicy : {};
    return {
        schemaVersion: PDF_SCHEMA_VERSION,
        templateVersion: PDF_TEMPLATE_VERSION,
        filename: createStudentReportPdfFilename(report),
        mimeType: 'application/pdf',
        pdf: document.pdf,
        safeguards: {
            adminTokenStored: false,
            aiLogWrittenToSb3: false,
            classRosterIncluded: false,
            rawProjectIncluded: false,
            scratchProjectMutated: false,
            studentIdentityIncluded: false,
            teacherNotesIncluded: false
        },
        values: {
            lines: lines.length,
            pages: document.pageCount,
            rubricItems: readArray(teacherPolicy.rubric).slice(0, RUBRIC_LIMIT).length,
            templateSections: 7
        }
    };
};

export {
    PDF_SCHEMA_VERSION,
    PDF_TEMPLATE_VERSION,
    createStudentReportPdfDraft,
    createStudentReportPdfFilename
};

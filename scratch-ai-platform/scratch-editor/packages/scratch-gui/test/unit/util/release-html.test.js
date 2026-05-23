/* eslint-env jest */
import {
    createReleasePreviewHtml,
    createReleasePreviewHtmlFilename,
    escapeHtml
} from '../../../src/lib/ai/release-html';

const createPreview = () => ({
    aiSummary: {
        blocked: 1,
        questions: 2,
        replies: 1
    },
    iterationPlan: 'Make the buttons bigger.',
    logicFlows: [{
        blockCount: 4,
        broadcastCount: 2,
        id: 'flow-1',
        scriptIndex: 1,
        targetName: 'Cat',
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
    userFeedback: 'Buttons need clearer labels.',
    version: '1.1'
});

describe('release html', () => {
    test('escapes HTML-sensitive text', () => {
        expect(escapeHtml('<script>alert("x")</script>')).toBe(
            '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
        );
    });

    test('creates a standalone static HTML release draft', () => {
        const html = createReleasePreviewHtml({
            preview: createPreview()
        });

        expect(html).toContain('<!doctype html>');
        expect(html).toContain('Chore helper');
        expect(html).toContain('Cat script 1: starts with Green flag, has 4 blocks.');
        expect(html).toContain('2 questions / 1 hints / 1 safety stops');
        expect(html).not.toContain('targetId');
        expect(html).not.toContain('blockIds');
    });

    test('escapes preview content before writing HTML', () => {
        const html = createReleasePreviewHtml({
            preview: Object.assign({}, createPreview(), {
                productLine: '<img src=x onerror=alert(1)>'
            })
        });

        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).not.toContain('<img src=x');
    });

    test('creates a stable html filename from version', () => {
        expect(createReleasePreviewHtmlFilename({
            version: '1.1 beta'
        })).toBe('scratch-ai-release-1-1-beta.html');
    });
});

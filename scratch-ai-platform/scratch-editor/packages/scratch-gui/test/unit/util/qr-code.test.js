/* eslint-env jest */
import {
    byteLength,
    createQrCodeMatrix,
    createQrCodeSvg
} from '../../../src/lib/ai/qr-code';

describe('qr code renderer', () => {
    test('measures UTF-8 payload length', () => {
        expect(byteLength('abc')).toBe(3);
        expect(byteLength('二维码')).toBe(9);
        expect(byteLength('😀')).toBe(4);
    });

    test('creates a stable matrix with finder patterns and mask metadata', () => {
        const qr = createQrCodeMatrix('http://example.test/release/hosted-123');
        const sameQr = createQrCodeMatrix('http://example.test/release/hosted-123');

        expect(qr).toEqual(sameQr);
        expect(qr.version).toBeGreaterThanOrEqual(1);
        expect(qr.mask).toBeGreaterThanOrEqual(0);
        expect(qr.mask).toBeLessThan(8);
        expect(qr.size).toBe(21 + ((qr.version - 1) * 4));
        expect(qr.modules).toHaveLength(qr.size);
        expect(qr.modules[0]).toHaveLength(qr.size);
        expect(qr.modules[0][0]).toBe(true);
        expect(qr.modules[1][1]).toBe(false);
        expect(qr.modules[3][3]).toBe(true);
        expect(qr.modules[0][qr.size - 1]).toBe(true);
        expect(qr.modules[qr.size - 1][0]).toBe(true);
        expect(qr.modules[7][7]).toBe(false);
    });

    test('renders deterministic local SVG without raw URL text or active content', () => {
        const url = 'http://example.test/release/hosted-123?class=demo';
        const svg = createQrCodeSvg({
            cellSize: 4,
            title: 'QR <scan>',
            url
        });
        const sameSvg = createQrCodeSvg({
            cellSize: 4,
            title: 'QR <scan>',
            url
        });
        const otherSvg = createQrCodeSvg({
            cellSize: 4,
            title: 'QR <scan>',
            url: 'http://example.test/release/hosted-456?class=demo'
        });

        expect(svg).toBe(sameSvg);
        expect(svg).not.toBe(otherSvg);
        expect(svg).toContain('<svg');
        expect(svg).toContain('<title>QR &lt;scan&gt;</title>');
        expect(svg).toContain('data-qr-version=');
        expect(svg).toContain('data-qr-mask=');
        expect(svg).toContain('data-qr-bytes=');
        expect(svg).not.toContain(url);
        expect(svg).not.toContain('<script');
        expect(svg).not.toContain('<image');
    });

    test('rejects payloads larger than the supported QR versions', () => {
        expect(() => createQrCodeMatrix('a'.repeat(400))).toThrow('QR payload is too large.');
    });
});

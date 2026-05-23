/* eslint-env jest */
import {
    RELEASE_GATE_REASONS,
    createReleaseGate
} from '../../../src/lib/ai/release-gate';

const createReadyPreview = () => ({
    status: 'ready'
});

describe('release gate', () => {
    test('allows release when publishing, explain gate, draft, and asset adoption are ready', () => {
        const gate = createReleaseGate({
            assetAdoptionSummary: {
                adopted: true,
                hasAsset: true,
                visualEditCount: 2
            },
            generationGateAllowed: true,
            publishingEnabled: true,
            releasePreview: createReadyPreview()
        });

        expect(gate.allowed).toBe(true);
        expect(gate.reasons).toEqual([]);
        expect(gate.checklist.every(item => item.ready)).toBe(true);
    });

    test('reports release blockers without requiring an asset when no asset draft exists', () => {
        const gate = createReleaseGate({
            assetAdoptionSummary: {
                hasAsset: false
            },
            generationGateAllowed: false,
            publishingEnabled: false,
            releasePreview: {
                status: 'drafting'
            }
        });

        expect(gate.allowed).toBe(false);
        expect(gate.reasons).toEqual(expect.arrayContaining([
            RELEASE_GATE_REASONS.PUBLISHING_DISABLED,
            RELEASE_GATE_REASONS.EXPLAIN_GATE_NOT_REVIEWED,
            RELEASE_GATE_REASONS.RELEASE_DRAFT_NOT_READY
        ]));
        expect(gate.reasons).not.toContain(RELEASE_GATE_REASONS.ASSET_DRAFT_NOT_ADOPTED);
    });

    test('blocks release when an AI asset draft exists but is not adopted', () => {
        const gate = createReleaseGate({
            assetAdoptionSummary: {
                adopted: false,
                hasAsset: true,
                visualEditCount: 1
            },
            generationGateAllowed: true,
            publishingEnabled: true,
            releasePreview: createReadyPreview()
        });

        expect(gate.allowed).toBe(false);
        expect(gate.reasons).toContain(RELEASE_GATE_REASONS.ASSET_DRAFT_NOT_ADOPTED);
    });
});

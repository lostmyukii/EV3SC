/* eslint-disable arrow-parens */
const RELEASE_GATE_REASONS = Object.freeze({
    PUBLISHING_DISABLED: 'publishing-disabled',
    EXPLAIN_GATE_NOT_REVIEWED: 'explain-gate-not-reviewed',
    RELEASE_DRAFT_NOT_READY: 'release-draft-not-ready',
    ASSET_DRAFT_NOT_ADOPTED: 'asset-draft-not-adopted'
});

const RELEASE_GATE_ITEM_IDS = Object.freeze({
    PUBLISHING: 'publishing',
    EXPLAIN_GATE: 'explain-gate',
    RELEASE_DRAFT: 'release-draft',
    ASSET_ADOPTION: 'asset-adoption'
});

const readBoolean = value => value === true;

const createReleaseGateItem = ({
    id,
    label,
    ready,
    reason
}) => ({
    id,
    label,
    ready: readBoolean(ready),
    reason: readBoolean(ready) ? '' : reason
});

const createReleaseGate = ({
    assetAdoptionSummary,
    generationGateAllowed,
    publishingEnabled,
    releasePreview
} = {}) => {
    const hasAssetDraft = assetAdoptionSummary && assetAdoptionSummary.hasAsset === true;
    const assetAdopted = !hasAssetDraft || assetAdoptionSummary.adopted === true;
    const items = [
        createReleaseGateItem({
            id: RELEASE_GATE_ITEM_IDS.PUBLISHING,
            label: 'Publishing feature flag',
            ready: publishingEnabled === true,
            reason: RELEASE_GATE_REASONS.PUBLISHING_DISABLED
        }),
        createReleaseGateItem({
            id: RELEASE_GATE_ITEM_IDS.EXPLAIN_GATE,
            label: 'Explain gate reviewed',
            ready: generationGateAllowed === true,
            reason: RELEASE_GATE_REASONS.EXPLAIN_GATE_NOT_REVIEWED
        }),
        createReleaseGateItem({
            id: RELEASE_GATE_ITEM_IDS.RELEASE_DRAFT,
            label: 'Release draft ready',
            ready: releasePreview && releasePreview.status === 'ready',
            reason: RELEASE_GATE_REASONS.RELEASE_DRAFT_NOT_READY
        }),
        createReleaseGateItem({
            id: RELEASE_GATE_ITEM_IDS.ASSET_ADOPTION,
            label: 'AI asset adopted if present',
            ready: assetAdopted,
            reason: RELEASE_GATE_REASONS.ASSET_DRAFT_NOT_ADOPTED
        })
    ];
    const reasons = items
        .filter(item => !item.ready)
        .map(item => item.reason);

    return {
        allowed: reasons.length === 0,
        asset: {
            adopted: hasAssetDraft ? assetAdoptionSummary.adopted === true : false,
            present: hasAssetDraft,
            visualEditCount: hasAssetDraft && Number.isFinite(assetAdoptionSummary.visualEditCount) ?
                assetAdoptionSummary.visualEditCount :
                0
        },
        checklist: items,
        reasons,
        requires: {
            assetAdoptedIfPresent: true,
            explainGateReviewed: true,
            publishingFlagEnabled: true,
            releaseDraftReady: true
        },
        schemaVersion: 'scratch-ai-release-gate-v1'
    };
};

export {
    RELEASE_GATE_ITEM_IDS,
    RELEASE_GATE_REASONS,
    createReleaseGate
};

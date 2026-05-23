/* eslint-disable arrow-parens */
const DEFAULT_REQUIRED_VISUAL_EDITS = 2;

const ASSET_ADOPTION_STATUS = Object.freeze({
    EMPTY: 'empty',
    NEEDS_REVIEW: 'needs-review',
    NEEDS_IMPORT: 'needs-import',
    NEEDS_EDITS: 'needs-edits',
    READY_TO_ADOPT: 'ready-to-adopt',
    ADOPTED: 'adopted'
});

const ASSET_ADOPTION_ACTIONS = Object.freeze({
    REVIEW: 'review',
    IMPORT: 'import',
    RECORD_VISUAL_EDIT: 'record-visual-edit',
    ADOPT: 'adopt'
});

const readNumber = value => (Number.isFinite(value) ? value : 0);

const readAssetJob = assetReply => (
    assetReply && assetReply.worker && assetReply.worker.job ?
        assetReply.worker.job :
        null
);

const readAsset = assetReply => {
    const job = readAssetJob(assetReply);
    return job && job.result && job.result.asset ? job.result.asset : null;
};

const readAssetJobId = assetReply => {
    const job = readAssetJob(assetReply);
    return job && job.id ? String(job.id) : '';
};

const readRequiredVisualEdits = assetReply => {
    const job = readAssetJob(assetReply);
    const audit = job && job.audit ? job.audit : {};
    return Math.max(
        DEFAULT_REQUIRED_VISUAL_EDITS,
        readNumber(audit.costumeEditorEditsRequired)
    );
};

const createEmptyAssetAdoptionState = () => ({
    adopted: false,
    assetJobId: '',
    importTarget: '',
    imported: false,
    reviewed: false,
    visualEditCount: 0
});

const createAssetAdoptionState = assetReply => Object.assign(
    createEmptyAssetAdoptionState(),
    {
        assetJobId: readAssetJobId(assetReply)
    }
);

const isMatchingAssetState = (assetReply, adoptionState) => {
    const assetJobId = readAssetJobId(assetReply);
    return Boolean(
        assetJobId &&
        adoptionState &&
        adoptionState.assetJobId === assetJobId
    );
};

const createAssetAdoptionSummary = ({
    adoptionState,
    assetReply
} = {}) => {
    const job = readAssetJob(assetReply);
    const asset = readAsset(assetReply);
    const assetJobId = readAssetJobId(assetReply);
    const hasAsset = Boolean(job && asset && asset.dataUri);
    const requiredVisualEdits = readRequiredVisualEdits(assetReply);
    const matchesState = isMatchingAssetState(assetReply, adoptionState);
    const reviewed = matchesState && adoptionState.reviewed === true;
    const imported = matchesState && adoptionState.imported === true;
    const adopted = matchesState && adoptionState.adopted === true;
    const visualEditCount = matchesState ?
        Math.min(
            requiredVisualEdits,
            Math.max(0, readNumber(adoptionState.visualEditCount))
        ) :
        0;
    const importTarget = matchesState && adoptionState.importTarget ?
        adoptionState.importTarget :
        '';
    const visualEditsComplete = visualEditCount >= requiredVisualEdits;
    const canReview = hasAsset && !reviewed && !adopted;
    const canImport = hasAsset && reviewed && !imported && !adopted;
    const canRecordVisualEdit = hasAsset && reviewed && imported && !visualEditsComplete && !adopted;
    const canAdopt = hasAsset && reviewed && imported && visualEditsComplete && !adopted;
    let status = ASSET_ADOPTION_STATUS.EMPTY;

    if (hasAsset && adopted) {
        status = ASSET_ADOPTION_STATUS.ADOPTED;
    } else if (hasAsset && canAdopt) {
        status = ASSET_ADOPTION_STATUS.READY_TO_ADOPT;
    } else if (hasAsset && imported) {
        status = ASSET_ADOPTION_STATUS.NEEDS_EDITS;
    } else if (hasAsset && reviewed) {
        status = ASSET_ADOPTION_STATUS.NEEDS_IMPORT;
    } else if (hasAsset) {
        status = ASSET_ADOPTION_STATUS.NEEDS_REVIEW;
    }

    return {
        adopted,
        assetJobId,
        assetType: job && job.type ? String(job.type) : '',
        canAdopt,
        canImport,
        canRecordVisualEdit,
        canReview,
        hasAsset,
        imported,
        importTarget,
        requiredVisualEdits,
        reviewed,
        status,
        visualEditCount,
        visualEditsComplete
    };
};

const getBaseStateForReply = (currentState, assetReply) => (
    isMatchingAssetState(assetReply, currentState) ?
        currentState :
        createAssetAdoptionState(assetReply)
);

const getNextAssetAdoptionState = ({
    action,
    assetReply,
    currentState,
    values
} = {}) => {
    const baseState = getBaseStateForReply(currentState, assetReply);
    const summary = createAssetAdoptionSummary({
        adoptionState: baseState,
        assetReply
    });

    switch (action) {
    case ASSET_ADOPTION_ACTIONS.REVIEW:
        if (!summary.hasAsset || summary.reviewed) return baseState;
        return Object.assign({}, baseState, {
            reviewed: true
        });
    case ASSET_ADOPTION_ACTIONS.IMPORT:
        if (!summary.canImport) return baseState;
        return Object.assign({}, baseState, {
            importTarget: values && values.importTarget ? String(values.importTarget).slice(0, 80) : '',
            imported: true
        });
    case ASSET_ADOPTION_ACTIONS.RECORD_VISUAL_EDIT:
        if (!summary.canRecordVisualEdit) return baseState;
        return Object.assign({}, baseState, {
            visualEditCount: Math.min(
                summary.requiredVisualEdits,
                summary.visualEditCount + 1
            )
        });
    case ASSET_ADOPTION_ACTIONS.ADOPT:
        if (!summary.canAdopt) return baseState;
        return Object.assign({}, baseState, {
            adopted: true
        });
    default:
        return baseState;
    }
};

const decodeBase64 = base64Text => {
    if (typeof globalThis.atob !== 'function') return null;

    const binary = globalThis.atob(base64Text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

const decodeUriText = uriText => {
    const text = decodeURIComponent(uriText);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        bytes[i] = text.charCodeAt(i);
    }
    return bytes;
};

const bytesToArrayBuffer = bytes => (
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
);

const parseDataUri = dataUri => {
    if (typeof dataUri !== 'string') return null;

    const match = dataUri.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/i);
    if (!match) return null;

    const bytes = match[2] ? decodeBase64(match[3]) : decodeUriText(match[3]);
    if (!bytes) return null;

    return {
        fileData: bytesToArrayBuffer(bytes),
        mimeType: match[1].toLowerCase()
    };
};

const createAssetImportName = assetReply => {
    const job = readAssetJob(assetReply);
    const jobType = job && job.type ? String(job.type) : 'asset';
    const jobId = readAssetJobId(assetReply);
    const suffix = jobId ? ` ${jobId.slice(-4)}` : '';
    return `AI draft ${jobType}${suffix}`;
};

const createAssetImportData = assetReply => {
    const job = readAssetJob(assetReply);
    const asset = readAsset(assetReply);
    const parsed = asset && asset.dataUri ? parseDataUri(asset.dataUri) : null;

    if (!job || !parsed) {
        return {
            ready: false
        };
    }

    return {
        assetJobId: readAssetJobId(assetReply),
        assetType: job.type || '',
        fileData: parsed.fileData,
        mimeType: parsed.mimeType,
        name: createAssetImportName(assetReply),
        ready: true
    };
};

export {
    ASSET_ADOPTION_ACTIONS,
    ASSET_ADOPTION_STATUS,
    DEFAULT_REQUIRED_VISUAL_EDITS,
    createAssetAdoptionState,
    createAssetAdoptionSummary,
    createAssetImportData,
    createEmptyAssetAdoptionState,
    getNextAssetAdoptionState,
    parseDataUri
};

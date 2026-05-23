const SCRIPT_DRAFT_UI_REASONS = Object.freeze({
    DRAFT_NOT_READY: 'draft-not-ready',
    GATE_LOCKED: 'gate-locked',
    LOADING: 'loading',
    MODEL_CONSENT_MISSING: 'model-consent-missing',
    PREVIEW_MISSING: 'preview-missing'
});

const getScriptDraftCreateButtonState = ({
    generationGateAllowed = false,
    hasDraftInput = false,
    isLoading = false,
    modelConsent = false
} = {}) => {
    if (!generationGateAllowed) {
        return {
            disabled: true,
            reason: SCRIPT_DRAFT_UI_REASONS.GATE_LOCKED
        };
    }
    if (!hasDraftInput) {
        return {
            disabled: true,
            reason: SCRIPT_DRAFT_UI_REASONS.PREVIEW_MISSING
        };
    }
    if (!modelConsent) {
        return {
            disabled: true,
            reason: SCRIPT_DRAFT_UI_REASONS.MODEL_CONSENT_MISSING
        };
    }
    if (isLoading) {
        return {
            disabled: true,
            reason: SCRIPT_DRAFT_UI_REASONS.LOADING
        };
    }
    return {
        disabled: false,
        reason: ''
    };
};

const getScriptDraftInsertButtonState = ({
    hasScriptDraft = false,
    inserted = false,
    ready = false
} = {}) => {
    if (!hasScriptDraft || inserted || !ready) {
        return {
            disabled: true,
            reason: SCRIPT_DRAFT_UI_REASONS.DRAFT_NOT_READY
        };
    }
    return {
        disabled: false,
        reason: ''
    };
};

const getScriptDraftResultVisibility = ({
    hasScriptDraft = false,
    isLoading = false,
    scriptDraftError = ''
} = {}) => ({
    showEmpty: !isLoading && !scriptDraftError && !hasScriptDraft,
    showError: Boolean(scriptDraftError),
    showLoading: Boolean(isLoading),
    showReadyDraft: Boolean(hasScriptDraft)
});

const shouldRequestScriptDraft = ({
    generationGateAllowed = false,
    modelConsent = false
} = {}) => generationGateAllowed && modelConsent;

export {
    SCRIPT_DRAFT_UI_REASONS,
    getScriptDraftCreateButtonState,
    getScriptDraftInsertButtonState,
    getScriptDraftResultVisibility,
    shouldRequestScriptDraft
};

/* eslint-env jest */
import {
    SCRIPT_DRAFT_UI_REASONS,
    getScriptDraftCreateButtonState,
    getScriptDraftInsertButtonState,
    getScriptDraftResultVisibility,
    shouldRequestScriptDraft
} from '../../../src/lib/ai/nl-blocks-script-draft-ui';

describe('nl blocks script draft UI state', () => {
    test('blocks model-backed script requests until the explain gate is reviewed', () => {
        expect(shouldRequestScriptDraft({
            generationGateAllowed: false,
            modelConsent: true
        })).toBe(false);
        expect(getScriptDraftCreateButtonState({
            generationGateAllowed: false,
            hasDraftInput: true,
            modelConsent: true
        })).toEqual({
            disabled: true,
            reason: SCRIPT_DRAFT_UI_REASONS.GATE_LOCKED
        });
    });

    test('blocks model-backed script requests without explicit model consent', () => {
        expect(shouldRequestScriptDraft({
            generationGateAllowed: true,
            modelConsent: false
        })).toBe(false);
        expect(getScriptDraftCreateButtonState({
            generationGateAllowed: true,
            hasDraftInput: true,
            modelConsent: false
        })).toEqual({
            disabled: true,
            reason: SCRIPT_DRAFT_UI_REASONS.MODEL_CONSENT_MISSING
        });
    });

    test('allows model-backed script requests only from reviewed and consented UI state', () => {
        expect(shouldRequestScriptDraft({
            generationGateAllowed: true,
            modelConsent: true
        })).toBe(true);
        expect(getScriptDraftCreateButtonState({
            generationGateAllowed: true,
            hasDraftInput: true,
            isLoading: false,
            modelConsent: true
        })).toEqual({
            disabled: false,
            reason: ''
        });
    });

    test('keeps insert disabled until a reviewed script draft is ready', () => {
        expect(getScriptDraftInsertButtonState({
            hasScriptDraft: false,
            ready: true
        })).toEqual({
            disabled: true,
            reason: SCRIPT_DRAFT_UI_REASONS.DRAFT_NOT_READY
        });
        expect(getScriptDraftInsertButtonState({
            hasScriptDraft: true,
            ready: false
        })).toEqual({
            disabled: true,
            reason: SCRIPT_DRAFT_UI_REASONS.DRAFT_NOT_READY
        });
        expect(getScriptDraftInsertButtonState({
            hasScriptDraft: true,
            ready: true
        })).toEqual({
            disabled: false,
            reason: ''
        });
    });

    test('shows loading and error states without implying workspace mutation', () => {
        expect(getScriptDraftResultVisibility({
            isLoading: true,
            scriptDraftError: '',
            hasScriptDraft: false
        })).toEqual({
            showEmpty: false,
            showError: false,
            showLoading: true,
            showReadyDraft: false
        });
        expect(getScriptDraftResultVisibility({
            isLoading: false,
            scriptDraftError: 'Model disabled',
            hasScriptDraft: false
        })).toEqual({
            showEmpty: false,
            showError: true,
            showLoading: false,
            showReadyDraft: false
        });
    });
});

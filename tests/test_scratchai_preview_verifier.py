import pytest

from scripts.verify_scratchai_preview import (
    ScratchAIPreviewVerificationError,
    verify_scratchai_gui_bundle,
)


def test_gui_bundle_verifier_accepts_enabled_ai_assistant_bundle():
    gui_js = """
const scratchAIEnabled = parseBooleanFlag( false ? 0 : "true", false);
const aiFeatureFlags = Object.freeze({
  scratchAIEnabled,
  scratchAIPanelEnabled: scratchAIEnabled && parseBooleanFlag( false ? 0 : "true", false),
  scratchAIImageBlocksEnabled: scratchAIEnabled && parseBooleanFlag( false ? 0 : "true", false)
});
"data-testid": "ai-logic-coach-toggle";
"data-testid": "ai-logic-coach-asset-generator";
"""

    markers = verify_scratchai_gui_bundle(gui_js)

    assert markers == [
        "SCRATCH_AI_ENABLED=true",
        "SCRATCH_AI_PANEL_ENABLED=true",
        "SCRATCH_AI_IMAGE_BLOCKS_ENABLED=true",
        "ai-logic-coach-toggle",
        "ai-logic-coach-asset-generator",
    ]


def test_gui_bundle_verifier_rejects_disabled_ai_assistant_bundle():
    gui_js = """
const scratchAIEnabled = parseBooleanFlag( false ? 0 : "", false);
const aiFeatureFlags = Object.freeze({
  scratchAIEnabled,
  scratchAIPanelEnabled: scratchAIEnabled && parseBooleanFlag( false ? 0 : "", false),
  scratchAIImageBlocksEnabled: scratchAIEnabled && parseBooleanFlag( false ? 0 : "", false)
});
"data-testid": "ai-logic-coach-toggle";
"data-testid": "ai-logic-coach-asset-generator";
"""

    with pytest.raises(ScratchAIPreviewVerificationError) as error:
        verify_scratchai_gui_bundle(gui_js)

    assert "SCRATCH_AI_ENABLED=true" in str(error.value)
    assert "SCRATCH_AI_PANEL_ENABLED=true" in str(error.value)
    assert "SCRATCH_AI_IMAGE_BLOCKS_ENABLED=true" in str(error.value)


def test_gui_bundle_verifier_accepts_expected_vsle_ev3_extension_url():
    extension_url = "http://127.0.0.1:8000/vsle-ev3-extension/index.js"
    gui_js = f"""
const scratchAIEnabled = parseBooleanFlag( false ? 0 : "true", false);
const aiFeatureFlags = Object.freeze({{
  scratchAIEnabled,
  scratchAIPanelEnabled: scratchAIEnabled && parseBooleanFlag( false ? 0 : "true", false),
  scratchAIImageBlocksEnabled: scratchAIEnabled && parseBooleanFlag( false ? 0 : "true", false)
}});
"data-testid": "ai-logic-coach-toggle";
"data-testid": "ai-logic-coach-asset-generator";
const VSLE_EV3_EXTENSION_URL = "{extension_url}";
"""

    markers = verify_scratchai_gui_bundle(
        gui_js,
        expected_vsle_ev3_extension_url=extension_url,
    )

    assert f"SCRATCH_AI_VSLE_EV3_EXTENSION_URL={extension_url}" in markers


def test_gui_bundle_verifier_rejects_wrong_vsle_ev3_extension_url():
    expected_url = "http://127.0.0.1:8000/vsle-ev3-extension/index.js"
    gui_js = """
const scratchAIEnabled = parseBooleanFlag( false ? 0 : "true", false);
const aiFeatureFlags = Object.freeze({
  scratchAIEnabled,
  scratchAIPanelEnabled: scratchAIEnabled && parseBooleanFlag( false ? 0 : "true", false),
  scratchAIImageBlocksEnabled: scratchAIEnabled && parseBooleanFlag( false ? 0 : "true", false)
});
"data-testid": "ai-logic-coach-toggle";
"data-testid": "ai-logic-coach-asset-generator";
const VSLE_EV3_EXTENSION_URL = "http://101.42.92.6:18612/vsle-ev3-extension/index.js";
"""

    with pytest.raises(ScratchAIPreviewVerificationError) as error:
        verify_scratchai_gui_bundle(
            gui_js,
            expected_vsle_ev3_extension_url=expected_url,
        )

    assert "SCRATCH_AI_VSLE_EV3_EXTENSION_URL" in str(error.value)


def test_gui_bundle_verifier_rejects_browser_unreachable_vsle_ev3_url():
    expected_url = "http://127.0.0.1:8000/vsle-ev3-extension/index.js"
    gui_js = f"""
const scratchAIEnabled = parseBooleanFlag( false ? 0 : "true", false);
const aiFeatureFlags = Object.freeze({{
  scratchAIEnabled,
  scratchAIPanelEnabled: scratchAIEnabled && parseBooleanFlag( false ? 0 : "true", false),
  scratchAIImageBlocksEnabled: scratchAIEnabled && parseBooleanFlag( false ? 0 : "true", false)
}});
"data-testid": "ai-logic-coach-toggle";
"data-testid": "ai-logic-coach-asset-generator";
const getConfiguredVSLEEV3ExtensionURL = () => {{
    if (typeof process === 'undefined' || !process.env) {{
        return '';
    }}

    return "{expected_url}" || 0;
}};
"""

    with pytest.raises(ScratchAIPreviewVerificationError) as error:
        verify_scratchai_gui_bundle(
            gui_js,
            expected_vsle_ev3_extension_url=expected_url,
        )

    assert "browser-reachable" in str(error.value)

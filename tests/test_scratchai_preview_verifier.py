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

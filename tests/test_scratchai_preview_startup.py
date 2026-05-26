from pathlib import Path

from scripts.start_scratchai_preview import (
    DEFAULT_MIDDLEWARE_URL,
    ScratchAIPreviewError,
    build_preview_command,
    command_summary,
    missing_preview_requirements,
)


def _write_preview_tree(root: Path) -> None:
    files = [
        "scratch-ai-platform/scratch-editor/package.json",
        "scratch-ai-platform/scratch-editor/package-lock.json",
        "scratch-ai-platform/scratch-editor/node_modules/.package-lock.json",
        "scratch-ai-platform/scratch-editor/packages/scratch-gui/package.json",
        "scratch-ai-platform/scratch-editor/packages/scratch-gui/webpack.config.js",
        "scratch-ai-platform/scratch-editor/packages/scratch-gui/src/playground/index.jsx",
        "scratch-ai-platform/scratch-editor/packages/scratch-svg-renderer/dist/node/scratch-svg-renderer.js",
        "scratch-ai-platform/scratch-editor/packages/scratch-render/dist/node/scratch-render.js",
        "scratch-ai-platform/scratch-editor/packages/scratch-vm/dist/node/scratch-vm.js",
        "scratch-ai-platform/scratch-editor/packages/scratch-vm/dist/node/extension-worker.js",
    ]
    for relative in files:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{}\n", encoding="utf-8")


def test_missing_preview_requirements_reports_unbuilt_vm_artifact(tmp_path):
    _write_preview_tree(tmp_path)
    vm_artifact = (
        tmp_path
        / "scratch-ai-platform/scratch-editor/packages/scratch-vm/dist/node/scratch-vm.js"
    )
    vm_artifact.unlink()

    missing = missing_preview_requirements(tmp_path)

    assert (
        "scratch-ai-platform/scratch-editor/packages/scratch-vm/dist/node/scratch-vm.js"
        in missing
    )


def test_build_preview_command_uses_ev3sc_owned_scratch_gui(tmp_path):
    _write_preview_tree(tmp_path)
    extension_url = "http://127.0.0.1:8001/vsle-ev3-extension/index.js"

    preview = build_preview_command(
        root=tmp_path,
        host="127.0.0.1",
        port=8610,
        middleware_url=DEFAULT_MIDDLEWARE_URL,
        vsle_ev3_extension_url=extension_url,
    )
    summary = command_summary(preview)

    assert summary["cwd"].startswith(str(tmp_path))
    assert summary["cwd"].endswith(
        "scratch-ai-platform/scratch-editor/packages/scratch-gui"
    )
    assert summary["command"] == ["npm", "run", "start", "--", "--host", "127.0.0.1"]
    assert summary["env"]["PORT"] == "8610"
    assert summary["env"]["SCRATCH_AI_ENABLED"] == "true"
    assert summary["env"]["SCRATCH_AI_EXTENSION_ENABLED"] == "true"
    assert summary["env"]["SCRATCH_AI_IMAGE_BLOCKS_ENABLED"] == "true"
    assert summary["env"]["SCRATCH_AI_VSLE_EV3_EXTENSION_URL"] == extension_url
    assert summary["url"] == "http://127.0.0.1:8610/"


def test_build_preview_command_rejects_missing_prerequisites(tmp_path):
    try:
        build_preview_command(root=tmp_path)
    except ScratchAIPreviewError as error:
        assert "prerequisites are missing" in str(error)
    else:
        raise AssertionError("Expected ScratchAIPreviewError")

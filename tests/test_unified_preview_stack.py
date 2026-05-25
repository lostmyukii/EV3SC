from pathlib import Path
import urllib.request

import pytest

from scripts import verify_unified_preview
from scripts.start_unified_preview import (
    UnifiedPreviewError,
    build_unified_preview_plan,
    command_summary,
    missing_unified_preview_requirements,
)
from scripts.verify_unified_preview import (
    probe_health_check,
    verification_summary,
    verify_health_checks,
)


def _write_unified_preview_tree(root: Path) -> None:
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
        "scratch-ai-platform/ai-middleware/package.json",
        "scratch-ai-platform/ai-middleware/src/server.js",
        "scratch-ai-platform/asset-worker/package.json",
        "scratch-ai-platform/asset-worker/src/server.js",
        "scratch-ai-platform/preview-server/package.json",
        "scratch-ai-platform/preview-server/src/server.js",
        "preview/weisile_preview_server.py",
        "vsle-ev3-extension/index.js",
        "weisile-link/weisile_link/json_rpc_server.py",
    ]
    for relative in files:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{}\n", encoding="utf-8")


def test_missing_unified_preview_requirements_reports_service_files(tmp_path):
    _write_unified_preview_tree(tmp_path)
    (tmp_path / "scratch-ai-platform/asset-worker/src/server.js").unlink()

    missing = missing_unified_preview_requirements(tmp_path)

    assert "scratch-ai-platform/asset-worker/src/server.js" in missing


def test_unified_preview_plan_wires_all_local_services(tmp_path):
    _write_unified_preview_tree(tmp_path)

    plan = build_unified_preview_plan(
        root=tmp_path,
        editor_port=8610,
        middleware_port=8788,
        asset_worker_port=8791,
        preview_gateway_port=8604,
        extension_port=8001,
        weisile_link_port=20211,
        trainer_port=18766,
    )
    summary = command_summary(plan)

    assert summary["urls"] == {
        "editor": "http://127.0.0.1:8610/",
        "extension": "http://127.0.0.1:8001/vsle-ev3-extension/index.js",
        "middleware": "http://127.0.0.1:8788",
        "assetWorker": "http://127.0.0.1:8791",
        "previewGateway": "http://127.0.0.1:8604",
        "weisileLink": "ws://127.0.0.1:20211/scratch/bt",
        "trainer": "ws://127.0.0.1:18766",
    }
    assert [service["id"] for service in summary["services"]] == [
        "asset-worker",
        "ai-middleware",
        "preview-gateway",
        "extension-static",
        "weisile-link-preview",
        "scratchai-editor",
    ]
    env_by_id = {service["id"]: service["env"] for service in summary["services"]}
    assert env_by_id["asset-worker"]["ASSET_WORKER_PORT"] == "8791"
    assert env_by_id["asset-worker"]["SCRATCH_AI_IMAGE_PROVIDER"] == "template-svg"
    assert env_by_id["ai-middleware"]["AI_MIDDLEWARE_PORT"] == "8788"
    assert env_by_id["ai-middleware"]["ASSET_WORKER_URL"] == "http://127.0.0.1:8791"
    assert (
        "http://127.0.0.1:8610"
        in env_by_id["ai-middleware"]["SCRATCH_AI_ALLOWED_ORIGINS"]
    )
    assert (
        "http://127.0.0.1:8604"
        in env_by_id["ai-middleware"]["SCRATCH_AI_ALLOWED_ORIGINS"]
    )
    assert env_by_id["preview-gateway"]["SCRATCH_AI_MIDDLEWARE_URL"] == (
        "http://127.0.0.1:8788"
    )
    assert env_by_id["weisile-link-preview"]["AI_QUEST_PROVIDER"] == "mock"
    assert env_by_id["weisile-link-preview"]["WEISILE_LINK_HOST"] == "127.0.0.1"
    assert env_by_id["weisile-link-preview"]["WEISILE_LINK_PORT"] == "20211"
    assert env_by_id["weisile-link-preview"]["TRAINER_WS_PORT"] == "18766"
    assert (
        "http://127.0.0.1:8610"
        in env_by_id["weisile-link-preview"]["WEISILE_ALLOWED_ORIGINS"]
    )
    assert len(summary["healthChecks"]) == 7
    preview_gateway_check = next(
        check
        for check in summary["healthChecks"]
        if check["id"] == "preview-gateway-status"
    )
    assert preview_gateway_check["expected"] == "scratch-ai-preview-server"
    assert all(str(tmp_path) in service["cwd"] for service in summary["services"])
    assert "/Users/yukii/Desktop/scratch ai" not in repr(summary)


def test_unified_preview_plan_allows_real_asset_provider_override(tmp_path):
    _write_unified_preview_tree(tmp_path)

    plan = build_unified_preview_plan(
        root=tmp_path,
        asset_image_provider="openai",
    )
    summary = command_summary(plan)
    env_by_id = {service["id"]: service["env"] for service in summary["services"]}

    assert env_by_id["asset-worker"]["SCRATCH_AI_IMAGE_PROVIDER"] == "openai"


def test_unified_preview_plan_rejects_missing_prerequisites(tmp_path):
    with pytest.raises(UnifiedPreviewError) as error:
        build_unified_preview_plan(root=tmp_path)

    assert "Unified preview prerequisites are missing" in str(error.value)


def test_verify_health_checks_returns_json_ready_results(tmp_path):
    _write_unified_preview_tree(tmp_path)
    plan = build_unified_preview_plan(root=tmp_path)
    calls = []

    def fake_probe(check):
        calls.append((check.id, check.kind))
        return {
            "id": check.id,
            "kind": check.kind,
            "ok": True,
            "url": check.url,
            "expected": check.expected,
            "detail": "matched",
        }

    results = verify_health_checks(plan, probe=fake_probe)
    summary = verification_summary(results)

    assert calls == [(check.id, check.kind) for check in plan.health_checks]
    assert summary["ok"] is True
    assert summary["passed"] == len(plan.health_checks)
    assert summary["failed"] == 0
    assert summary["checks"][0]["id"] == "asset-worker-health"


def test_http_health_fetch_bypasses_environment_proxy(monkeypatch):
    calls = []

    class FakeHeaders:
        def get_content_charset(self):
            return "utf-8"

    class FakeResponse:
        status = 200
        headers = FakeHeaders()

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return b"scratch-ai-health"

    class FakeOpener:
        def open(self, request, *, timeout):
            calls.append(("open", request.full_url, timeout))
            return FakeResponse()

    def fake_build_opener(*handlers):
        calls.append(("handlers", handlers))
        return FakeOpener()

    monkeypatch.setattr(
        verify_unified_preview.urllib.request,
        "build_opener",
        fake_build_opener,
    )

    body = verify_unified_preview._fetch_text(
        "http://127.0.0.1:8787/healthz",
        timeout=1.0,
    )

    assert body == "scratch-ai-health"
    assert calls[0][0] == "handlers"
    assert any(
        isinstance(handler, urllib.request.ProxyHandler) and handler.proxies == {}
        for handler in calls[0][1]
    )
    assert calls[1] == ("open", "http://127.0.0.1:8787/healthz", 1.0)


def test_scratchai_editor_health_check_requires_enabled_ai_assistant(
    monkeypatch,
    tmp_path,
):
    _write_unified_preview_tree(tmp_path)
    calls = []

    def fake_fetch(url, *, timeout):
        calls.append((url, timeout))
        if url.endswith("/gui.js"):
            return """
const scratchAIEnabled = parseBooleanFlag( false ? 0 : "", false);
const aiFeatureFlags = Object.freeze({
  scratchAIEnabled,
  scratchAIPanelEnabled: scratchAIEnabled && parseBooleanFlag( false ? 0 : "", false)
});
"data-testid": "ai-logic-coach-toggle";
"""
        return '<title>Scratch 3.0 GUI</title><script src="gui.js"></script>'

    monkeypatch.setattr(verify_unified_preview, "_fetch_text", fake_fetch)
    check = build_unified_preview_plan(root=tmp_path).health_checks[-3]

    result = probe_health_check(check)

    assert check.id == "scratchai-editor-html"
    assert result["ok"] is False
    assert "SCRATCH_AI_ENABLED=true" in result["detail"]
    assert calls == [
        ("http://127.0.0.1:8601/", 10.0),
        ("http://127.0.0.1:8601/gui.js", 30.0),
    ]

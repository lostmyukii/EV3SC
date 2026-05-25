#!/usr/bin/env python3
"""Verify the EV3SC unified ScratchAI + VSLE-EV3 preview stack."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable, Dict, List

try:
    from scripts.start_unified_preview import (
        HealthCheck,
        UnifiedPreviewPlan,
        build_unified_preview_plan,
    )
    from scripts.verify_scratchai_preview import verify_scratchai_gui_bundle
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from scripts.start_unified_preview import (
        HealthCheck,
        UnifiedPreviewPlan,
        build_unified_preview_plan,
    )
    from scripts.verify_scratchai_preview import verify_scratchai_gui_bundle


DEFAULT_TIMEOUT_SECONDS = 90.0
POLL_INTERVAL_SECONDS = 2.0


class UnifiedPreviewVerificationError(RuntimeError):
    """Raised when a preview health check cannot be verified."""


def _fetch_text(url: str, *, timeout: float) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "EV3SC unified preview verifier"},
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=timeout) as response:
        status = getattr(response, "status", None)
        if status is None:
            status = response.getcode()
        if int(status) != 200:
            raise UnifiedPreviewVerificationError(f"HTTP {status} while checking {url}")
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def _join_url(base_url: str, path: str) -> str:
    return urllib.parse.urljoin(base_url.rstrip("/") + "/", path)


async def _probe_websocket_json_rpc(url: str, expected: str) -> str:
    import websockets

    async with websockets.connect(url, open_timeout=5) as websocket:
        await websocket.send(
            json.dumps({"jsonrpc": "2.0", "id": "verify", "method": "getVersion"})
        )
        raw = await asyncio.wait_for(websocket.recv(), timeout=5)
    if expected not in str(raw):
        raise UnifiedPreviewVerificationError(
            f"WebSocket JSON-RPC response from {url} did not contain {expected}"
        )
    return str(raw)


async def _probe_websocket_open(url: str) -> str:
    import websockets

    async with websockets.connect(url, open_timeout=5):
        return "open"


def probe_health_check(check: HealthCheck) -> Dict[str, object]:
    """Probe one health check and return a JSON-ready result."""

    started = time.monotonic()
    try:
        if check.kind in {"http-json", "http-html"}:
            body = _fetch_text(check.url, timeout=10.0)
            if check.expected not in body:
                raise UnifiedPreviewVerificationError(
                    f"{check.url} did not contain {check.expected}"
                )
            detail = f"matched {check.expected}"
            if check.id == "scratchai-editor-html":
                gui_js = _fetch_text(_join_url(check.url, "gui.js"), timeout=30.0)
                markers = verify_scratchai_gui_bundle(gui_js)
                detail = f"{detail}; matched {', '.join(markers)}"
        elif check.kind == "websocket-json-rpc":
            asyncio.run(_probe_websocket_json_rpc(check.url, check.expected))
            detail = f"matched {check.expected}"
        elif check.kind == "websocket-open":
            asyncio.run(_probe_websocket_open(check.url))
            detail = "opened"
        else:
            raise UnifiedPreviewVerificationError(
                f"Unsupported health check kind: {check.kind}"
            )
        return {
            "id": check.id,
            "kind": check.kind,
            "ok": True,
            "url": check.url,
            "expected": check.expected,
            "detail": detail,
            "durationMs": int((time.monotonic() - started) * 1000),
        }
    except Exception as error:
        return {
            "id": check.id,
            "kind": check.kind,
            "ok": False,
            "url": check.url,
            "expected": check.expected,
            "detail": str(error),
            "durationMs": int((time.monotonic() - started) * 1000),
        }


def verify_health_checks(
    plan: UnifiedPreviewPlan,
    *,
    probe: Callable[[HealthCheck], Dict[str, object]] | None = None,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> List[Dict[str, object]]:
    """Poll all health checks until they pass or the timeout expires."""

    probe_fn = probe or probe_health_check
    deadline = time.monotonic() + timeout_seconds
    results: List[Dict[str, object]] = []
    while True:
        results = [probe_fn(check) for check in plan.health_checks]
        if all(result.get("ok") is True for result in results):
            return results
        if time.monotonic() >= deadline:
            return results
        time.sleep(POLL_INTERVAL_SECONDS)


def verification_summary(results: List[Dict[str, object]]) -> Dict[str, object]:
    """Return a compact JSON-ready verification summary."""

    passed = sum(1 for result in results if result.get("ok") is True)
    failed = len(results) - passed
    return {
        "ok": failed == 0,
        "passed": passed,
        "failed": failed,
        "checks": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify the unified ScratchAI + VSLE-EV3 preview stack."
    )
    parser.add_argument("--root", type=Path, default=None)
    parser.add_argument("--host", default=None)
    parser.add_argument("--editor-port", type=int, default=None)
    parser.add_argument("--middleware-port", type=int, default=None)
    parser.add_argument("--asset-worker-port", type=int, default=None)
    parser.add_argument("--preview-gateway-port", type=int, default=None)
    parser.add_argument("--extension-port", type=int, default=None)
    parser.add_argument("--weisile-link-port", type=int, default=None)
    parser.add_argument("--trainer-port", type=int, default=None)
    parser.add_argument("--asset-image-provider", default=None)
    parser.add_argument(
        "--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS
    )
    args = parser.parse_args()

    plan_args = {
        key: value
        for key, value in {
            "root": args.root,
            "host": args.host,
            "editor_port": args.editor_port,
            "middleware_port": args.middleware_port,
            "asset_worker_port": args.asset_worker_port,
            "preview_gateway_port": args.preview_gateway_port,
            "extension_port": args.extension_port,
            "weisile_link_port": args.weisile_link_port,
            "trainer_port": args.trainer_port,
            "asset_image_provider": args.asset_image_provider,
        }.items()
        if value is not None
    }
    plan = build_unified_preview_plan(**plan_args)
    summary = verification_summary(
        verify_health_checks(plan, timeout_seconds=args.timeout_seconds)
    )
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

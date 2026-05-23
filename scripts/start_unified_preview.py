#!/usr/bin/env python3
"""Start the EV3SC unified ScratchAI + VSLE-EV3 preview stack."""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

try:
    from scripts.start_scratchai_preview import (
        DEFAULT_HOST,
        DEFAULT_PORT as DEFAULT_EDITOR_PORT,
        build_preview_command,
        missing_preview_requirements,
    )
except ModuleNotFoundError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from scripts.start_scratchai_preview import (
        DEFAULT_HOST,
        DEFAULT_PORT as DEFAULT_EDITOR_PORT,
        build_preview_command,
        missing_preview_requirements,
    )


DEFAULT_ROOT = Path("/Users/yukii/Desktop/EV3SC")
DEFAULT_ASSET_WORKER_PORT = 8790
DEFAULT_MIDDLEWARE_PORT = 8787
DEFAULT_PREVIEW_GATEWAY_PORT = 8602
DEFAULT_EXTENSION_PORT = 8000
DEFAULT_WEISILE_LINK_PORT = 20111
DEFAULT_TRAINER_PORT = 8766

SERVICE_REQUIREMENTS = (
    Path("scratch-ai-platform/ai-middleware/package.json"),
    Path("scratch-ai-platform/ai-middleware/src/server.js"),
    Path("scratch-ai-platform/asset-worker/package.json"),
    Path("scratch-ai-platform/asset-worker/src/server.js"),
    Path("scratch-ai-platform/preview-server/package.json"),
    Path("scratch-ai-platform/preview-server/src/server.js"),
    Path("preview/weisile_preview_server.py"),
    Path("vsle-ev3-extension/index.js"),
    Path("weisile-link/weisile_link/json_rpc_server.py"),
)


class UnifiedPreviewError(RuntimeError):
    """Raised when the unified preview stack cannot be resolved."""


@dataclass(frozen=True)
class PreviewService:
    """One long-running local preview service."""

    id: str
    label: str
    command: Tuple[str, ...]
    cwd: Path
    env: Dict[str, str]
    url: str


@dataclass(frozen=True)
class HealthCheck:
    """One operator-visible local health check."""

    id: str
    kind: str
    url: str
    expected: str


@dataclass(frozen=True)
class UnifiedPreviewPlan:
    """Resolved local preview service plan."""

    services: Tuple[PreviewService, ...]
    health_checks: Tuple[HealthCheck, ...]
    urls: Dict[str, str]


def _require_inside_root(path: Path, root: Path) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise UnifiedPreviewError(
            f"Unified preview path escapes EV3SC root: {resolved}"
        ) from error
    return resolved


def _python_command(root: Path) -> str:
    venv_python = root / ".venv/bin/python"
    if venv_python.exists():
        return str(venv_python)
    return sys.executable or "python3"


def missing_unified_preview_requirements(root: Path) -> List[str]:
    """Return missing files needed by the unified local preview stack."""

    root = root.resolve()
    missing = list(missing_preview_requirements(root))
    for relative in SERVICE_REQUIREMENTS:
        if not (root / relative).exists():
            missing.append(str(relative))
    return missing


def _allowed_origins(
    *,
    editor_port: int,
    extension_port: int,
    preview_gateway_port: int,
) -> str:
    origins = [
        f"http://127.0.0.1:{editor_port}",
        f"http://localhost:{editor_port}",
        f"http://127.0.0.1:{extension_port}",
        f"http://localhost:{extension_port}",
        f"http://127.0.0.1:{preview_gateway_port}",
        f"http://localhost:{preview_gateway_port}",
    ]
    return ",".join(origins)


def build_unified_preview_plan(
    *,
    root: Path = DEFAULT_ROOT,
    host: str = DEFAULT_HOST,
    editor_port: int = DEFAULT_EDITOR_PORT,
    middleware_port: int = DEFAULT_MIDDLEWARE_PORT,
    asset_worker_port: int = DEFAULT_ASSET_WORKER_PORT,
    preview_gateway_port: int = DEFAULT_PREVIEW_GATEWAY_PORT,
    extension_port: int = DEFAULT_EXTENSION_PORT,
    weisile_link_port: int = DEFAULT_WEISILE_LINK_PORT,
    trainer_port: int = DEFAULT_TRAINER_PORT,
) -> UnifiedPreviewPlan:
    """Build a complete local service plan for ScratchAI + VSLE-EV3."""

    root = root.resolve()
    if not root.is_dir():
        raise UnifiedPreviewError(f"EV3SC root does not exist: {root}")
    missing = missing_unified_preview_requirements(root)
    if missing:
        raise UnifiedPreviewError(
            "Unified preview prerequisites are missing: " + ", ".join(missing)
        )

    middleware_url = f"http://{host}:{middleware_port}"
    asset_worker_url = f"http://{host}:{asset_worker_port}"
    preview_gateway_url = f"http://{host}:{preview_gateway_port}"
    extension_url = f"http://{host}:{extension_port}/vsle-ev3-extension/index.js"
    weisile_link_url = f"ws://{host}:{weisile_link_port}/scratch/bt"
    trainer_url = f"ws://{host}:{trainer_port}"
    editor = build_preview_command(
        root=root,
        host=host,
        port=editor_port,
        middleware_url=middleware_url,
    )
    python = _python_command(root)

    services = (
        PreviewService(
            id="asset-worker",
            label="ScratchAI asset worker",
            command=("npm", "run", "start"),
            cwd=_require_inside_root(root / "scratch-ai-platform/asset-worker", root),
            env={
                "ASSET_WORKER_PORT": str(asset_worker_port),
                "SCRATCH_AI_IMAGE_PROVIDER": "mock",
            },
            url=asset_worker_url,
        ),
        PreviewService(
            id="ai-middleware",
            label="ScratchAI middleware",
            command=("npm", "run", "start"),
            cwd=_require_inside_root(root / "scratch-ai-platform/ai-middleware", root),
            env={
                "AI_MIDDLEWARE_PORT": str(middleware_port),
                "AI_MODEL_ENABLED": "false",
                "ASSET_WORKER_URL": asset_worker_url,
            },
            url=middleware_url,
        ),
        PreviewService(
            id="preview-gateway",
            label="ScratchAI preview gateway",
            command=("npm", "run", "start"),
            cwd=_require_inside_root(root / "scratch-ai-platform/preview-server", root),
            env={
                "SCRATCH_AI_MIDDLEWARE_URL": middleware_url,
                "SCRATCH_AI_PREVIEW_HOST": host,
                "SCRATCH_AI_PREVIEW_PORT": str(preview_gateway_port),
                "SCRATCH_AI_STATIC_ROOT": str(
                    root
                    / "scratch-ai-platform/scratch-editor/packages/scratch-gui/build"
                ),
            },
            url=preview_gateway_url,
        ),
        PreviewService(
            id="extension-static",
            label="VSLE-EV3 extension static server",
            command=(python, "-m", "http.server", str(extension_port), "--bind", host),
            cwd=root,
            env={},
            url=f"http://{host}:{extension_port}/",
        ),
        PreviewService(
            id="weisile-link-preview",
            label="WeisileLink EV3 simulation + AI Quest mock",
            command=(python, "preview/weisile_preview_server.py"),
            cwd=root,
            env={
                "AI_QUEST_PROVIDER": "mock",
                "WEISILE_LINK_HOST": host,
                "WEISILE_LINK_PORT": str(weisile_link_port),
                "TRAINER_WS_PORT": str(trainer_port),
                "WEISILE_ALLOWED_ORIGINS": _allowed_origins(
                    editor_port=editor_port,
                    extension_port=extension_port,
                    preview_gateway_port=preview_gateway_port,
                ),
            },
            url=weisile_link_url,
        ),
        PreviewService(
            id="scratchai-editor",
            label="ScratchAI editor",
            command=editor.command,
            cwd=editor.cwd,
            env=editor.env,
            url=editor.url,
        ),
    )
    health_checks = (
        HealthCheck(
            id="asset-worker-health",
            kind="http-json",
            url=f"{asset_worker_url}/healthz",
            expected="scratch-ai-asset-worker",
        ),
        HealthCheck(
            id="middleware-health",
            kind="http-json",
            url=f"{middleware_url}/healthz",
            expected="moonshot",
        ),
        HealthCheck(
            id="middleware-status",
            kind="http-json",
            url=f"{middleware_url}/statusz",
            expected="scratch-ai-middleware",
        ),
        HealthCheck(
            id="preview-gateway-status",
            kind="http-json",
            url=f"{preview_gateway_url}/preview-statusz",
            expected="scratch-ai-preview-server",
        ),
        HealthCheck(
            id="scratchai-editor-html",
            kind="http-html",
            url=editor.url,
            expected="Scratch 3.0 GUI",
        ),
        HealthCheck(
            id="weisile-link-json-rpc",
            kind="websocket-json-rpc",
            url=weisile_link_url,
            expected="WeisileLink",
        ),
        HealthCheck(
            id="trainer-websocket",
            kind="websocket-open",
            url=trainer_url,
            expected="open",
        ),
    )
    return UnifiedPreviewPlan(
        services=services,
        health_checks=health_checks,
        urls={
            "editor": editor.url,
            "extension": extension_url,
            "middleware": middleware_url,
            "assetWorker": asset_worker_url,
            "previewGateway": preview_gateway_url,
            "weisileLink": weisile_link_url,
            "trainer": trainer_url,
        },
    )


def command_summary(plan: UnifiedPreviewPlan) -> Dict[str, object]:
    """Return a JSON-serializable stack plan."""

    return {
        "urls": plan.urls,
        "services": [
            {
                "id": service.id,
                "label": service.label,
                "command": list(service.command),
                "cwd": str(service.cwd),
                "env": service.env,
                "url": service.url,
            }
            for service in plan.services
        ],
        "healthChecks": [
            {
                "id": check.id,
                "kind": check.kind,
                "url": check.url,
                "expected": check.expected,
            }
            for check in plan.health_checks
        ],
    }


def run_unified_preview(plan: UnifiedPreviewPlan) -> int:
    """Start all preview services and keep them running until interrupted."""

    processes: List[subprocess.Popen] = []
    try:
        for service in plan.services:
            env = {**os.environ, **service.env}
            print(f"Starting {service.label}: {service.url}", flush=True)
            processes.append(
                subprocess.Popen(
                    service.command,
                    cwd=service.cwd,
                    env=env,
                )
            )
            time.sleep(0.5)

        print("Unified preview URLs:", flush=True)
        for key, url in plan.urls.items():
            print(f"  {key}: {url}", flush=True)
        while all(process.poll() is None for process in processes):
            time.sleep(1.0)
        return next(
            (
                process.returncode or 1
                for process in processes
                if process.poll() is not None
            ),
            1,
        )
    except KeyboardInterrupt:
        return 130
    finally:
        for process in processes:
            if process.poll() is None:
                process.send_signal(signal.SIGTERM)
        for process in processes:
            if process.poll() is None:
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Start the unified ScratchAI + VSLE-EV3 local preview stack."
    )
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--editor-port", type=int, default=DEFAULT_EDITOR_PORT)
    parser.add_argument("--middleware-port", type=int, default=DEFAULT_MIDDLEWARE_PORT)
    parser.add_argument(
        "--asset-worker-port",
        type=int,
        default=DEFAULT_ASSET_WORKER_PORT,
    )
    parser.add_argument(
        "--preview-gateway-port",
        type=int,
        default=DEFAULT_PREVIEW_GATEWAY_PORT,
    )
    parser.add_argument("--extension-port", type=int, default=DEFAULT_EXTENSION_PORT)
    parser.add_argument(
        "--weisile-link-port",
        type=int,
        default=DEFAULT_WEISILE_LINK_PORT,
    )
    parser.add_argument("--trainer-port", type=int, default=DEFAULT_TRAINER_PORT)
    parser.add_argument(
        "--print-plan",
        action="store_true",
        help="Print the resolved stack plan and exit without starting services.",
    )
    args = parser.parse_args()

    plan = build_unified_preview_plan(
        root=args.root,
        host=args.host,
        editor_port=args.editor_port,
        middleware_port=args.middleware_port,
        asset_worker_port=args.asset_worker_port,
        preview_gateway_port=args.preview_gateway_port,
        extension_port=args.extension_port,
        weisile_link_port=args.weisile_link_port,
        trainer_port=args.trainer_port,
    )
    if args.print_plan:
        print(json.dumps(command_summary(plan), indent=2, sort_keys=True))
        return 0
    return run_unified_preview(plan)


if __name__ == "__main__":
    raise SystemExit(main())

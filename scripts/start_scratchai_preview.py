#!/usr/bin/env python3
"""Start the EV3SC-owned ScratchAI editor preview."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


DEFAULT_ROOT = Path("/Users/yukii/Desktop/EV3SC")
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8601
DEFAULT_MIDDLEWARE_URL = "http://127.0.0.1:8787"

SCRATCH_EDITOR_RELATIVE = Path("scratch-ai-platform/scratch-editor")
SCRATCH_GUI_RELATIVE = SCRATCH_EDITOR_RELATIVE / "packages/scratch-gui"

REQUIRED_SOURCE_PATHS = (
    SCRATCH_EDITOR_RELATIVE / "package.json",
    SCRATCH_EDITOR_RELATIVE / "package-lock.json",
    SCRATCH_GUI_RELATIVE / "package.json",
    SCRATCH_GUI_RELATIVE / "webpack.config.js",
    SCRATCH_GUI_RELATIVE / "src/playground/index.jsx",
)

REQUIRED_INSTALL_PATHS = (SCRATCH_EDITOR_RELATIVE / "node_modules/.package-lock.json",)

REQUIRED_WORKSPACE_ARTIFACTS = (
    SCRATCH_EDITOR_RELATIVE
    / "packages/scratch-svg-renderer/dist/node/scratch-svg-renderer.js",
    SCRATCH_EDITOR_RELATIVE / "packages/scratch-render/dist/node/scratch-render.js",
    SCRATCH_EDITOR_RELATIVE / "packages/scratch-vm/dist/node/scratch-vm.js",
    SCRATCH_EDITOR_RELATIVE / "packages/scratch-vm/dist/node/extension-worker.js",
)

SCRATCHAI_PREVIEW_ENV = {
    "BROWSER": "none",
    "SCRATCH_AI_ENABLED": "true",
    "SCRATCH_AI_EXTENSION_ENABLED": "true",
    "SCRATCH_AI_MENU_ENABLED": "true",
    "SCRATCH_AI_PANEL_ENABLED": "true",
    "SCRATCH_AI_LOGGING_ENABLED": "true",
    "SCRATCH_AI_META_EXPORT_ENABLED": "true",
    "SCRATCH_AI_TEACHER_PANEL_ENABLED": "true",
    "SCRATCH_AI_KNOWLEDGE_LOCK_ENABLED": "true",
    "SCRATCH_AI_LESSON_PREP_ENABLED": "true",
    "SCRATCH_AI_PROJECT_PLANNER_ENABLED": "true",
    "SCRATCH_AI_LOGIC_VIS_ENABLED": "true",
    "SCRATCH_AI_PUBLISHING_ENABLED": "true",
    "SCRATCH_AI_IMAGE_BLOCKS_ENABLED": "true",
    "SCRATCH_AI_VOICE_BLOCKS_ENABLED": "true",
    "SCRATCH_AI_ONE_LINE_PROJECT_ENABLED": "true",
    "SCRATCH_AI_ADDITION_TEMPLATE_ENABLED": "true",
    "SCRATCH_AI_TEXT_TO_SPEECH_EXTENSION_ENABLED": "true",
    "SCRATCH_AI_TRANSLATE_EXTENSION_ENABLED": "true",
    "SCRATCH_AI_SPEECH_TO_TEXT_EXTENSION_ENABLED": "true",
}


class ScratchAIPreviewError(RuntimeError):
    """Raised when the ScratchAI editor preview cannot be started."""


@dataclass(frozen=True)
class PreviewCommand:
    """Resolved command for launching the Scratch GUI dev server."""

    command: tuple[str, ...]
    cwd: Path
    env: dict[str, str]
    url: str


def _require_inside_root(path: Path, root: Path) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ScratchAIPreviewError(
            f"Preview path escapes EV3SC root: {resolved}"
        ) from error
    return resolved


def missing_preview_requirements(root: Path) -> list[str]:
    """Return missing source/install/build paths needed by webpack serve."""

    root = root.resolve()
    missing: list[str] = []
    for relative in (
        *REQUIRED_SOURCE_PATHS,
        *REQUIRED_INSTALL_PATHS,
        *REQUIRED_WORKSPACE_ARTIFACTS,
    ):
        path = root / relative
        if not path.exists():
            missing.append(str(relative))
    return missing


def build_preview_command(
    *,
    root: Path = DEFAULT_ROOT,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    middleware_url: str = DEFAULT_MIDDLEWARE_URL,
) -> PreviewCommand:
    """Build the npm command that starts the ScratchAI editor preview."""

    root = root.resolve()
    if not root.is_dir():
        raise ScratchAIPreviewError(f"EV3SC root does not exist: {root}")

    gui_root = _require_inside_root(root / SCRATCH_GUI_RELATIVE, root)
    missing = missing_preview_requirements(root)
    if missing:
        raise ScratchAIPreviewError(
            "ScratchAI preview prerequisites are missing: "
            + ", ".join(missing)
            + ". Run npm ci and the scratch-svg-renderer, scratch-render, "
            "and scratch-vm workspace builds from scratch-ai-platform/"
            "scratch-editor first."
        )

    env = {
        **SCRATCHAI_PREVIEW_ENV,
        "PORT": str(port),
        "SCRATCH_AI_MIDDLEWARE_URL": middleware_url.rstrip("/"),
    }
    return PreviewCommand(
        command=("npm", "run", "start", "--", "--host", host),
        cwd=gui_root,
        env=env,
        url=f"http://{host}:{port}/",
    )


def command_summary(command: PreviewCommand) -> dict[str, object]:
    """Return a JSON-serializable command summary for tests and operators."""

    return {
        "command": list(command.command),
        "cwd": str(command.cwd),
        "env": command.env,
        "url": command.url,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Start the EV3SC-owned ScratchAI editor via scratch-gui " "webpack serve."
        )
    )
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument(
        "--middleware-url",
        default=DEFAULT_MIDDLEWARE_URL,
        help="ScratchAI middleware URL embedded into the editor bundle.",
    )
    parser.add_argument(
        "--print-command",
        action="store_true",
        help="Print the resolved command and exit without starting webpack.",
    )
    args = parser.parse_args()

    preview = build_preview_command(
        root=args.root,
        host=args.host,
        port=args.port,
        middleware_url=args.middleware_url,
    )
    if args.print_command:
        print(json.dumps(command_summary(preview), indent=2, sort_keys=True))
        return 0

    env = {**os.environ, **preview.env}
    print(f"ScratchAI editor preview: {preview.url}", flush=True)
    try:
        return subprocess.call(preview.command, cwd=preview.cwd, env=env)
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())

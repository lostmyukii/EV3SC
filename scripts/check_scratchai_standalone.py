#!/usr/bin/env python3
"""Verify the EV3SC-owned ScratchAI copy is standalone."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


class StandaloneCheckError(RuntimeError):
    """Raised when the ScratchAI port violates EV3SC ownership rules."""


REQUIRED_RELATIVE_PATHS = (
    "scratch-ai-platform",
    "scratch-ai-platform/scratch-editor",
    "scratch-ai-platform/scratch-editor/package.json",
    "scratch-ai-platform/ai-middleware",
    "scratch-ai-platform/ai-middleware/package.json",
    "scratch-ai-platform/asset-worker",
    "scratch-ai-platform/asset-worker/package.json",
    "scratch-ai-platform/preview-server",
    "scratch-ai-platform/preview-server/package.json",
    "scratch-ai-platform/scripts",
)

PACKAGE_JSONS = (
    "scratch-ai-platform/scratch-editor/package.json",
    "scratch-ai-platform/ai-middleware/package.json",
    "scratch-ai-platform/asset-worker/package.json",
    "scratch-ai-platform/preview-server/package.json",
)


def _assert_required_paths(root: Path) -> int:
    checked = 0
    missing = []
    for relative in REQUIRED_RELATIVE_PATHS:
        checked += 1
        path = root / relative
        if not path.exists():
            missing.append(relative)
    if missing:
        raise StandaloneCheckError(
            "Missing required ScratchAI port paths: " + ", ".join(missing)
        )
    return checked


def _assert_symlinks_do_not_escape(root: Path) -> int:
    checked = 0
    platform = root / "scratch-ai-platform"
    for path in platform.rglob("*"):
        if not path.is_symlink():
            continue
        checked += 1
        target = path.resolve()
        try:
            target.relative_to(root)
        except ValueError as error:
            raise StandaloneCheckError(
                f"Symlink escapes EV3SC: {path} -> {target}"
            ) from error
    return checked


def _assert_package_scripts_are_local(
    root: Path,
    forbidden_source: Path,
) -> int:
    forbidden_text = str(forbidden_source)
    checked = 0
    for relative in PACKAGE_JSONS:
        checked += 1
        path = root / relative
        data = json.loads(path.read_text(encoding="utf-8"))
        scripts = data.get("scripts", {})
        encoded = json.dumps(scripts, sort_keys=True)
        if forbidden_text in encoded:
            raise StandaloneCheckError(
                f"Package scripts reference forbidden source path: {path}"
            )
    return checked


def check_scratchai_standalone(
    *,
    root: Path,
    forbidden_source: Path,
) -> dict[str, object]:
    root = root.resolve()
    forbidden_source = forbidden_source.resolve()
    if not root.is_dir():
        raise StandaloneCheckError(f"EV3SC root does not exist: {root}")

    required_count = _assert_required_paths(root)
    symlink_count = _assert_symlinks_do_not_escape(root)
    package_count = _assert_package_scripts_are_local(root, forbidden_source)

    return {
        "root": str(root),
        "platform": str(root / "scratch-ai-platform"),
        "forbidden_source": str(forbidden_source),
        "required_paths_checked": required_count,
        "symlinks_checked": symlink_count,
        "package_jsons_checked": package_count,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("/Users/yukii/Desktop/EV3SC"),
    )
    parser.add_argument(
        "--forbidden-source",
        type=Path,
        default=Path("/Users/yukii/Desktop/scratch ai"),
    )
    args = parser.parse_args()

    result = check_scratchai_standalone(
        root=args.root,
        forbidden_source=args.forbidden_source,
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

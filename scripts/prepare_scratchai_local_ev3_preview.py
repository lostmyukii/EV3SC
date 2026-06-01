#!/usr/bin/env python3
"""Prepare an ignored ScratchAI static build for local EV3 browser smoke."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Users/yukii/Desktop/EV3SC")
DEFAULT_BUILD_DIR = (
    DEFAULT_ROOT
    / "scratch-ai-platform/scratch-editor/packages/scratch-gui/build"
)
DEFAULT_DEPLOYED_EXTENSION_URL = (
    "http://101.42.92.6:18612/vsle-ev3-extension/index.js"
)
DEFAULT_LOCAL_EXTENSION_URL = (
    "http://127.0.0.1:8000/vsle-ev3-extension/index.js"
)
CACHE_BUST_QUERY = "ev3sc-local-preview=local"
HTML_BUNDLE_RE = re.compile(
    r'src="(?P<bundle>'
    r'(?:gui|blocksonly|compatibilitytesting|guistandalone|player)\.js)'
    r'(?:\?[^"]*)?"'
)


class LocalPreviewPreparationError(RuntimeError):
    """Raised when the local ScratchAI preview bundle cannot be prepared."""


def _inside_root(path: Path, root: Path) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise LocalPreviewPreparationError(
            f"Preview path escapes EV3SC root: {resolved}"
        ) from error
    return resolved


def prepare_local_preview_bundle(
    *,
    root: Path = DEFAULT_ROOT,
    build_dir: Path = DEFAULT_BUILD_DIR,
    source_url: str = DEFAULT_DEPLOYED_EXTENSION_URL,
    extension_url: str = DEFAULT_LOCAL_EXTENSION_URL,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Rewrite ignored Scratch GUI build JS files to use a local EV3 URL."""

    root = root.resolve()
    build_dir = _inside_root(build_dir, root)
    if not build_dir.is_dir():
        raise LocalPreviewPreparationError(
            f"Scratch GUI build directory not found: {build_dir}"
        )

    files_rewritten: list[str] = []
    already_local_files: list[str] = []
    html_files_rewritten: list[str] = []
    replacements = 0
    for path in sorted(build_dir.glob("*.js")):
        text = path.read_text(encoding="utf-8")
        count = text.count(source_url)
        if count == 0 and extension_url in text:
            already_local_files.append(str(path.relative_to(root)))
            continue
        if count == 0:
            continue
        replacements += count
        files_rewritten.append(str(path.relative_to(root)))
        if not dry_run:
            path.write_text(text.replace(source_url, extension_url), encoding="utf-8")

    for path in sorted(build_dir.glob("*.html")):
        text = path.read_text(encoding="utf-8")

        def add_cache_bust(match: re.Match[str]) -> str:
            return f'src="{match.group("bundle")}?{CACHE_BUST_QUERY}"'

        updated = HTML_BUNDLE_RE.sub(add_cache_bust, text)
        if updated == text:
            continue
        html_files_rewritten.append(str(path.relative_to(root)))
        if not dry_run:
            path.write_text(updated, encoding="utf-8")

    if replacements == 0 and not already_local_files:
        raise LocalPreviewPreparationError(
            f"Did not find {source_url!r} in JS files under {build_dir}"
        )

    return {
        "build_dir": str(build_dir.relative_to(root)),
        "source_url": source_url,
        "extension_url": extension_url,
        "files_rewritten": files_rewritten,
        "already_local_files": already_local_files,
        "html_files_rewritten": html_files_rewritten,
        "replacements": replacements,
        "cache_bust_query": CACHE_BUST_QUERY,
        "dry_run": dry_run,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--build-dir", type=Path, default=DEFAULT_BUILD_DIR)
    parser.add_argument("--source-url", default=DEFAULT_DEPLOYED_EXTENSION_URL)
    parser.add_argument("--extension-url", default=DEFAULT_LOCAL_EXTENSION_URL)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    summary = prepare_local_preview_bundle(
        root=args.root,
        build_dir=args.build_dir,
        source_url=args.source_url,
        extension_url=args.extension_url,
        dry_run=args.dry_run,
    )
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

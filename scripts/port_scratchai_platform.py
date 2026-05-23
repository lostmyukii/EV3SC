#!/usr/bin/env python3
"""Port the ScratchAI platform source into EV3SC.

This script reads the authorized local reference tree and writes only under
EV3SC. It excludes generated dependency and build artifacts so EV3SC owns
source, lockfiles, scripts, tests, and docs without vendoring node_modules.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path
from typing import Iterable


EXCLUDED_DIR_NAMES = frozenset(
    {
        ".cache",
        ".git",
        ".pytest_cache",
        "artifacts",
        "build",
        "dist",
        "node_modules",
        "test-results",
    }
)

EXCLUDED_FILE_NAMES = frozenset({".DS_Store"})


def _is_excluded(path: Path) -> bool:
    return path.name in EXCLUDED_FILE_NAMES or any(
        part in EXCLUDED_DIR_NAMES for part in path.parts
    )


def _iter_source_files(source: Path) -> Iterable[Path]:
    for root, dirs, files in os.walk(source):
        dirs[:] = sorted(
            directory
            for directory in dirs
            if directory not in EXCLUDED_DIR_NAMES
        )
        root_path = Path(root)
        for file_name in sorted(files):
            relative = root_path.joinpath(file_name).relative_to(source)
            if _is_excluded(relative):
                continue
            yield source / relative


def port_scratchai_platform(
    *,
    source: Path,
    dest: Path,
    force: bool = False,
) -> dict[str, object]:
    source = source.resolve()
    dest = dest.resolve()

    if not source.is_dir():
        raise FileNotFoundError(f"ScratchAI source does not exist: {source}")

    if dest.exists() or dest.is_symlink():
        if not force:
            raise FileExistsError(
                f"Destination already exists: {dest}. "
                "Pass --force to replace it."
            )
        if dest.is_dir() and not dest.is_symlink():
            shutil.rmtree(dest)
        else:
            dest.unlink()

    dest.mkdir(parents=True, exist_ok=True)

    copied_files = 0
    copied_symlinks = 0
    for src_file in _iter_source_files(source):
        relative = src_file.relative_to(source)
        dst_file = dest / relative
        dst_file.parent.mkdir(parents=True, exist_ok=True)
        if src_file.is_symlink():
            target = src_file.readlink()
            dst_file.symlink_to(target)
            copied_symlinks += 1
        else:
            shutil.copy2(src_file, dst_file)
            copied_files += 1

    summary = {
        "source": str(source),
        "destination": str(dest),
        "copied_files": copied_files,
        "copied_symlinks": copied_symlinks,
        "excluded_dir_names": sorted(EXCLUDED_DIR_NAMES),
        "excluded_file_names": sorted(EXCLUDED_FILE_NAMES),
    }
    (dest / "PORT_SOURCE.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("/Users/yukii/Desktop/scratch ai/scratch-ai-platform"),
    )
    parser.add_argument(
        "--dest",
        type=Path,
        default=Path("/Users/yukii/Desktop/EV3SC/scratch-ai-platform"),
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    summary = port_scratchai_platform(
        source=args.source,
        dest=args.dest,
        force=args.force,
    )
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

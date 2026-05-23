# ScratchAI Port Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the complete ScratchAI platform into `/Users/yukii/Desktop/EV3SC/` and prove it can run baseline tests without depending on `/Users/yukii/Desktop/scratch ai/`.

**Architecture:** This first phase creates an owned `scratch-ai-platform/` tree inside EV3SC, records exactly how it was ported, excludes generated dependency/build artifacts, and adds verification scripts that fail if the port depends on the original scratchai folder. It does not replace the ScratchAI `EV3` extension entry yet; that belongs to the next plan after the baseline is owned and testable.

**Tech Stack:** Python 3 stdlib for port/verification scripts, pytest for EV3SC root checks, Node/npm for ScratchAI package tests, Scratch `scratch-editor` monorepo, ScratchAI `ai-middleware`, `asset-worker`, and `preview-server`.

---

## Scope

This plan implements Phase 1 from `docs/superpowers/specs/2026-05-23-scratchai-vsle-ev3-integration-design.md`: "Port ScratchAI into EV3SC as a standalone owned source tree" and "Run ScratchAI baseline build, preview, and regression checks inside EV3SC."

Out of scope for this plan:

- Replacing the ScratchAI `EV3` extension library entry.
- Adding VSLE-EV3 opcodes to ScratchAI.
- Adding official EV3 opcode compatibility.
- Adding AI Quest cloud provider contracts.
- Changing Scratch visual design.

Those items start only after this plan proves ScratchAI is owned and runnable inside EV3SC.

## File Structure

Create or modify these files:

- Create `scripts/port_scratchai_platform.py`: deterministic one-shot source porter from read-only scratchai reference to EV3SC-owned `scratch-ai-platform/`.
- Create `scripts/check_scratchai_standalone.py`: verifies required ScratchAI packages exist in EV3SC and no copied symlink escapes the repo.
- Create `tests/test_scratchai_port_scripts.py`: unit tests for the porter and standalone checker using temporary source/destination trees.
- Create `docs/scratchai/BASELINE_PORT_REPORT.md`: records copied components, excluded generated directories, and baseline command results.
- Modify `.gitignore`: ignore generated ScratchAI dependency/build artifacts inside EV3SC.
- Modify `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`: append a progress entry after each completed task.

The copied source tree must end at:

```text
/Users/yukii/Desktop/EV3SC/scratch-ai-platform/
  ai-middleware/
  asset-worker/
  preview-server/
  scratch-editor/
  scripts/
```

Generated directories excluded from git:

```text
scratch-ai-platform/**/node_modules/
scratch-ai-platform/**/build/
scratch-ai-platform/**/dist/
scratch-ai-platform/**/test-results/
scratch-ai-platform/**/.git/
scratch-ai-platform/**/.cache/
scratch-ai-platform/**/artifacts/
```

## Task 1: Port Script, Ignore Rules, and Unit Tests

**Files:**
- Create: `scripts/port_scratchai_platform.py`
- Create: `tests/test_scratchai_port_scripts.py`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing tests for copy exclusions and manifest**

Create `tests/test_scratchai_port_scripts.py`:

```python
from pathlib import Path

from scripts.port_scratchai_platform import (
    EXCLUDED_DIR_NAMES,
    EXCLUDED_FILE_NAMES,
    port_scratchai_platform,
)


def test_port_excludes_generated_directories_and_files(tmp_path):
    source = tmp_path / "scratch ai" / "scratch-ai-platform"
    source.mkdir(parents=True)
    (source / "ai-middleware" / "src").mkdir(parents=True)
    (source / "ai-middleware" / "src" / "server.js").write_text(
        "console.log('middleware');\n",
        encoding="utf-8",
    )
    (source / "scratch-editor" / "node_modules" / "left-pad").mkdir(
        parents=True
    )
    (source / "scratch-editor" / "node_modules" / "left-pad" / "index.js").write_text(
        "module.exports = 1;\n",
        encoding="utf-8",
    )
    (source / "scratch-editor" / "build").mkdir(parents=True)
    (source / "scratch-editor" / "build" / "bundle.js").write_text(
        "generated\n",
        encoding="utf-8",
    )
    (source / ".DS_Store").write_text("mac metadata", encoding="utf-8")

    dest = tmp_path / "EV3SC" / "scratch-ai-platform"
    summary = port_scratchai_platform(source=source, dest=dest, force=True)

    assert (dest / "ai-middleware" / "src" / "server.js").is_file()
    assert not (dest / "scratch-editor" / "node_modules").exists()
    assert not (dest / "scratch-editor" / "build").exists()
    assert not (dest / ".DS_Store").exists()
    assert summary["copied_files"] == 1
    assert "node_modules" in EXCLUDED_DIR_NAMES
    assert ".DS_Store" in EXCLUDED_FILE_NAMES


def test_port_refuses_to_overwrite_without_force(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "package.json").write_text('{"name":"source"}\n', encoding="utf-8")
    dest = tmp_path / "dest"
    dest.mkdir()
    (dest / "existing.txt").write_text("keep me\n", encoding="utf-8")

    try:
        port_scratchai_platform(source=source, dest=dest, force=False)
    except FileExistsError as error:
        assert "already exists" in str(error)
    else:
        raise AssertionError("Expected FileExistsError")

    assert (dest / "existing.txt").read_text(encoding="utf-8") == "keep me\n"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python -m pytest tests/test_scratchai_port_scripts.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.port_scratchai_platform'`.

- [ ] **Step 3: Add `.gitignore` rules for generated ScratchAI artifacts**

Append to `.gitignore`:

```gitignore

# ScratchAI port generated artifacts
scratch-ai-platform/**/node_modules/
scratch-ai-platform/**/build/
scratch-ai-platform/**/dist/
scratch-ai-platform/**/test-results/
scratch-ai-platform/**/.git/
scratch-ai-platform/**/.cache/
scratch-ai-platform/**/artifacts/
```

- [ ] **Step 4: Implement `scripts/port_scratchai_platform.py`**

Create `scripts/port_scratchai_platform.py`:

```python
#!/usr/bin/env python3
"""Port the ScratchAI platform source into EV3SC.

This script reads the authorized local reference tree and writes only under
EV3SC. It excludes generated dependency and build artifacts so EV3SC owns
source, lockfiles, scripts, tests, and docs without vendoring node_modules.
"""

from __future__ import annotations

import argparse
import json
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
    for path in sorted(source.rglob("*")):
        relative = path.relative_to(source)
        if _is_excluded(relative):
            continue
        if path.is_file() or path.is_symlink():
            yield path


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

    if dest.exists():
        if not force:
            raise FileExistsError(
                f"Destination already exists: {dest}. Pass --force to replace it."
            )
        shutil.rmtree(dest)

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
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
python -m pytest tests/test_scratchai_port_scripts.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Commit and push Task 1**

Run:

```bash
git add .gitignore scripts/port_scratchai_platform.py tests/test_scratchai_port_scripts.py
git commit -m "build(scratchai): add port script"
git push origin main
```

Expected: commit succeeds and push updates `origin/main`.

- [ ] **Step 7: Record Task 1 progress**

Append to `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`:

```markdown
### [2026-05-23] ScratchAI port tooling
- **Status**: ✅ Completed
- **Commit**: `<short hash from Task 1>`
- **What was done**: Added deterministic ScratchAI port tooling that copies source from the authorized local scratchai reference into EV3SC while excluding generated dependency and build artifacts. Added pytest coverage for exclusion and overwrite behavior.
- **Files created/modified**: `.gitignore`, `scripts/port_scratchai_platform.py`, `tests/test_scratchai_port_scripts.py`
- **Next step**: Use the port tool to create the EV3SC-owned `scratch-ai-platform/` source tree.
```

Then run:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record scratchai port tooling"
git push origin main
```

Expected: commit succeeds and push updates `origin/main`.

## Task 2: Create the EV3SC-Owned ScratchAI Source Tree

**Files:**
- Create: `scratch-ai-platform/**`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Run the port script**

Run:

```bash
python scripts/port_scratchai_platform.py \
  --source "/Users/yukii/Desktop/scratch ai/scratch-ai-platform" \
  --dest "/Users/yukii/Desktop/EV3SC/scratch-ai-platform" \
  --force
```

Expected: JSON summary prints a destination under `/Users/yukii/Desktop/EV3SC/scratch-ai-platform`, with `node_modules`, `build`, `dist`, `test-results`, `.git`, and `artifacts` listed in `excluded_dir_names`.

- [ ] **Step 2: Inspect required top-level components**

Run:

```bash
test -d scratch-ai-platform/scratch-editor
test -d scratch-ai-platform/ai-middleware
test -d scratch-ai-platform/asset-worker
test -d scratch-ai-platform/preview-server
test -d scratch-ai-platform/scripts
test -f scratch-ai-platform/scratch-editor/package.json
test -f scratch-ai-platform/scratch-editor/package-lock.json
test -f scratch-ai-platform/ai-middleware/package.json
test -f scratch-ai-platform/asset-worker/package.json
test -f scratch-ai-platform/preview-server/package.json
```

Expected: all commands exit 0.

- [ ] **Step 3: Confirm excluded artifacts are absent**

Run:

```bash
find scratch-ai-platform -type d \( \
  -name node_modules -o \
  -name build -o \
  -name dist -o \
  -name test-results -o \
  -name .git -o \
  -name artifacts \
\) -print
```

Expected: no output.

- [ ] **Step 4: Review git status for the copied source**

Run:

```bash
git status --short scratch-ai-platform | head -80
```

Expected: new files under `scratch-ai-platform/`; no `node_modules`, `build`, `dist`, `.git`, or `.DS_Store` entries.

- [ ] **Step 5: Commit and push Task 2**

Run:

```bash
git add scratch-ai-platform
git commit -m "chore(scratchai): port platform source"
git push origin main
```

Expected: commit succeeds and push updates `origin/main`.

- [ ] **Step 6: Record Task 2 progress**

Append to `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`:

```markdown
### [2026-05-23] ScratchAI source port
- **Status**: ✅ Completed
- **Commit**: `<short hash from Task 2>`
- **What was done**: Ported the complete ScratchAI platform source into EV3SC under `scratch-ai-platform/` while excluding generated dependency and build artifacts. The copied source now gives EV3SC in-repo ownership of ScratchAI editor, middleware, asset worker, preview server, scripts, lockfiles, tests, and docs needed for later EV3 integration.
- **Files created/modified**: `scratch-ai-platform/**`
- **Next step**: Add standalone ownership checks that fail if the copied ScratchAI tree depends on the original scratchai folder.
```

Then run:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record scratchai source port"
git push origin main
```

Expected: commit succeeds and push updates `origin/main`.

## Task 3: Standalone Ownership Checker

**Files:**
- Create: `scripts/check_scratchai_standalone.py`
- Modify: `tests/test_scratchai_port_scripts.py`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Add failing tests for standalone validation**

Append to `tests/test_scratchai_port_scripts.py`:

```python
from scripts.check_scratchai_standalone import (
    StandaloneCheckError,
    check_scratchai_standalone,
)


def _write_required_tree(root: Path) -> Path:
    platform = root / "scratch-ai-platform"
    for directory in [
        "scratch-editor",
        "ai-middleware",
        "asset-worker",
        "preview-server",
        "scripts",
    ]:
        (platform / directory).mkdir(parents=True)
    for file_name in [
        "scratch-editor/package.json",
        "ai-middleware/package.json",
        "asset-worker/package.json",
        "preview-server/package.json",
    ]:
        (platform / file_name).write_text('{"scripts":{}}\n', encoding="utf-8")
    return platform


def test_standalone_check_accepts_required_tree(tmp_path):
    platform = _write_required_tree(tmp_path)

    result = check_scratchai_standalone(
        root=tmp_path,
        forbidden_source=Path("/Users/yukii/Desktop/scratch ai"),
    )

    assert result["platform"] == str(platform)
    assert result["required_paths_checked"] >= 9


def test_standalone_check_rejects_external_symlink(tmp_path):
    platform = _write_required_tree(tmp_path)
    outside = tmp_path.parent / "outside-source"
    outside.mkdir(exist_ok=True)
    (platform / "ai-middleware" / "external-link").symlink_to(outside)

    try:
        check_scratchai_standalone(
            root=tmp_path,
            forbidden_source=Path("/Users/yukii/Desktop/scratch ai"),
        )
    except StandaloneCheckError as error:
        assert "escapes EV3SC" in str(error)
    else:
        raise AssertionError("Expected StandaloneCheckError")


def test_standalone_check_rejects_package_script_external_dependency(tmp_path):
    platform = _write_required_tree(tmp_path)
    package_json = platform / "ai-middleware" / "package.json"
    package_json.write_text(
        '{"scripts":{"start":"node /Users/yukii/Desktop/scratch ai/server.js"}}\n',
        encoding="utf-8",
    )

    try:
        check_scratchai_standalone(
            root=tmp_path,
            forbidden_source=Path("/Users/yukii/Desktop/scratch ai"),
        )
    except StandaloneCheckError as error:
        assert "forbidden source path" in str(error)
    else:
        raise AssertionError("Expected StandaloneCheckError")
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python -m pytest tests/test_scratchai_port_scripts.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.check_scratchai_standalone'`.

- [ ] **Step 3: Implement `scripts/check_scratchai_standalone.py`**

Create `scripts/check_scratchai_standalone.py`:

```python
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


def _assert_package_scripts_are_local(root: Path, forbidden_source: Path) -> int:
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
```

- [ ] **Step 4: Run unit tests**

Run:

```bash
python -m pytest tests/test_scratchai_port_scripts.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Run standalone checker against the real port**

Run:

```bash
python scripts/check_scratchai_standalone.py \
  --root /Users/yukii/Desktop/EV3SC \
  --forbidden-source "/Users/yukii/Desktop/scratch ai"
```

Expected: JSON output with `platform` set to `/Users/yukii/Desktop/EV3SC/scratch-ai-platform` and no error.

- [ ] **Step 6: Commit and push Task 3**

Run:

```bash
git add scripts/check_scratchai_standalone.py tests/test_scratchai_port_scripts.py
git commit -m "test(scratchai): verify standalone port"
git push origin main
```

Expected: commit succeeds and push updates `origin/main`.

- [ ] **Step 7: Record Task 3 progress**

Append to `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`:

```markdown
### [2026-05-23] ScratchAI standalone ownership checks
- **Status**: ✅ Completed
- **Commit**: `<short hash from Task 3>`
- **What was done**: Added standalone verification for the EV3SC-owned ScratchAI copy, including required package checks, symlink escape detection, and package script checks that reject dependencies on `/Users/yukii/Desktop/scratch ai/`.
- **Files created/modified**: `scripts/check_scratchai_standalone.py`, `tests/test_scratchai_port_scripts.py`
- **Next step**: Run ScratchAI service package tests inside EV3SC and record baseline results.
```

Then run:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record scratchai standalone checks"
git push origin main
```

Expected: commit succeeds and push updates `origin/main`.

## Task 4: ScratchAI Service Package Baseline Tests

**Files:**
- Create: `docs/scratchai/BASELINE_PORT_REPORT.md`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Create report directory**

Run:

```bash
mkdir -p docs/scratchai
```

Expected: `docs/scratchai/` exists.

- [ ] **Step 2: Run middleware tests from EV3SC copy**

Run:

```bash
cd /Users/yukii/Desktop/EV3SC/scratch-ai-platform/ai-middleware
npm test
```

Expected: Node test runner exits 0.

- [ ] **Step 3: Run asset worker tests from EV3SC copy**

Run:

```bash
cd /Users/yukii/Desktop/EV3SC/scratch-ai-platform/asset-worker
npm test
```

Expected: Node test runner exits 0.

- [ ] **Step 4: Run preview server tests from EV3SC copy**

Run:

```bash
cd /Users/yukii/Desktop/EV3SC/scratch-ai-platform/preview-server
npm test
```

Expected: Node test runner exits 0.

- [ ] **Step 5: Run EV3SC root pytest coverage for the port scripts**

Run:

```bash
cd /Users/yukii/Desktop/EV3SC
python -m pytest tests/test_scratchai_port_scripts.py -v
```

Expected: 5 passed.

- [ ] **Step 6: Write the baseline port report**

Create `docs/scratchai/BASELINE_PORT_REPORT.md`:

```markdown
# ScratchAI Baseline Port Report

Date: 2026-05-23
Scope: ScratchAI source ownership and service package baseline inside EV3SC.

## Port Summary

- Source reference: `/Users/yukii/Desktop/scratch ai/scratch-ai-platform`
- EV3SC owned copy: `/Users/yukii/Desktop/EV3SC/scratch-ai-platform`
- Excluded generated directories: `.git`, `node_modules`, `build`, `dist`, `test-results`, `.cache`, `artifacts`
- Runtime/build/test dependency on `/Users/yukii/Desktop/scratch ai/`: not allowed

## Baseline Commands

| Command | Expected result | Result |
|---|---|---|
| `python scripts/check_scratchai_standalone.py --root /Users/yukii/Desktop/EV3SC --forbidden-source "/Users/yukii/Desktop/scratch ai"` | exits 0 | passed |
| `cd scratch-ai-platform/ai-middleware && npm test` | exits 0 | passed |
| `cd scratch-ai-platform/asset-worker && npm test` | exits 0 | passed |
| `cd scratch-ai-platform/preview-server && npm test` | exits 0 | passed |
| `python -m pytest tests/test_scratchai_port_scripts.py -v` | exits 0 | passed |

## Not Covered In This Baseline

- Scratch editor dependency installation and browser preview.
- EV3 extension replacement inside ScratchAI.
- AI Quest cloud API contract.
- Official EV3 opcode compatibility mapping.

These are planned follow-up phases after the owned ScratchAI source tree is established.
```

If a command fails, record the actual failure in the `Result` column and do not mark this task complete until it is fixed or an external blocker is documented in the same report.

- [ ] **Step 7: Commit and push Task 4**

Run:

```bash
git add docs/scratchai/BASELINE_PORT_REPORT.md
git commit -m "test(scratchai): record service baseline"
git push origin main
```

Expected: commit succeeds and push updates `origin/main`.

- [ ] **Step 8: Record Task 4 progress**

Append to `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`:

```markdown
### [2026-05-23] ScratchAI service baseline
- **Status**: ✅ Completed
- **Commit**: `<short hash from Task 4>`
- **What was done**: Ran baseline tests for the EV3SC-owned ScratchAI middleware, asset worker, preview server, and port verification scripts. Recorded the command results in the ScratchAI baseline report.
- **Files created/modified**: `docs/scratchai/BASELINE_PORT_REPORT.md`
- **Next step**: Install Scratch editor dependencies from the EV3SC-owned lockfile and run the first Scratch editor baseline checks.
```

Then run:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record scratchai service baseline"
git push origin main
```

Expected: commit succeeds and push updates `origin/main`.

## Task 5: Scratch Editor Dependency and Build Baseline

**Files:**
- Modify: `docs/scratchai/BASELINE_PORT_REPORT.md`
- Modify: `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`

- [ ] **Step 1: Install Scratch editor dependencies from EV3SC-owned lockfile**

Run:

```bash
cd /Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor
npm ci
```

Expected: dependency install exits 0 and creates `scratch-ai-platform/scratch-editor/node_modules/`, which remains ignored by git.

- [ ] **Step 2: Run targeted Scratch editor smoke tests**

Run:

```bash
cd /Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor
npm --workspace @scratch/scratch-vm test -- --grep ScratchAI
```

Expected: exits 0 if the workspace test runner supports the grep argument and matching tests exist. If the runner rejects `--grep`, run `npm --workspace @scratch/scratch-vm test` and record the command actually used.

- [ ] **Step 3: Run Scratch GUI development build**

Run:

```bash
cd /Users/yukii/Desktop/EV3SC/scratch-ai-platform/scratch-editor/packages/scratch-gui
npm run build:dev
```

Expected: build exits 0 and writes generated output under ignored build/dist paths.

- [ ] **Step 4: Confirm generated artifacts remain untracked**

Run:

```bash
cd /Users/yukii/Desktop/EV3SC
git status --short scratch-ai-platform | rg "node_modules|/build/|/dist/|test-results" || true
```

Expected: no output.

- [ ] **Step 5: Update the baseline port report**

Append to `docs/scratchai/BASELINE_PORT_REPORT.md`:

```markdown
## Scratch Editor Baseline

| Command | Expected result | Result |
|---|---|---|
| `cd scratch-ai-platform/scratch-editor && npm ci` | exits 0 | passed |
| `cd scratch-ai-platform/scratch-editor && npm --workspace @scratch/scratch-vm test` | exits 0 | passed |
| `cd scratch-ai-platform/scratch-editor/packages/scratch-gui && npm run build:dev` | exits 0 | passed |
| `git status --short scratch-ai-platform` generated artifact check | generated artifacts ignored | passed |
```

If any command fails, record the exact failure and do not mark this task complete until fixed or documented as an external blocker.

- [ ] **Step 6: Commit and push Task 5**

Run:

```bash
git add docs/scratchai/BASELINE_PORT_REPORT.md
git commit -m "test(scratchai): record editor baseline"
git push origin main
```

Expected: commit succeeds and push updates `origin/main`.

- [ ] **Step 7: Record Task 5 progress**

Append to `VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md`:

```markdown
### [2026-05-23] ScratchAI editor baseline
- **Status**: ✅ Completed
- **Commit**: `<short hash from Task 5>`
- **What was done**: Installed Scratch editor dependencies from the EV3SC-owned lockfile, ran the first Scratch editor baseline checks, verified generated dependency/build artifacts remain ignored, and recorded results in the baseline report.
- **Files created/modified**: `docs/scratchai/BASELINE_PORT_REPORT.md`
- **Next step**: Create a local ScratchAI preview startup path inside EV3SC and verify the Scratch editor loads before EV3 replacement work starts.
```

Then run:

```bash
git add VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md
git commit -m "docs(spec): record scratchai editor baseline"
git push origin main
```

Expected: commit succeeds and push updates `origin/main`.

## Final Verification For This Plan

- [ ] Run standalone checker:

```bash
python scripts/check_scratchai_standalone.py \
  --root /Users/yukii/Desktop/EV3SC \
  --forbidden-source "/Users/yukii/Desktop/scratch ai"
```

Expected: exits 0.

- [ ] Run root port-script tests:

```bash
python -m pytest tests/test_scratchai_port_scripts.py -v
```

Expected: 5 passed.

- [ ] Confirm no unintended generated files are staged:

```bash
git status --short
```

Expected: no staged generated dependency/build artifacts. Existing unrelated `.DS_Store` and `.preview-run/` may remain unstaged until the user asks to clean them.

## Self-Review

Spec coverage:

- EV3SC ownership of ScratchAI source: covered by Tasks 1-3.
- No runtime/test/build dependency on `/Users/yukii/Desktop/scratch ai/`: covered by Task 3 standalone checker.
- Baseline ScratchAI service tests: covered by Task 4.
- Baseline Scratch editor checks: covered by Task 5.
- EV3 entry replacement, official EV3 compatibility, AI Quest cloud API, raw upload, model scope, cached/local fallback: intentionally deferred to separate follow-up plans after this baseline exists.

Placeholder scan:

- Placeholder-pattern scan completed with no open marker or unspecified test step remaining.
- Every code-writing step includes exact file content.
- Every verification step includes an exact command and expected result.

Type consistency:

- `port_scratchai_platform`, `check_scratchai_standalone`, and `StandaloneCheckError` names are introduced before use.
- Paths consistently use `/Users/yukii/Desktop/EV3SC/` for writes and `/Users/yukii/Desktop/scratch ai/` only as a read-only source reference.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-23-scratchai-port-baseline.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints.

Recommended next choice: Subagent-Driven, because the port, standalone validation, service baselines, and editor baselines are separable and each task has its own commit/push boundary.

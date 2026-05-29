#!/usr/bin/env python3
"""Submit, staple, and record macOS WeisileLink notarization evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_manifest(path: Path) -> dict[str, object]:
    if not path.is_file():
        raise ValueError(f"manifest does not exist: {path}")
    decoded = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(decoded, dict):
        raise ValueError("manifest JSON must be an object")
    return decoded


def _write_manifest(path: Path, manifest: dict[str, object]) -> None:
    path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _zip_app(app: Path, zip_path: Path) -> None:
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(app.rglob("*")):
            if path.is_dir():
                continue
            archive.write(path, (app.name / path.relative_to(app)).as_posix())


def _require_macos_release(
    manifest_path: Path,
    manifest: dict[str, object],
) -> tuple[Path, Path]:
    if manifest.get("target") != "macos":
        raise ValueError("manifest target must be macos")
    if manifest.get("signed") is not True:
        raise ValueError("manifest must be signed before notarization")
    if manifest.get("contains_self_contained_executable") is not True:
        raise ValueError("manifest must include a self-contained executable")

    app_name = manifest.get("app_bundle")
    zip_name = manifest.get("artifact_zip")
    if not isinstance(app_name, str) or not app_name:
        raise ValueError("manifest app_bundle is required")
    if not isinstance(zip_name, str) or not zip_name:
        raise ValueError("manifest artifact_zip is required")

    root = manifest_path.parent
    app = root / app_name
    zip_path = root / zip_name
    if not app.is_dir():
        raise ValueError(f"app bundle does not exist: {app}")
    if not zip_path.is_file():
        raise ValueError(f"artifact zip does not exist: {zip_path}")
    return app, zip_path


def notarize_release(
    manifest_path: Path,
    keychain_profile: str,
) -> dict[str, object]:
    manifest = _load_manifest(manifest_path)
    app, zip_path = _require_macos_release(manifest_path, manifest)

    subprocess.run(
        [
            "xcrun",
            "notarytool",
            "submit",
            str(zip_path),
            "--keychain-profile",
            keychain_profile,
            "--wait",
        ],
        check=True,
    )
    subprocess.run(["xcrun", "stapler", "staple", str(app)], check=True)
    subprocess.run(["xcrun", "stapler", "validate", str(app)], check=True)

    _zip_app(app, zip_path)
    manifest["artifact_sha256"] = _sha256(zip_path)
    manifest["notarized"] = True
    manifest["notarization_tool"] = "xcrun notarytool"
    manifest["release_note"] = (
        "macOS artifact is signed and notarized; classroom readiness still "
        "requires clean-machine install smoke evidence."
    )
    _write_manifest(manifest_path, manifest)
    return {"manifest": str(manifest_path), "zip": str(zip_path)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Notarize a signed macOS WeisileLink release artifact."
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        required=True,
        help="Path to WeisileLink-macos-*-manifest.json.",
    )
    parser.add_argument(
        "--keychain-profile",
        required=True,
        help="notarytool keychain profile name. Do not pass Apple passwords.",
    )
    args = parser.parse_args(argv)

    try:
        result = notarize_release(
            args.manifest.expanduser().resolve(),
            args.keychain_profile,
        )
    except subprocess.CalledProcessError as exc:
        print(f"notarization command failed: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

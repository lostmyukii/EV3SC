#!/usr/bin/env python3
"""Build a signed macOS installer pkg from a notarized WeisileLink app."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile


PACKAGE_IDENTIFIER = "cn.vsle.weisile-link"


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


def _require_notarized_release(
    manifest_path: Path,
    manifest: dict[str, object],
) -> tuple[Path, str]:
    if manifest.get("target") != "macos":
        raise ValueError("manifest target must be macos")
    if manifest.get("signed") is not True:
        raise ValueError("manifest must be signed before building installer pkg")
    if manifest.get("notarized") is not True:
        raise ValueError("manifest must be notarized before building installer pkg")
    if manifest.get("contains_self_contained_executable") is not True:
        raise ValueError("manifest must include a self-contained executable")

    app_name = manifest.get("app_bundle")
    if not isinstance(app_name, str) or not app_name:
        raise ValueError("manifest app_bundle is required")
    app = manifest_path.parent / app_name
    if not app.is_dir():
        raise ValueError(f"app bundle does not exist: {app}")

    version = manifest.get("version")
    if not isinstance(version, str) or not version:
        raise ValueError("manifest version is required")
    return app, version


def _write_postinstall(path: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env bash",
                "set -eu",
                'APP_INSTALL="/Applications/WeisileLink.app/Contents/Resources/install.sh"',
                'if [ ! -x "${APP_INSTALL}" ]; then',
                '  echo "Missing WeisileLink install helper: ${APP_INSTALL}" >&2',
                "  exit 1",
                "fi",
                'CONSOLE_USER="$(stat -f %Su /dev/console)"',
                'if [ -n "${CONSOLE_USER}" ] && [ "${CONSOLE_USER}" != "root" ]; then',
                '  sudo -u "${CONSOLE_USER}" "${APP_INSTALL}"',
                "else",
                '  "${APP_INSTALL}"',
                "fi",
                "",
            ]
        ),
        encoding="utf-8",
    )
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def build_pkg(
    manifest_path: Path,
    sign_identity: str,
    package_name: str | None = None,
) -> dict[str, object]:
    manifest = _load_manifest(manifest_path)
    app, version = _require_notarized_release(manifest_path, manifest)
    pkg_name = package_name or f"WeisileLink-macos-{version}.pkg"
    final_pkg = manifest_path.parent / pkg_name

    with tempfile.TemporaryDirectory(prefix="weisilelink-pkg-") as tmp:
        tmp_path = Path(tmp)
        scripts = tmp_path / "scripts"
        scripts.mkdir()
        _write_postinstall(scripts / "postinstall")
        component_pkg = tmp_path / "WeisileLink-component.pkg"

        subprocess.run(
            [
                "pkgbuild",
                "--component",
                str(app),
                "--install-location",
                "/Applications",
                "--scripts",
                str(scripts),
                "--identifier",
                PACKAGE_IDENTIFIER,
                "--version",
                version,
                "--sign",
                sign_identity,
                str(component_pkg),
            ],
            check=True,
        )
        subprocess.run(
            [
                "productbuild",
                "--package",
                str(component_pkg),
                "--sign",
                sign_identity,
                str(final_pkg),
            ],
            check=True,
        )

    manifest["installer_pkg"] = final_pkg.name
    manifest["installer_sha256"] = _sha256(final_pkg)
    manifest["installer_signed"] = True
    manifest["installer_tool"] = "productbuild"
    manifest["installer_identifier"] = PACKAGE_IDENTIFIER
    manifest["release_note"] = (
        "macOS app and installer package are signed; app is notarized; "
        "classroom readiness still requires clean-machine install smoke evidence."
    )
    _write_manifest(manifest_path, manifest)
    return {"manifest": str(manifest_path), "pkg": str(final_pkg)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build a signed WeisileLink macOS installer pkg."
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        required=True,
        help="Path to a signed and notarized macOS release manifest.",
    )
    parser.add_argument(
        "--sign-identity",
        required=True,
        help="Developer ID Installer signing identity for productbuild/pkgbuild.",
    )
    parser.add_argument(
        "--package-name",
        help="Optional installer pkg filename. Defaults to WeisileLink-macos-<version>.pkg.",
    )
    args = parser.parse_args(argv)

    try:
        result = build_pkg(
            args.manifest.expanduser().resolve(),
            args.sign_identity,
            args.package_name,
        )
    except subprocess.CalledProcessError as exc:
        print(f"pkg command failed: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

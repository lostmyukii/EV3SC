import json
from pathlib import Path
import stat
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "desktop/scripts/build_macos_pkg.py"


def _fake_executable(path: Path) -> Path:
    path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


def _make_notarized_release(tmp_path):
    output = tmp_path / "release"
    app = output / "WeisileLink.app"
    macos = app / "Contents/MacOS"
    resources = app / "Contents/Resources"
    macos.mkdir(parents=True)
    resources.mkdir(parents=True)
    _fake_executable(macos / "WeisileLink")
    _fake_executable(resources / "install.sh")
    (resources / "weisile-link.launchd.plist").write_text(
        "<plist></plist>",
        encoding="utf-8",
    )
    manifest = output / "WeisileLink-macos-0.1.0-manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "target": "macos",
                "version": "0.1.0",
                "artifact_zip": "WeisileLink-macos-0.1.0-signed.zip",
                "artifact_sha256": "a" * 64,
                "app_bundle": app.name,
                "signed": True,
                "notarized": True,
                "classroom_ready": False,
                "contains_self_contained_executable": True,
                "contains_macos_native_bluetooth_adapter": True,
                "requires_clean_machine_evidence": True,
            }
        ),
        encoding="utf-8",
    )
    return manifest, app


def _fake_pkg_tool(tmp_path, name):
    log = tmp_path / f"{name}.log"
    script = tmp_path / name
    script.write_text(
        "\n".join(
            [
                "#!/usr/bin/env python3",
                "import os, pathlib, sys",
                f"log = pathlib.Path(os.environ['{name.upper()}_LOG'])",
                "log.open('a').write(' '.join(sys.argv[1:]) + '\\n')",
                "pathlib.Path(sys.argv[-1]).write_text('pkg', encoding='utf-8')",
                "",
            ]
        ),
        encoding="utf-8",
    )
    script.chmod(script.stat().st_mode | stat.S_IXUSR)
    return script, log


def test_build_macos_pkg_updates_manifest_after_pkg_tools_succeed(tmp_path):
    manifest, app = _make_notarized_release(tmp_path)
    pkgbuild, pkgbuild_log = _fake_pkg_tool(tmp_path, "pkgbuild")
    productbuild, productbuild_log = _fake_pkg_tool(tmp_path, "productbuild")
    env = {
        "PATH": f"{tmp_path}:{Path('/usr/bin')}",
        "PKGBUILD_LOG": str(pkgbuild_log),
        "PRODUCTBUILD_LOG": str(productbuild_log),
    }
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--manifest",
            str(manifest),
            "--sign-identity",
            "Developer ID Installer: VSLE",
        ],
        cwd=ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert pkgbuild.is_file()
    assert productbuild.is_file()
    assert result.returncode == 0, result.stderr + result.stdout
    assert f"--component {app}" in pkgbuild_log.read_text(encoding="utf-8")
    assert "--scripts" in pkgbuild_log.read_text(encoding="utf-8")
    assert "--package" in productbuild_log.read_text(encoding="utf-8")
    assert "--sign Developer ID Installer: VSLE" in (
        productbuild_log.read_text(encoding="utf-8")
    )

    payload = json.loads(manifest.read_text(encoding="utf-8"))
    assert payload["installer_signed"] is True
    assert payload["installer_tool"] == "productbuild"
    assert payload["installer_pkg"] == "WeisileLink-macos-0.1.0.pkg"
    assert payload["installer_sha256"] != ""
    assert (manifest.parent / payload["installer_pkg"]).is_file()


def test_build_macos_pkg_refuses_unnotarized_manifest(tmp_path):
    manifest, _ = _make_notarized_release(tmp_path)
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    payload["notarized"] = False
    manifest.write_text(json.dumps(payload), encoding="utf-8")
    pkgbuild, pkgbuild_log = _fake_pkg_tool(tmp_path, "pkgbuild")
    productbuild, productbuild_log = _fake_pkg_tool(tmp_path, "productbuild")
    env = {
        "PATH": f"{tmp_path}:{Path('/usr/bin')}",
        "PKGBUILD_LOG": str(pkgbuild_log),
        "PRODUCTBUILD_LOG": str(productbuild_log),
    }
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--manifest",
            str(manifest),
            "--sign-identity",
            "Developer ID Installer: VSLE",
        ],
        cwd=ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert pkgbuild.is_file()
    assert productbuild.is_file()
    assert result.returncode == 2
    assert "manifest must be notarized before building installer pkg" in (result.stderr)
    assert not pkgbuild_log.exists()
    assert not productbuild_log.exists()

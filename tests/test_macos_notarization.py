import json
from pathlib import Path
import stat
import subprocess
import sys
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "desktop/scripts/notarize_macos_release.py"


def _make_signed_release(tmp_path):
    output = tmp_path / "release"
    app = output / "WeisileLink.app"
    contents = app / "Contents"
    macos = contents / "MacOS"
    macos.mkdir(parents=True)
    executable = macos / "WeisileLink"
    executable.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    executable.chmod(executable.stat().st_mode | stat.S_IXUSR)
    (contents / "Info.plist").write_text("plist", encoding="utf-8")
    zip_path = output / "WeisileLink-macos-0.1.0-signed.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.write(executable, "WeisileLink.app/Contents/MacOS/WeisileLink")
    manifest = output / "WeisileLink-macos-0.1.0-manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "target": "macos",
                "version": "0.1.0",
                "artifact_zip": zip_path.name,
                "artifact_sha256": "0" * 64,
                "app_bundle": app.name,
                "signed": True,
                "notarized": False,
                "classroom_ready": False,
                "contains_self_contained_executable": True,
                "contains_macos_native_bluetooth_adapter": True,
                "requires_clean_machine_evidence": True,
            }
        ),
        encoding="utf-8",
    )
    return manifest, app, zip_path


def _fake_xcrun(tmp_path, exit_code=0):
    log = tmp_path / "xcrun.log"
    fake = tmp_path / "xcrun"
    fake.write_text(
        "\n".join(
            [
                "#!/usr/bin/env python3",
                "import os, pathlib, sys",
                "pathlib.Path(os.environ['XCRUN_LOG']).open('a').write(",
                "    ' '.join(sys.argv[1:]) + '\\n'",
                ")",
                f"sys.exit({exit_code})",
                "",
            ]
        ),
        encoding="utf-8",
    )
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    return fake, log


def test_notarization_updates_manifest_only_after_tool_validation(tmp_path):
    manifest, _, zip_path = _make_signed_release(tmp_path)
    fake_xcrun, log = _fake_xcrun(tmp_path)
    env = {
        **dict(PATH=f"{tmp_path}:{Path('/usr/bin')}", XCRUN_LOG=str(log)),
    }
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--manifest",
            str(manifest),
            "--keychain-profile",
            "VSLE_NOTARY",
        ],
        cwd=ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert fake_xcrun.is_file()
    assert result.returncode == 0, result.stderr + result.stdout
    commands = log.read_text(encoding="utf-8")
    assert f"notarytool submit {zip_path}" in commands
    assert "stapler staple" in commands
    assert "stapler validate" in commands

    payload = json.loads(manifest.read_text(encoding="utf-8"))
    assert payload["notarized"] is True
    assert payload["notarization_tool"] == "xcrun notarytool"
    assert payload["artifact_sha256"] != "0" * 64
    assert zip_path.is_file()


def test_notarization_refuses_unsigned_manifest(tmp_path):
    manifest, _, _ = _make_signed_release(tmp_path)
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    payload["signed"] = False
    manifest.write_text(json.dumps(payload), encoding="utf-8")
    fake_xcrun, log = _fake_xcrun(tmp_path)
    env = {
        **dict(PATH=f"{tmp_path}:{Path('/usr/bin')}", XCRUN_LOG=str(log)),
    }
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--manifest",
            str(manifest),
            "--keychain-profile",
            "VSLE_NOTARY",
        ],
        cwd=ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert fake_xcrun.is_file()
    assert result.returncode == 2
    assert "manifest must be signed before notarization" in result.stderr
    assert not log.exists()

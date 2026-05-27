import json
import os
from pathlib import Path
import plistlib
import stat
import subprocess
import sys
import zipfile


ROOT = Path(__file__).resolve().parents[1]
PACKAGER = ROOT / "desktop/scripts/build_release_artifacts.py"


def _fake_executable(path: Path, text: str = "#!/bin/sh\nexit 0\n") -> Path:
    path.write_text(text, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


def test_macos_packager_refuses_unsigned_by_default(tmp_path):
    executable = _fake_executable(tmp_path / "WeisileLink")
    result = subprocess.run(
        [
            sys.executable,
            str(PACKAGER),
            "macos",
            "--executable",
            str(executable),
            "--output",
            str(tmp_path / "release"),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 2
    assert "--allow-unsigned" in result.stderr


def test_macos_packager_requires_native_bluetooth_adapter(tmp_path):
    executable = _fake_executable(tmp_path / "WeisileLink")
    result = subprocess.run(
        [
            sys.executable,
            str(PACKAGER),
            "macos",
            "--executable",
            str(executable),
            "--output",
            str(tmp_path / "release"),
            "--allow-unsigned",
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 2
    assert "--native-adapter" in result.stderr


def test_macos_packager_creates_app_bundle_zip_and_metadata(tmp_path):
    executable = _fake_executable(tmp_path / "WeisileLink")
    native_adapter = _fake_executable(tmp_path / "WeisileEV3BluetoothAdapter")
    output = tmp_path / "release"
    result = subprocess.run(
        [
            sys.executable,
            str(PACKAGER),
            "macos",
            "--executable",
            str(executable),
            "--native-adapter",
            str(native_adapter),
            "--output",
            str(output),
            "--version",
            "0.1.0-test",
            "--allow-unsigned",
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr + result.stdout
    app = output / "WeisileLink.app"
    assert (app / "Contents/MacOS/WeisileLink").is_file()
    assert os.access(app / "Contents/MacOS/WeisileLink", os.X_OK)
    adapter = app / "Contents/Resources/native/WeisileEV3BluetoothAdapter"
    assert adapter.is_file()
    assert os.access(adapter, os.X_OK)
    assert (app / "Contents/Resources/install.sh").is_file()
    assert (app / "Contents/Resources/weisile-link.launchd.plist").is_file()

    info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    assert info["CFBundleName"] == "WeisileLink"
    assert info["CFBundleShortVersionString"] == "0.1.0-test"

    zip_path = output / "WeisileLink-macos-0.1.0-test-unsigned.zip"
    assert zip_path.is_file()
    with zipfile.ZipFile(zip_path) as archive:
        names = set(archive.namelist())
    assert "WeisileLink.app/Contents/MacOS/WeisileLink" in names
    assert (
        "WeisileLink.app/Contents/Resources/native/" "WeisileEV3BluetoothAdapter"
    ) in names
    assert "WeisileLink.app/Contents/Resources/install.sh" in names

    metadata = json.loads(
        (output / "WeisileLink-macos-0.1.0-test-manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert metadata["target"] == "macos"
    assert metadata["signed"] is False
    assert metadata["classroom_ready"] is False
    assert metadata["contains_self_contained_executable"] is True
    assert metadata["contains_macos_native_bluetooth_adapter"] is True
    assert metadata["official_firmware_bt_classroom_ready"] is False


def test_windows_packager_creates_zip_and_metadata(tmp_path):
    executable = _fake_executable(
        tmp_path / "WeisileLink.exe",
        text="@echo off\r\nexit /b 0\r\n",
    )
    output = tmp_path / "release"
    result = subprocess.run(
        [
            sys.executable,
            str(PACKAGER),
            "windows",
            "--executable",
            str(executable),
            "--output",
            str(output),
            "--version",
            "0.1.0-test",
            "--allow-unsigned",
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr + result.stdout
    zip_path = output / "WeisileLink-windows-0.1.0-test-unsigned.zip"
    assert zip_path.is_file()
    with zipfile.ZipFile(zip_path) as archive:
        names = set(archive.namelist())
    assert "WeisileLink/WeisileLink.exe" in names
    assert "WeisileLink/install.ps1" in names
    assert "WeisileLink/weisile-link-service.xml" in names

    metadata = json.loads(
        (output / "WeisileLink-windows-0.1.0-test-manifest.json").read_text(
            encoding="utf-8"
        )
    )
    assert metadata["target"] == "windows"
    assert metadata["signed"] is False
    assert metadata["classroom_ready"] is False
    assert metadata["build_host_can_run_target"] is False


def test_desktop_docs_reference_release_artifact_packager():
    for path in (
        ROOT / "desktop/README.md",
        ROOT / "docs/desktop/WEISILELINK_DESKTOP.md",
        ROOT / "docs/desktop/MACOS_INSTALL.md",
        ROOT / "docs/desktop/WINDOWS_INSTALL.md",
    ):
        text = path.read_text(encoding="utf-8")
        assert "build_release_artifacts.py" in text
        assert "desktop/release/" in text

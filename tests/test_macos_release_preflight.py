import argparse
import importlib.util
import json
from pathlib import Path
import stat
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "desktop/scripts/check_macos_release_preflight.py"


def _load_preflight_module():
    spec = importlib.util.spec_from_file_location("macos_release_preflight", SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _fake_executable(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


def _fake_native_adapter_app(app: Path) -> Path:
    macos = app / "Contents/MacOS"
    macos.mkdir(parents=True)
    executable = _fake_executable(macos / "WeisileEV3BluetoothAdapter")
    (app / "Contents/Info.plist").write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>WeisileEV3BluetoothAdapter</string>
  <key>NSBluetoothAlwaysUsageDescription</key>
  <string>Bluetooth is used to connect to EV3 bricks.</string>
</dict>
</plist>
""",
        encoding="utf-8",
    )
    return executable


def _fake_tool(tmp_path: Path, name: str, body: str = "") -> Path:
    tool = tmp_path / name
    tool.write_text(
        "\n".join(
            [
                "#!/usr/bin/env python3",
                "import pathlib, sys",
                body,
                "sys.exit(0)",
                "",
            ]
        ),
        encoding="utf-8",
    )
    tool.chmod(tool.stat().st_mode | stat.S_IXUSR)
    return tool


def test_macos_release_preflight_reports_missing_inputs(tmp_path):
    json_report = tmp_path / "preflight.json"
    md_report = tmp_path / "preflight.md"
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--json-report",
            str(json_report),
            "--report",
            str(md_report),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    payload = json.loads(json_report.read_text(encoding="utf-8"))
    assert payload["ready"] is False
    assert "app_sign_identity" in payload["missing_inputs"]
    assert "notary_keychain_profile" in payload["missing_inputs"]
    markdown = md_report.read_text(encoding="utf-8")
    assert "Ready: no" in markdown


def test_macos_release_preflight_autodetects_default_build_outputs(tmp_path):
    executable = _fake_executable(tmp_path / "desktop/build/macos/WeisileLink")
    native_adapter = _fake_native_adapter_app(
        tmp_path / "desktop/build/macos/native/WeisileEV3BluetoothAdapter.app"
    )
    module = _load_preflight_module()
    module.DEFAULT_EXECUTABLE = executable
    module.DEFAULT_NATIVE_ADAPTER = native_adapter
    module._tool_path = lambda name: f"/fake/{name}"

    args = argparse.Namespace(
        executable=None,
        native_adapter=None,
        app_sign_identity=None,
        installer_sign_identity=None,
        notary_keychain_profile=None,
    )

    payload = module.build_payload(
        args,
        lambda *_, **__: subprocess.CompletedProcess(
            args=["security"], returncode=0, stdout="", stderr=""
        ),
    )

    assert "executable_path" not in payload["missing_inputs"]
    assert "native_adapter_path" not in payload["missing_inputs"]
    checks = {check["name"]: check for check in payload["checks"]}
    assert checks["executable_path"]["ok"] is True
    assert checks["executable_path"]["detail"] == str(executable)
    assert checks["native_adapter_path"]["ok"] is True
    assert checks["native_adapter_path"]["detail"] == str(native_adapter)


def test_macos_release_preflight_autodetects_unique_developer_id_identities(
    tmp_path,
):
    executable = _fake_executable(tmp_path / "desktop/build/macos/WeisileLink")
    native_adapter = _fake_native_adapter_app(
        tmp_path / "desktop/build/macos/native/WeisileEV3BluetoothAdapter.app"
    )
    module = _load_preflight_module()
    module.DEFAULT_EXECUTABLE = executable
    module.DEFAULT_NATIVE_ADAPTER = native_adapter
    module._tool_path = lambda name: f"/fake/{name}"

    args = argparse.Namespace(
        executable=None,
        native_adapter=None,
        app_sign_identity=None,
        installer_sign_identity=None,
        notary_keychain_profile=None,
    )

    identities = "\n".join(
        [
            '  1) ABCD "Developer ID Application: WeisileEDU (TEAMID)"',
            '  2) EFGH "Developer ID Installer: WeisileEDU (TEAMID)"',
        ]
    )
    payload = module.build_payload(
        args,
        lambda *_, **__: subprocess.CompletedProcess(
            args=["security"], returncode=0, stdout=identities, stderr=""
        ),
    )

    assert "app_sign_identity" not in payload["missing_inputs"]
    assert "installer_sign_identity" not in payload["missing_inputs"]
    checks = {check["name"]: check for check in payload["checks"]}
    assert checks["app_sign_identity"]["ok"] is True
    assert checks["app_sign_identity"]["detail"] == (
        "Developer ID Application: WeisileEDU (TEAMID)"
    )
    assert checks["installer_sign_identity"]["ok"] is True
    assert checks["installer_sign_identity"]["detail"] == (
        "Developer ID Installer: WeisileEDU (TEAMID)"
    )
    commands = "\n".join(payload["release_commands"])
    assert '--sign-identity "Developer ID Application: WeisileEDU (TEAMID)"' in commands
    assert '--sign-identity "Developer ID Installer: WeisileEDU (TEAMID)"' in commands


def test_macos_release_preflight_passes_with_fake_tools_and_inputs(tmp_path):
    executable = _fake_executable(tmp_path / "WeisileLink")
    native_adapter = _fake_native_adapter_app(
        tmp_path / "WeisileEV3BluetoothAdapter.app"
    )
    tool_log = tmp_path / "tool.log"
    _fake_tool(
        tmp_path,
        "security",
        "\n".join(
            [
                "print('  1) ABCD \"Developer ID Application: VSLE (TEAMID)\"')",
                "print('  2) EFGH \"Developer ID Installer: VSLE (TEAMID)\"')",
            ]
        ),
    )
    for name in ("codesign", "pkgbuild", "productbuild"):
        _fake_tool(tmp_path, name)
    _fake_tool(
        tmp_path,
        "xcrun",
        (
            f"pathlib.Path({str(tool_log)!r}).write_text(' '.join(sys.argv[1:]), "
            "encoding='utf-8')"
        ),
    )
    json_report = tmp_path / "preflight.json"
    md_report = tmp_path / "preflight.md"
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--executable",
            str(executable),
            "--native-adapter",
            str(native_adapter),
            "--app-sign-identity",
            "Developer ID Application: VSLE",
            "--installer-sign-identity",
            "Developer ID Installer: VSLE",
            "--notary-keychain-profile",
            "VSLE_NOTARY",
            "--json-report",
            str(json_report),
            "--report",
            str(md_report),
        ],
        cwd=ROOT,
        env={"PATH": f"{tmp_path}:{Path('/usr/bin')}"},
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr + result.stdout
    payload = json.loads(json_report.read_text(encoding="utf-8"))
    assert payload["ready"] is True
    assert payload["missing_inputs"] == []
    assert all(check["ok"] for check in payload["checks"])
    assert "notarytool history --keychain-profile VSLE_NOTARY" in (
        tool_log.read_text(encoding="utf-8")
    )
    markdown = md_report.read_text(encoding="utf-8")
    assert "Ready: yes" in markdown
    assert "build_release_artifacts.py macos" in markdown
    assert "notarize_macos_release.py" in markdown
    assert "build_macos_pkg.py" in markdown

import argparse
import importlib.util
import json
from pathlib import Path
import stat
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "desktop/scripts/run_internal_release_flow.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("internal_release_flow", SCRIPT)
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


def _fake_native_adapter(path: Path) -> Path:
    executable = path / "Contents/MacOS/WeisileEV3BluetoothAdapter"
    executable.parent.mkdir(parents=True, exist_ok=True)
    executable.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    executable.chmod(executable.stat().st_mode | stat.S_IXUSR)
    info = path / "Contents/Info.plist"
    info.write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSBluetoothAlwaysUsageDescription</key>
  <string>Bluetooth is used to connect to EV3 bricks.</string>
</dict>
</plist>
""",
        encoding="utf-8",
    )
    return executable


def _args(tmp_path: Path, target: str) -> argparse.Namespace:
    return argparse.Namespace(
        target=target,
        executable=None,
        native_adapter=None,
        output=tmp_path / "release/internal",
        version="0.1.0-internal",
        json_report=tmp_path / "internal-release.json",
        report=tmp_path / "internal-release.md",
        clean=False,
    )


def test_macos_internal_release_uses_unsigned_packager_without_signing(
    tmp_path,
    monkeypatch,
):
    module = _load_module()
    executable = _fake_executable(tmp_path / "build/macos/WeisileLink")
    native_adapter = _fake_native_adapter(
        tmp_path / "native/WeisileEV3BluetoothAdapter.app"
    )
    calls = []

    monkeypatch.setattr(module.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(module, "DEFAULT_MACOS_EXECUTABLE", executable)
    monkeypatch.setattr(module, "DEFAULT_MACOS_NATIVE_ADAPTER", native_adapter)

    def runner(command, **_kwargs):
        calls.append(command)
        return subprocess.CompletedProcess(args=command, returncode=0)

    assert module.run_internal_release_flow(_args(tmp_path, "macos"), runner) == 0

    packager_calls = [
        call for call in calls if "build_release_artifacts.py" in call[1]
    ]
    assert len(packager_calls) == 1
    command = packager_calls[0]
    assert "--allow-unsigned" in command
    assert "--sign-identity" not in command
    assert "notarize_macos_release.py" not in json.dumps(calls)
    assert "build_macos_pkg.py" not in json.dumps(calls)

    payload = json.loads((_args(tmp_path, "macos").json_report).read_text())
    assert payload["internal_test_release"]["ready"] is True
    assert payload["internal_test_release"]["signed"] is False
    assert payload["internal_test_release"]["notarized"] is False
    assert "macos_developer_id" in payload["production_release"]["blockers"]
    assert "macos_notarization" in payload["production_release"]["blockers"]


def test_macos_internal_release_clean_rebuilds_existing_executable(
    tmp_path,
    monkeypatch,
):
    module = _load_module()
    executable = _fake_executable(tmp_path / "build/macos/WeisileLink")
    native_adapter = _fake_native_adapter(
        tmp_path / "native/WeisileEV3BluetoothAdapter.app"
    )
    args = _args(tmp_path, "macos")
    args.clean = True
    calls = []

    monkeypatch.setattr(module.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(module, "DEFAULT_MACOS_EXECUTABLE", executable)
    monkeypatch.setattr(module, "DEFAULT_MACOS_NATIVE_ADAPTER", native_adapter)

    def runner(command, **_kwargs):
        calls.append(command)
        return subprocess.CompletedProcess(args=command, returncode=0)

    assert module.run_internal_release_flow(args, runner) == 0

    command_names = [Path(call[1]).name for call in calls]
    assert command_names[0] == "build_weisilelink_executable.py"
    assert command_names[-2] == "build_release_artifacts.py"
    assert Path(calls[-1][0]).name == "WeisileLink"


def test_macos_internal_release_report_records_required_checks(
    tmp_path,
    monkeypatch,
):
    module = _load_module()
    executable = _fake_executable(tmp_path / "build/macos/WeisileLink")
    native_adapter = _fake_native_adapter(
        tmp_path / "native/WeisileEV3BluetoothAdapter.app"
    )

    monkeypatch.setattr(module.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(module, "DEFAULT_MACOS_EXECUTABLE", executable)
    monkeypatch.setattr(module, "DEFAULT_MACOS_NATIVE_ADAPTER", native_adapter)

    def runner(command, **_kwargs):
        if str(command[0]).endswith("WeisileLink"):
            return subprocess.CompletedProcess(
                args=command,
                returncode=3,
                stdout=json.dumps({"state": "needs_pairing"}),
            )
        return subprocess.CompletedProcess(args=command, returncode=0)

    assert module.run_internal_release_flow(_args(tmp_path, "macos"), runner) == 0

    payload = json.loads((_args(tmp_path, "macos").json_report).read_text())
    internal = payload["internal_test_release"]
    assert internal["known_security_prompts"]
    assert internal["startup_verification_commands"]
    assert internal["core_verification_commands"]
    assert internal["startup_verification_result"]["state"] == "needs_pairing"
    assert internal["startup_verification_result"]["acceptable"] is True

    report = (_args(tmp_path, "macos").report.read_text(encoding="utf-8"))
    assert "## Internal Test Required Checks" in report
    assert "macOS dev/unsigned build can generate: pass" in report
    assert "Application startup: verify with" in report
    assert "Observed startup state: `needs_pairing`" in report
    assert "Core function verification: verify with" in report
    assert "Known Security Prompts" in report


def test_windows_internal_release_on_macos_requires_windows_host_not_signing(
    tmp_path,
    monkeypatch,
):
    module = _load_module()
    monkeypatch.setattr(module.platform, "system", lambda: "Darwin")

    assert module.run_internal_release_flow(_args(tmp_path, "windows")) == 2

    payload = json.loads((_args(tmp_path, "windows").json_report).read_text())
    internal = payload["internal_test_release"]
    assert internal["ready"] is False
    assert internal["status"] == "requires-windows-host"
    assert internal["blocking_items"] == ["windows_host_or_actions"]
    assert "windows_sign_identity" not in internal["blocking_items"]
    assert "timestamp_url" not in internal["blocking_items"]
    assert (
        "Windows unsigned internal build requires real Windows host "
        "or GitHub Actions windows-latest"
    ) in internal["notes"]


def test_docs_describe_internal_and_production_release_split():
    required = [
        "Internal Test Release",
        "Production Release",
        "Internal Test Optional",
        "Production Release Blocker",
        "run_internal_release_flow.py --target macos",
        "run_internal_release_flow.py --target windows",
        "run_internal_release_flow.py --target all",
        "npm run build:mac:internal",
        "npm run build:win:internal",
        "npm run release:internal",
    ]
    docs = [
        ROOT / "desktop/README.md",
        ROOT / "docs/desktop/WEISILELINK_DESKTOP.md",
        ROOT / "docs/desktop/MACOS_INSTALL.md",
        ROOT / "docs/desktop/WINDOWS_INSTALL.md",
    ]

    for path in docs:
        text = path.read_text(encoding="utf-8")
        for item in required:
            assert item in text, f"{path} must mention {item}"


def test_root_package_exposes_internal_release_scripts():
    package_json = ROOT / "package.json"

    payload = json.loads(package_json.read_text(encoding="utf-8"))
    scripts = payload["scripts"]

    assert scripts["build:mac:internal"] == "node scripts/run_internal_release_flow.js macos"
    assert scripts["build:win:internal"] == "node scripts/run_internal_release_flow.js windows"
    assert scripts["release:internal"] == "node scripts/run_internal_release_flow.js all"

    shim = ROOT / "scripts/run_internal_release_flow.js"
    text = shim.read_text(encoding="utf-8")
    assert "process.env.PYTHON" in text
    assert ".venv" in text
    assert "Scripts" in text
    assert "bin" in text
    assert '"desktop", "scripts", "run_internal_release_flow.py"' in text


def test_github_actions_windows_internal_release_workflow():
    workflow = ROOT / ".github/workflows/windows-internal-release.yml"

    text = workflow.read_text(encoding="utf-8")

    assert "runs-on: windows-latest" in text
    assert "npm run build:win:internal" in text
    assert "actions/upload-artifact" in text
    assert "docs/desktop/evidence/internal-release" in text
    assert "desktop/release/internal/windows" in text
    assert "python -m venv .venv" in text
    assert "pyinstaller" in text.lower()

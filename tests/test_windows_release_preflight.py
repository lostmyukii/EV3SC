import argparse
import importlib.util
import json
from pathlib import Path
import stat
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "desktop/scripts/check_windows_release_preflight.py"


def _load_preflight_module():
    spec = importlib.util.spec_from_file_location("windows_release_preflight", SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _fake_executable(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("@echo off\r\nexit /b 0\r\n", encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


def test_windows_release_preflight_reports_missing_inputs(tmp_path):
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
    assert payload["target"] == "windows"
    assert payload["ready"] is False
    assert "executable_path" in payload["missing_inputs"]
    assert "windows_sign_identity" in payload["missing_inputs"]
    assert "timestamp_url" in payload["missing_inputs"]
    checks = {check["name"]: check for check in payload["checks"]}
    assert checks["windows_signing_implementation"]["ok"] is False
    markdown = md_report.read_text(encoding="utf-8")
    assert "Ready: no" in markdown
    assert "build_release_artifacts.py windows" in markdown


def test_windows_release_preflight_uses_environment_signing_inputs(
    tmp_path,
    monkeypatch,
):
    executable = _fake_executable(tmp_path / "desktop/build/windows/WeisileLink.exe")
    module = _load_preflight_module()
    module.DEFAULT_EXECUTABLE = executable
    module._tool_path = lambda name: f"/fake/{name}"
    module._host_is_windows = lambda: True
    monkeypatch.setenv("WEISILE_WINDOWS_SIGN_IDENTITY", "VSLE Windows Code Signing")
    monkeypatch.setenv("WEISILE_WINDOWS_TIMESTAMP_URL", "http://timestamp.example")

    args = argparse.Namespace(
        executable=None,
        sign_identity=None,
        timestamp_url=None,
    )

    payload = module.build_payload(args)

    assert "executable_path" not in payload["missing_inputs"]
    assert "windows_sign_identity" not in payload["missing_inputs"]
    assert "timestamp_url" not in payload["missing_inputs"]
    checks = {check["name"]: check for check in payload["checks"]}
    assert checks["executable_path"]["ok"] is True
    assert checks["executable_path"]["detail"] == str(executable)
    assert checks["windows_sign_identity"]["ok"] is True
    assert checks["windows_sign_identity"]["detail"] == "VSLE Windows Code Signing"
    assert checks["timestamp_url"]["ok"] is True
    assert checks["timestamp_url"]["detail"] == "http://timestamp.example"
    assert payload["ready"] is False
    assert checks["windows_signing_implementation"]["ok"] is False
    commands = "\n".join(payload["release_commands"])
    assert '--sign-identity "VSLE Windows Code Signing"' in commands
    assert "--timestamp-url http://timestamp.example" in commands

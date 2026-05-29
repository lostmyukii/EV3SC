import argparse
import importlib.util
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "desktop/scripts/run_windows_release_flow.py"


def _load_release_flow_module():
    spec = importlib.util.spec_from_file_location("windows_release_flow", SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _args(tmp_path: Path) -> argparse.Namespace:
    return argparse.Namespace(
        executable=None,
        sign_identity=None,
        timestamp_url=None,
        preflight_json_report=tmp_path / "preflight.json",
        preflight_report=tmp_path / "preflight.md",
        json_report=tmp_path / "release-flow.json",
        report=tmp_path / "release-flow.md",
        output=tmp_path / "release",
        version="0.1.0",
    )


def _ready_preflight_payload(tmp_path: Path) -> dict[str, object]:
    executable = tmp_path / "WeisileLink.exe"
    return {
        "ready": True,
        "checks": [
            {"name": "executable_path", "ok": True, "detail": str(executable)},
            {
                "name": "windows_sign_identity",
                "ok": True,
                "detail": "VSLE Windows Code Signing",
            },
            {
                "name": "timestamp_url",
                "ok": True,
                "detail": "http://timestamp.example",
            },
        ],
    }


def test_windows_release_flow_stops_when_preflight_is_not_ready(tmp_path):
    module = _load_release_flow_module()
    calls = []

    def runner(command, **_kwargs):
        calls.append(command)
        _args(tmp_path).preflight_json_report.write_text(
            json.dumps({"ready": False, "checks": []}),
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(args=command, returncode=1)

    assert module.run_release_flow(_args(tmp_path), runner) == 2
    assert len(calls) == 1
    assert str(module.PREFLIGHT_SCRIPT) in calls[0]
    payload = json.loads((tmp_path / "release-flow.json").read_text(encoding="utf-8"))
    assert payload["status"] == "blocked-preflight"
    assert payload["preflight_ready"] is False
    assert payload["commands_executed"] == []
    markdown = (tmp_path / "release-flow.md").read_text(encoding="utf-8")
    assert "Status: blocked-preflight" in markdown
    assert "Commands executed: 0" in markdown


def test_windows_release_flow_runs_signed_packager_after_preflight(tmp_path):
    module = _load_release_flow_module()
    calls = []
    args = _args(tmp_path)

    def runner(command, **_kwargs):
        calls.append(command)
        if str(module.PREFLIGHT_SCRIPT) in command:
            args.preflight_json_report.write_text(
                json.dumps(_ready_preflight_payload(tmp_path)),
                encoding="utf-8",
            )
        return subprocess.CompletedProcess(args=command, returncode=0)

    assert module.run_release_flow(args, runner) == 0

    manifest = args.output / "WeisileLink-windows-0.1.0-manifest.json"
    assert calls[1] == [
        module.PYTHON,
        str(module.PACKAGER_SCRIPT),
        "windows",
        "--executable",
        str(tmp_path / "WeisileLink.exe"),
        "--output",
        str(args.output),
        "--version",
        "0.1.0",
        "--sign-identity",
        "VSLE Windows Code Signing",
        "--timestamp-url",
        "http://timestamp.example",
    ]
    payload = json.loads(args.json_report.read_text(encoding="utf-8"))
    assert payload["status"] == "release-flow-complete"
    assert payload["preflight_ready"] is True
    assert payload["manifest"] == str(manifest)
    assert payload["commands_executed"] == ["build_release_artifacts.py"]

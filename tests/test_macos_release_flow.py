import argparse
import importlib.util
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "desktop/scripts/run_macos_release_flow.py"


def _load_release_flow_module():
    spec = importlib.util.spec_from_file_location("macos_release_flow", SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _args(tmp_path: Path) -> argparse.Namespace:
    return argparse.Namespace(
        executable=None,
        native_adapter=None,
        app_sign_identity=None,
        installer_sign_identity=None,
        notary_keychain_profile=None,
        preflight_json_report=tmp_path / "preflight.json",
        preflight_report=tmp_path / "preflight.md",
        output=tmp_path / "release",
        version="0.1.0",
    )


def _ready_preflight_payload(tmp_path: Path) -> dict[str, object]:
    executable = tmp_path / "WeisileLink"
    native_adapter = (
        tmp_path
        / "WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter"
    )
    return {
        "ready": True,
        "checks": [
            {"name": "executable_path", "ok": True, "detail": str(executable)},
            {"name": "native_adapter_path", "ok": True, "detail": str(native_adapter)},
            {
                "name": "app_sign_identity",
                "ok": True,
                "detail": "Developer ID Application: VSLE",
            },
            {
                "name": "installer_sign_identity",
                "ok": True,
                "detail": "Developer ID Installer: VSLE",
            },
            {
                "name": "notary_keychain_profile",
                "ok": True,
                "detail": "VSLE_NOTARY",
            },
        ],
    }


def test_macos_release_flow_stops_when_preflight_is_not_ready(tmp_path):
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


def test_macos_release_flow_runs_signed_chain_after_preflight(tmp_path):
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

    manifest = args.output / "WeisileLink-macos-0.1.0-manifest.json"
    assert [str(module.PREFLIGHT_SCRIPT)] == [command[1] for command in calls[:1]]
    assert calls[1] == [
        module.PYTHON,
        str(module.PACKAGER_SCRIPT),
        "macos",
        "--executable",
        str(tmp_path / "WeisileLink"),
        "--native-adapter",
        str(
            tmp_path
            / "WeisileEV3BluetoothAdapter.app/Contents/MacOS/WeisileEV3BluetoothAdapter"
        ),
        "--output",
        str(args.output),
        "--version",
        "0.1.0",
        "--sign-identity",
        "Developer ID Application: VSLE",
    ]
    assert calls[2] == [
        module.PYTHON,
        str(module.NOTARIZE_SCRIPT),
        "--manifest",
        str(manifest),
        "--keychain-profile",
        "VSLE_NOTARY",
    ]
    assert calls[3] == [
        module.PYTHON,
        str(module.PKG_SCRIPT),
        "--manifest",
        str(manifest),
        "--sign-identity",
        "Developer ID Installer: VSLE",
    ]

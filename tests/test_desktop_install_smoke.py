import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "scripts/run_desktop_install_smoke.py"


def _run_smoke(tmp_path, evidence, mode=None):
    evidence_path = tmp_path / "evidence.json"
    report_path = tmp_path / "report.md"
    evidence_path.write_text(json.dumps(evidence), encoding="utf-8")
    command = [
        sys.executable,
        str(RUNNER),
        "--evidence",
        str(evidence_path),
        "--report",
        str(report_path),
    ]
    if mode is not None:
        command.extend(["--mode", mode])
    result = subprocess.run(
        command,
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if report_path.is_file():
        report = report_path.read_text(encoding="utf-8")
    else:
        report = result.stderr + result.stdout
    return result, report


def _release_manifest(
    tmp_path,
    *,
    target="macos",
    signed=True,
    notarized=True,
):
    manifest = tmp_path / f"{target}-manifest.json"
    payload = {
        "target": target,
        "artifact_zip": f"WeisileLink-{target}-0.1.0-signed.zip",
        "artifact_sha256": "a" * 64,
        "signed": signed,
        "contains_self_contained_executable": True,
        "requires_clean_machine_evidence": True,
    }
    if target == "macos":
        payload["notarized"] = notarized
        payload["contains_macos_native_bluetooth_adapter"] = True
        payload["installer_pkg"] = "WeisileLink-macos-0.1.0.pkg"
        payload["installer_sha256"] = "b" * 64
        payload["installer_signed"] = True
    manifest.write_text(json.dumps(payload), encoding="utf-8")
    return str(manifest)


def test_runner_refuses_missing_evidence_json(tmp_path):
    report_path = tmp_path / "missing-report.md"
    result = subprocess.run(
        [
            sys.executable,
            str(RUNNER),
            "--evidence",
            str(tmp_path / "missing.json"),
            "--report",
            str(report_path),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert report_path.is_file()
    assert "Classroom ready: no" in report_path.read_text(encoding="utf-8")
    assert "evidence file is missing" in result.stderr


def test_runner_refuses_localhost_only_developer_run(tmp_path):
    result, report = _run_smoke(
        tmp_path,
        {
            "developer_checkout_run": True,
            "installed_from_release_artifact": False,
            "started_after_reboot": True,
            "scratch_link_endpoint_ok": True,
            "official_firmware_bt_real_ev3_ok": True,
        },
    )

    assert result.returncode == 1
    assert "Classroom ready: no" in report
    assert "installed_from_release_artifact" in report
    assert "developer_checkout_run" in report
    assert "localhost-only developer runs cannot approve release support" in (report)


def test_runner_requires_official_firmware_real_ev3_evidence(tmp_path):
    result, report = _run_smoke(
        tmp_path,
        {
            "installed_from_release_artifact": True,
            "started_after_reboot": True,
            "scratch_link_endpoint_ok": True,
            "official_firmware_bt_real_ev3_ok": False,
        },
    )

    assert result.returncode == 1
    assert "Classroom ready: no" in report
    assert "official_firmware_bt_real_ev3_ok" in report


def test_runner_passes_with_release_reboot_endpoint_and_real_ev3(tmp_path):
    result, report = _run_smoke(
        tmp_path,
        {
            "release_artifact_manifest": _release_manifest(tmp_path),
            "installed_from_release_artifact": True,
            "started_after_reboot": True,
            "scratch_link_endpoint_ok": True,
            "official_firmware_bt_real_ev3_ok": True,
        },
    )

    assert result.returncode == 0, result.stderr + result.stdout
    assert "Classroom ready: yes" in report
    assert "installed_from_release_artifact: pass" in report
    assert "official_firmware_bt_real_ev3_ok: pass" in report


def test_runner_passes_vsle_bluetooth_release_artifact_evidence(tmp_path):
    result, report = _run_smoke(
        tmp_path,
        {
            "release_artifact_manifest": _release_manifest(tmp_path),
            "installed_from_release_artifact": True,
            "started_after_reboot": True,
            "scratch_link_endpoint_ok": True,
            "vsle_bluetooth_real_ev3_ok": True,
        },
        mode="vsle-bluetooth",
    )

    assert result.returncode == 0, result.stderr + result.stdout
    assert "Mode: `vsle-bluetooth`" in report
    assert "Classroom ready: yes" in report
    assert "vsle_bluetooth_real_ev3_ok: pass" in report
    assert "official_firmware_bt_real_ev3_ok" not in report


def test_runner_refuses_vsle_bluetooth_without_real_ev3_evidence(tmp_path):
    result, report = _run_smoke(
        tmp_path,
        {
            "release_artifact_manifest": _release_manifest(tmp_path),
            "installed_from_release_artifact": True,
            "started_after_reboot": True,
            "scratch_link_endpoint_ok": True,
            "vsle_bluetooth_real_ev3_ok": False,
        },
        mode="vsle-bluetooth",
    )

    assert result.returncode == 1
    assert "Classroom ready: no" in report
    assert "vsle_bluetooth_real_ev3_ok must be true" in report


def test_runner_refuses_release_artifact_without_manifest(tmp_path):
    result, report = _run_smoke(
        tmp_path,
        {
            "installed_from_release_artifact": True,
            "started_after_reboot": True,
            "scratch_link_endpoint_ok": True,
            "vsle_bluetooth_real_ev3_ok": True,
        },
        mode="vsle-bluetooth",
    )

    assert result.returncode == 1
    assert "Classroom ready: no" in report
    assert "release_artifact_manifest must point to a release manifest" in report


def test_runner_refuses_macos_vsle_bluetooth_unsigned_or_unnnotarized_manifest(
    tmp_path,
):
    result, report = _run_smoke(
        tmp_path,
        {
            "release_artifact_manifest": _release_manifest(
                tmp_path,
                signed=False,
                notarized=False,
            ),
            "installed_from_release_artifact": True,
            "started_after_reboot": True,
            "scratch_link_endpoint_ok": True,
            "vsle_bluetooth_real_ev3_ok": True,
        },
        mode="vsle-bluetooth",
    )

    assert result.returncode == 1
    assert "Classroom ready: no" in report
    assert "release manifest signed must be true" in report
    assert "release manifest notarized must be true for macOS" in report


def test_runner_refuses_macos_release_without_signed_installer_pkg(tmp_path):
    manifest = _release_manifest(tmp_path)
    payload = json.loads(Path(manifest).read_text(encoding="utf-8"))
    del payload["installer_pkg"]
    payload["installer_signed"] = False
    Path(manifest).write_text(json.dumps(payload), encoding="utf-8")
    result, report = _run_smoke(
        tmp_path,
        {
            "release_artifact_manifest": manifest,
            "installed_from_release_artifact": True,
            "started_after_reboot": True,
            "scratch_link_endpoint_ok": True,
            "vsle_bluetooth_real_ev3_ok": True,
        },
        mode="vsle-bluetooth",
    )

    assert result.returncode == 1
    assert "Classroom ready: no" in report
    assert "release manifest installer_pkg is required for macOS" in report
    assert "release manifest installer_signed must be true for macOS" in report


def test_native_adapter_readmes_keep_platform_boundaries():
    expected = (
        "This adapter is the only supported path for official LEGO firmware "
        "Bluetooth on this OS. Python stdlib RFCOMM is not supported here. "
        "Real EV3 smoke evidence is required before this adapter can be "
        "marked classroom ready."
    )
    for path in (
        ROOT / "desktop/macos/native/README.md",
        ROOT / "desktop/windows/native/README.md",
    ):
        text = path.read_text(encoding="utf-8")
        assert expected in " ".join(text.split())
        assert "pybluez" in text.lower()
        assert "real official-firmware EV3" in text


def test_desktop_docs_reference_install_smoke_gate():
    for path in (
        ROOT / "docs/desktop/MACOS_INSTALL.md",
        ROOT / "docs/desktop/WINDOWS_INSTALL.md",
        ROOT / "docs/desktop/OFFICIAL_EV3_BLUETOOTH_COMPATIBILITY.md",
    ):
        text = path.read_text(encoding="utf-8")
        assert "run_desktop_install_smoke.py" in text
        assert "installed_from_release_artifact" in text
        assert "release_artifact_manifest" in text
        assert "official_firmware_bt_real_ev3_ok" in text


def test_desktop_docs_reference_vsle_bluetooth_install_smoke_mode():
    for path in (
        ROOT / "docs/desktop/MACOS_INSTALL.md",
        ROOT / "docs/desktop/WINDOWS_INSTALL.md",
        ROOT / "docs/desktop/WEISILELINK_DESKTOP.md",
    ):
        text = path.read_text(encoding="utf-8")
        assert "--mode vsle-bluetooth" in text
        assert "vsle_bluetooth_real_ev3_ok" in text


def test_vsle_bluetooth_install_evidence_templates_are_blocked_by_default(
    tmp_path,
):
    for name in (
        "macos-vsle-bluetooth-install-smoke.template.json",
        "windows-vsle-bluetooth-install-smoke.template.json",
    ):
        template = ROOT / "docs/desktop/evidence" / name
        report = tmp_path / f"{name}.md"
        payload = json.loads(template.read_text(encoding="utf-8"))
        assert payload["release_artifact_manifest"] == ""
        assert payload["installed_from_release_artifact"] is False
        result = subprocess.run(
            [
                sys.executable,
                str(RUNNER),
                "--mode",
                "vsle-bluetooth",
                "--evidence",
                str(template),
                "--report",
                str(report),
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 1
        text = report.read_text(encoding="utf-8")
        assert "Classroom ready: no" in text
        assert "installed_from_release_artifact must be true" in text
        assert "started_after_reboot must be true" in text
        assert "scratch_link_endpoint_ok must be true" in text
        assert "vsle_bluetooth_real_ev3_ok must be true" in text


def test_desktop_docs_point_to_vsle_bluetooth_evidence_templates():
    for path, template_name in (
        (
            ROOT / "docs/desktop/MACOS_INSTALL.md",
            "macos-vsle-bluetooth-install-smoke.template.json",
        ),
        (
            ROOT / "docs/desktop/WINDOWS_INSTALL.md",
            "windows-vsle-bluetooth-install-smoke.template.json",
        ),
    ):
        text = path.read_text(encoding="utf-8")
        assert template_name in text
        assert template_name.replace(".template", "") in text
        assert "release_artifact_manifest" in text

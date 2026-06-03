import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INSTALL = ROOT / "install"
WIZARD_ROOT = INSTALL / "windows"
SMOKE_SCRIPT = WIZARD_ROOT / "run-wpf-smoke.ps1"
TEMPLATE = (
    WIZARD_ROOT
    / "03-evidence-templates"
    / "windows-setup-wizard-wpf-smoke.template.json"
)
README = WIZARD_ROOT / "README.md"
MANIFEST = INSTALL / "INSTALL_FILES_MANIFEST.md"
AUDIT = INSTALL / "ASSET_AUDIT.md"
CHECK_SCRIPT = INSTALL / "check_install_files.sh"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_wpf_smoke_script_and_template_are_registered():
    assert SMOKE_SCRIPT.is_file(), SMOKE_SCRIPT
    assert TEMPLATE.is_file(), TEMPLATE

    script = _read(SMOKE_SCRIPT)
    assert "#requires -Version 5.1" in script
    assert "PresentationFramework" in script
    assert "Windows.Markup.XamlReader" in script
    assert "setup-wizard.xaml" in script
    assert "SetupWizard.psm1" in script
    assert "InstallFileChecks.psm1" in script
    assert "WindowsInstallActions.psm1" in script
    assert "Ev3ConnectionChecks.psm1" in script
    assert "ConfirmInstallButton" in script
    assert "ConfirmEv3InstallButton" in script
    assert "TransportComboBox" in script
    assert "wpf_load_ok" in script
    assert "click_flow_checked" in script
    assert "production_release_ready" in script
    assert "requires Windows PowerShell 5.1" in script
    assert "ShowDialog" not in script
    assert "WEISILE_PAIRING_TOKEN" not in script
    assert "PairingToken" not in script
    assert "Password" not in script

    template = json.loads(TEMPLATE.read_text(encoding="utf-8"))
    assert template["status"] == "blocked"
    assert template["production_release_ready"] is False
    assert template["wpf_load_ok"] is False
    assert template["click_flow_checked"] is False
    assert template["windows_powershell_5_1"] is False
    assert "visual" in template
    assert "manual_confirmations" in template


def test_wpf_smoke_docs_and_install_checks_reference_artifacts():
    readme = _read(README)
    manifest = _read(MANIFEST)
    audit = _read(AUDIT)
    check_script = _read(CHECK_SCRIPT)

    assert "Windows WPF Smoke" in readme
    assert "run-wpf-smoke.ps1" in readme
    assert "windows-setup-wizard-wpf-smoke.template.json" in readme
    assert "Windows PowerShell 5.1" in readme

    for text in (manifest, audit, check_script):
        assert "windows/run-wpf-smoke.ps1" in text
        assert "windows-setup-wizard-wpf-smoke.template.json" in text


def test_wpf_smoke_script_reports_blocked_on_non_windows_pwsh(tmp_path):
    pwsh = shutil.which("pwsh")
    assert pwsh, "PowerShell Core must be installed for this smoke boundary test"

    output = tmp_path / "wpf-smoke.json"
    result = subprocess.run(
        [
            pwsh,
            "-NoLogo",
            "-NoProfile",
            "-File",
            str(SMOKE_SCRIPT),
            "-OutputPath",
            str(output),
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    evidence = json.loads(output.read_text(encoding="utf-8"))
    assert evidence["status"] == "blocked"
    assert evidence["wpf_load_ok"] is False
    assert evidence["windows_powershell_5_1"] is False
    assert "requires Windows PowerShell 5.1" in evidence["blocker"]

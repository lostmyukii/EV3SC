from pathlib import Path
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
WIZARD_ROOT = ROOT / "install" / "windows"
SCRIPT = WIZARD_ROOT / "setup-wizard.ps1"
XAML = WIZARD_ROOT / "setup-wizard.xaml"
MODULE = WIZARD_ROOT / "lib" / "SetupWizard.psm1"
README = WIZARD_ROOT / "README.md"


EXPECTED_STEP_IDS = [
    "welcome",
    "validate-files",
    "prepare-sd-card",
    "ev3-first-boot",
    "choose-transport",
    "install-ev3-server",
    "enable-bluetooth-full-vsle",
    "install-weisilelink-desktop",
    "verify-local-bridge",
    "open-scratchai",
    "finish-report",
]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_phase_a_wizard_files_exist_and_are_documented():
    for path in (SCRIPT, XAML, MODULE):
        assert path.is_file(), path

    readme = _read(README)
    assert "setup-wizard.ps1" in readme
    assert "Phase A" in readme
    assert "no install actions" in readme


def test_setup_wizard_module_defines_complete_safe_step_model():
    text = _read(MODULE)

    assert "Set-StrictMode -Version Latest" in text
    assert "Get-VsleSetupWizardSteps" in text
    assert "Get-VsleSetupWizardProgress" in text
    assert "Export-ModuleMember" in text

    for step_id in EXPECTED_STEP_IDS:
        assert f'Id = "{step_id}"' in text

    for status in (
        "pending",
        "needs_manual_action",
        "needs_input",
        "blocked",
        "skipped",
    ):
        assert f'Status = "{status}"' in text

    assert "ManualConfirmationRequired = $true" in text
    assert "ProductionReleaseReady = $false" in text
    assert "PairingToken" not in text
    assert "Password" not in text


def test_setup_wizard_script_only_loads_phase_a_ui():
    text = _read(SCRIPT)

    assert "#requires -Version 5.1" in text
    assert "Set-StrictMode -Version Latest" in text
    assert '$ErrorActionPreference = "Stop"' in text
    assert "PresentationFramework" in text
    assert "setup-wizard.xaml" in text
    assert "SetupWizard.psm1" in text
    assert "Get-VsleSetupWizardSteps" in text
    assert ".ShowDialog()" in text

    forbidden_actions = [
        "install-windows.ps1",
        "uninstall-windows.ps1",
        "Expand-Archive",
        "Copy-Item",
        "Remove-Item",
        "ssh ",
        "scp ",
        "Get-FileHash",
    ]
    for action in forbidden_actions:
        assert action not in text

    assert "Start-VsleEv3InstallConsole" in text
    assert "Start-Process" in text


def test_setup_wizard_main_buttons_have_click_handlers():
    text = _read(SCRIPT)

    for button_name in (
        "BackButton",
        "ContinueButton",
        "RetryButton",
        "ExportButton",
        "ConfirmInstallButton",
        "ConfirmEv3InstallButton",
    ):
        assert f'$window.FindName("{button_name}").Add_Click' in text

    assert "Move-VsleSetupWizardStep" in text
    assert "Export-VsleSetupWizardDiagnostics" in text
    assert "Invoke-VsleWizardUiAction" in text


def test_setup_wizard_diagnostics_exports_live_step_model_and_display_text():
    text = _read(SCRIPT)

    assert "foreach ($item in Get-VsleSetupWizardSteps)" in text
    assert "foreach ($item in $StepList.Items)" not in text
    assert "current_display = [ordered]@{" in text
    assert 'status_text = [string]$Window.FindName("StatusText").Text' in text
    assert 'evidence_text = [string]$Window.FindName("EvidenceText").Text' in text


def test_setup_wizard_button_errors_are_persisted_to_selected_step():
    text = _read(SCRIPT)

    assert "function Set-VsleWizardButtonError" in text
    assert "Set-VsleSetupWizardStepResult" in text
    assert '-Summary "按钮操作失败。"' in text
    assert "-Evidence $evidence" in text


def test_setup_wizard_xaml_parses_and_contains_ios_style_stepper_shell():
    tree = ET.parse(XAML)
    root = tree.getroot()
    assert root.tag.endswith("Window")
    assert root.attrib["Title"] == "VSLE Scratch-EV3 安装向导"

    text = _read(XAML)
    for required_name in (
        "StepList",
        "StepTitle",
        "AutoActionsText",
        "ManualActionsText",
        "StatusText",
        "EvidenceText",
        "BackButton",
        "ContinueButton",
        "RetryButton",
        "ExportButton",
    ):
        assert required_name in text

    assert "#007AFF" in text
    assert "#F5F5F7" in text
    assert "CornerRadius=\"18\"" in text
    assert "Classroom ready" not in text

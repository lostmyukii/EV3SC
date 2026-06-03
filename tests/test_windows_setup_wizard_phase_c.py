from pathlib import Path
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
INSTALL = ROOT / "install"
WIZARD_ROOT = INSTALL / "windows"
SCRIPT = WIZARD_ROOT / "setup-wizard.ps1"
SETUP_MODULE = WIZARD_ROOT / "lib" / "SetupWizard.psm1"
ACTION_MODULE = WIZARD_ROOT / "lib" / "WindowsInstallActions.psm1"
README = WIZARD_ROOT / "README.md"
EVIDENCE_ZIP = (
    WIZARD_ROOT
    / "02-weisilelink-desktop"
    / "windows-internal-release-evidence.zip"
)


EXPECTED_PACKAGE_ENTRIES = [
    "desktop/release/internal/windows/WeisileLink/WeisileLink.exe",
    "desktop/release/internal/windows/WeisileLink/install.ps1",
    "desktop/release/internal/windows/WeisileLink/uninstall.ps1",
    "desktop/release/internal/windows/WeisileLink/weisile-link-service.xml",
    "desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-manifest.json",
    "desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-unsigned.zip",
]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_phase_c_module_exists_and_exports_staging_functions():
    assert ACTION_MODULE.is_file(), ACTION_MODULE
    text = _read(ACTION_MODULE)

    assert "Set-StrictMode -Version Latest" in text
    assert "Get-VsleWindowsDesktopInstallPlan" in text
    assert "Prepare-VsleWindowsDesktopInstallStaging" in text
    assert "Test-VsleWindowsDesktopInstallStaging" in text
    assert "New-VsleWindowsDesktopInstallConfirmation" in text
    assert "System.IO.Compression.ZipFile" in text
    assert "ExtractToDirectory" in text
    assert "ManualConfirmationRequired = $true" in text
    assert "Status = \"needs_manual_action\"" in text
    assert "ProductionReleaseReady = $false" in text
    assert "Export-ModuleMember" in text

    for entry in EXPECTED_PACKAGE_ENTRIES:
        assert entry in text


def test_phase_c_module_does_not_auto_install_or_launch_processes():
    text = _read(ACTION_MODULE)

    forbidden = [
        "Start-Process",
        "Invoke-Expression",
        "Invoke-Command",
        "& $",
        "desktop-supervise",
        "ssh ",
        "scp ",
        "WEISILE_PAIRING_TOKEN",
        "PairingToken",
        "Password",
        "Set-ExecutionPolicy",
    ]
    for token in forbidden:
        assert token not in text

    assert "CallInstallScript = $false" in text
    assert "CopyToInstallRoot = $false" in text


def test_setup_wizard_wires_step_7_to_desktop_install_preparation():
    script = _read(SCRIPT)
    setup_module = _read(SETUP_MODULE)

    assert "WindowsInstallActions.psm1" in script
    assert "Prepare-VsleWindowsDesktopInstallStaging" in script
    assert "New-VsleWindowsDesktopInstallConfirmation" in script
    assert "Update-VsleDesktopInstallStep" in script
    assert "Run-VslePrepareDesktopInstallStep" in script
    assert 'Id -eq "install-weisilelink-desktop"' in script
    assert "Set-VsleSetupWizardStepResult" in script
    assert "needs_manual_action" in setup_module

    forbidden_script_tokens = [
        "Start-Process",
        "Copy-Item",
        "Invoke-Expression",
        "Invoke-Command",
        "desktop-supervise",
    ]
    for token in forbidden_script_tokens:
        assert token not in script


def test_current_windows_evidence_extracts_to_clean_staging_package():
    with tempfile.TemporaryDirectory() as tmp:
        staging = Path(tmp) / "windows-release-evidence"
        staging.mkdir()
        with zipfile.ZipFile(EVIDENCE_ZIP) as archive:
            archive.extractall(staging)

        for entry in EXPECTED_PACKAGE_ENTRIES:
            assert (staging / entry).is_file(), entry

        package_root = staging / "desktop/release/internal/windows/WeisileLink"
        assert (package_root / "WeisileLink.exe").is_file()
        assert (package_root / "install.ps1").is_file()
        assert (package_root / "uninstall.ps1").is_file()
        assert (package_root / "weisile-link-service.xml").is_file()


def test_phase_c_readme_documents_manual_confirmation_and_mac_limit():
    readme = _read(README)

    assert "Phase C" in readme
    assert "WindowsInstallActions.psm1" in readme
    assert "staging" in readme.lower()
    assert "manual confirmation" in readme.lower()
    assert "does not copy" in readme
    assert "does not call" in readme
    assert "macOS" in readme
    assert "Windows PowerShell 5.1" in readme

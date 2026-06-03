from pathlib import Path
import hashlib
import json
import xml.etree.ElementTree as ET
import zipfile


ROOT = Path(__file__).resolve().parents[1]
INSTALL = ROOT / "install"
WIZARD_ROOT = INSTALL / "windows"
SCRIPT = WIZARD_ROOT / "setup-wizard.ps1"
SETUP_MODULE = WIZARD_ROOT / "lib" / "SetupWizard.psm1"
CHECK_MODULE = WIZARD_ROOT / "lib" / "InstallFileChecks.psm1"
README = WIZARD_ROOT / "README.md"


EXPECTED_HASHES = {
    "windows/01-sd-card/balenaEtcher-Setup-1.17.0.exe": (
        "63cff656853143d33128e66d9d2bd824d1f87c74256ed1c5e7927556bcf2b684"
    ),
    "shared/01-ev3-sd-card/ev3dev-stretch-ev3-generic-2020-04-10.zip": (
        "f7f1e8c28b57a5b6af098f23868cb7c2210e90bf803ebfa23d8fb99c2c717e62"
    ),
    "windows/02-weisilelink-desktop/windows-internal-release-evidence.zip": (
        "1853a7de52b37c683247440afa8cf66d112fe19993bc5876f4a20f1528c75fb0"
    ),
    "windows/02-weisilelink-desktop/windows-internal-release-download-receipt.json": (
        "79ef79d72578c9adcf6a6ed4377313fdf37482fbd83896465c3e485c88e91e22"
    ),
}


EXPECTED_ZIP_ENTRIES = [
    "desktop/release/internal/windows/WeisileLink/WeisileLink.exe",
    "desktop/release/internal/windows/WeisileLink/install.ps1",
    "desktop/release/internal/windows/WeisileLink/uninstall.ps1",
    "desktop/release/internal/windows/WeisileLink/weisile-link-service.xml",
    "desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-manifest.json",
    "desktop/release/internal/windows/WeisileLink-windows-0.1.0-internal-unsigned.zip",
]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def test_phase_b_module_exists_and_exports_file_validation_functions():
    assert CHECK_MODULE.is_file(), CHECK_MODULE
    text = _read(CHECK_MODULE)

    assert "Set-StrictMode -Version Latest" in text
    assert "Get-VsleInstallFileCheckPlan" in text
    assert "Invoke-VsleInstallFileChecks" in text
    assert "Test-VsleZipEntries" in text
    assert "Test-VsleJsonFile" in text
    assert "Test-VsleXmlFile" in text
    assert "Get-FileHash" in text
    assert "System.IO.Compression.ZipFile" in text
    assert "ConvertFrom-Json" in text
    assert "Export-ModuleMember" in text

    for relative_path, expected_hash in EXPECTED_HASHES.items():
        assert relative_path in text
        assert expected_hash in text

    for entry in EXPECTED_ZIP_ENTRIES:
        assert entry in text


def test_phase_b_validation_module_has_no_install_side_effects_or_unix_dependencies():
    text = _read(CHECK_MODULE)

    forbidden = [
        "Start-Process",
        "Copy-Item",
        "Remove-Item",
        "Expand-Archive",
        "Invoke-WebRequest",
        "ssh ",
        "scp ",
        "git ",
        "unzip",
        "sha256sum",
        "shasum",
        "bash",
        "pairing",
        "PairingToken",
        "Password",
    ]
    for token in forbidden:
        assert token not in text


def test_setup_wizard_wires_step_1_to_validation_without_install_actions():
    script = _read(SCRIPT)
    setup_module = _read(SETUP_MODULE)

    assert "InstallFileChecks.psm1" in script
    assert "Invoke-VsleInstallFileChecks" in script
    assert "Update-VsleValidateFilesStep" in script
    assert "Run-VsleValidateFilesStep" in script
    assert 'Id -eq "validate-files"' in script
    assert "StepList.Items.Refresh()" in script
    assert "Set-VsleSetupWizardStepResult" in setup_module
    assert "Status = \"passed\"" in setup_module
    assert "Status = \"blocked\"" in setup_module
    assert "Status = \"warning\"" in setup_module


def test_current_install_assets_match_phase_b_validation_plan():
    for relative_path, expected_hash in EXPECTED_HASHES.items():
        path = INSTALL / relative_path
        assert path.is_file(), path
        assert _sha256(path) == expected_hash

    with zipfile.ZipFile(
        INSTALL
        / "windows/02-weisilelink-desktop/windows-internal-release-evidence.zip"
    ) as archive:
        names = set(archive.namelist())
    for entry in EXPECTED_ZIP_ENTRIES:
        assert entry in names

    for relative_path in (
        "windows/02-weisilelink-desktop/windows-internal-release-download-receipt.json",
        "windows/03-evidence-templates/windows-vsle-bluetooth-install-smoke.template.json",
    ):
        with (INSTALL / relative_path).open("r", encoding="utf-8") as handle:
            json.load(handle)

    ET.parse(WIZARD_ROOT / "setup-wizard.xaml")


def test_phase_b_readme_documents_validation_scope_and_mac_preview_limit():
    readme = _read(README)

    assert "Phase B" in readme
    assert "InstallFileChecks.psm1" in readme
    assert "Validate Files" in readme
    assert "does not install" in readme
    assert "macOS" in readme
    assert "Windows PowerShell 5.1" in readme

from pathlib import Path
import shutil
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
WIZARD_ROOT = ROOT / "install" / "windows"
SCRIPT = WIZARD_ROOT / "setup-wizard.ps1"
XAML = WIZARD_ROOT / "setup-wizard.xaml"
ACTION_MODULE = WIZARD_ROOT / "lib" / "WindowsInstallActions.psm1"
README = WIZARD_ROOT / "README.md"
EVIDENCE_ZIP = (
    WIZARD_ROOT
    / "02-weisilelink-desktop"
    / "windows-internal-release-evidence.zip"
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_phase_c_execution_requires_explicit_confirmation_exports():
    text = _read(ACTION_MODULE)

    assert "Invoke-VsleWindowsDesktopInstallExecution" in text
    assert "Test-VsleWindowsDesktopStartupCommand" in text
    assert "Stop-VsleWindowsDesktopProcessesForUpgrade" in text
    assert "[switch]$ConfirmInstall" in text
    assert "Manual confirmation required before installing WeisileLink Desktop." in text
    assert "Remaining process IDs:" in text
    assert "Target executable:" in text
    assert "Copy-Item" in text
    assert "CallInstallScript = $true" in text
    assert "desktop-supervise" in text
    assert "127.0.0.1" in text
    assert "20111" in text
    assert "8766" in text

    export_line = next(
        line for line in text.splitlines() if line.startswith("Export-ModuleMember")
    )
    assert "Invoke-VsleWindowsDesktopInstallExecution" in export_line
    assert "Test-VsleWindowsDesktopStartupCommand" in export_line
    assert "Stop-VsleWindowsDesktopProcessesForUpgrade" in export_line


def test_phase_c_forced_replace_stops_target_process_before_remove():
    text = _read(ACTION_MODULE)
    install_start = text.index("function Invoke-VsleWindowsDesktopInstallExecution")
    install_end = text.index("\nfunction Test-VsleTcpPort", install_start)
    install_body = text[install_start:install_end]

    stop_index = install_body.index("Stop-VsleWindowsDesktopProcessesForUpgrade")
    remove_index = install_body.index(
        "Remove-Item -LiteralPath $Plan.TargetRoot -Recurse -Force"
    )

    assert stop_index < remove_index
    assert '$processResult.Status -eq "blocked"' in install_body


def test_phase_c_wizard_has_dedicated_confirmation_control():
    xaml = _read(XAML)
    script = _read(SCRIPT)

    assert 'x:Name="ConfirmInstallButton"' in xaml
    assert "确认安装" in xaml
    assert "ConfirmInstallButton" in script
    assert "Run-VsleConfirmDesktopInstallStep" in script
    assert "Invoke-VsleWindowsDesktopInstallExecution" in script
    assert "-ConfirmInstall" in script
    assert 'Id -eq "install-weisilelink-desktop"' in script


def test_current_evidence_can_copy_to_clean_temp_install_root_and_verify_startup():
    with tempfile.TemporaryDirectory() as tmp:
        staging = Path(tmp) / "staging"
        install_root = Path(tmp) / "Programs" / "VSLE" / "WeisileLink"
        with zipfile.ZipFile(EVIDENCE_ZIP) as archive:
            archive.extractall(staging)

        package_root = staging / "desktop/release/internal/windows/WeisileLink"
        shutil.copytree(package_root, install_root)

        assert (install_root / "WeisileLink.exe").is_file()
        assert (install_root / "install.ps1").is_file()
        assert (install_root / "uninstall.ps1").is_file()
        assert (install_root / "weisile-link-service.xml").is_file()

        install_script = (install_root / "install.ps1").read_text(encoding="utf-8")
        service_xml = (install_root / "weisile-link-service.xml").read_text(
            encoding="utf-8"
        )
        startup_text = install_script + "\n" + service_xml

        for required in [
            "desktop-supervise",
            "127.0.0.1",
            "20111",
            "8766",
            "--open-scratchai",
        ]:
            assert required in startup_text


def test_phase_c_execution_readme_documents_confirmed_install_slice():
    readme = _read(README)
    normalized = " ".join(readme.split())

    assert "Phase C Desktop Install Confirmation" in readme
    assert "Confirm Install" in readme
    assert "copies the staged package" in normalized
    assert "desktop-supervise" in readme
    assert "127.0.0.1:20111" in readme
    assert "127.0.0.1:8766" in readme
    assert "Windows WPF" in readme

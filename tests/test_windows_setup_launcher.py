from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INSTALL_ROOT = ROOT / "install"
LAUNCHER = INSTALL_ROOT / "Start-VSLE-Setup-Wizard.cmd"
START_HERE = INSTALL_ROOT / "START_HERE_WINDOWS.txt"


def test_windows_double_click_launcher_exists_and_uses_system_powershell_51():
    assert LAUNCHER.exists(), "Windows double-click launcher is missing"

    text = LAUNCHER.read_text(encoding="utf-8")
    raw = LAUNCHER.read_bytes()

    assert "@echo off" in text
    assert "%~dp0" in text
    assert "windows\\setup-wizard.ps1" in text
    assert "WindowsPowerShell\\v1.0\\powershell.exe" in text
    assert "-ExecutionPolicy Bypass" in text
    assert "-NoLogo" in text
    assert "-NoProfile" in text
    assert "pwsh" not in text.lower()
    assert "WEISILE_PAIRING_TOKEN" not in text
    assert "Password" not in text
    assert "API" not in text
    assert all(byte < 128 for byte in raw), "CMD launcher must be ASCII-only"
    assert b"\r\n" in raw, "CMD launcher must use CRLF line endings"
    assert b"\n" not in raw.replace(b"\r\n", b""), "CMD launcher has bare LF"


def test_windows_start_here_tells_user_to_double_click_launcher_not_ps1():
    assert START_HERE.exists(), "Windows start-here note is missing"

    text = START_HERE.read_text(encoding="utf-8")

    assert "Start-VSLE-Setup-Wizard.cmd" in text
    assert "setup-wizard.ps1" in text
    assert "不要手动运行" in text
    assert "C:\\VSLE-Install" in text


def test_install_checks_and_docs_reference_double_click_launcher():
    install_check = (INSTALL_ROOT / "check_install_files.sh").read_text(
        encoding="utf-8"
    )
    manifest = (INSTALL_ROOT / "INSTALL_FILES_MANIFEST.md").read_text(
        encoding="utf-8"
    )
    install_readme = (INSTALL_ROOT / "README.md").read_text(encoding="utf-8")
    windows_readme = (INSTALL_ROOT / "windows" / "README.md").read_text(
        encoding="utf-8"
    )
    chinese_guide = (
        INSTALL_ROOT / "VSLE_Scratch-EV3_完整安装向导.md"
    ).read_text(encoding="utf-8")

    for text in (
        install_check,
        manifest,
        install_readme,
        windows_readme,
        chinese_guide,
    ):
        assert "Start-VSLE-Setup-Wizard.cmd" in text

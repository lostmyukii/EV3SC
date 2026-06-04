from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INSTALL_ROOT = ROOT / "install"
WINDOWS_ROOT = INSTALL_ROOT / "windows"


UTF8_BOM = b"\xef\xbb\xbf"


def test_windows_powershell_51_chinese_files_have_utf8_bom():
    # Windows PowerShell 5.1 guesses ANSI for UTF-8 files without a BOM.
    # Keep Chinese UI files BOM-tagged so the parser does not corrupt strings.
    for path in (
        WINDOWS_ROOT / "setup-wizard.ps1",
        WINDOWS_ROOT / "run-wpf-smoke.ps1",
        WINDOWS_ROOT / "lib" / "SetupWizard.psm1",
        WINDOWS_ROOT / "setup-wizard.xaml",
    ):
        assert path.read_bytes().startswith(UTF8_BOM), path


def test_windows_setup_scripts_do_not_use_smart_quotes():
    for path in (
        WINDOWS_ROOT / "setup-wizard.ps1",
        WINDOWS_ROOT / "run-wpf-smoke.ps1",
        WINDOWS_ROOT / "lib" / "SetupWizard.psm1",
        WINDOWS_ROOT / "setup-wizard.xaml",
    ):
        text = path.read_text(encoding="utf-8-sig")
        for bad in ("“", "”", "‘", "’"):
            assert bad not in text, f"{path} contains smart quote {bad!r}"

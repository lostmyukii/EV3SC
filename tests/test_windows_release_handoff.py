from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "desktop/windows/build_release.ps1"


def test_windows_release_handoff_script_runs_guarded_chain():
    text = SCRIPT.read_text(encoding="utf-8")

    assert "Set-StrictMode -Version Latest" in text
    assert '$ErrorActionPreference = "Stop"' in text
    assert "[PlatformID]::Win32NT" in text
    assert "WEISILE_WINDOWS_SIGN_IDENTITY" in text
    assert "WEISILE_WINDOWS_TIMESTAMP_URL" in text
    assert "desktop/scripts/build_weisilelink_executable.py" in text
    assert "--target" in text
    assert "windows" in text
    assert "--clean" in text
    assert "desktop/scripts/check_windows_release_preflight.py" in text
    assert "docs/desktop/evidence/windows-release-preflight.json" in text
    assert "docs/desktop/evidence/windows-release-preflight.md" in text
    assert "desktop/scripts/run_windows_release_flow.py" in text
    assert "docs/desktop/evidence/windows-release-flow.json" in text
    assert "docs/desktop/evidence/windows-release-flow.md" in text
    assert "--allow-unsigned" not in text


def test_windows_docs_reference_handoff_script():
    for path in (
        ROOT / "desktop/README.md",
        ROOT / "docs/desktop/WINDOWS_INSTALL.md",
        ROOT / "docs/desktop/WEISILELINK_DESKTOP.md",
        ROOT / "docs/SOURCE_REGISTER.md",
    ):
        text = path.read_text(encoding="utf-8")
        assert "desktop/windows/build_release.ps1" in text
        assert "WEISILE_WINDOWS_SIGN_IDENTITY" in text
        assert "WEISILE_WINDOWS_TIMESTAMP_URL" in text

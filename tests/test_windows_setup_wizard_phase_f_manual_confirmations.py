from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WIZARD_ROOT = ROOT / "install" / "windows"
SCRIPT = WIZARD_ROOT / "setup-wizard.ps1"
XAML = WIZARD_ROOT / "setup-wizard.xaml"
MODULE = WIZARD_ROOT / "lib" / "SetupWizard.psm1"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def test_phase_f_step_model_defines_manual_confirmations():
    text = _read(MODULE)

    assert "ManualConfirmations" in text
    for step_id in (
        'Id = "welcome"',
        'Id = "prepare-sd-card"',
        'Id = "ev3-first-boot"',
        'Id = "enable-bluetooth-full-vsle"',
        'Id = "open-scratchai"',
    ):
        assert step_id in text

    for label in (
        "我已确认这是内部测试安装包",
        "我已确认 SD 卡插在 Windows 电脑上，不在 EV3 上",
        "我已确认 Etcher 选择的是 ev3dev 镜像和正确的 microSD 卡",
        "我已确认 Etcher 显示 Flash Complete，并已安全弹出 SD 卡",
        "我已确认 SD 卡已经插入 EV3",
        "我已确认 EV3 屏幕出现 ev3dev / Brickman",
        "我已确认 Windows 电脑有蓝牙或已插入 USB 蓝牙适配器",
        "我已确认 ScratchAI 已打开",
    ):
        assert label in text


def test_phase_f_xaml_renders_manual_confirmation_checkboxes():
    text = _read(XAML)

    assert "ManualConfirmationsList" in text
    assert "CheckBox" in text
    assert 'IsChecked="{Binding Checked' in text
    assert "人工确认清单" in text


def test_phase_f_xaml_pins_manual_confirmations_above_manual_instructions():
    text = _read(XAML)

    assert 'x:Name="ManualConfirmationPinnedPanel"' in text
    assert "必须完成的确认" in text
    assert "勾选后本步进度会同步增加" in text
    assert 'MinHeight="96"' in text
    assert 'MaxHeight="180"' in text
    assert text.index('x:Name="ManualConfirmationsList"') < text.index('x:Name="ManualActionsText"')


def test_phase_f_script_tracks_manual_confirmation_progress_and_gates_continue():
    text = _read(SCRIPT)

    for expected in (
        "Get-VsleManualConfirmationProgress",
        "Update-VsleManualConfirmationProgress",
        "Convert-VsleManualConfirmationsForDisplay",
        "ManualConfirmationsList",
        "Add_Checked",
        "Add_Unchecked",
        "requiredCheckedCount",
        "requiredTotalCount",
        "ManualConfirmationRequired",
        "ManualConfirmationPinnedPanel",
    ):
        assert expected in text

    assert "StepProgressPercent $manualProgress.Percent" in text
    assert "$continueButton.IsEnabled = $manualProgress.Complete" in text

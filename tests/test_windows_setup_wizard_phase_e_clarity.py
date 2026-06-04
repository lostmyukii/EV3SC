from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WIZARD_ROOT = ROOT / "install" / "windows"
SCRIPT = WIZARD_ROOT / "setup-wizard.ps1"
XAML = WIZARD_ROOT / "setup-wizard.xaml"
MODULE = WIZARD_ROOT / "lib" / "SetupWizard.psm1"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def test_phase_e_xaml_exposes_step_progress_and_guidance_controls():
    text = _read(XAML)

    for required_name in (
        "CurrentStepProgressBar",
        "CurrentStepProgressText",
        "CompletionConditionText",
        "HardwareLocationText",
        "CheckItemsList",
    ):
        assert required_name in text

    assert "本步进度" in text
    assert "完成条件" in text
    assert "当前位置" in text
    assert "自动检查明细" in text


def test_phase_e_step_model_has_progress_completion_and_sd_card_guidance():
    text = _read(MODULE)

    for required_field in (
        "CompletionCondition",
        "HardwareLocation",
        "CheckItems",
        "StepProgressPercent",
    ):
        assert required_field in text

    assert "SD 卡位置：插在 Windows 电脑上" in text
    assert "SD 卡位置：插在 EV3 里" in text
    assert "不要插入 EV3" in text
    assert "Etcher 显示 Flash Complete" in text
    assert "Brickman" in text


def test_phase_e_file_validation_has_deterministic_check_items():
    text = _read(MODULE)

    for check_name in (
        "必需路径",
        "Etcher 与 ev3dev",
        "Windows release evidence",
        "JSON 证据模板",
        "XAML 向导文件",
        "Desktop release 内容",
        "最终结果",
    ):
        assert check_name in text


def test_phase_e_script_updates_progress_guidance_and_file_check_items():
    text = _read(SCRIPT)

    for expected in (
        "CurrentStepProgressBar",
        "CurrentStepProgressText",
        "CompletionConditionText",
        "HardwareLocationText",
        "CheckItemsList",
        "Set-VsleStepProgress",
        "Set-VsleStepCheckItems",
        "New-VsleValidateFileCheckItemsFromResult",
        "-ProgressPercent 5",
        "-ProgressPercent 100",
    ):
        assert expected in text

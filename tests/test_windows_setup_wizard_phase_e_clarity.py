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


def test_phase_e_xaml_wraps_step_details_in_scroll_viewer():
    text = _read(XAML)

    assert 'x:Name="StepDetailsScrollViewer"' in text
    assert 'VerticalScrollBarVisibility="Auto"' in text
    assert 'HorizontalScrollBarVisibility="Disabled"' in text
    assert 'PanningMode="VerticalFirst"' in text
    assert text.index('x:Name="StepDetailsScrollViewer"') < text.index('x:Name="CurrentStepProgressBar"')
    assert text.index('x:Name="StepDetailsScrollViewer"') < text.index('x:Name="EvidenceText"')


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


def test_phase_e_prepare_sd_card_step_names_full_flash_workflow():
    text = _read(MODULE)

    for expected in (
        "刷写 ev3dev 系统到 EV3 SD 卡",
        "这一步就是把 ev3dev 系统安装到 microSD 卡",
        "1. 将 microSD 卡插入 Windows 电脑",
        "2. 打开 Balena Etcher",
        "3. 选择 Flash from file",
        "4. 选择 ev3dev 镜像文件",
        "5. 选择目标 microSD 卡",
        "6. 点击 Flash",
        "7. 等待 Etcher 显示 Flash Complete",
        "8. 安全弹出 SD 卡",
        "我已确认已经点击 Flash，并等待 Etcher 完成写入和验证",
    ):
        assert expected in text


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

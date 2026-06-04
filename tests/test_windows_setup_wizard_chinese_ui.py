from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WIZARD_ROOT = ROOT / "install" / "windows"
XAML = WIZARD_ROOT / "setup-wizard.xaml"
SCRIPT = WIZARD_ROOT / "setup-wizard.ps1"
MODULE = WIZARD_ROOT / "lib" / "SetupWizard.psm1"
LAUNCHER = ROOT / "install" / "Start-VSLE-Setup-Wizard.cmd"
START_HERE = ROOT / "install" / "START_HERE_WINDOWS.txt"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_wizard_visible_shell_text_is_chinese():
    xaml = _read(XAML)

    for text in (
        'Title="VSLE Scratch-EV3 安装向导"',
        'Text="VSLE 安装"',
        'Text="Windows 内部测试向导"',
        'Text="欢迎"',
        'Text="自动执行"',
        'Text="需要你手动确认"',
        'Text="EV3 连接"',
        'Text="连接方式"',
        'Text="EV3 SSH 地址"',
        'Text="SSH 用户"',
        'Text="EV3 蓝牙地址"',
        'Text="当前状态"',
        'Text="证据或结果"',
        'Content="上一步"',
        'Content="重试"',
        'Content="导出诊断"',
        'Content="确认安装"',
        'Content="确认安装 EV3"',
        'Content="下一步"',
    ):
        assert text in xaml

    for text in (
        'Title="VSLE Windows Setup Wizard"',
        'Text="Welcome"',
        'Text="Automatic actions"',
        'Text="Manual teacher action"',
        'Content="Continue"',
        'Content="Confirm Install"',
    ):
        assert text not in xaml


def test_step_model_exposes_chinese_titles_and_status_labels():
    module = _read(MODULE)

    for text in (
        'Title = "欢迎"',
        'Title = "检查安装文件"',
        'Title = "准备 EV3 SD 卡"',
        'Title = "安装 WeisileLink Desktop"',
        'Title = "完成并导出报告"',
        'StatusLabel',
        '"needs_manual_action" { "需要手动确认" }',
        '"blocked" { "已阻塞" }',
        '"passed" { "已通过" }',
    ):
        assert text in module


def test_setup_script_suppresses_unapproved_verb_import_warning():
    script = _read(SCRIPT)

    import_lines = [
        line for line in script.splitlines() if line.strip().startswith("Import-Module")
    ]
    assert import_lines
    assert all("-DisableNameChecking" in line for line in import_lines)
    assert "状态：" in script
    assert "阻塞：" in script
    assert "下一步：" in script
    assert "Phase A shell" not in script


def test_windows_launcher_and_start_note_are_teacher_facing_chinese():
    launcher = _read(LAUNCHER)
    start_here = _read(START_HERE)

    assert "Opening VSLE Scratch-EV3 setup wizard" in launcher
    assert "正在打开" not in launcher
    assert "请双击" in start_here
    assert "Start-VSLE-Setup-Wizard.cmd" in start_here
    assert "不要手动运行 setup-wizard.ps1" in start_here

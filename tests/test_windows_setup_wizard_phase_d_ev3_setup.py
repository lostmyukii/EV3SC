from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INSTALL = ROOT / "install"
WIZARD_ROOT = INSTALL / "windows"
SCRIPT = WIZARD_ROOT / "setup-wizard.ps1"
XAML = WIZARD_ROOT / "setup-wizard.xaml"
SETUP_MODULE = WIZARD_ROOT / "lib" / "SetupWizard.psm1"
EV3_MODULE = WIZARD_ROOT / "lib" / "Ev3ConnectionChecks.psm1"
README = WIZARD_ROOT / "README.md"
MANIFEST = INSTALL / "INSTALL_FILES_MANIFEST.md"
CHECK_SCRIPT = INSTALL / "check_install_files.sh"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_phase_d_ev3_module_exists_and_exports_input_and_runner_functions():
    assert EV3_MODULE.is_file(), EV3_MODULE
    text = _read(EV3_MODULE)

    assert "Set-StrictMode -Version Latest" in text
    assert "New-VsleEv3SetupInput" in text
    assert "Test-VsleEv3SetupInput" in text
    assert "New-VsleEv3ServerInstallPlan" in text
    assert "Invoke-VsleEv3ServerInstall" in text
    assert "New-VsleBluetoothFullVslePairingGuide" in text
    assert "[switch]$ConfirmEv3Install" in text
    assert "Manual confirmation required before installing the EV3 server." in text
    assert "New-VsleEv3RemoteInstallCommand" in text
    assert "VSLE_REMOTE_STEP_START" in text
    assert "VSLE_REMOTE_STEP_FAILED" in text
    assert "run_vsle_timed_step" in text
    assert "collect_vsle_service_logs" in text
    assert "timeout" in text
    assert "install-systemd-assets" in text
    assert "journalctl -u vsle-ev3-server.service -n 80 --no-pager" in text
    assert "SKIP_PIP_INSTALL=1 bash ./scripts/install.sh" in text
    assert "SKIP_PIP_INSTALL=1 bash ./scripts/install.sh && systemctl" not in text
    assert "sudo -v" in text
    assert "Arguments = @(\"-tt\", $sshTarget, $remoteInstall)" in text
    assert "systemctl is-active vsle-ev3-server.service" in text
    assert "python3 -m py_compile vsle_ev3_server.py" in text
    assert "scp" in text
    assert "ssh" in text

    export_line = next(
        line for line in text.splitlines() if line.startswith("Export-ModuleMember")
    )
    for function in (
        "New-VsleEv3SetupInput",
        "Test-VsleEv3SetupInput",
        "New-VsleEv3ServerInstallPlan",
        "Invoke-VsleEv3ServerInstall",
        "New-VsleBluetoothFullVslePairingGuide",
    ):
        assert function in export_line


def test_phase_d_ev3_module_validates_transport_and_never_stores_secrets():
    text = _read(EV3_MODULE)

    assert '"wifi-full-vsle"' in text
    assert '"bluetooth-full-vsle"' in text
    assert '"usb-assisted"' in text
    assert '"robot"' in text
    assert "Bluetooth address is required for Bluetooth Full VSLE." in text
    assert "Official firmware Bluetooth is not a Full VSLE transport." in text
    assert "RedactedBluetoothAddress" in text

    forbidden = [
        "PairingToken",
        "WEISILE_PAIRING_TOKEN",
        "maker",
        "ConvertTo-SecureString",
        "Invoke-Expression",
        "Set-ExecutionPolicy",
        "production_release_ready: true",
    ]
    for token in forbidden:
        assert token not in text


def test_phase_d_wizard_exposes_ev3_inputs_and_confirm_button():
    xaml = _read(XAML)
    script = _read(SCRIPT)
    runner_section = script[
        script.index("function New-VsleEv3ExternalInstallRunner") :
        script.index("function Start-VsleEv3InstallConsole")
    ]
    auto_refresh_section = script[
        script.index("function New-VsleEv3ExternalInstallAutoRefreshTimer") :
        script.index("function Run-VsleConfirmEv3ServerInstallStep")
    ]

    for control in (
        'x:Name="Ev3SetupPanel"',
        'x:Name="TransportComboBox"',
        'x:Name="Ev3HostTextBox"',
        'x:Name="Ev3UserTextBox"',
        'x:Name="Ev3BluetoothAddressTextBox"',
        'x:Name="ConfirmEv3InstallButton"',
    ):
        assert control in xaml

    assert "WiFi Full VSLE" in xaml
    assert "Bluetooth Full VSLE" in xaml
    assert "USB-assisted setup" in xaml
    assert 'Text="ev3dev.local"' in xaml
    assert "先填 ev3dev.local" in xaml
    assert "SSH 用户固定填写 robot" in xaml
    assert "默认密码是 maker" in xaml
    assert "安装窗口会先显示输入一次 sudo 密码" in xaml
    assert "直接回车使用 maker" in xaml
    assert "不会写入安装向导证据" in xaml
    assert "蓝牙地址可在 EV3 的 Bluetooth 设置中查看" in xaml
    assert "也可以在 EV3 SSH 里运行 hciconfig -a" in xaml
    assert "Windows 设置 > 蓝牙和设备 > 添加设备" in xaml

    assert "Ev3ConnectionChecks.psm1" in script
    assert "Get-VsleEv3SetupInputFromWindow" in script
    assert "Run-VslePrepareEv3SetupStep" in script
    assert "Run-VsleConfirmEv3ServerInstallStep" in script
    assert "New-VsleEv3ServerInstallPlan" in script
    assert "Invoke-VsleEv3ServerInstall" in script
    assert "-ConfirmEv3Install" in script
    assert "New-VsleEv3ExternalInstallRunner" in script
    assert "Start-VsleEv3InstallConsole" in script
    assert "Update-VsleEv3ExternalInstallResultStep" in script
    assert "Start-Process" in script
    assert "ev3-install-result" in script
    assert "Return to the VSLE wizard and click Retry" in script
    assert "Write-VsleEv3RunnerStatus" in script
    assert "EV3 Server install runner is waiting for password input." in script
    assert "EV3 Server install runner is executing SSH/SCP commands." in script
    assert "CurrentCommandName" in script
    assert "CurrentCommandStartedAt" in script
    assert "Current command elapsed minutes:" in script
    assert "-StatusUpdateScript $statusCallback" in script
    assert "OpenSSH host-key, yes/no, or SSH login password prompt" in script
    assert (
        runner_section.index("EV3 Server install runner is waiting for password input.")
        < runner_section.index("EV3 Server install runner is executing SSH/SCP commands.")
    )
    assert (
        runner_section.index(
            "EV3 Server install runner is waiting for password input."
        )
        < runner_section.index('Read-Host "EV3 robot password')
    )
    assert runner_section.index("'try {'") < runner_section.index(
        "Import-Module $moduleLiteral -Force -DisableNameChecking"
    )
    assert 'Read-Host "EV3 robot password (press Enter to use maker)"' in script
    assert "-Ev3SudoPassword $ev3SudoPassword" in script
    assert "ProcessId:" in script
    assert "Process running:" in script
    assert "Last checked:" in script
    assert "New-VsleEv3ExternalInstallAutoRefreshTimer" in script
    assert "[System.Windows.Threading.DispatcherTimer]" in script
    assert "Update-VsleEv3ExternalInstallResultStep -Window $window" in script
    assert "VlseLastEv3ExternalInstallResultPath" in auto_refresh_section
    assert 'SelectedItem.Status -ne "running"' not in auto_refresh_section
    assert '$continueButton.IsEnabled = (' in script
    assert "-not [bool]$Step.Blocking" in script
    assert "ConfirmEv3InstallButton" in script
    assert 'Id -eq "install-ev3-server"' in script
    assert 'Id -eq "choose-transport"' in script


def test_phase_d_ev3_failures_never_export_empty_evidence():
    module = _read(EV3_MODULE)
    script = _read(SCRIPT)

    assert module.isascii()
    assert "Convert-VsleNativeCommandOutputText" in module
    assert "System.Management.Automation.ErrorRecord" in module
    assert "FullyQualifiedErrorId" in module
    assert "Exception.Message" in module
    assert "$previousErrorActionPreference = $ErrorActionPreference" in module
    assert '$ErrorActionPreference = "Continue"' in module
    assert "$ErrorActionPreference = $previousErrorActionPreference" in module
    assert "2>&1 | Out-String" not in module
    assert "Command output:" in module
    assert "No command output captured." in module
    assert "EV3 install did not provide diagnostic detail." in module
    assert "PowerShell error type:" in module
    assert "Get-VsleEv3CommandFailureHint" in module
    assert 'sudo:\\s*3 incorrect password attempts' in module
    assert "SudoPasswordArgumentIndex = 2" in module
    assert "New-VsleEv3SudoPasswordStandardInput" in module
    assert "sudo -S" in module
    assert "[scriptblock]$StatusUpdateScript" in module
    assert "StepIndex" in module
    assert "StepCount" in module
    assert "StartedAt" in module
    assert '$lines -join "`n"' in module
    assert 'Arguments = [string[]]$arguments' in module
    assert "StandardInputText = $standardInputText" in module
    assert "New-VsleUnicodeString" in module
    assert "0x5bc6, 0x7801, 0x8f93, 0x5165" in module
    assert "Results = $results.ToArray()" in module
    assert "Results = @($results)" not in module
    assert "Get-VsleEv3ResultEvidenceText" in script
    assert "if ([string]::IsNullOrWhiteSpace($evidence))" in script
    assert "EV3 安装步骤没有返回诊断内容" in script


def test_phase_d_setup_model_and_docs_register_ev3_module():
    setup_module = _read(SETUP_MODULE)
    readme = _read(README)
    manifest = _read(MANIFEST)
    check_script = _read(CHECK_SCRIPT)

    assert 'Id = "choose-transport"' in setup_module
    assert 'Id = "install-ev3-server"' in setup_module
    assert 'Id = "enable-bluetooth-full-vsle"' in setup_module
    assert "EV3 server 服务为 active" in setup_module
    for expected in (
        "WiFi Full VSLE：EV3 SSH 地址先填 ev3dev.local",
        "如果 ev3dev.local 不通，在 EV3 Brickman 的网络信息里查看 IP 地址",
        "SSH 用户填写 robot；默认密码是 maker",
        "Bluetooth Full VSLE：先确认 Windows 有蓝牙或 USB 蓝牙适配器",
        "EV3 蓝牙地址可在 EV3 的 Bluetooth 设置中查看",
        "也可在 EV3 SSH 里运行 hciconfig -a | grep \"BD Address\"",
        "Windows 设置 > 蓝牙和设备 > 添加设备",
        "install/shared/02-ev3-server/ev3-firmware/vsle_ev3_server.py",
        "install/shared/02-ev3-server/websockets-7.0.tar.gz",
    ):
        assert expected in setup_module

    assert "Phase D EV3 Guided Setup" in readme
    assert "Ev3ConnectionChecks.psm1" in readme
    assert "Confirm EV3 Install" in readme
    assert "Bluetooth Full VSLE" in readme
    assert "ev3dev.local" in readme
    assert "hciconfig -a" in readme
    assert "Windows Settings > Bluetooth & devices > Add device" in readme
    assert "password" in readme.lower()
    assert "not stored" in readme.lower()
    assert "sudo -S" in readme
    assert "through standard" in readme
    assert "input" in readme
    assert "allocates a TTY" in readme

    assert "windows/lib/Ev3ConnectionChecks.psm1" in manifest
    assert "windows/lib/Ev3ConnectionChecks.psm1" in check_script

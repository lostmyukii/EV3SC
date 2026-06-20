from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WIZARD_ROOT = ROOT / "install" / "windows"
SCRIPT = WIZARD_ROOT / "setup-wizard.ps1"
ACTION_MODULE = WIZARD_ROOT / "lib" / "WindowsInstallActions.psm1"
SETUP_MODULE = WIZARD_ROOT / "lib" / "SetupWizard.psm1"
README = WIZARD_ROOT / "README.md"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def test_phase_g_local_bridge_action_module_starts_and_checks_ports():
    text = _read(ACTION_MODULE)

    for expected in (
        "Get-VsleWindowsDesktopBridgePlan",
        "Test-VsleTcpPort",
        "Test-VsleScratchLinkProtocol",
        "System.Net.WebSockets.ClientWebSocket",
        "ws://127.0.0.1:20111/scratch/bt",
        '"getVersion"',
        '"discover"',
        '"implementation"',
        '"WeisileLink"',
        '"didDiscoverPeripheral"',
        "Invoke-VsleWindowsDesktopBridgeVerification",
        "Start-Process",
        "desktop-supervise",
        "direct-runtime",
        "WEISILE_TRANSPORT",
        "EV3_IP",
        "EV3_BT",
        "vsle-bluetooth",
        "Set-VsleProcessEnvironment",
        "--host",
        "127.0.0.1",
        "--port",
        "20111",
        "--trainer-port",
        "8766",
        "System.Net.Sockets.TcpClient",
        "BridgeProcessId",
        "scratch_link_endpoint_ok",
        "scratch_link_protocol_ok",
        "scratch_link_discover_ok",
        "scratch_link_protocol_error",
        "trainer_endpoint_ok",
    ):
        assert expected in text

    export_line = next(
        line for line in text.splitlines() if line.startswith("Export-ModuleMember")
    )
    assert "Get-VsleWindowsDesktopBridgePlan" in export_line
    assert "Test-VsleScratchLinkProtocol" in export_line
    assert "Invoke-VsleWindowsDesktopBridgeVerification" in export_line


def test_phase_g_local_bridge_blocks_when_port_open_but_protocol_invalid():
    text = _read(ACTION_MODULE)

    assert "本地桥接端口打开，但 Scratch Link 协议不是 WeisileLink。" in text
    assert "端口被其他程序占用，或不是当前 VSLE WeisileLink runtime。" in text
    assert "这是内部 WebSocket 地址，不能直接在浏览器地址栏打开。" in text
    assert "$scratchProtocol.ProtocolOk" in text
    assert "$scratchProtocol.DiscoverOk" in text
    assert "$scratchOk -and $trainerOk -and $scratchProtocol.ProtocolOk -and $scratchProtocol.DiscoverOk" in text


def test_phase_g_wizard_wires_verify_local_bridge_step_to_real_action():
    script = _read(SCRIPT)

    for expected in (
        "Run-VsleVerifyLocalBridgeStep",
        "Invoke-VsleWindowsDesktopBridgeVerification",
        "Get-VsleEv3SetupInputFromWindow",
        "Get-VsleWindowsDesktopBridgePlan -Ev3SetupInput",
        'Id -eq "verify-local-bridge"',
        "正在启动并检查本地桥接。",
        "127.0.0.1:20111",
        "127.0.0.1:8766",
    ):
        assert expected in script


def test_phase_g_step_model_and_readme_describe_real_bridge_verification():
    setup = _read(SETUP_MODULE)
    readme = _read(README)

    assert 'Id = "verify-local-bridge"' in setup
    assert "真实启动或检测 WeisileLink Desktop supervisor" in setup
    assert "如果端口已经响应，继续验证 Scratch Link WebSocket 协议" in setup
    assert "WiFi Full VSLE 使用当前 EV3 地址直接启动 WeisileLink runtime" in setup
    assert "Bluetooth Full VSLE 使用 EV3 蓝牙地址直接启动 WeisileLink runtime" in setup
    assert "两个本机端口都通过后继续" in setup
    assert "getVersion 返回 WeisileLink 且 discover 返回 EV3 主机后继续" in setup

    assert "Phase G Local Bridge Verification" in readme
    normalized_readme = " ".join(readme.split())
    assert "starts or detects the WeisileLink local runtime" in normalized_readme
    assert "validates the Scratch Link WebSocket protocol" in normalized_readme
    assert "not a browser URL" in normalized_readme
    assert "WEISILE_TRANSPORT=wifi" in readme
    assert "WEISILE_TRANSPORT=vsle-bluetooth" in readme
    assert "127.0.0.1:20111" in readme
    assert "127.0.0.1:8766" in readme

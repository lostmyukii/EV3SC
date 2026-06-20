from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GUI_ROOT = ROOT / "scratch-ai-platform" / "scratch-editor" / "packages" / "scratch-gui" / "src"
VM_ROOT = ROOT / "scratch-ai-platform" / "scratch-editor" / "packages" / "scratch-vm" / "src"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_connection_modal_passes_ev3_diagnostics_to_scanning_step():
    container = _read(GUI_ROOT / "containers" / "scanning-step.jsx")
    component = _read(GUI_ROOT / "components" / "connection-modal" / "scanning-step.jsx")
    runtime = _read(VM_ROOT / "engine" / "runtime.js")

    assert "getPeripheralConnectionDiagnostic" in runtime
    assert "refreshConnectionDiagnostic" in container
    assert "this.props.vm.getPeripheralConnectionDiagnostic(this.props.extensionId)" in container
    assert "connectionDiagnostic={this.state.connectionDiagnostic}" in container
    assert "connectionDiagnostic" in component
    assert "ws://127.0.0.1:20111/scratch/bt" in component
    assert "这是内部 WebSocket 地址，不能直接在浏览器地址栏打开" in component
    assert "Link 未启动 / 20111 不可达" in component


def test_vsle_ev3_compat_diagnostics_are_exposed_through_extension_interface():
    compat = _read(VM_ROOT / "extensions" / "scratch3_vsle_ev3_compat" / "index.js")

    assert "getConnectionDiagnostic" in compat
    assert "linkUrl: DEFAULT_LINK_URL" in compat
    assert "status: 'not_connected'" in compat
    assert "status: 'searching'" in compat
    assert "status: 'discovered'" in compat
    assert "'sensor_streaming'" in compat
    assert "'sensor_stale'" in compat
    assert "status: 'origin_rejected'" in compat
    assert "status: 'link_unavailable'" in compat
    assert "status: 'not_found'" in compat
    assert "距上次传感器数据" in compat

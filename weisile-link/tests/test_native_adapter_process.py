import asyncio
import json
import stat
import subprocess
import sys
import textwrap
from pathlib import Path

from weisile_link.cli import WeisileLinkRuntimeConfig, build_server
from weisile_link.transport.native_adapter_process import NativeAdapterProcess
from weisile_link.transport.official_ev3_bt_transport import (
    OfficialEV3BluetoothTransport,
)


ROOT = Path(__file__).resolve().parents[2]


def _fake_adapter(path: Path) -> Path:
    path.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env python3
            import base64
            import json
            import sys

            for raw in sys.stdin:
                request = json.loads(raw)
                method = request["method"]
                if method == "connect":
                    result = {"address": request["params"]["address"]}
                elif method == "send":
                    payload = base64.b64decode(request["params"]["payload"])
                    result = {"bytesWritten": len(payload)}
                elif method == "recv":
                    result = {"payload": base64.b64encode(b"reply").decode("ascii")}
                elif method == "close":
                    result = {"closed": True}
                else:
                    print(json.dumps({
                        "id": request["id"],
                        "ok": False,
                        "error": "unknown method",
                    }), flush=True)
                    continue
                print(json.dumps({
                    "id": request["id"],
                    "ok": True,
                    "result": result,
                }), flush=True)
            """
        ),
        encoding="utf-8",
    )
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


def test_native_adapter_process_connect_send_recv_and_close(tmp_path):
    async def scenario():
        adapter = NativeAdapterProcess(
            _fake_adapter(tmp_path / "fake_adapter.py")
        )

        await adapter.connect("00:16:53:12:34:56")
        await adapter.send(b"\x01\x02\x03")
        assert await adapter.recv() == b"reply"
        await adapter.close()

    asyncio.run(scenario())


def test_native_adapter_process_maps_adapter_errors(tmp_path):
    failing = tmp_path / "failing_adapter.py"
    failing.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env python3
            import json
            import sys

            request = json.loads(sys.stdin.readline())
            print(json.dumps({
                "id": request["id"],
                "ok": False,
                "error": "pair EV3 in macOS Bluetooth settings first",
            }), flush=True)
            """
        ),
        encoding="utf-8",
    )
    failing.chmod(failing.stat().st_mode | stat.S_IXUSR)

    async def scenario():
        adapter = NativeAdapterProcess(failing)
        try:
            await adapter.connect("00:16:53:12:34:56")
        except ConnectionError as exc:
            assert "pair EV3" in str(exc)
        else:
            raise AssertionError("connect should surface native adapter errors")
        await adapter.close()

    asyncio.run(scenario())


def test_build_server_uses_native_process_adapter_from_env(
    monkeypatch, tmp_path
):
    adapter_path = _fake_adapter(tmp_path / "fake_adapter.py")
    monkeypatch.setenv("WEISILE_TRANSPORT", "official-bluetooth")
    monkeypatch.setenv("EV3_OFFICIAL_BT", "00:16:53:12:34:56")
    monkeypatch.setenv("WEISILE_OFFICIAL_BT_ADAPTER", str(adapter_path))

    config = WeisileLinkRuntimeConfig.from_env()
    server = build_server(config)

    assert isinstance(server.transport, OfficialEV3BluetoothTransport)
    assert server.transport.supported is True
    assert isinstance(server.transport.adapter, NativeAdapterProcess)
    assert server.transport.adapter.executable == adapter_path


def test_macos_native_adapter_source_passes_syntax_check():
    if sys.platform != "darwin":
        return

    result = subprocess.run(
        ["desktop/macos/native/build.sh", "--check"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr + result.stdout

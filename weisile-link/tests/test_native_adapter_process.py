import asyncio
import json
import re
import stat
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from weisile_link.cli import WeisileLinkRuntimeConfig, build_server
from weisile_link.transport.native_adapter_process import NativeAdapterProcess
from weisile_link.transport.official_ev3_bt_transport import (
    OfficialEV3BluetoothTransport,
)
from weisile_link.transport.selector import AutoTransport


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
                    reply = json.dumps(request["params"]).encode("utf-8")
                    result = {
                        "payload": base64.b64encode(reply).decode("ascii")
                    }
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


def make_fake_adapter(path: Path, responses) -> Path:
    path.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env python3
            import json
            import sys

            responses = {list(responses)!r}

            for index, raw in enumerate(sys.stdin):
                request = json.loads(raw)
                response = responses[index]
                response["id"] = request["id"]
                print(json.dumps(response), flush=True)
            """
        ),
        encoding="utf-8",
    )
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


def _fake_bundle_adapter(app_dir: Path) -> Path:
    macos_dir = app_dir / "Contents" / "MacOS"
    macos_dir.mkdir(parents=True)
    executable = macos_dir / "FakeAdapter"
    executable.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env python3
            import argparse
            import base64
            import json
            import socket

            parser = argparse.ArgumentParser()
            parser.add_argument("--host", required=True)
            parser.add_argument("--port", required=True, type=int)
            args = parser.parse_args()

            sock = socket.create_connection((args.host, args.port))
            with sock, sock.makefile("r", encoding="utf-8") as reader, sock.makefile(
                "w", encoding="utf-8"
            ) as writer:
                for raw in reader:
                    request = json.loads(raw)
                    method = request["method"]
                    if method == "connect":
                        result = {"address": request["params"]["address"]}
                    elif method == "status":
                        result = {
                            "connected": True,
                            "adapter_version": "fake-app-1",
                            "profile": "rfcomm",
                        }
                    elif method == "send":
                        payload = base64.b64decode(
                            request["params"]["payload"]
                        )
                        result = {"bytesWritten": len(payload)}
                    elif method == "recv":
                        result = {
                            "payload": base64.b64encode(b"reply").decode(
                                "ascii"
                            )
                        }
                    elif method == "close":
                        result = {"closed": True}
                    else:
                        print(json.dumps({
                            "id": request["id"],
                            "ok": False,
                            "error": "unknown method",
                        }), file=writer, flush=True)
                        continue
                    print(json.dumps({
                        "id": request["id"],
                        "ok": True,
                        "result": result,
                    }), file=writer, flush=True)
            """
        ),
        encoding="utf-8",
    )
    executable.chmod(executable.stat().st_mode | stat.S_IXUSR)
    return executable


def _fake_open_launcher(path: Path, app_executable_name: str) -> Path:
    path.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env python3
            import subprocess
            import sys
            from pathlib import Path

            args = sys.argv[1:]
            app_index = args.index("-nW") + 1
            app_dir = Path(args[app_index])
            pass_args = args[args.index("--args") + 1:]
            executable = app_dir / "Contents" / "MacOS" / "{app_executable_name}"
            raise SystemExit(subprocess.call([str(executable), *pass_args]))
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
        payload = json.loads((await adapter.recv()).decode("utf-8"))
        assert 0 < payload["timeout"] <= 0.1
        await adapter.close()

    asyncio.run(scenario())


def test_native_adapter_process_allows_custom_recv_timeout(tmp_path):
    async def scenario():
        adapter = NativeAdapterProcess(
            _fake_adapter(tmp_path / "fake_adapter.py"),
            recv_timeout_s=0.25,
        )

        await adapter.connect("00:16:53:12:34:56")
        payload = json.loads((await adapter.recv()).decode("utf-8"))

        assert payload["timeout"] == 0.25
        await adapter.close()

    asyncio.run(scenario())


def test_native_adapter_process_maps_recv_timeout_to_timeout_error(tmp_path):
    timeout_adapter = tmp_path / "timeout_adapter.py"
    timeout_adapter.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env python3
            import json
            import sys

            for raw in sys.stdin:
                request = json.loads(raw)
                if request["method"] == "recv":
                    print(json.dumps({
                        "id": request["id"],
                        "ok": False,
                        "error": "EV3 RFCOMM read timed out",
                    }), flush=True)
                    continue
                print(json.dumps({
                    "id": request["id"],
                    "ok": True,
                    "result": {},
                }), flush=True)
            """
        ),
        encoding="utf-8",
    )
    timeout_adapter.chmod(timeout_adapter.stat().st_mode | stat.S_IXUSR)

    async def scenario():
        adapter = NativeAdapterProcess(timeout_adapter)

        await adapter.connect("00:16:53:12:34:56")
        with pytest.raises(TimeoutError):
            await adapter.recv()
        await adapter.close()

    asyncio.run(scenario())


def test_native_adapter_process_launches_app_bundle_with_local_socket_bridge(
    tmp_path,
):
    async def scenario():
        executable = _fake_bundle_adapter(tmp_path / "FakeAdapter.app")
        launcher = _fake_open_launcher(tmp_path / "open.py", executable.name)
        adapter = NativeAdapterProcess(
            executable,
            platform_name="Darwin",
            open_executable=launcher,
        )

        await adapter.connect("A0:E6:F8:19:58:3C")
        status = await adapter.status()
        await adapter.send(b"\x01\x02\x03")

        assert status.connected is True
        assert status.adapter_version == "fake-app-1"
        assert await adapter.recv() == b"reply"
        assert adapter.uses_app_bundle_launcher is True
        await adapter.close()

    asyncio.run(scenario())


def test_native_adapter_process_connect_accepts_channel_and_reports_status(
    tmp_path,
):
    async def scenario():
        script = make_fake_adapter(
            tmp_path / "status_adapter.py",
            [
                {"ok": True, "result": {"connected": True}},
                {
                    "ok": True,
                    "result": {
                        "connected": True,
                        "adapter_version": "fake-1",
                        "profile": "rfcomm",
                    },
                },
            ],
        )
        adapter = NativeAdapterProcess(script)

        await adapter.connect(
            "00:16:53:AA:BB:CC",
            channel=1,
            profile="rfcomm",
        )
        status = await adapter.status()

        assert status.connected is True
        assert status.adapter_version == "fake-1"
        assert status.profile == "rfcomm"
        assert adapter.executable == script
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


def test_build_server_uses_native_process_adapter_for_vsle_bluetooth(
    monkeypatch,
    tmp_path,
):
    adapter_path = _fake_adapter(tmp_path / "fake_vsle_adapter.py")
    monkeypatch.setenv("WEISILE_TRANSPORT", "vsle-bluetooth")
    monkeypatch.setenv("EV3_BT", "00:16:53:AA:BB:CC")
    monkeypatch.setenv("WEISILE_VSLE_BT_ADAPTER", str(adapter_path))
    monkeypatch.setenv("WEISILE_PAIRING_TOKEN", "secret-token")

    from weisile_link.transport.bluetooth_transport import (
        VSLEBluetoothTransport,
    )

    config = WeisileLinkRuntimeConfig.from_env()
    server = build_server(config)

    assert isinstance(server.transport, AutoTransport)
    assert isinstance(
        server.transport.bluetooth_transport,
        VSLEBluetoothTransport,
    )
    assert server.transport.bluetooth_transport._native_adapter is not None
    assert (
        server.transport.bluetooth_transport._native_adapter.executable
        == adapter_path
    )
    assert server.transport.bluetooth_transport._pairing_token == "secret-token"


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


def test_macos_native_adapter_supports_shared_status_command():
    source = (
        ROOT / "desktop/macos/native/WeisileEV3BluetoothAdapter.m"
    ).read_text(encoding="utf-8")

    assert "- (NSDictionary *)status:" in source
    assert 'isEqualToString:@"status"' in source
    assert '"adapter_version"' in source
    assert '"profile"' in source
    assert '"--host"' in source
    assert '"--port"' in source


def test_macos_native_adapter_recv_poll_interval_is_low_latency():
    source = (
        ROOT / "desktop/macos/native/WeisileEV3BluetoothAdapter.m"
    ).read_text(encoding="utf-8")

    assert "kRFCOMMFramePollIntervalSeconds" in source
    assert "0.005" in source
    assert re.search(
        r"dateWithTimeIntervalSinceNow:\s*kRFCOMMFramePollIntervalSeconds",
        source,
    )
    assert "dateWithTimeIntervalSinceNow:0.05" not in source


def test_macos_native_adapter_embeds_bluetooth_usage_description():
    if sys.platform != "darwin":
        return

    result = subprocess.run(
        ["desktop/macos/native/build.sh"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr + result.stdout
    binary = Path(result.stdout.strip())
    assert binary.is_file()
    assert ".app/Contents/MacOS" in str(binary)
    app_bundle = next(
        parent for parent in binary.parents if parent.suffix == ".app"
    )
    info_plist = app_bundle / "Contents" / "Info.plist"
    assert info_plist.is_file()
    assert "NSBluetoothAlwaysUsageDescription" in info_plist.read_text(
        encoding="utf-8"
    )
    strings = subprocess.run(
        ["strings", str(binary)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert strings.returncode == 0, strings.stderr + strings.stdout
    assert "NSBluetoothAlwaysUsageDescription" in strings.stdout
    assert "NSBluetoothPeripheralUsageDescription" in strings.stdout
    assert "official-firmware EV3 Bluetooth" in strings.stdout

    signature = subprocess.run(
        ["codesign", "-dv", "--verbose=4", str(binary)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    signature_output = signature.stderr + signature.stdout
    assert signature.returncode == 0, signature_output
    assert "Info.plist=not bound" not in signature_output
    assert "Info.plist entries=" in signature_output

    bundle_signature = subprocess.run(
        ["codesign", "-dv", "--verbose=4", str(app_bundle)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    bundle_signature_output = bundle_signature.stderr + bundle_signature.stdout
    assert bundle_signature.returncode == 0, bundle_signature_output
    assert "Identifier=cn.vsle.weisile-link.native-adapter" in (
        bundle_signature_output
    )

    verify = subprocess.run(
        ["codesign", "--verify", "--deep", "--verbose=4", str(app_bundle)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    verify_output = verify.stderr + verify.stdout
    assert verify.returncode == 0, verify_output

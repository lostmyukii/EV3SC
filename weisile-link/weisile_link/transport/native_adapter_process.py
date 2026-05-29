"""Process-backed native Bluetooth adapter for official EV3 firmware.

The native macOS/Windows code owns OS Bluetooth APIs. Python communicates with
that executable over newline-delimited JSON so the Scratch-facing service stays
portable and testable.
"""

from __future__ import annotations

import asyncio
import base64
import json
import platform
from pathlib import Path
from typing import Any, Dict, Optional

from weisile_link.transport.native_byte_stream import NativeByteStreamStatus


class NativeAdapterProcess:
    """JSON-line subprocess adapter implementing the native BT protocol."""

    def __init__(
        self,
        executable: Path,
        *,
        request_timeout_s: float = 10.0,
        recv_timeout_s: float = 0.1,
        platform_name: Optional[str] = None,
        open_executable: Path = Path("/usr/bin/open"),
        launch_app_bundles: Optional[bool] = None,
    ) -> None:
        self.executable = Path(executable)
        self.request_timeout_s = request_timeout_s
        self.recv_timeout_s = recv_timeout_s
        self.platform_name = platform_name or platform.system()
        self.open_executable = Path(open_executable)
        self._process: Optional[asyncio.subprocess.Process] = None
        self._request_id = 0
        self._lock: Optional[asyncio.Lock] = None
        self._stderr_task: Optional[asyncio.Task] = None
        self._stream_reader: Optional[asyncio.StreamReader] = None
        self._stream_writer: Optional[asyncio.StreamWriter] = None
        self._server: Optional[asyncio.AbstractServer] = None
        self._app_bundle = self._find_app_bundle(self.executable)
        self._use_app_bundle_launcher = (
            launch_app_bundles
            if launch_app_bundles is not None
            else self.platform_name == "Darwin" and self._app_bundle is not None
        )

    @property
    def uses_app_bundle_launcher(self) -> bool:
        """Whether requests are bridged through a LaunchServices app run."""
        return bool(self._use_app_bundle_launcher)

    async def connect(
        self,
        address: str,
        *,
        channel: int = 1,
        profile: str = "rfcomm",
    ) -> None:
        """Start the native process and open a Bluetooth connection."""
        await self._ensure_process()
        await self._request(
            "connect",
            {
                "address": address,
                "channel": channel,
                "profile": profile,
            },
        )

    async def send(self, payload: bytes) -> None:
        """Send one EV3 Direct Command frame."""
        await self._request(
            "send",
            {"payload": base64.b64encode(payload).decode("ascii")},
        )

    async def recv(self) -> bytes:
        """Read one EV3 reply frame from the native adapter."""
        try:
            result = await self._request(
                "recv",
                {"timeout": self.recv_timeout_s},
            )
        except ConnectionError as exc:
            if "read timed out" in str(exc):
                raise TimeoutError("native adapter recv timed out") from exc
            raise
        payload = str(result.get("payload", ""))
        return base64.b64decode(payload)

    async def status(self) -> NativeByteStreamStatus:
        """Return connection details reported by the native adapter."""
        result = await self._request("status", {})
        last_error = result.get("last_error")
        return NativeByteStreamStatus(
            connected=bool(result.get("connected")),
            adapter_version=str(result.get("adapter_version", "")),
            profile=str(result.get("profile", "")),
            last_error=str(last_error) if last_error is not None else None,
        )

    async def close(self) -> None:
        """Close the native connection and stop the adapter process."""
        process = self._process
        if process is None:
            await self._cleanup_stream_bridge()
            return
        if process.returncode is None:
            try:
                await self._request("close", {})
            except Exception:
                pass
            if process.returncode is None:
                try:
                    process.terminate()
                except ProcessLookupError:
                    pass
            try:
                await asyncio.wait_for(process.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
        self._process = None
        if self._stderr_task is not None:
            self._stderr_task.cancel()
            try:
                await self._stderr_task
            except asyncio.CancelledError:
                pass
            self._stderr_task = None
        self._lock = None
        await self._cleanup_stream_bridge()

    async def _ensure_process(self) -> None:
        if self._process is not None and self._process.returncode is None:
            return
        if not self.executable.is_file():
            raise FileNotFoundError(
                f"native adapter not found: {self.executable}"
            )
        if self._use_app_bundle_launcher:
            await self._ensure_app_bundle_process()
            return

        self._process = await asyncio.create_subprocess_exec(
            str(self.executable),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._stderr_task = asyncio.create_task(
            self._drain_stderr(self._process)
        )

    async def _ensure_app_bundle_process(self) -> None:
        if self._app_bundle is None:
            raise FileNotFoundError(
                f"native adapter app bundle not found: {self.executable}"
            )
        if not self.open_executable.is_file():
            raise FileNotFoundError(
                f"native adapter app launcher not found: {self.open_executable}"
            )

        loop = asyncio.get_running_loop()
        accepted = loop.create_future()

        async def accept_once(
            reader: asyncio.StreamReader,
            writer: asyncio.StreamWriter,
        ) -> None:
            if not accepted.done():
                accepted.set_result((reader, writer))
            else:
                writer.close()
                await writer.wait_closed()

        self._server = await asyncio.start_server(
            accept_once,
            host="127.0.0.1",
            port=0,
        )
        assert self._server.sockets is not None
        bridge_port = self._server.sockets[0].getsockname()[1]

        self._process = await asyncio.create_subprocess_exec(
            str(self.open_executable),
            "-nW",
            str(self._app_bundle),
            "--args",
            "--host",
            "127.0.0.1",
            "--port",
            str(bridge_port),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )

        try:
            self._stream_reader, self._stream_writer = await asyncio.wait_for(
                accepted,
                timeout=self.request_timeout_s,
            )
            self._server.close()
            await self._server.wait_closed()
            self._server = None
        except Exception:
            await self._terminate_process()
            await self._cleanup_stream_bridge()
            raise

    async def _request(
        self, method: str, params: Dict[str, Any]
    ) -> Dict[str, Any]:
        await self._ensure_process()
        assert self._process is not None

        if self._lock is None:
            self._lock = asyncio.Lock()

        async with self._lock:
            self._request_id += 1
            request_id = self._request_id
            request = {
                "id": request_id,
                "method": method,
                "params": params,
            }
            await self._write_request_line(
                (json.dumps(request, separators=(",", ":")) + "\n").encode(
                    "utf-8",
                )
            )
            raw = await asyncio.wait_for(
                self._read_response_line(),
                timeout=self.request_timeout_s,
            )
            if not raw:
                raise ConnectionError("native adapter exited without response")
            response = json.loads(raw.decode("utf-8"))
            if response.get("id") != request_id:
                raise ConnectionError("native adapter response id mismatch")
            if response.get("ok") is not True:
                raise ConnectionError(
                    str(response.get("error", "adapter error"))
                )
            result = response.get("result", {})
            if not isinstance(result, dict):
                return {}
            return result

    async def _drain_stderr(self, process: asyncio.subprocess.Process) -> None:
        if process.stderr is None:
            return
        try:
            while await process.stderr.readline():
                pass
        except asyncio.CancelledError:
            pass

    async def _write_request_line(self, payload: bytes) -> None:
        if self._stream_writer is not None:
            self._stream_writer.write(payload)
            await self._stream_writer.drain()
            return

        assert self._process is not None
        assert self._process.stdin is not None
        self._process.stdin.write(payload)
        await self._process.stdin.drain()

    async def _read_response_line(self) -> bytes:
        if self._stream_reader is not None:
            return await self._stream_reader.readline()

        assert self._process is not None
        assert self._process.stdout is not None
        return await self._process.stdout.readline()

    async def _terminate_process(self) -> None:
        process = self._process
        if process is None:
            return
        if process.returncode is None:
            try:
                process.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(process.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
        self._process = None
        if self._stderr_task is not None:
            self._stderr_task.cancel()
            try:
                await self._stderr_task
            except asyncio.CancelledError:
                pass
            self._stderr_task = None

    async def _cleanup_stream_bridge(self) -> None:
        if self._stream_writer is not None:
            self._stream_writer.close()
            try:
                await self._stream_writer.wait_closed()
            except Exception:
                pass
            self._stream_writer = None
        self._stream_reader = None
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    def _find_app_bundle(self, executable: Path) -> Optional[Path]:
        for parent in (executable, *executable.parents):
            if parent.suffix == ".app":
                return parent
        return None

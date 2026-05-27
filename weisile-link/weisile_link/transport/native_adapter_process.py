"""Process-backed native Bluetooth adapter for official EV3 firmware.

The native macOS/Windows code owns OS Bluetooth APIs. Python communicates with
that executable over newline-delimited JSON so the Scratch-facing service stays
portable and testable.
"""

from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path
from typing import Any, Dict, Optional


class NativeAdapterProcess:
    """JSON-line subprocess adapter implementing the native BT protocol."""

    def __init__(
        self,
        executable: Path,
        *,
        request_timeout_s: float = 10.0,
    ) -> None:
        self.executable = Path(executable)
        self.request_timeout_s = request_timeout_s
        self._process: Optional[asyncio.subprocess.Process] = None
        self._request_id = 0
        self._lock: Optional[asyncio.Lock] = None
        self._stderr_task: Optional[asyncio.Task] = None

    async def connect(self, address: str) -> None:
        """Start the native process and open a Bluetooth connection."""
        await self._ensure_process()
        await self._request("connect", {"address": address})

    async def send(self, payload: bytes) -> None:
        """Send one EV3 Direct Command frame."""
        await self._request(
            "send",
            {"payload": base64.b64encode(payload).decode("ascii")},
        )

    async def recv(self) -> bytes:
        """Read one EV3 reply frame from the native adapter."""
        result = await self._request("recv", {})
        payload = str(result.get("payload", ""))
        return base64.b64decode(payload)

    async def close(self) -> None:
        """Close the native connection and stop the adapter process."""
        process = self._process
        if process is None:
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
            self._stderr_task = None
        self._lock = None

    async def _ensure_process(self) -> None:
        if self._process is not None and self._process.returncode is None:
            return
        if not self.executable.is_file():
            raise FileNotFoundError(
                f"native adapter not found: {self.executable}"
            )

        self._process = await asyncio.create_subprocess_exec(
            str(self.executable),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._stderr_task = asyncio.create_task(
            self._drain_stderr(self._process)
        )

    async def _request(
        self, method: str, params: Dict[str, Any]
    ) -> Dict[str, Any]:
        await self._ensure_process()
        assert self._process is not None
        assert self._process.stdin is not None
        assert self._process.stdout is not None

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
            self._process.stdin.write(
                (json.dumps(request, separators=(",", ":")) + "\n").encode(
                    "utf-8"
                )
            )
            await self._process.stdin.drain()
            raw = await asyncio.wait_for(
                self._process.stdout.readline(),
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

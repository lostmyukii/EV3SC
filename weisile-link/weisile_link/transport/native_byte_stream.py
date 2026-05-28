"""Shared native Bluetooth Classic byte-stream boundary."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass(frozen=True)
class NativeByteStreamStatus:
    connected: bool
    adapter_version: str = ""
    profile: str = ""
    last_error: Optional[str] = None


class NativeByteStreamAdapter(Protocol):
    async def connect(
        self,
        address: str,
        *,
        channel: int = 1,
        profile: str = "rfcomm",
    ) -> None:
        """Open an OS-native Bluetooth Classic byte stream."""

    async def send(self, payload: bytes) -> None:
        """Write raw bytes to the native connection."""

    async def recv(self) -> bytes:
        """Read raw bytes from the native connection."""

    async def status(self) -> NativeByteStreamStatus:
        """Return native adapter connection details."""

    async def close(self) -> None:
        """Close the native connection."""

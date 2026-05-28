"""WiFi-first transport selector with Bluetooth fallback."""

from typing import Any, Optional

from weisile_link.runtime.degradation import DegradationManager, TransportKind


FULL_BLUETOOTH_NAMES = {"bluetooth", "vsle-bluetooth", "vsle_bluetooth"}


def _normalize_transport_name(transport: str) -> str:
    """Return the product-facing transport name for selector decisions."""
    normalized = str(transport).strip().lower().replace("_", "-")
    if normalized in {name.replace("_", "-") for name in FULL_BLUETOOTH_NAMES}:
        return "vsle-bluetooth"
    if normalized in {"wifi", "auto"}:
        return normalized
    raise ConnectionError(f"Unsupported EV3 transport: {transport}")


class AutoTransport:
    """Select WiFi first and fall back to Bluetooth when allowed."""

    def __init__(
        self,
        wifi_transport: Any,
        bluetooth_transport: Optional[Any],
        *,
        manager: Optional[DegradationManager] = None,
        preferred: str = "wifi",
    ) -> None:
        self.wifi_transport = wifi_transport
        self.bluetooth_transport = bluetooth_transport
        self.manager = manager or getattr(
            wifi_transport,
            "manager",
            DegradationManager(),
        )
        self.preferred = _normalize_transport_name(preferred)
        self._active_transport: Optional[Any] = None
        self._sensor_callback = None

    @property
    def active_transport_name(self) -> Optional[str]:
        """Return the active transport name for status and JSON-RPC replies."""
        if (
            self._active_transport is not None
            and self.manager.connection_state.transport_label
        ):
            return self.manager.connection_state.transport_label
        if self._active_transport is self.wifi_transport:
            return "wifi"
        if self._active_transport is self.bluetooth_transport:
            return "vsle-bluetooth"
        return None

    @property
    def connected(self) -> bool:
        """Whether any selected transport is currently connected."""
        return (
            self._active_transport is not None
            and self.manager.connection_state.connected
        )

    async def connect(self, on_sensor_data) -> bool:
        """Connect using the preferred transport and Section 16 fallback."""
        self._sensor_callback = on_sensor_data
        for name in self._connect_order():
            if await self._connect_named(name, on_sensor_data):
                return True
        self._active_transport = None
        return False

    async def set_transport(
        self,
        transport: str,
        on_sensor_data,
        **config: Any,
    ) -> dict:
        """Explicitly switch WiFi/Bluetooth from `vsle.setTransport`."""
        original = str(transport).strip().lower().replace("_", "-")
        normalized = _normalize_transport_name(transport)
        self._configure_endpoints(config)

        if self._active_transport is not None:
            await self._disconnect_transport(self._active_transport)
            self._active_transport = None

        if normalized == "auto":
            self.preferred = "wifi"
            if not await self.connect(on_sensor_data):
                raise ConnectionError("No active BT/WiFi transport")
            return self._transport_result(self.active_transport_name)

        target = normalized
        if not await self._connect_named(target, on_sensor_data):
            raise ConnectionError(f"EV3 {target} transport is disconnected")
        self.preferred = target
        return self._transport_result(target, original=original)

    async def send_command(self, command: dict) -> dict:
        """Send through the currently active transport."""
        if self._active_transport is None:
            raise ConnectionError("No active BT/WiFi transport")
        return await self._active_transport.send_command(command)

    async def disconnect(self) -> None:
        """Disconnect both transports so fallback state is clean."""
        for transport in (self.wifi_transport, self.bluetooth_transport):
            if transport is not None:
                await self._disconnect_transport(transport)
        self._active_transport = None

    def _connect_order(self) -> tuple:
        if self.preferred == "vsle-bluetooth":
            return ("vsle-bluetooth", "wifi")
        return ("wifi", "vsle-bluetooth")

    async def _connect_named(self, name: str, on_sensor_data) -> bool:
        transport = self._transport_for(name)
        if transport is None:
            return False
        if name == "vsle-bluetooth" and not self.manager.bluetooth_supported:
            supported = bool(getattr(transport, "supported", False))
            self.manager.bluetooth_supported = supported
            if not supported:
                return False

        connected = await transport.connect(on_sensor_data)
        if connected:
            self._active_transport = transport
            self.manager.record_reconnected(
                self._transport_kind_for(name),
                label=name,
                capability="full",
            )
        return connected

    def _transport_for(self, name: str):
        if name == "wifi":
            return self.wifi_transport
        if name == "vsle-bluetooth":
            return self.bluetooth_transport
        return None

    def _transport_kind_for(self, name: str) -> TransportKind:
        if name == "wifi":
            return TransportKind.WIFI
        return TransportKind.BLUETOOTH

    def _transport_result(
        self,
        name: Optional[str],
        *,
        original: Optional[str] = None,
    ) -> dict:
        result = {
            "transport": name,
            "transport_capability": (
                self.manager.connection_state.transport_capability
            ),
        }
        if original == "bluetooth" and name == "vsle-bluetooth":
            result["transport_alias"] = "bluetooth"
        return result

    def _configure_endpoints(self, config: dict) -> None:
        if not config:
            return
        for transport in (self.wifi_transport, self.bluetooth_transport):
            configure = getattr(transport, "configure_endpoint", None)
            if configure is not None:
                configure(**config)

    async def _disconnect_transport(self, transport: Any) -> None:
        disconnect = getattr(transport, "disconnect", None)
        if disconnect is not None:
            await disconnect()

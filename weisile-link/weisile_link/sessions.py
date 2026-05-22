"""Multi-EV3 session management for WeisileLink.

Sources:
- VSLE spec Phase 2 requires 2 simultaneous EV3 bricks without
  cross-contamination.
- VSLE spec Section 5.6 identifies WiFi as the multi-device transport path.
- Scratch Link discovery/connect uses `peripheralId` to select devices.
"""

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Optional

from weisile_link.router.sensor_router import (
    SensorDataRouter,
    SensorStreamBuffer,
)
from weisile_link.runtime.degradation import DegradationManager

SensorCallback = Callable[[str, Dict[str, Any]], Awaitable[None]]


@dataclass
class EV3Session:
    """Runtime state for one EV3 brick session."""

    brick_id: str
    name: str
    transport: Any
    manager: DegradationManager
    router: SensorDataRouter

    @classmethod
    def create(
        cls,
        brick_id: str,
        name: str,
        transport: Any,
        *,
        manager: Optional[DegradationManager] = None,
    ) -> "EV3Session":
        """Create a session with its own router and bounded Trainer buffer."""
        session_manager = manager or getattr(
            transport,
            "manager",
            DegradationManager(),
        )
        buffer = SensorStreamBuffer(
            max_points=session_manager.max_collected_points,
            manager=session_manager,
        )
        return cls(
            brick_id=brick_id,
            name=name,
            transport=transport,
            manager=session_manager,
            router=SensorDataRouter(buffer=buffer),
        )

    async def connect(self, on_sensor_data: SensorCallback) -> bool:
        """Connect this brick and bind sensor callbacks to its session ID."""

        async def route_to_session(payload: Dict[str, Any]) -> None:
            await on_sensor_data(self.brick_id, payload)

        return await self.transport.connect(route_to_session)

    async def set_transport(
        self,
        transport_name: str,
        on_sensor_data: SensorCallback,
        **config: Any,
    ) -> Dict[str, Any]:
        """Switch this brick transport while preserving session identity."""
        set_transport = getattr(self.transport, "set_transport", None)
        if set_transport is None:
            configure = getattr(self.transport, "configure_endpoint", None)
            if configure is not None:
                configure(**config)
            active_transport = getattr(
                self.transport,
                "active_transport_name",
                "wifi",
            )
            if transport_name != active_transport:
                raise ConnectionError(
                    f"EV3 {transport_name} transport is disconnected"
                )

            async def route_to_session(payload: Dict[str, Any]) -> None:
                await on_sensor_data(self.brick_id, payload)

            disconnect = getattr(self.transport, "disconnect", None)
            if disconnect is not None:
                result = disconnect()
                if hasattr(result, "__await__"):
                    await result
            connected = await self.transport.connect(route_to_session)
            if not connected:
                raise ConnectionError(
                    f"EV3 {transport_name} transport is disconnected"
                )
            return {"transport": active_transport}

        async def route_to_session(payload: Dict[str, Any]) -> None:
            await on_sensor_data(self.brick_id, payload)

        result = set_transport(transport_name, route_to_session, **config)
        if hasattr(result, "__await__"):
            result = await result
        return result

    async def send_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """Send one command to this session's active transport."""
        payload = dict(command)
        payload["peripheralId"] = self.brick_id
        return await self.transport.send_command(payload)

    async def disconnect(self) -> None:
        """Disconnect this session's transport if it exposes disconnect."""
        disconnect = getattr(self.transport, "disconnect", None)
        if disconnect is None:
            return
        result = disconnect()
        if hasattr(result, "__await__"):
            await result

    async def route_sensor_data(self, sensor_data: Dict[str, Any]) -> None:
        """Attach brick identity and broadcast through the session router."""
        payload = dict(sensor_data)
        payload["brick_id"] = self.brick_id
        payload["brick_name"] = self.name
        await self.router.broadcast(payload)

    def peripheral_payload(self) -> Dict[str, Any]:
        """Return Scratch Link-compatible discovery metadata."""
        return {
            "peripheralId": self.brick_id,
            "name": self.name,
            "rssi": 0,
        }

    def status_payload(self) -> Dict[str, Any]:
        """Return per-session status for `/api/status`."""
        active_transport = self.manager.connection_state.active_transport
        return {
            "brick_id": self.brick_id,
            "name": self.name,
            "connected": self.manager.connection_state.connected,
            "transport": active_transport.value if active_transport else None,
            "scratch_clients": self.router.consumer_count("scratch"),
            "trainer_clients": self.router.consumer_count("trainer"),
            "collected_points": self.manager.collected_points,
        }


class EV3SessionManager:
    """Own all EV3 sessions and provide deterministic default routing."""

    def __init__(self) -> None:
        self._sessions: Dict[str, EV3Session] = {}
        self._default_brick_id: Optional[str] = None

    def add_session(
        self,
        brick_id: str,
        name: str,
        transport: Any,
        *,
        manager: Optional[DegradationManager] = None,
    ) -> EV3Session:
        """Register one EV3 brick session."""
        if not brick_id:
            raise ValueError("brick_id is required")
        session = EV3Session.create(
            brick_id,
            name,
            transport,
            manager=manager,
        )
        self._sessions[brick_id] = session
        if self._default_brick_id is None:
            self._default_brick_id = brick_id
        return session

    @property
    def default_brick_id(self) -> str:
        """Return the default session ID."""
        if self._default_brick_id is None:
            raise KeyError("No EV3 sessions are configured")
        return self._default_brick_id

    @property
    def default_session(self) -> EV3Session:
        """Return the default EV3 session."""
        return self.require_session(self.default_brick_id)

    def require_session(self, brick_id: Optional[str]) -> EV3Session:
        """Return a session or raise KeyError for unknown IDs."""
        normalized = brick_id or self.default_brick_id
        session = self._sessions.get(normalized)
        if session is None:
            raise KeyError(normalized)
        return session

    def all_sessions(self) -> List[EV3Session]:
        """Return sessions in registration order."""
        return list(self._sessions.values())

    def peripheral_payloads(self) -> List[Dict[str, Any]]:
        """Return all Scratch discovery payloads."""
        return [session.peripheral_payload() for session in self.all_sessions()]

    def status_payloads(self) -> List[Dict[str, Any]]:
        """Return all per-session status payloads."""
        return [session.status_payload() for session in self.all_sessions()]

"""Local preview backend for the VSLE EV3 frontend shell."""

import asyncio
import math
import os
import pathlib
import sys
import time
from typing import Any, Dict, Optional

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "weisile-link"))

from weisile_link.json_rpc_server import (  # noqa: E402
    ScratchJsonRpcServer,
    ScratchServerConfig,
)
from weisile_link.runtime.degradation import (  # noqa: E402
    DegradationManager,
    TransportKind,
)
from weisile_link.sessions import EV3SessionManager  # noqa: E402


SENSOR_INTERVAL_SECONDS = 0.02
DEFAULT_PREVIEW_EV3_COUNT = 1
MAX_PREVIEW_EV3_COUNT = 30


class PreviewTransport:
    """Simulated EV3 transport that keeps the real WeisileLink server in use."""

    def __init__(self, *, brick_id: str, brick_name: str) -> None:
        self.brick_id = brick_id
        self.brick_name = brick_name
        self.manager = DegradationManager()
        self.active_transport_name = "preview"
        self.connected = False
        self.collecting = False
        self.label = ""
        self.collected_points = 0
        self._sensor_callback = None

    async def connect(self, on_sensor_data: Any) -> bool:
        self._sensor_callback = on_sensor_data
        self.connected = True
        self.manager.record_reconnected(TransportKind.WIFI)
        return True

    async def disconnect(self) -> None:
        self.connected = False

    async def set_transport(
        self,
        transport: str,
        on_sensor_data: Any,
        **config: Any,
    ) -> Dict[str, Any]:
        self.active_transport_name = str(transport or "wifi").lower()
        await self.connect(on_sensor_data)
        return {"transport": self.active_transport_name, "preview": True, **config}

    async def send_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        method = command.get("method")
        params = command.get("params", {})
        if method == "data.startCollect":
            self.collecting = True
            self.label = str(params.get("label", "preview"))
        elif method == "data.stopCollect":
            self.collecting = False
        elif method == "data.addPoint":
            self.collected_points += 1
            self.label = str(params.get("label", self.label))
        elif method == "data.clear":
            self.collecting = False
            self.collected_points = 0
        elif method == "system.stopAll":
            self.collecting = False
        return {
            "type": "ack",
            "id": command.get("id"),
            "ok": True,
            "method": method,
            "preview": True,
        }


def _preview_brick_id(index: int) -> str:
    if index == 1:
        return "vsle-ev3-wifi"
    return f"vsle-ev3-wifi-{index:02d}"


def _preview_brick_name(index: int) -> str:
    if index == 1:
        return "VSLE EV3 Preview"
    return f"VSLE EV3 Preview {index:02d}"


def _preview_ev3_count_from_env() -> int:
    raw_count = os.getenv("PREVIEW_EV3_COUNT", str(DEFAULT_PREVIEW_EV3_COUNT))
    try:
        count = int(raw_count)
    except ValueError:
        count = DEFAULT_PREVIEW_EV3_COUNT
    return max(1, min(MAX_PREVIEW_EV3_COUNT, count))


def _sensor_payload(
    transport: PreviewTransport,
    *,
    tick: int,
    offset: int,
) -> Dict[str, Any]:
    shifted = tick + offset
    if transport.collecting and shifted % 2 == 0:
        transport.collected_points += 1
    return {
        "type": "sensor_update",
        "timestamp": time.time(),
        "sensors": {
            "S1": {
                "type": "color",
                "reflected": 35 + int(20 * abs(math.sin(shifted / 14))),
                "ambient": 12,
                "color": 3,
            },
            "S2": {
                "type": "ultrasonic",
                "distance_cm": round(18 + 8 * math.sin(shifted / 8), 1),
            },
            "S3": {
                "type": "gyro",
                "angle": int(30 * math.sin(shifted / 20)),
                "rate": int(6 * math.cos(shifted / 20)),
            },
            "S4": {
                "type": "touch",
                "pressed": shifted % 30 > 22,
            },
        },
        "motors": {
            "A": {
                "position": shifted * 8,
                "speed": 35 if transport.collecting else 0,
                "running": transport.collecting,
            },
            "B": {
                "position": -shifted * 7,
                "speed": 32 if transport.collecting else 0,
                "running": transport.collecting,
            },
        },
        "system": {
            "battery_pct": 87,
            "battery_v": 7.8,
            "collecting": transport.collecting,
            "collect_label": transport.label,
            "collected_points": transport.collected_points,
            "buttons": {
                "up": False,
                "down": False,
                "left": False,
                "right": False,
                "center": False,
            },
        },
    }


def build_preview_server(
    *,
    host: str,
    link_port: int,
    trainer_port: int,
    preview_ev3_count: int = DEFAULT_PREVIEW_EV3_COUNT,
) -> ScratchJsonRpcServer:
    """Build a preview server with one simulated transport per EV3 session."""
    session_manager = EV3SessionManager()
    first_transport: Optional[PreviewTransport] = None
    first_manager: Optional[DegradationManager] = None
    count = max(1, min(MAX_PREVIEW_EV3_COUNT, int(preview_ev3_count)))
    for index in range(1, count + 1):
        transport = PreviewTransport(
            brick_id=_preview_brick_id(index),
            brick_name=_preview_brick_name(index),
        )
        session_manager.add_session(
            transport.brick_id,
            transport.brick_name,
            transport,
            manager=transport.manager,
        )
        if first_transport is None:
            first_transport = transport
            first_manager = transport.manager
    if first_transport is None:
        raise RuntimeError("Preview server requires at least one EV3 session")
    return ScratchJsonRpcServer(
        first_transport,
        manager=first_manager,
        config=ScratchServerConfig(
            host=host,
            port=link_port,
            trainer_host=host,
            trainer_port=trainer_port,
        ),
        session_manager=session_manager,
    )


async def sensor_loop(server: ScratchJsonRpcServer) -> None:
    tick = 0
    next_tick = time.monotonic()
    while True:
        sessions = [
            session
            for session in server.sessions.all_sessions()
            if _preview_session_is_active(session)
        ]
        if not sessions:
            sessions = server.sessions.all_sessions()[:1]
        for offset, session in enumerate(sessions):
            transport = session.transport
            await server.handle_session_sensor_data(
                session.brick_id,
                _sensor_payload(
                    transport,
                    tick=tick,
                    offset=offset * 7,
                ),
            )
        tick += 1
        next_tick += SENSOR_INTERVAL_SECONDS
        sleep_for = next_tick - time.monotonic()
        if sleep_for <= 0:
            next_tick = time.monotonic()
            sleep_for = 0.0
        await asyncio.sleep(sleep_for)


def _preview_session_is_active(session: Any) -> bool:
    transport = session.transport
    return (
        session.router.consumer_count("scratch") > 0
        or session.router.consumer_count("trainer") > 0
        or getattr(transport, "collecting", False) is True
    )


async def main() -> None:
    host = os.getenv("WEISILE_LINK_HOST", "127.0.0.1")
    link_port = int(os.getenv("WEISILE_LINK_PORT", "20111"))
    trainer_port = int(os.getenv("TRAINER_WS_PORT", "8766"))
    server = build_preview_server(
        host=host,
        link_port=link_port,
        trainer_port=trainer_port,
        preview_ev3_count=_preview_ev3_count_from_env(),
    )
    for session in server.sessions.all_sessions():
        await session.transport.connect(server.handle_session_sensor_data)
    print(f"VSLE preview backend: ws://{host}:{link_port}/scratch/bt")
    print(f"VSLE preview trainer: ws://{host}:{trainer_port}")
    print(f"VSLE preview simulated EV3s: {len(server.sessions.all_sessions())}")
    await asyncio.gather(
        server.run(),
        server.run_trainer(),
        sensor_loop(server),
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

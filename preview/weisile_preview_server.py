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


class PreviewTransport:
    """Simulated EV3 transport that keeps the real WeisileLink server in use."""

    def __init__(self) -> None:
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


async def sensor_loop(
    server: ScratchJsonRpcServer,
    transport: PreviewTransport,
) -> None:
    tick = 0
    while True:
        now = time.time()
        if transport.collecting and tick % 2 == 0:
            transport.collected_points += 1
        await server.handle_sensor_data(
            {
                "type": "sensor_update",
                "timestamp": now,
                "brick_id": "preview-ev3",
                "brick_name": "VSLE EV3 Preview",
                "sensors": {
                    "S1": {
                        "type": "color",
                        "reflected": 35 + int(20 * abs(math.sin(tick / 14))),
                        "ambient": 12,
                        "color": 3,
                    },
                    "S2": {
                        "type": "ultrasonic",
                        "distance_cm": round(18 + 8 * math.sin(tick / 8), 1),
                    },
                    "S3": {
                        "type": "gyro",
                        "angle": int(30 * math.sin(tick / 20)),
                        "rate": int(6 * math.cos(tick / 20)),
                    },
                    "S4": {
                        "type": "touch",
                        "pressed": tick % 30 > 22,
                    },
                },
                "motors": {
                    "A": {
                        "position": tick * 8,
                        "speed": 35 if transport.collecting else 0,
                        "running": transport.collecting,
                    },
                    "B": {
                        "position": -tick * 7,
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
        )
        tick += 1
        await asyncio.sleep(0.1)


async def main() -> None:
    host = os.getenv("WEISILE_LINK_HOST", "127.0.0.1")
    link_port = int(os.getenv("WEISILE_LINK_PORT", "20111"))
    trainer_port = int(os.getenv("TRAINER_WS_PORT", "8766"))
    transport = PreviewTransport()
    server = ScratchJsonRpcServer(
        transport,
        manager=transport.manager,
        config=ScratchServerConfig(
            host=host,
            port=link_port,
            trainer_host=host,
            trainer_port=trainer_port,
        ),
    )
    await transport.connect(server.handle_sensor_data)
    print(f"VSLE preview backend: ws://{host}:{link_port}/scratch/bt")
    print(f"VSLE preview trainer: ws://{host}:{trainer_port}")
    await asyncio.gather(
        server.run(),
        server.run_trainer(),
        sensor_loop(server, transport),
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

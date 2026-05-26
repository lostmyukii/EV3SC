"""Command-line entrypoint for packaged WeisileLink deployments.

Sources:
- VSLE spec Section 14 defines deployment environment variables and
  teacher-computer service requirements.
- Dockerfile reference defines container `CMD`, `EXPOSE`, `USER`, and
  `HEALTHCHECK` behavior used by the deployment package.
- Docker Compose file reference defines services, ports, env files, and
  healthchecks used by `deploy/docker-compose.yml`.
"""

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Optional, Tuple

from weisile_link.json_rpc_server import (
    DEFAULT_ALLOWED_ORIGINS,
    ScratchJsonRpcServer,
    ScratchServerConfig,
    allowed_origins_from_env,
)
from weisile_link.runtime.degradation import DegradationManager
from weisile_link.transport.bluetooth_transport import BluetoothTransport
from weisile_link.transport.official_ev3_bt_transport import (
    OfficialEV3BluetoothTransport,
)
from weisile_link.transport.selector import AutoTransport
from weisile_link.transport.wifi_transport import WiFiTransport


@dataclass(frozen=True)
class WeisileLinkRuntimeConfig:
    """Environment-backed runtime configuration for packaged services."""

    host: str = "127.0.0.1"
    port: int = 20111
    trainer_port: int = 8766
    ev3_ip: str = "ev3dev.local"
    ev3_ws_port: int = 8765
    ev3_bt: str = ""
    ev3_official_bt: str = ""
    transport: str = "auto"
    max_collected_points: int = 10_000
    log_level: str = "INFO"
    allowed_origins: Tuple[str, ...] = DEFAULT_ALLOWED_ORIGINS

    @classmethod
    def from_env(cls) -> "WeisileLinkRuntimeConfig":
        """Read deployment settings from environment variables."""
        return cls(
            host=os.getenv("WEISILE_LINK_HOST", cls.host),
            port=_int_env("WEISILE_LINK_PORT", cls.port),
            trainer_port=_int_env("TRAINER_WS_PORT", cls.trainer_port),
            ev3_ip=os.getenv("EV3_IP", cls.ev3_ip),
            ev3_ws_port=_int_env("EV3_WS_PORT", cls.ev3_ws_port),
            ev3_bt=os.getenv("EV3_BT", cls.ev3_bt),
            ev3_official_bt=os.getenv(
                "EV3_OFFICIAL_BT",
                cls.ev3_official_bt,
            ),
            transport=os.getenv("WEISILE_TRANSPORT", cls.transport).lower(),
            max_collected_points=_int_env(
                "MAX_COLLECTED_POINTS",
                cls.max_collected_points,
            ),
            log_level=os.getenv("LOG_LEVEL", cls.log_level).upper(),
            allowed_origins=allowed_origins_from_env(),
        )


def build_server(config: WeisileLinkRuntimeConfig) -> ScratchJsonRpcServer:
    """Create a packaged WeisileLink server without connecting to EV3 yet."""
    manager = DegradationManager(
        max_collected_points=config.max_collected_points
    )
    wifi_transport = WiFiTransport(
        config.ev3_ip,
        port=config.ev3_ws_port,
        manager=manager,
    )
    bluetooth_transport: Optional[BluetoothTransport] = None
    if config.ev3_bt:
        bluetooth_transport = BluetoothTransport(config.ev3_bt, manager=manager)
        manager.bluetooth_supported = bluetooth_transport.supported

    if config.transport in {"official-bluetooth", "official_ev3_bluetooth"}:
        official_transport = OfficialEV3BluetoothTransport(
            config.ev3_official_bt or config.ev3_bt,
            manager=manager,
        )
        manager.bluetooth_supported = official_transport.supported
        transport = official_transport
    elif config.transport == "wifi" or bluetooth_transport is None:
        transport = wifi_transport
    elif config.transport == "bluetooth":
        transport = AutoTransport(
            wifi_transport,
            bluetooth_transport,
            manager=manager,
            preferred="bluetooth",
        )
    else:
        transport = AutoTransport(
            wifi_transport,
            bluetooth_transport,
            manager=manager,
            preferred="wifi",
        )

    return ScratchJsonRpcServer(
        transport,
        manager=manager,
        config=ScratchServerConfig(
            host=config.host,
            port=config.port,
            trainer_host=config.host,
            trainer_port=config.trainer_port,
            allowed_origins=config.allowed_origins,
        ),
    )


async def run_runtime(config: WeisileLinkRuntimeConfig) -> None:
    """Run Scratch JSON-RPC and Trainer subscription servers together."""
    logging.basicConfig(
        level=getattr(logging, config.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    server = build_server(config)
    logging.getLogger(__name__).info(
        "Starting WeisileLink on %s:%s and Trainer on %s:%s",
        config.host,
        config.port,
        config.host,
        config.trainer_port,
    )
    await asyncio.gather(server.run(), server.run_trainer())


def main() -> None:
    """Run the packaged WeisileLink service."""
    config = WeisileLinkRuntimeConfig.from_env()
    try:
        asyncio.run(run_runtime(config))
    except KeyboardInterrupt:
        pass


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value in (None, ""):
        return default
    return int(value)

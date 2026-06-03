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
import sys
from dataclasses import dataclass
from typing import List, Optional, Tuple

from weisile_link.desktop.pairing import run_pairing_command
from weisile_link.desktop.diagnostics import run_diagnostics_command
from weisile_link.desktop.runtime import (
    DesktopStartupPlan,
    run_desktop_start_command,
)
from weisile_link.desktop.roster import run_roster_command
from weisile_link.desktop.supervisor import run_supervisor_command
from weisile_link.json_rpc_server import (
    DEFAULT_ALLOWED_ORIGINS,
    ScratchJsonRpcServer,
    ScratchServerConfig,
    allowed_origins_from_env,
)
from weisile_link.runtime.degradation import DegradationManager
from weisile_link.transport.bluetooth_transport import VSLEBluetoothTransport
from weisile_link.transport.native_adapter_process import NativeAdapterProcess
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
    vsle_bt_adapter: str = ""
    official_bt_adapter: str = ""
    transport: str = "auto"
    pairing_token: str = ""
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
            vsle_bt_adapter=os.getenv(
                "WEISILE_VSLE_BT_ADAPTER",
                cls.vsle_bt_adapter,
            ),
            official_bt_adapter=os.getenv(
                "WEISILE_OFFICIAL_BT_ADAPTER",
                cls.official_bt_adapter,
            ),
            transport=os.getenv("WEISILE_TRANSPORT", cls.transport).lower(),
            pairing_token=os.getenv(
                "WEISILE_PAIRING_TOKEN",
                cls.pairing_token,
            ),
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
        pairing_token=config.pairing_token,
        manager=manager,
    )
    bluetooth_transport: Optional[VSLEBluetoothTransport] = None
    if config.ev3_bt:
        native_vsle_adapter = (
            NativeAdapterProcess(config.vsle_bt_adapter)
            if config.vsle_bt_adapter
            else None
        )
        bluetooth_transport = VSLEBluetoothTransport(
            config.ev3_bt,
            pairing_token=config.pairing_token,
            manager=manager,
            native_adapter=native_vsle_adapter,
        )
        manager.bluetooth_supported = bluetooth_transport.supported

    transport_name = str(config.transport).lower().replace("_", "-")
    if transport_name in {"official-bluetooth", "official-ev3-bluetooth"}:
        native_adapter = (
            NativeAdapterProcess(config.official_bt_adapter)
            if config.official_bt_adapter
            else None
        )
        official_transport = OfficialEV3BluetoothTransport(
            config.ev3_official_bt or config.ev3_bt,
            adapter=native_adapter,
            manager=manager,
        )
        manager.bluetooth_supported = official_transport.supported
        transport = official_transport
    elif transport_name == "wifi" or bluetooth_transport is None:
        transport = wifi_transport
    elif transport_name in {"bluetooth", "vsle-bluetooth"}:
        transport = AutoTransport(
            wifi_transport,
            bluetooth_transport,
            manager=manager,
            preferred="vsle-bluetooth",
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


def runtime_config_from_desktop_plan(
    args: object,
    plan: DesktopStartupPlan,
) -> WeisileLinkRuntimeConfig:
    """Convert a saved Desktop profile plan into service runtime config."""
    return WeisileLinkRuntimeConfig(
        host=plan.host,
        port=plan.port,
        trainer_port=plan.trainer_port,
        ev3_bt=plan.ev3_bt,
        vsle_bt_adapter=plan.native_adapter_path,
        transport=plan.transport,
        pairing_token=plan.pairing_token,
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        allowed_origins=plan.allowed_origins,
    )


def main(argv: Optional[List[str]] = None) -> None:
    """Run the packaged WeisileLink service."""
    args = list(sys.argv[1:] if argv is None else argv)
    if args[:1] == ["desktop-pair"]:
        raise SystemExit(asyncio.run(run_pairing_command(args[1:])))
    if args[:1] == ["desktop-diagnostics"]:
        raise SystemExit(asyncio.run(run_diagnostics_command(args[1:])))
    if args[:1] == ["desktop-start"]:
        raise SystemExit(
            asyncio.run(
                run_desktop_start_command(
                    args[1:],
                    runtime_config_factory=runtime_config_from_desktop_plan,
                    runtime_runner=run_runtime,
                )
            )
        )
    if args[:1] == ["desktop-roster"]:
        raise SystemExit(run_roster_command(args[1:]))
    if args[:1] == ["desktop-supervise"]:
        raise SystemExit(asyncio.run(run_supervisor_command(args[1:])))

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

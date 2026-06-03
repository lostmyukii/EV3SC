from __future__ import annotations

import argparse
import asyncio
import json
import socket
import subprocess
import sys
import webbrowser
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from weisile_link.desktop.profiles import (
    DesktopProfileError,
    DesktopProfileStore,
    credential_backend_for_platform,
)
from weisile_link.desktop.runtime import (
    APP_VERSION,
    DesktopHealthState,
    DesktopRuntimeService,
    DesktopStartupPlan,
)


PortChecker = Callable[[str, int], bool]
ProcessLauncher = Callable[[Sequence[str]], Any]
BrowserOpener = Callable[[str], bool]


@dataclass(frozen=True)
class DesktopSupervisionResult:
    state: DesktopHealthState
    message: str
    scratchai_url: str
    command: Tuple[str, ...] = field(default_factory=tuple)
    process_started: bool = False
    browser_opened: bool = False
    ports: Dict[str, bool] = field(default_factory=dict)
    diagnostics: Dict[str, Any] = field(default_factory=dict)
    startup: Dict[str, Any] = field(default_factory=dict)

    def safe_payload(self) -> Dict[str, Any]:
        payload = {
            "state": self.state.value,
            "message": self.message,
            "scratchai_url": self.scratchai_url,
            "command": list(self.command),
            "process_started": self.process_started,
            "browser_opened": self.browser_opened,
            "ports": dict(self.ports),
            "diagnostics": dict(self.diagnostics),
            "startup": dict(self.startup),
        }
        _assert_safe_payload(payload)
        return payload


class DesktopSupervisorService:
    """One-click Desktop shell logic shared by macOS and Windows packages."""

    def __init__(
        self,
        *,
        runtime_service: DesktopRuntimeService,
        process_launcher: Optional[ProcessLauncher] = None,
        port_checker: Optional[PortChecker] = None,
        browser_opener: Optional[BrowserOpener] = None,
        python_executable: str = sys.executable,
    ) -> None:
        self.runtime_service = runtime_service
        self.process_launcher = process_launcher or _default_process_launcher
        self.port_checker = port_checker or tcp_port_open
        self.browser_opener = browser_opener or webbrowser.open
        self.python_executable = python_executable

    async def start(
        self,
        *,
        config_path: str = "",
        brick_id: str = "",
        native_adapter_path: str = "",
        open_scratchai: bool = False,
        host: str = "127.0.0.1",
        port: int = 20111,
        trainer_port: int = 8766,
        ready_timeout_s: float = 5.0,
        port_timeout_s: float = 10.0,
        port_interval_s: float = 0.25,
        extra_allowed_origins: Tuple[str, ...] = (),
    ) -> DesktopSupervisionResult:
        ready_plan = await self.runtime_service.ready_status(
            brick_id=brick_id,
            native_adapter_path=native_adapter_path,
            host=host,
            port=port,
            trainer_port=trainer_port,
            allowed_origins=extra_allowed_origins,
            timeout_s=ready_timeout_s,
        )
        if ready_plan.state != DesktopHealthState.READY:
            return _result_from_plan(
                ready_plan,
                message=ready_plan.message,
                diagnostics={
                    "teacher_action": _teacher_action(ready_plan.state),
                    "ready_check": ready_plan.safe_payload().get("checks", {}),
                },
            )

        command = build_desktop_start_command(
            python_executable=self.python_executable,
            config_path=config_path,
            brick_id=brick_id,
            native_adapter_path=native_adapter_path,
            host=host,
            port=port,
            trainer_port=trainer_port,
            extra_allowed_origins=extra_allowed_origins,
        )
        self.process_launcher(command)
        ports = await wait_for_local_ports(
            host,
            (port, trainer_port),
            checker=self.port_checker,
            timeout_s=port_timeout_s,
            interval_s=port_interval_s,
        )
        if not all(ports.values()):
            return DesktopSupervisionResult(
                state=DesktopHealthState.NEEDS_ATTENTION,
                message="WeisileLink local service did not become ready.",
                scratchai_url=ready_plan.scratchai_url,
                command=tuple(command),
                process_started=True,
                ports=_named_ports(port, trainer_port, ports),
                diagnostics={
                    "teacher_action": _teacher_action(
                        DesktopHealthState.NEEDS_ATTENTION
                    ),
                    "local_bridge": "port_check_failed",
                },
                startup=ready_plan.safe_payload(),
            )

        browser_opened = False
        if open_scratchai:
            browser_opened = bool(self.browser_opener(ready_plan.scratchai_url))

        return DesktopSupervisionResult(
            state=DesktopHealthState.READY,
            message="Ready for ScratchAI.",
            scratchai_url=ready_plan.scratchai_url,
            command=tuple(command),
            process_started=True,
            browser_opened=browser_opened,
            ports=_named_ports(port, trainer_port, ports),
            diagnostics={
                "teacher_action": "Open ScratchAI.",
                "local_bridge": "listening",
            },
            startup=ready_plan.safe_payload(),
        )


async def run_supervisor_command(
    argv: Optional[List[str]] = None,
    *,
    service_factory: Optional[
        Callable[[argparse.Namespace], DesktopSupervisorService]
    ] = None,
) -> int:
    parser = build_supervisor_parser()
    args = parser.parse_args(argv)
    service = (
        service_factory(args)
        if service_factory is not None
        else _service_from_args(args)
    )
    result = await service.start(
        brick_id=args.brick_id,
        config_path=args.config,
        native_adapter_path=args.native_adapter,
        open_scratchai=args.open_scratchai,
        host=args.host,
        port=args.port,
        trainer_port=args.trainer_port,
        ready_timeout_s=args.ready_timeout,
        port_timeout_s=args.port_timeout,
        port_interval_s=args.port_interval,
        extra_allowed_origins=tuple(args.allowed_origin or ()),
    )
    print(json.dumps(result.safe_payload(), indent=2, sort_keys=True))
    return _exit_code_for_state(result.state)


def build_supervisor_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="weisile_link desktop-supervise",
        description="Start, monitor, and launch ScratchAI from Desktop.",
    )
    parser.add_argument("--config", default="")
    parser.add_argument("--brick-id", default="")
    parser.add_argument("--native-adapter", default="")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=20111)
    parser.add_argument("--trainer-port", type=int, default=8766)
    parser.add_argument("--allowed-origin", action="append", default=[])
    parser.add_argument("--ready-timeout", type=float, default=5.0)
    parser.add_argument("--port-timeout", type=float, default=10.0)
    parser.add_argument("--port-interval", type=float, default=0.25)
    parser.add_argument("--open-scratchai", action="store_true")
    parser.add_argument("--app-version", default=APP_VERSION)
    return parser


def build_desktop_start_command(
    *,
    python_executable: str,
    config_path: str = "",
    brick_id: str = "",
    native_adapter_path: str = "",
    host: str = "127.0.0.1",
    port: int = 20111,
    trainer_port: int = 8766,
    extra_allowed_origins: Tuple[str, ...] = (),
) -> List[str]:
    command = [
        python_executable,
        "-m",
        "weisile_link",
        "desktop-start",
        "--host",
        host,
        "--port",
        str(port),
        "--trainer-port",
        str(trainer_port),
    ]
    if config_path:
        command.extend(["--config", config_path])
    if brick_id:
        command.extend(["--brick-id", brick_id])
    if native_adapter_path:
        command.extend(["--native-adapter", native_adapter_path])
    for origin in extra_allowed_origins:
        command.extend(["--allowed-origin", origin])
    return command


async def wait_for_local_ports(
    host: str,
    ports: Tuple[int, ...],
    *,
    checker: PortChecker = None,
    timeout_s: float = 10.0,
    interval_s: float = 0.25,
) -> Dict[int, bool]:
    checker = checker or tcp_port_open
    deadline = asyncio.get_running_loop().time() + max(0.0, timeout_s)
    status = {port: False for port in ports}
    while True:
        for port in ports:
            if not status[port]:
                status[port] = bool(checker(host, port))
        if (
            all(status.values())
            or asyncio.get_running_loop().time() >= deadline
        ):
            return status
        await asyncio.sleep(max(0.01, interval_s))


def tcp_port_open(host: str, port: int, *, timeout_s: float = 0.25) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout_s):
            return True
    except OSError:
        return False


def _service_from_args(args: argparse.Namespace) -> DesktopSupervisorService:
    config_path = args.config or None
    runtime_service = DesktopRuntimeService(
        credential_backend=credential_backend_for_platform(),
        profile_store=DesktopProfileStore(config_path),
        app_version=args.app_version,
    )
    return DesktopSupervisorService(runtime_service=runtime_service)


def _default_process_launcher(command: Sequence[str]) -> subprocess.Popen:
    return subprocess.Popen(
        list(command),
        close_fds=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _result_from_plan(
    plan: DesktopStartupPlan,
    *,
    message: str,
    diagnostics: Dict[str, Any],
) -> DesktopSupervisionResult:
    return DesktopSupervisionResult(
        state=plan.state,
        message=message,
        scratchai_url=plan.scratchai_url,
        diagnostics=diagnostics,
        startup=plan.safe_payload(),
    )


def _named_ports(
    scratch_port: int,
    trainer_port: int,
    status: Dict[int, bool],
) -> Dict[str, bool]:
    return {
        str(scratch_port): bool(status.get(scratch_port, False)),
        str(trainer_port): bool(status.get(trainer_port, False)),
    }


def _teacher_action(state: DesktopHealthState) -> str:
    if state == DesktopHealthState.READY:
        return "Open ScratchAI."
    if state == DesktopHealthState.STARTING:
        return "Wait."
    if state == DesktopHealthState.NEEDS_PAIRING:
        return "Open pairing wizard."
    return "Open guided diagnostics."


def _exit_code_for_state(state: DesktopHealthState) -> int:
    if state == DesktopHealthState.READY:
        return 0
    if state == DesktopHealthState.NEEDS_ATTENTION:
        return 2
    if state == DesktopHealthState.NEEDS_PAIRING:
        return 3
    return 1


def _assert_safe_payload(payload: Dict[str, Any]) -> None:
    encoded = json.dumps(payload, sort_keys=True).lower()
    forbidden = ("pairing_token", "weisile_pairing_token")
    if any(key in encoded for key in forbidden):
        raise DesktopProfileError("Desktop output must not include raw tokens")

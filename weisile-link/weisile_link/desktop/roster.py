from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from weisile_link.desktop.profiles import (
    DesktopProfileError,
    DesktopProfileStore,
)


def build_roster_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="weisile_link desktop-roster",
        description="Import or export non-secret EV3 classroom roster packages.",
    )
    parser.add_argument("--config", default="")
    subparsers = parser.add_subparsers(dest="command", required=True)

    import_parser = subparsers.add_parser("import")
    import_parser.add_argument("--input", required=True)

    export_parser = subparsers.add_parser("export")
    export_parser.add_argument("--output", required=True)
    return parser


def run_roster_command(
    argv: Optional[list[str]] = None,
    *,
    store_factory: Optional[
        Callable[[argparse.Namespace], DesktopProfileStore]
    ] = None,
) -> int:
    parser = build_roster_parser()
    args = parser.parse_args(argv)
    store = (
        store_factory(args)
        if store_factory is not None
        else _store_from_args(args)
    )

    try:
        if args.command == "import":
            roster = _load_roster(Path(args.input))
            payload = store.import_roster(roster)
            output = {
                "imported": True,
                "classroom_id": payload.get("roster", {}).get(
                    "classroom_id", ""
                ),
                "devices": len(payload.get("roster", {}).get("devices", [])),
                "profiles_updated": len(payload.get("profiles", [])),
            }
            print(json.dumps(output, indent=2, sort_keys=True))
            return 0

        if args.command == "export":
            roster = store.export_roster()
            output = Path(args.output)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(
                json.dumps(roster, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            print(
                json.dumps(
                    {
                        "exported": True,
                        "output": str(output),
                        "devices": len(roster.get("devices", [])),
                    },
                    indent=2,
                    sort_keys=True,
                )
            )
            return 0

        raise DesktopProfileError("Unsupported roster command")
    except DesktopProfileError as exc:
        print(str(exc), file=sys.stderr)
        return 2


def _store_from_args(args: argparse.Namespace) -> DesktopProfileStore:
    config_path = Path(args.config) if args.config else None
    return DesktopProfileStore(config_path)


def _load_roster(path: Path) -> Dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DesktopProfileError(
            "Roster JSON is invalid: {}".format(exc.msg)
        ) from exc
    if not isinstance(payload, dict):
        raise DesktopProfileError("Roster JSON must be an object")
    return payload

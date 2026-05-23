#!/usr/bin/env python3
"""Validate checked-in VSLE deployment packaging assets."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def assert_contains(relative: str, *needles: str) -> None:
    text = read(relative)
    for needle in needles:
        if needle not in text:
            raise AssertionError(f"{relative} is missing {needle!r}")


def assert_not_contains(relative: str, *needles: str) -> None:
    text = read(relative)
    for needle in needles:
        if needle in text:
            raise AssertionError(f"{relative} must not contain {needle!r}")


def main() -> None:
    assert_contains(
        "deploy/Dockerfile.weisile-link",
        "FROM python:3.11-slim",
        "USER vsle",
        "HEALTHCHECK",
        'CMD ["python", "-m", "weisile_link"]',
    )
    assert_not_contains(
        "deploy/Dockerfile.weisile-link",
        "WEISILE_PAIRING_TOKEN=",
        "pybluez",
    )
    assert_contains(
        "deploy/docker-compose.yml",
        "weisile-link:",
        "preview:",
        '"127.0.0.1:20111:20111"',
        '"127.0.0.1:8766:8766"',
        '"127.0.0.1:3001:3001"',
        "condition: service_healthy",
    )
    assert_not_contains(
        "deploy/docker-compose.yml",
        "network_mode: host",
        "privileged: true",
    )
    assert_contains(
        "deploy/env.example",
        "WEISILE_LINK_HOST=127.0.0.1",
        "WEISILE_LINK_PORT=20111",
        "TRAINER_WS_PORT=8766",
        "EV3_IP=ev3dev.local",
        "generate this per classroom",
    )
    assert_not_contains("deploy/env.example", "WEISILE_PAIRING_TOKEN=")
    assert_contains(
        "deploy/README.md",
        "docker compose -f deploy/docker-compose.yml config",
        "docker compose -f deploy/docker-compose.yml build",
        "rollback",
    )
    assert_contains(
        ".dockerignore",
        ".git",
        ".venv",
        "**/.DS_Store",
        "**/.pytest_cache",
        "node_modules",
    )


if __name__ == "__main__":
    main()

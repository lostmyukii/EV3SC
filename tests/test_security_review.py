from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SECURITY_REVIEW = ROOT / "docs" / "security" / "SECURITY_REVIEW.md"
SOURCE_REGISTER = ROOT / "docs" / "SOURCE_REGISTER.md"
ENV_EXAMPLE = ROOT / "deploy" / "env.example"
COMPOSE = ROOT / "deploy" / "docker-compose.yml"
CLI = ROOT / "weisile-link" / "weisile_link" / "cli.py"
JSON_RPC_SERVER = ROOT / "weisile-link" / "weisile_link" / "json_rpc_server.py"
VALIDATION = (
    ROOT / "weisile-link" / "weisile_link" / "protocol" / "validation.py"
)
WIFI_TRANSPORT = (
    ROOT / "weisile-link" / "weisile_link" / "transport" / "wifi_transport.py"
)
BLUETOOTH_TRANSPORT = (
    ROOT
    / "weisile-link"
    / "weisile_link"
    / "transport"
    / "bluetooth_transport.py"
)
EV3_SERVER = ROOT / "ev3-firmware" / "vsle_ev3_server.py"
TRAINER_PIPELINE = (
    ROOT / "weisile-link" / "weisile_link" / "trainer_pipeline.py"
)
LOGGING = (
    ROOT / "weisile-link" / "weisile_link" / "observability" / "logging.py"
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_security_review_document_covers_phase3_gates_and_evidence():
    text = _read(SECURITY_REVIEW)

    for required in (
        "Phase 3 security review",
        "Section 13.6 Critical Remediation Gates",
        "localhost-only bridge",
        "WEISILE_LINK_HOST=127.0.0.1",
        "Origin allowlist",
        "WEISILE_ALLOWED_ORIGINS",
        "auth.pair",
        "WEISILE_PAIRING_TOKEN",
        "command validation",
        "COMMAND_VALIDATORS",
        "privacy/delete",
        "/api/data/clear",
        "student names",
        "photos",
        "voice",
        "No open security deployment blockers",
        "Evidence",
    ):
        assert required in text

    lowered = text.lower()
    assert "todo" not in lowered
    assert "tbd" not in lowered


def test_runtime_security_controls_are_source_enforced():
    env = _read(ENV_EXAMPLE)
    compose = _read(COMPOSE)
    cli = _read(CLI)
    json_rpc = _read(JSON_RPC_SERVER)
    validation = _read(VALIDATION)
    wifi = _read(WIFI_TRANSPORT)
    bluetooth = _read(BLUETOOTH_TRANSPORT)
    ev3 = _read(EV3_SERVER)
    trainer = _read(TRAINER_PIPELINE)
    logging = _read(LOGGING)

    assert "WEISILE_LINK_HOST=127.0.0.1" in env
    assert "WEISILE_ALLOWED_ORIGINS=" in env
    assert "WEISILE_PAIRING_TOKEN=" not in env
    assert '"127.0.0.1:20111:20111"' in compose
    assert '"127.0.0.1:8766:8766"' in compose
    assert "network_mode: host" not in compose
    assert "allowed_origins=allowed_origins_from_env()" in cli
    assert "origin not allowed" in json_rpc
    assert "DEFAULT_ALLOWED_ORIGINS" in json_rpc
    assert "WEISILE_ALLOWED_ORIGINS" in json_rpc
    assert "auth.pair" in wifi
    assert "auth.pair" in bluetooth
    assert "authenticate_client" in ev3
    assert "pairing_token" in ev3
    assert "COMMAND_VALIDATORS" in validation
    assert "validate_ev3_command" in validation
    assert "MAX_LABEL_LENGTH = 64" in validation
    assert "MAX_COLLECTED_POINTS" in ev3
    assert '"clearRoute": "/api/data/clear"' in trainer
    assert '"studentDataIncluded": False' in trainer
    assert "TOKEN_KEY_FRAGMENTS" in logging
    assert "label" in logging and "[:MAX_LOG_LABEL_LENGTH]" in logging


def test_source_register_records_security_review_sources():
    text = _read(SOURCE_REGISTER)

    for required in (
        "Phase 3 Step 7 — Security Review",
        "VSLE platform specification",
        "WeisileLink JSON-RPC server",
        "WeisileLink command validation",
        "EV3 firmware server",
        "Trainer pipeline",
        "Deployment package",
    ):
        assert required in text

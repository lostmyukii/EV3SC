import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEPLOY = ROOT / "deploy"
DOCKERFILE = DEPLOY / "Dockerfile.weisile-link"
COMPOSE = DEPLOY / "docker-compose.yml"
ENV_EXAMPLE = DEPLOY / "env.example"
README = DEPLOY / "README.md"
VALIDATOR = DEPLOY / "scripts" / "validate_deployment_assets.py"
SYSTEMD = DEPLOY / "weisile-link.service"
PLIST = DEPLOY / "weisile-link.plist"
DOCKERIGNORE = ROOT / ".dockerignore"
CLI = ROOT / "weisile-link" / "weisile_link" / "cli.py"
MAIN = ROOT / "weisile-link" / "weisile_link" / "__main__.py"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_dockerfile_packages_weisile_link_as_non_root_service():
    text = _read(DOCKERFILE)

    assert "FROM python:3.11-slim" in text
    assert "WORKDIR /opt/vsle/ev3sc" in text
    assert "COPY weisile-link/pyproject.toml" in text
    assert "COPY weisile-link/weisile_link" in text
    assert "websockets>=10,<16" in text
    assert "USER vsle" in text
    assert "EXPOSE 20111 8766" in text
    assert "HEALTHCHECK" in text
    assert 'CMD ["python", "-m", "weisile_link"]' in text
    assert "WEISILE_PAIRING_TOKEN=" not in text
    assert "pybluez" not in text.lower()


def test_compose_file_exposes_localhost_only_services_and_healthchecks():
    text = _read(COMPOSE)

    assert "services:" in text
    assert "weisile-link:" in text
    assert "dockerfile: deploy/Dockerfile.weisile-link" in text
    assert "env_file:" in text
    assert "- ./env.example" in text
    assert 'WEISILE_LINK_HOST: "0.0.0.0"' in text
    assert '"127.0.0.1:20111:20111"' in text
    assert '"127.0.0.1:8766:8766"' in text
    assert "healthcheck:" in text
    assert "preview:" in text
    assert '"127.0.0.1:3001:3001"' in text
    assert "condition: service_healthy" in text
    assert "network_mode: host" not in text
    assert "privileged: true" not in text


def test_deployment_env_example_documents_safe_defaults_without_secrets():
    text = _read(ENV_EXAMPLE)

    assert "WEISILE_LINK_HOST=127.0.0.1" in text
    assert "WEISILE_LINK_PORT=20111" in text
    assert "TRAINER_WS_PORT=8766" in text
    assert "EV3_IP=ev3dev.local" in text
    assert "EV3_WS_PORT=8765" in text
    assert "MAX_COLLECTED_POINTS=10000" in text
    assert "LOG_LEVEL=INFO" in text
    assert "WEISILE_PAIRING_TOKEN=" not in text
    assert "generate this per classroom" in text


def test_weisile_link_cli_reads_deployment_environment_and_has_module_entrypoint():
    cli = _read(CLI)
    main = _read(MAIN)

    assert "WeisileLinkRuntimeConfig" in cli
    assert "from_env" in cli
    assert "WEISILE_LINK_HOST" in cli
    assert "WEISILE_LINK_PORT" in cli
    assert "TRAINER_WS_PORT" in cli
    assert "EV3_IP" in cli
    assert "EV3_WS_PORT" in cli
    assert "asyncio.gather" in cli
    assert "server.run()" in cli
    assert "server.run_trainer()" in cli
    assert "main()" in main


def test_native_teacher_service_templates_use_localhost_defaults():
    service = _read(SYSTEMD)
    plist = _read(PLIST)
    combined = service + "\n" + plist

    assert "ExecStart=/usr/bin/python3 -m weisile_link" in service
    assert "WorkingDirectory=/opt/vsle/EV3SC/weisile-link" in service
    assert "EnvironmentFile=-/etc/vsle/weisile-link.env" in service
    assert "Restart=on-failure" in service
    assert "<key>ProgramArguments</key>" in plist
    assert "<string>-m</string>" in plist
    assert "<string>weisile_link</string>" in plist
    assert "WEISILE_LINK_HOST" in combined
    assert "127.0.0.1" in combined
    assert "WEISILE_PAIRING_TOKEN=" not in combined


def test_deployment_docs_and_validator_cover_build_run_health_and_rollback():
    readme = _read(README)
    validator = _read(VALIDATOR)

    assert "docker compose -f deploy/docker-compose.yml build" in readme
    assert "docker compose -f deploy/docker-compose.yml up" in readme
    assert "docker compose -f deploy/docker-compose.yml down" in readme
    assert "docker compose -f deploy/docker-compose.yml config" in readme
    assert "http://127.0.0.1:3001/preview/index.html" in readme
    assert "WEISILE_PAIRING_TOKEN" in readme
    assert "rollback" in readme.lower()
    assert "validate_deployment_assets.py" in readme
    assert "Docker Compose file reference" in readme
    assert "Dockerfile reference" in readme
    assert "assert_contains" in validator
    assert "deploy/docker-compose.yml" in validator


def test_dockerignore_and_validation_script_keep_context_clean():
    dockerignore = _read(DOCKERIGNORE)

    assert ".git" in dockerignore
    assert ".venv" in dockerignore
    assert "**/.DS_Store" in dockerignore
    assert "**/.pytest_cache" in dockerignore
    assert "node_modules" in dockerignore
    assert os.access(VALIDATOR, os.X_OK)
    subprocess.run([str(VALIDATOR)], cwd=ROOT, check=True)

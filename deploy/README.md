# VSLE Deployment Packaging

This directory contains the Phase 3 teacher-computer deployment package for the
VSLE Scratch-EV3 platform. It keeps the classroom bridge local by default and
does not contain pairing tokens or student data.

Sources used for this package:

- Docker Compose file reference: https://docs.docker.com/compose/compose-file/
- Docker Compose service healthchecks and `depends_on`:
  https://docs.docker.com/reference/compose-file/services/
- Dockerfile reference:
  https://docs.docker.com/reference/dockerfile/
- VSLE spec Sections 13.8 and 14 for packaging, service startup, environment
  variables, rollback, and release checklist requirements.

## Assets

| File | Purpose |
|------|---------|
| `Dockerfile.weisile-link` | Builds the WeisileLink bridge as a non-root Python container. |
| `docker-compose.yml` | Runs WeisileLink and the local preview server with localhost-only host ports. |
| `env.example` | Safe checked-in defaults for teacher computers. Copy before adding secrets. |
| `weisile-link.service` | Linux systemd template for native installs. |
| `weisile-link.plist` | macOS LaunchAgent template for native installs. |
| `scripts/validate_deployment_assets.py` | Fast validation for deployment files. |

## Validate

Run the static deployment package checks:

```bash
deploy/scripts/validate_deployment_assets.py
```

If Docker Compose is installed, also ask Docker to parse the Compose file:

```bash
docker compose -f deploy/docker-compose.yml config
```

## Configure

Copy the example env file before editing deployment values:

```bash
cp deploy/env.example deploy/.env.local
```

`WEISILE_PAIRING_TOKEN` is intentionally absent from `env.example`. Generate one
per classroom or per EV3 group and keep it out of git:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Default host ports are bound to `127.0.0.1`:

- `20111`: Scratch-compatible JSON-RPC endpoint
- `8766`: WeisileAI Trainer subscription endpoint
- `3001`: local preview page

The container binds `WEISILE_LINK_HOST=0.0.0.0` internally so Docker can publish
ports, but Compose publishes those ports to localhost only. LAN exposure remains
an explicit teacher action.

## Build And Run

Build:

```bash
docker compose -f deploy/docker-compose.yml build
```

Start:

```bash
docker compose -f deploy/docker-compose.yml up
```

Open the preview:

```text
http://127.0.0.1:3001/preview/index.html
```

Stop:

```bash
docker compose -f deploy/docker-compose.yml down
```

## Native Service Templates

Linux:

```bash
sudo install -D -m 0644 deploy/weisile-link.service /etc/systemd/system/weisile-link.service
sudo systemctl daemon-reload
sudo systemctl enable --now weisile-link.service
```

macOS:

```bash
cp deploy/weisile-link.plist ~/Library/LaunchAgents/weisile-link.plist
launchctl load ~/Library/LaunchAgents/weisile-link.plist
```

Both templates expect EV3SC at `/opt/vsle/EV3SC` and use localhost defaults.
For a different install location, copy the template and update
`WorkingDirectory`.

## Rollback

Container rollback:

```bash
docker compose -f deploy/docker-compose.yml down
docker image ls vsle/weisile-link
docker tag vsle/weisile-link:<previous-version> vsle/weisile-link:local
docker compose -f deploy/docker-compose.yml up
```

Native Linux rollback:

```bash
sudo systemctl stop weisile-link.service
sudo cp /path/to/previous/weisile-link.service /etc/systemd/system/weisile-link.service
sudo systemctl daemon-reload
sudo systemctl enable --now weisile-link.service
```

EV3 brick rollback remains handled by
`ev3-firmware/scripts/rollback_ev3_autostart.sh`.

## Emergency Stop

If a class needs to recover immediately:

1. Stop Scratch programs with the red stop button.
2. Stop the bridge with `docker compose -f deploy/docker-compose.yml down` or
   `systemctl stop weisile-link.service`.
3. Power off EV3 bricks from Brickman if motors or sounds continue.
4. Preserve exported `vsle_ev3_data.csv` and `model_rules.json` files before
   clearing data.

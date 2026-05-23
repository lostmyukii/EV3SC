# Phase 3 Security Review

This Phase 3 security review verifies the VSLE Scratch-EV3 platform against
Section 13.6 Critical Remediation Gates and Section 15 security, privacy, and
safety requirements. The review scope is the EV3SC-owned implementation only.

## Result

No open security deployment blockers remain for the local teacher-computer
pilot profile after the Origin allowlist fix in WeisileLink. Classroom LAN
exposure still requires an explicit teacher configuration change, a private
WEISILE_PAIRING_TOKEN, and a matching WEISILE_ALLOWED_ORIGINS value.

## Evidence

| Gate | Evidence | Status |
|------|----------|--------|
| localhost-only bridge | `WEISILE_LINK_HOST=127.0.0.1` in `deploy/env.example`; Compose publishes `20111`, `8766`, and `3001` to `127.0.0.1` only | Pass |
| Origin allowlist | `ScratchJsonRpcServer` rejects browser WebSocket clients whose Origin is outside `WEISILE_ALLOWED_ORIGINS`; defaults cover localhost `3001`, `8000`, and ScratchAI editor preview `8601` | Pass |
| EV3 pairing | WiFi and Bluetooth transports send `auth.pair` when WEISILE_PAIRING_TOKEN is configured; EV3 firmware requires `auth.pair` before command handling when token is set | Pass |
| command validation | WeisileLink uses COMMAND_VALIDATORS before transport dispatch; EV3 firmware validates the same command surface and rejects unknown methods | Pass |
| unsafe actuator values | Motor speeds are clamped, timed commands are capped at 60 seconds, PID values are bounded, and `motor.stopAll` stays allowlisted | Pass |
| payload limits | Labels are capped at 64 characters; asset filenames reject paths; MAX_COLLECTED_POINTS keeps buffers bounded | Pass |
| privacy/delete | Student telemetry excludes student names, photos, voice, accounts, and location; `/api/data/clear` clears collected rows; exported model rules omit raw rows | Pass |
| token-safe logs | Structured logging redacts token-like fields and truncates labels before writing JSON log lines | Pass |

## Localhost And Origin Policy

The local Scratch-compatible bridge binds to `127.0.0.1` by default. Container
services may bind to `0.0.0.0` inside Docker, but the checked-in Compose file
publishes host ports to localhost only.

Allowed browser origins are controlled by WEISILE_ALLOWED_ORIGINS. The checked
default permits the local preview and extension hosts only:

- `http://localhost:3001`
- `http://127.0.0.1:3001`
- `http://localhost:8000`
- `http://127.0.0.1:8000`
- `http://localhost:8601`
- `http://127.0.0.1:8601`

Non-browser clients without an Origin header remain accepted so health probes,
tests, and native tooling can connect without fabricating browser metadata.

## Pairing And Command Flow

WeisileLink never accepts arbitrary EV3 method names. Scratch JSON-RPC requests
are accepted only if the method maps to the VSLE command allowlist or a
Scratch-compatible control method. Before forwarding to EV3, the command path is
checked against COMMAND_VALIDATORS. The EV3 firmware repeats validation before
hardware dispatch, which keeps unknown commands and unsafe parameters from
reaching motors, sound, display, or data collection.

WEISILE_PAIRING_TOKEN is intentionally absent from checked-in example configs.
When a teacher enables LAN access or EV3 pairing, the token must be generated
outside git and loaded from a private env file or EV3 autostart env file.

## Privacy And Deletion

The EV3 data model is local-first and minimizes student data. It records EV3
sensor values, motor state, system state, timestamps, and short educational
labels only. Student names, photos, voice, account IDs, and location are outside
the accepted telemetry surface.

Teacher-facing cleanup is available through `/api/data/clear`; EV3-side
`data.clear` also clears the brick-side collection buffer. Trainer export emits
`model_rules.json` without raw rows and includes deletion guidance via its
privacy metadata.

## Verification Commands

Fresh verification for this review is:

```bash
python -m pytest weisile-link/tests/test_json_rpc_server.py tests/test_security_review.py -q
python -m pytest -q
cd weisile-link && python -m black --check .
python -m black --check --line-length 80 tests/test_security_review.py weisile-link/tests/test_json_rpc_server.py weisile-link/weisile_link/json_rpc_server.py weisile-link/weisile_link/cli.py
npm test
npm run check
deploy/scripts/validate_deployment_assets.py
git diff --check
```

The commands above are the required evidence set before this security review is
used for a pilot release decision.

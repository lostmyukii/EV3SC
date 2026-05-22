# Source Register

This project requires EV3 and Scratch behavior to be based on open-source
source code, official repositories, official documentation, or verified local
ports. This register records the sources used for the current implementation.

## Phase 1 Step 1 — WeisileLink JSON-RPC and Validation Baseline

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| Scratch Link Network Protocol | `/Users/yukii/Desktop/scratch ai/scratch-link/Documentation/NetworkProtocol.md` | JSON-RPC 2.0 envelope shape, WebSocket path model, Scratch Link request/response expectations |
| Scratch Link Architecture | `/Users/yukii/Desktop/scratch ai/scratch-link/Documentation/Architecture.md` | Scratch Link service boundary and WebSocket listener/RPC/session separation |
| Scratch VM EV3 extension | `/Users/yukii/Desktop/scratch ai/scratch-ai-platform/scratch-editor/packages/scratch-vm/src/extensions/scratch3_ev3/index.js` | EV3 direct-command naming context and Scratch-side compatibility reference |
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 10 API contracts, Section 13.6 critical gates, Section 15 security requirements, Section 16 error codes |
| JSON-RPC 2.0 specification | `https://www.jsonrpc.org/specification` | Generic JSON-RPC 2.0 response and error envelope semantics |

## Phase 1 Step 2 — Error Mapping and Reconnect/Degradation Baseline

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 10.4 Scratch-facing JSON-RPC error envelope; Section 16.1 error code and retryability catalog; Section 16.2 degradation rules; Section 16.3 reconnect behavior |
| WeisileLink JSON-RPC baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/protocol/json_rpc.py` | Reused `make_result` and `make_error` helpers for Scratch-compatible response envelopes |
| WeisileLink validation baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/protocol/validation.py` | Confirms validation failures stop before transport dispatch; this step only maps runtime failures and degraded runtime state |
| Python standard library documentation | `https://docs.python.org/3/library/random.html` | `random.uniform` jitter source for Section 16.3 reconnect backoff; no external runtime dependency introduced |

## Phase 1 Step 3 — Health Check and Structured Logging Baseline

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Section 17.1 JSON structured log fields and log privacy rules; Section 17.2 `/api/status` response fields; Section 17.3 metrics and alert thresholds |
| WeisileLink degradation baseline | `/Users/yukii/Desktop/EV3SC/weisile-link/weisile_link/runtime/degradation.py` | Connection state, active transport, reconnect count, and collected point count used by `/api/status` |
| Python standard library documentation | `https://docs.python.org/3/library/json.html` | JSON serialization for health endpoint responses and structured JSON line logs |
| Python standard library documentation | `https://docs.python.org/3/library/datetime.html` | UTC ISO-8601 timestamp generation for structured log records |

## Phase 1 Step 4 — ev3dev SD Card Preparation and Autostart

| Source | Local path / URL | Used for |
|--------|------------------|----------|
| VSLE platform specification | `/Users/yukii/Desktop/EV3SC/VSLE_SCRATCH_EV3_PLATFORM_DEV_SPEC.md` | Phase 1 ev3dev SD card/autostart task; Section 14.2 EV3 setup; Section 14.5 rollback and recovery; Section 14.6 release checklist |
| AGENTS project instructions | `/Users/yukii/Desktop/EV3SC/AGENTS.md` | EV3 setup defaults: ev3dev, `robot@ev3dev.local`, default password, `websockets` and `ev3dev2`, no pybluez |
| ev3dev Getting Started | `https://www.ev3dev.org/docs/getting-started/` | Official SD card, boot, networking, SSH, and shutdown flow for EV3 |
| ev3dev Downloads | `https://www.ev3dev.org/downloads/` | Official EV3 image source and image-selection guidance |
| Debian systemd service manual | `https://manpages.debian.org/man/systemd.service` | Service unit sections and directives including `ExecStart`, `Restart`, and process handling |
| Debian systemd wiki | `https://wiki.debian.org/systemd/Services` | `systemctl enable` service startup workflow reference |

## Rules

- Do not invent Scratch Link, Scratch VM, EV3, ev3dev, or ev3dev2 behavior from
  memory.
- Add a row here whenever code ports, adapts, or depends on upstream behavior.
- Keep local paths inside `/Users/yukii/Desktop/EV3SC/` for project-owned files;
  external source paths are read-only references unless ported into this repo.

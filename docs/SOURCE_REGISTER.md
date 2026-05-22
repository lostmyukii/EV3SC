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

## Rules

- Do not invent Scratch Link, Scratch VM, EV3, ev3dev, or ev3dev2 behavior from
  memory.
- Add a row here whenever code ports, adapts, or depends on upstream behavior.
- Keep local paths inside `/Users/yukii/Desktop/EV3SC/` for project-owned files;
  external source paths are read-only references unless ported into this repo.

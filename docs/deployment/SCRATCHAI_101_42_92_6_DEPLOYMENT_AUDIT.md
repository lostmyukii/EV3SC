# ScratchAI 101.42.92.6 Deployment Audit

Date: 2026-05-25
Updated: 2026-05-26

## Scope

- Deployed EV3SC-owned ScratchAI unified preview to `http://101.42.92.6:18612/`.
- Kept existing server applications untouched on ports `80`, `3000`, and `8001`.
- Exposed only the preview gateway publicly on `18612`.
- Kept AI middleware on `127.0.0.1:18614` and asset worker on `127.0.0.1:18615`.
- Preview authentication is disabled for the current testing stage. The remote secret file keeps `systemcreator` as the staged username for future re-enabling, but the runtime password value is blank so Basic Auth is not configured.

## Runtime Layout

Remote base directory: `/home/ubuntu/ev3sc-scratchai-18612`

Systemd services:

- `ev3sc-scratchai-preview-18612.service`: public preview gateway
- `ev3sc-scratchai-middleware-18614.service`: loopback AI middleware
- `ev3sc-scratchai-asset-18615.service`: loopback asset worker

Port audit:

```text
127.0.0.1:8001   existing uvicorn app
0.0.0.0:80       existing web app
*:3000           existing node app
0.0.0.0:18612   EV3SC ScratchAI preview gateway
127.0.0.1:18614 EV3SC ScratchAI middleware
127.0.0.1:18615 EV3SC ScratchAI asset worker
```

Service audit:

```text
enabled enabled enabled
active  active  active
```

## AI Configuration

Text AI:

- Provider: `deepseek`
- Model enabled: `true`
- Base URL: `https://api.deepseek.com`
- Model: `deepseek-v4-pro`
- API key: configured, redacted

DeepSeek's official API quick-start documents `https://api.deepseek.com` and `deepseek-v4-pro` for OpenAI-compatible chat completions: https://api-docs.deepseek.com/

Image/role draft AI:

- Current provider: `siliconflow-image`
- Image generation enabled: `true`
- External network: `true`
- Model weights downloaded: `false`
- API key: configured, redacted
- Base URL: `https://api.siliconflow.cn/v1`
- Model: `Tongyi-MAI/Z-Image-Turbo`
- Transparent role/background handling: character/sprite PNG drafts require transparent backgrounds before adoption into Scratch. The server validates the generated PNG and can repair simple corner-background outputs before returning the asset to the browser.

Important: EV3SC currently has image providers for `mock`, `gemini-image`, `openai-image`, `siliconflow-image`, and `template-svg`. DeepSeek is configured here for text/chat AI; SiliconFlow is configured for role/image drafts. The SiliconFlow provider is external-network and remains marked `provider-terms-review-required` before broad classroom release.

## Browser Evidence

- Root preview with AI helper visible: `docs/deployment/evidence/scratchai_101_42_92_6_root_ai_helper_20260525.png`
- AI helper opened in browser: `docs/deployment/evidence/scratchai_101_42_92_6_ai_helper_open_20260525.png`
- Asset generator visible: `docs/deployment/evidence/scratchai_101_42_92_6_asset_generator_20260525.png`
- Legacy `/preview/index.html` path fixed and verified: `docs/deployment/evidence/scratchai_101_42_92_6_preview_path_ai_helper_20260525.png`
- EV3 extension click loads VSLE-EV3 blocks: `docs/deployment/evidence/scratchai_101_42_92_6_ev3_blocks_loaded_20260526.png`

The `/preview/gui.js` compatibility check now returns:

```text
HTTP/1.1 200 OK
Content-Type: application/javascript; charset=utf-8
```

## EV3 Extension Evidence

On 2026-05-26, the isolated preview was redeployed as release
`/home/ubuntu/ev3sc-scratchai-18612/releases/scratchai-18612-202605261110-ev3-url`.
The build embeds `SCRATCH_AI_VSLE_EV3_EXTENSION_URL` as
`http://101.42.92.6:18612/vsle-ev3-extension/index.js` and keeps ScratchAI
middleware calls same-origin through the preview gateway.

The EV3 extension static bundle is served from the in-repo
`vsle-ev3-extension` source under `static/vsle-ev3-extension/`. The public
route now returns JavaScript instead of the Scratch HTML fallback:

```text
HTTP/1.1 200 OK
Content-Type: application/javascript; charset=utf-8
```

Browser click evidence:

```json
{
  "hasVSLECategory": true,
  "bodyIncludesEV3Blocks": true,
  "ev3ScriptLoadedUnsandboxed": true,
  "ev3LoadedViaSandboxWorker": false,
  "expectedEV3ExtensionURL": "http://101.42.92.6:18612/vsle-ev3-extension/index.js"
}
```

Evidence files:

- `docs/deployment/evidence/scratchai_101_42_92_6_ev3_blocks_loaded_20260526.json`
- `docs/deployment/evidence/scratchai_101_42_92_6_ev3_blocks_loaded_20260526.png`

On 2026-06-02, the public preview was advanced to release
`/home/ubuntu/ev3sc-scratchai-18612/releases/scratchai-18612-20260602-vsle-extension-freshness`
by syncing the EV3SC-owned `vsle-ev3-extension/` directory into
`static/vsle-ev3-extension/` while preserving the remote Scratch GUI build and
its public EV3 extension URL. The served extension now includes the
`Bluetooth Full VSLE` transport label, the `vsle-bluetooth` transport value, and
the browser-side `received_at_ms` host freshness fix.

Server-side Bluetooth note: the cloud host has no detectable Bluetooth adapter,
its `bluetooth` service is inactive, and `127.0.0.1:20111` is closed on the
server. This is expected for the VSLE architecture: the public server hosts the
ScratchAI website and extension, while real EV3 Bluetooth ownership remains on
the teacher computer through local WeisileLink Desktop at
`ws://127.0.0.1:20111/scratch/bt`.

Evidence files:

- `docs/deployment/evidence/scratchai_101_42_92_6_vsle_extension_sync_20260602.json`
- `docs/deployment/evidence/scratchai_101_42_92_6_vsle_extension_sync_20260602.md`

On 2026-06-02, the public preview was advanced again to release
`/home/ubuntu/ev3sc-scratchai-18612/releases/scratchai-18612-20260602-numeric-boolean`
by syncing the updated EV3SC-owned `vsle-ev3-extension/` directory into
`static/vsle-ev3-extension/` while preserving the remote Scratch GUI build and
its public EV3 extension URL. The served extension SHA-256 now matches the local
EV3SC extension at commit `7ca1a88` and includes the numeric EV3 Boolean
normalization fix (`safeBoolean`) for real payload values such as S4 touch
`pressed: 1`.

Evidence files:

- `docs/deployment/evidence/scratchai_101_42_92_6_vsle_extension_numeric_boolean_sync_20260602.json`
- `docs/deployment/evidence/scratchai_101_42_92_6_vsle_extension_numeric_boolean_sync_20260602.md`

## API Evidence

Preview readiness:

```json
{
  "service": "scratch-ai-preview-server",
  "ready": true,
  "basicAuth": false,
  "hostAllowlist": true,
  "publicBaseUrlConfigured": true,
  "publicBaseUrlScheme": "http",
  "proxyMiddleware": true,
  "staticConfigured": true
}
```

Middleware health:

```json
{
  "provider": "deepseek",
  "modelEnabled": true,
  "deepseek": {
    "apiKeyConfigured": true,
    "baseUrl": "https://api.deepseek.com",
    "model": "deepseek-v4-pro"
  },
  "assetWorker": {
    "configured": true,
    "route": "/api/v1/assets/image-jobs",
    "manifestRoute": "/api/v1/assets/generation-manifest"
  },
  "structuredEventLog": true
}
```

Asset worker manifest:

```json
{
  "proxied": true,
  "currentProvider": "siliconflow-image",
  "providers": [
    "mock",
    "gemini-image",
    "openai-image",
    "siliconflow-image",
    "template-svg"
  ]
}
```

Unauthenticated role draft smoke result:

```json
{
  "proxied": true,
  "blocked": false,
  "provider": "siliconflow-image",
  "status": "completed",
  "type": "character",
  "generated": true,
  "format": "png",
  "mimeType": "image/png",
  "model": "Tongyi-MAI/Z-Image-Turbo",
  "externalNetwork": true
}
```

Unauthenticated SiliconFlow transparent role check:

```json
{
  "provider": "siliconflow-image",
  "status": "completed",
  "generated": true,
  "type": "character",
  "format": "png",
  "mimeType": "image/png",
  "transparentBackground": {
    "required": true,
    "serverValidated": true,
    "passed": true,
    "repaired": true,
    "repairMethod": "server-corner-background-removal-v1",
    "originalReason": "missing-transparent-pixels",
    "reason": "transparent-png"
  },
  "reviewState": "pending-human-review"
}
```

Previous in-repo fallback verification remains valid for offline/local fallback: `template-svg` character drafts omit a background rectangle, while `template-svg` backdrop drafts keep one.

Prompt robustness check: the prompt `transparent classroom EV3 helper sprite, clean silhouette, no background` produced an opaque provider image and the server correctly rejected it with `generated=false` because transparent-background repair did not pass. The prompt `transparent friendly EV3 robot helper sprite, full body, clean silhouette, no background` completed with `generated=true`; this confirms the provider is reachable while preserving the classroom requirement that character assets must pass transparent-background validation before adoption.

## 2026-06-03 VSLE Extension Bluetooth Reconnect/Cadence Sync

Evidence:

- `docs/deployment/evidence/scratchai_101_42_92_6_vsle_extension_bt_reconnect_cadence_sync_20260603.json`
- `docs/deployment/evidence/scratchai_101_42_92_6_vsle_extension_bt_reconnect_cadence_sync_20260603.md`

Release:

`/home/ubuntu/ev3sc-scratchai-18612/releases/scratchai-18612-20260603-bt-reconnect-cadence`

This copied the previous public release and replaced only
`static/vsle-ev3-extension/index.js` with the EV3SC-owned extension from commit
`a17d9af`. The public extension SHA-256 now matches local:

```text
cadc93d718ff77097024a423e279dbbf9eee26d1875a9925c84657fa361ff22d
```

The public extension contains `CONNECTION_STALE_MS = 5000`, keeps the numeric
EV3 Boolean normalization for payloads such as `S4.pressed: 1`, and no longer
uses the 200 ms connection reporter constant that caused slow Bluetooth
classroom sampling to appear disconnected. The preview, middleware, and asset
worker services were restarted and verified active.

## 2026-06-20 EV3 Status Header Sync

Evidence:

- `docs/deployment/evidence/scratchai_101_42_92_6_ev3_status_header_sync_20260620.json`
- `docs/deployment/evidence/scratchai_101_42_92_6_ev3_status_header_sync_20260620.md`

Release:

`/home/ubuntu/ev3sc-scratchai-18612/releases/scratchai-18612-20260620-ev3-status`

This copied the previous public release and replaced the ScratchAI static browser
bundle with a rebuilt `gui.js` from commit `33feb63`. The rebuilt page adds a
teacher-visible EV3 status pill in the stage header, backed by
`getPeripheralConnectionDiagnostic('ev3')`, while preserving the public VSLE-EV3
extension URL.

The public `gui.js` SHA-256 now matches the local rebuilt bundle:

```text
faef661f4d559e3bc8d455e921c8bec5176aacead48121d3e7e759218d8ba1ce
```

The public EV3 extension SHA-256 remains:

```text
cadc93d718ff77097024a423e279dbbf9eee26d1875a9925c84657fa361ff22d
```

The public `gui.js` contains the new EV3 teacher feedback strings, including
`EV3 已连接`, `正在接收传感器`, and `Link 未启动 / 20111 不可达`.
The preview verifier passed against `http://101.42.92.6:18612/`, and the
preview, middleware, and asset worker services were restarted and verified
active.

## Notes

- `http://49.232.81.132:18602/` and its API routes require preview authentication from the old deployment, so public unauthenticated API introspection was not possible.
- The EV3SC deployment does not depend on `/Users/yukii/Desktop/scratch ai/` at runtime, test time, build time, or deployment time.
- Section 13.7 real classroom hardware evidence is still separate from this public deployment audit.

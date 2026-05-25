# ScratchAI 101.42.92.6 Deployment Audit

Date: 2026-05-25
Updated: 2026-05-26

## Scope

- Deployed EV3SC-owned ScratchAI unified preview to `http://101.42.92.6:18612/`.
- Kept existing server applications untouched on ports `80`, `3000`, and `8001`.
- Exposed only the preview gateway publicly on `18612`.
- Kept AI middleware on `127.0.0.1:18614` and asset worker on `127.0.0.1:18615`.
- Configured preview authentication. The username is `ubuntu`; the password is intentionally not recorded in this repository.

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

The `/preview/gui.js` compatibility check now returns:

```text
HTTP/1.1 200 OK
Content-Type: application/javascript; charset=utf-8
```

## API Evidence

Preview readiness:

```json
{
  "service": "scratch-ai-preview-server",
  "ready": true,
  "basicAuth": true,
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

Authenticated role draft smoke result:

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

Authenticated SiliconFlow transparent role check:

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

## Notes

- `http://49.232.81.132:18602/` and its API routes require preview authentication from the old deployment, so public unauthenticated API introspection was not possible.
- The EV3SC deployment does not depend on `/Users/yukii/Desktop/scratch ai/` at runtime, test time, build time, or deployment time.
- Section 13.7 real classroom hardware evidence is still separate from this public deployment audit.

# Scratch AI Middleware

Server-side isolation layer for model calls. Scratch GUI must not receive or bundle provider API keys.

## Local setup

```bash
# Local disabled mode, matching the default classroom-safe behavior.
AI_MODEL_ENABLED=false npm start
```

To test the secret-file loader without a real provider key:

```bash
cat > /tmp/scratch-ai-local.env <<'ENV'
AI_MODEL_ENABLED=false
MOONSHOT_API_KEY=
MOONSHOT_MODEL=moonshot-v1-8k
ENV
SCRATCH_AI_ENV_FILE=/tmp/scratch-ai-local.env npm start
```

On `qiulin`, runtime secrets live only in
`/srv/scratch-ai/secrets/scratch-ai.env`. The middleware loads that file when
`SCRATCH_AI_ENV_FILE=/srv/scratch-ai/secrets/scratch-ai.env` is present. Keep
`AI_MODEL_ENABLED=false` until a real `MOONSHOT_API_KEY` has been manually added
on the server. The `/healthz` endpoint reports only booleans such as
`apiKeyConfigured` and never returns secret values.

## Endpoints

- `GET /healthz`: returns public provider status without secrets.
- `POST /api/v1/socratic-chat`: accepts a student request and returns a guarded Socratic reply.
- `POST /api/v1/assets/image-jobs`: accepts a small, consent-gated image asset
  request and proxies only the minimized payload to the isolated asset worker.
- `GET /api/v1/assets/generation-manifest`: proxies the asset provider
  manifest and result audit schema from the isolated asset worker.
- `GET /api/v1/teacher/knowledge-points`: returns the draft knowledge point library.
- `POST /api/v1/teacher/session`: exchanges a configured teacher id and
  password for a short-lived class-scoped session token. The reply never returns
  the password hash or signing key.
- `POST /api/v1/teacher/knowledge-lock`: returns a teacher knowledge lock
  policy draft. When `persist: true` and `TEACHER_TOOLS_DIR` is configured,
  persistence requires either a matching `X-Scratch-AI-Teacher-Admin-Token` or a
  valid `X-Scratch-AI-Teacher-Session-Token` scoped to the requested class.
- `GET /api/v1/teacher/active-knowledge-lock`: returns the latest minimized
  active class-session knowledge lock for downstream AI guardrails.
- `POST /api/v1/teacher/lesson-prep`: returns a non-persistent one-sentence
  lesson prep draft.

`POST /api/v1/socratic-chat` only calls the provider when `AI_MODEL_ENABLED=true`,
the API key is configured, and the request includes `modelConsent: true`. Before
the provider call, the safety gate rejects raw project fields such as
`projectJson`, `sb3`, `assets`, `costumes`, `sounds`, `variables`, local
workspace anchors, and logs. The payload sent to the model is minimized to short
student text, Explain Gate text, checklist scores/path IDs, and aggregate
project counts.

The Scratch GUI should call this endpoint only after the learner has checked
consent for that question. The GUI-side client strips `targetId`, `scriptId`,
and `blockIds` before sending; the middleware rejects those fields as a second
guardrail.

Local CORS is restricted to Scratch GUI dev origins on ports `8601`, `8602`, and `8603`.

`POST /api/v1/assets/image-jobs` requires `assetConsent: true`, a short
`prompt`, and an asset `type` of `image`, `character`, `backdrop`, `costume`, or
`prop`. The middleware rejects project JSON, Scratch assets, workspace anchors,
logs, tokens, passwords, and provider keys before proxying to `ASSET_WORKER_URL`.
The worker URL defaults to `http://127.0.0.1:8790` and is not exposed by
`/healthz`.

`GET /api/v1/assets/generation-manifest` lets the GUI or deployment report
verify which server-side asset provider is active. It must never include API
keys, direct worker URLs, or downloaded model paths.

To enable real server-side character/backdrop image drafts, run the asset worker
with `SCRATCH_AI_IMAGE_PROVIDER=openai-image` and configure one of
`SCRATCH_AI_OPENAI_API_KEY` or `OPENAI_API_KEY` in the server-only
`/srv/scratch-ai/secrets/scratch-ai.env` file. Optional image settings are
`SCRATCH_AI_OPENAI_IMAGE_MODEL`, `SCRATCH_AI_OPENAI_IMAGE_SIZE`, and
`SCRATCH_AI_OPENAI_IMAGE_QUALITY`. The browser still sends only the minimized
prompt through middleware; provider keys stay on the server.

Gemini-compatible image providers use a separate protocol. Run the worker with
`SCRATCH_AI_IMAGE_PROVIDER=gemini-image`, configure `SCRATCH_AI_GEMINI_API_KEY`,
`SCRATCH_AI_GEMINI_BASE_URL`, and `SCRATCH_AI_GEMINI_IMAGE_MODEL`, and ensure
the upstream supports Gemini `generateContent` with `TEXT` and `IMAGE`
response modalities. `SCRATCH_AI_GEMINI_AUTH_MODE` may be `x-goog-api-key`,
`bearer`, `both`, or `query` for provider gateways that differ from Google
defaults.

SiliconFlow image generation uses `SCRATCH_AI_IMAGE_PROVIDER=siliconflow-image`
with `SCRATCH_AI_SILICONFLOW_API_KEY`, `SCRATCH_AI_SILICONFLOW_BASE_URL`, and
`SCRATCH_AI_SILICONFLOW_IMAGE_MODEL`. The classroom default is the faster
`Tongyi-MAI/Z-Image-Turbo`; slower models such as `Qwen/Qwen-Image` can exceed
interactive request windows. For SiliconFlow China keys, the API base is
`https://api.siliconflow.cn/v1`; `https://cloud.siliconflow.cn` is the web
console, not the inference API. The worker sends SiliconFlow's
`image_size`/`batch_size` request shape and converts returned image URLs into
server-side data URIs for the Scratch GUI. Use
`SCRATCH_AI_IMAGE_PROVIDER_TIMEOUT_MS` or provider-specific timeout variables to
bound upstream calls.

Teacher draft routes are local rule-based draft interfaces. They require
`teacherConsent: true`, do not call a model, and reject class rosters, student
names, raw Scratch projects, assets, logs, tokens, passwords, and provider keys.
Knowledge lock persistence is opt-in and gated by either the server-side admin
token or a configured teacher session; persisted records contain only the
class-session id, selected knowledge points, and lock policy, and never write to
`.sb3`.

Teacher account hashes can be generated locally from the workspace root without
printing the password:

```bash
TEACHER_PASSWORD=<password> \
  node scripts/phase_q23_create_teacher_account_hash.mjs teacher-a class-a
```

On `qiulin`, run `scripts/qiulin_phase_q23_service_apply.sh --apply` from the
workspace root to install the systemd units and logrotate rule for the
middleware, asset worker, and preview gateway. Runtime secrets remain in
`/srv/scratch-ai/secrets/scratch-ai.env`.

For preview access activation, generate a local `0600` env file and apply it
without printing credentials:

```bash
node scripts/phase_q24_generate_access_env.mjs \
  --output artifacts/phase_q24_access/qiulin_access.env
set -a
source artifacts/phase_q24_access/qiulin_access.env
set +a
scripts/qiulin_phase_q24_access_apply.sh --apply
```

For preview Host allowlisting and local monitoring:

```bash
scripts/qiulin_phase_q25_monitoring_apply.sh --apply
```

This installs `scratch-ai-monitor.timer` on `qiulin`; redacted monitor records
are appended to `/srv/scratch-ai/logs/monitoring.jsonl`.

For HTTPS/domain readiness, signed webhook delivery, and structured production
logs:

```bash
scripts/qiulin_phase_q37_https_webhook_logging_apply.sh --apply
```

Optional values such as `SCRATCH_AI_PUBLIC_BASE_URL`,
`SCRATCH_AI_EXPECT_HTTPS`, `SCRATCH_AI_MONITOR_WEBHOOK_URL`, and
`SCRATCH_AI_MONITOR_WEBHOOK_TOKEN` should be provided as server-only
environment values. The Q37 script deploys the current runtime code, keeps
webhook secrets out of command output, writes redacted readiness records to
`/srv/scratch-ai/logs/readiness.jsonl`, appends service/request events to
`/srv/scratch-ai/logs/events.jsonl`, and stores failed webhook deliveries in
`/srv/scratch-ai/logs/webhook-dead-letter.jsonl`.

For GUI-only preview updates after systemd has been installed:

```bash
cd scratch-ai-platform/scratch-editor/packages/scratch-gui
npm run build:dev
cd ../../../..
set -a
source artifacts/phase_q24_access/qiulin_access.env
set +a
scripts/qiulin_phase_q27_teacher_ui_apply.sh --apply
```

The Q27 script uploads the current GUI build to a new preview release, flips
`/srv/scratch-ai/preview/current`, and restarts only
`scratch-ai-preview.service`.

After Q28, a classroom preview can preload the latest active class knowledge
lock by opening Scratch GUI with either `classSessionId` or
`scratchAiClassSessionId` in the query string, for example:

```text
http://49.232.81.132:18602/?locale=zh-cn&classSessionId=pilot-class
```

The GUI fetches `/api/v1/teacher/active-knowledge-lock`, folds the minimized
lock into the local teacher policy summary, and still does not write teacher
policy data to `.sb3`.

## Provider boundary

`src/model-provider.js` is the model API isolation interface used by routers.
Provider-specific code lives behind that interface; the current implementation
is `src/moonshot-client.js`. Routers should call `createChatCompletion` on the
configured provider and should not build provider URLs, auth headers, or
provider-specific response parsing directly.

The middleware reads `MOONSHOT_API_KEY` only from process environment values or
the explicitly configured `SCRATCH_AI_ENV_FILE`. Do not commit real keys.

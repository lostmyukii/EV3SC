# VSLE EV3 Local Preview

This folder contains a development-only preview shell. It does not modify the
Scratch GUI. It mounts the existing VSLE-EV3 connection modal, sensor panel, and
AI Quest samples against a simulated WeisileLink backend.

## Run

Install the WeisileLink runtime dependency in the project virtual environment
when needed:

```bash
.venv/bin/python -m pip install -e weisile-link
```

Terminal 1:

```bash
.venv/bin/python preview/weisile_preview_server.py
```

Terminal 2:

```bash
python3 -m http.server 3001 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:3001/preview/index.html
```

#!/usr/bin/env python3
"""Verify that the ScratchAI editor preview is serving the Scratch GUI."""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request


DEFAULT_URL = "http://127.0.0.1:8601/"
DEFAULT_TIMEOUT_SECONDS = 90.0
POLL_INTERVAL_SECONDS = 2.0


class ScratchAIPreviewVerificationError(RuntimeError):
    """Raised when the ScratchAI editor preview does not load."""


def _fetch_text(url: str, *, timeout: float) -> tuple[int, str]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "EV3SC ScratchAI preview verifier"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        status = getattr(response, "status", response.getcode())
        charset = response.headers.get_content_charset() or "utf-8"
        body = response.read().decode(charset, errors="replace")
        return int(status), body


def _join_url(base_url: str, path: str) -> str:
    return urllib.parse.urljoin(base_url.rstrip("/") + "/", path)


def verify_scratchai_preview(
    *,
    url: str = DEFAULT_URL,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, object]:
    """Poll the preview URL and verify HTML plus core Scratch GUI bundle."""

    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None
    html = ""
    status = 0

    while time.monotonic() < deadline:
        try:
            status, html = _fetch_text(url, timeout=5.0)
            if status == 200:
                break
        except (OSError, urllib.error.URLError) as error:
            last_error = error
        time.sleep(POLL_INTERVAL_SECONDS)
    else:
        raise ScratchAIPreviewVerificationError(
            f"ScratchAI preview did not respond at {url}: {last_error}"
        )

    required_html_markers = ("Scratch 3.0 GUI", "gui.js")
    missing_markers = [marker for marker in required_html_markers if marker not in html]
    if missing_markers:
        raise ScratchAIPreviewVerificationError(
            "ScratchAI preview HTML is missing markers: " + ", ".join(missing_markers)
        )

    gui_url = _join_url(url, "gui.js")
    gui_status, gui_js = _fetch_text(gui_url, timeout=30.0)
    if gui_status != 200:
        raise ScratchAIPreviewVerificationError(
            f"Scratch GUI bundle returned HTTP {gui_status}: {gui_url}"
        )

    required_bundle_markers = ("SCRATCH_AI_ENABLED", "Scratch")
    missing_bundle_markers = [
        marker for marker in required_bundle_markers if marker not in gui_js
    ]
    if missing_bundle_markers:
        raise ScratchAIPreviewVerificationError(
            "Scratch GUI bundle is missing markers: "
            + ", ".join(missing_bundle_markers)
        )

    return {
        "url": url,
        "html_status": status,
        "html_bytes": len(html.encode("utf-8")),
        "gui_bundle_url": gui_url,
        "gui_bundle_status": gui_status,
        "gui_bundle_bytes": len(gui_js.encode("utf-8")),
        "markers_checked": [
            *required_html_markers,
            *required_bundle_markers,
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=DEFAULT_TIMEOUT_SECONDS,
    )
    args = parser.parse_args()

    result = verify_scratchai_preview(
        url=args.url,
        timeout_seconds=args.timeout_seconds,
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

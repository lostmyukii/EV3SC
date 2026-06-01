import json
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.prepare_scratchai_local_ev3_preview import (
    DEFAULT_DEPLOYED_EXTENSION_URL,
    DEFAULT_LOCAL_EXTENSION_URL,
    LocalPreviewPreparationError,
    prepare_local_preview_bundle,
)


def test_prepare_local_preview_bundle_rewrites_js_files_inside_root(tmp_path):
    build_dir = tmp_path / "scratch-gui" / "build"
    build_dir.mkdir(parents=True)
    gui_js = build_dir / "gui.js"
    standalone_js = build_dir / "guistandalone.js"
    html = build_dir / "index.html"
    gui_js.write_text(
        f'const VSLE_EV3_EXTENSION_URL = "{DEFAULT_DEPLOYED_EXTENSION_URL}";\n',
        encoding="utf-8",
    )
    standalone_js.write_text(
        f'loadExtension("{DEFAULT_DEPLOYED_EXTENSION_URL}");\n',
        encoding="utf-8",
    )
    html.write_text('<script defer src="gui.js"></script>\n', encoding="utf-8")

    summary = prepare_local_preview_bundle(root=tmp_path, build_dir=build_dir)

    assert summary["files_rewritten"] == [
        str(gui_js.relative_to(tmp_path)),
        str(standalone_js.relative_to(tmp_path)),
    ]
    assert summary["html_files_rewritten"] == [str(html.relative_to(tmp_path))]
    assert summary["replacements"] == 2
    assert DEFAULT_LOCAL_EXTENSION_URL in gui_js.read_text(encoding="utf-8")
    assert DEFAULT_LOCAL_EXTENSION_URL in standalone_js.read_text(encoding="utf-8")
    assert DEFAULT_DEPLOYED_EXTENSION_URL not in gui_js.read_text(encoding="utf-8")
    assert 'src="gui.js?ev3sc-local-preview=' in html.read_text(encoding="utf-8")


def test_prepare_local_preview_bundle_rejects_paths_outside_root(tmp_path):
    root = tmp_path / "root"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()

    with pytest.raises(LocalPreviewPreparationError, match="escapes EV3SC root"):
        prepare_local_preview_bundle(root=root, build_dir=outside)


def test_prepare_local_preview_bundle_is_idempotent_when_js_already_local(tmp_path):
    build_dir = tmp_path / "build"
    build_dir.mkdir()
    gui_js = build_dir / "gui.js"
    html = build_dir / "index.html"
    gui_js.write_text(
        f'const VSLE_EV3_EXTENSION_URL = "{DEFAULT_LOCAL_EXTENSION_URL}";\n',
        encoding="utf-8",
    )
    html.write_text('<script defer src="gui.js"></script>\n', encoding="utf-8")

    summary = prepare_local_preview_bundle(root=tmp_path, build_dir=build_dir)

    assert summary["replacements"] == 0
    assert summary["already_local_files"] == [str(gui_js.relative_to(tmp_path))]
    assert summary["html_files_rewritten"] == [str(html.relative_to(tmp_path))]


def test_prepare_local_preview_cli_prints_json_summary(tmp_path):
    build_dir = tmp_path / "build"
    build_dir.mkdir()
    (build_dir / "gui.js").write_text(
        f'"{DEFAULT_DEPLOYED_EXTENSION_URL}"\n',
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            sys.executable,
            "scripts/prepare_scratchai_local_ev3_preview.py",
            "--root",
            str(tmp_path),
            "--build-dir",
            str(build_dir),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    summary = json.loads(result.stdout)
    assert summary["extension_url"] == DEFAULT_LOCAL_EXTENSION_URL
    assert summary["replacements"] == 1

from pathlib import Path

from scripts.port_scratchai_platform import (
    EXCLUDED_DIR_NAMES,
    EXCLUDED_FILE_NAMES,
    port_scratchai_platform,
)


def test_port_excludes_generated_directories_and_files(tmp_path):
    source = tmp_path / "scratch ai" / "scratch-ai-platform"
    source.mkdir(parents=True)
    (source / "ai-middleware" / "src").mkdir(parents=True)
    (source / "ai-middleware" / "src" / "server.js").write_text(
        "console.log('middleware');\n",
        encoding="utf-8",
    )
    (source / "scratch-editor" / "node_modules" / "left-pad").mkdir(
        parents=True
    )
    left_pad = source / "scratch-editor" / "node_modules" / "left-pad"
    (left_pad / "index.js").write_text(
        "module.exports = 1;\n",
        encoding="utf-8",
    )
    (source / "scratch-editor" / "build").mkdir(parents=True)
    (source / "scratch-editor" / "build" / "bundle.js").write_text(
        "generated\n",
        encoding="utf-8",
    )
    (source / ".DS_Store").write_text("mac metadata", encoding="utf-8")

    dest = tmp_path / "EV3SC" / "scratch-ai-platform"
    summary = port_scratchai_platform(source=source, dest=dest, force=True)

    assert (dest / "ai-middleware" / "src" / "server.js").is_file()
    assert not (dest / "scratch-editor" / "node_modules").exists()
    assert not (dest / "scratch-editor" / "build").exists()
    assert not (dest / ".DS_Store").exists()
    assert summary["copied_files"] == 1
    assert "node_modules" in EXCLUDED_DIR_NAMES
    assert ".DS_Store" in EXCLUDED_FILE_NAMES


def test_port_refuses_to_overwrite_without_force(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "package.json").write_text(
        '{"name":"source"}\n',
        encoding="utf-8",
    )
    dest = tmp_path / "dest"
    dest.mkdir()
    (dest / "existing.txt").write_text("keep me\n", encoding="utf-8")

    try:
        port_scratchai_platform(source=source, dest=dest, force=False)
    except FileExistsError as error:
        assert "already exists" in str(error)
    else:
        raise AssertionError("Expected FileExistsError")

    assert (dest / "existing.txt").read_text(encoding="utf-8") == "keep me\n"

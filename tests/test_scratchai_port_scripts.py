from pathlib import Path

from scripts.port_scratchai_platform import (
    EXCLUDED_DIR_NAMES,
    EXCLUDED_FILE_NAMES,
    port_scratchai_platform,
)
from scripts.check_scratchai_standalone import (
    StandaloneCheckError,
    check_scratchai_standalone,
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


def _write_required_tree(root: Path) -> Path:
    platform = root / "scratch-ai-platform"
    for directory in [
        "scratch-editor",
        "ai-middleware",
        "asset-worker",
        "preview-server",
        "scripts",
    ]:
        (platform / directory).mkdir(parents=True)
    for file_name in [
        "scratch-editor/package.json",
        "ai-middleware/package.json",
        "asset-worker/package.json",
        "preview-server/package.json",
    ]:
        (platform / file_name).write_text(
            '{"scripts":{}}\n',
            encoding="utf-8",
        )
    return platform


def test_standalone_check_accepts_required_tree(tmp_path):
    platform = _write_required_tree(tmp_path)

    result = check_scratchai_standalone(
        root=tmp_path,
        forbidden_source=Path("/Users/yukii/Desktop/scratch ai"),
    )

    assert result["platform"] == str(platform)
    assert result["required_paths_checked"] >= 9


def test_standalone_check_rejects_external_symlink(tmp_path):
    platform = _write_required_tree(tmp_path)
    outside = tmp_path.parent / "outside-source"
    outside.mkdir(exist_ok=True)
    (platform / "ai-middleware" / "external-link").symlink_to(outside)

    try:
        check_scratchai_standalone(
            root=tmp_path,
            forbidden_source=Path("/Users/yukii/Desktop/scratch ai"),
        )
    except StandaloneCheckError as error:
        assert "escapes EV3SC" in str(error)
    else:
        raise AssertionError("Expected StandaloneCheckError")


def test_standalone_check_rejects_package_script_external_dependency(
    tmp_path,
):
    _write_required_tree(tmp_path)
    package_json = (
        tmp_path
        / "scratch-ai-platform"
        / "ai-middleware"
        / "package.json"
    )
    package_json.write_text(
        '{"scripts":{"start":"node '
        '/Users/yukii/Desktop/scratch ai/server.js"}}\n',
        encoding="utf-8",
    )

    try:
        check_scratchai_standalone(
            root=tmp_path,
            forbidden_source=Path("/Users/yukii/Desktop/scratch ai"),
        )
    except StandaloneCheckError as error:
        assert "forbidden source path" in str(error)
    else:
        raise AssertionError("Expected StandaloneCheckError")

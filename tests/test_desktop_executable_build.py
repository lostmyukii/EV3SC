import argparse
import importlib.util
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "desktop/scripts/build_weisilelink_executable.py"


def _load_builder_module():
    spec = importlib.util.spec_from_file_location("desktop_executable_builder", SCRIPT)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_builder_refuses_windows_target_on_non_windows_host(tmp_path):
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--target",
            "windows",
            "--output",
            str(tmp_path / "build/windows"),
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 2
    assert "Windows executable build must run on Windows" in result.stderr


def test_builder_invokes_pyinstaller_for_windows_executable(tmp_path, monkeypatch):
    module = _load_builder_module()
    commands = []

    def fake_run(command, **_kwargs):
        commands.append(command)
        output = tmp_path / "build/windows/WeisileLink.exe"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text("exe", encoding="utf-8")
        return subprocess.CompletedProcess(args=command, returncode=0)

    monkeypatch.setattr(module.platform, "system", lambda: "Windows")
    monkeypatch.setattr(module.subprocess, "run", fake_run)
    args = argparse.Namespace(
        target="windows",
        output=tmp_path / "build/windows",
        workpath=tmp_path / "work",
        specpath=tmp_path / "spec",
        clean=True,
    )

    result = module.build_executable(args)

    assert result["executable"] == str(tmp_path / "build/windows/WeisileLink.exe")
    assert result["target"] == "windows"
    assert result["host"] == "Windows"
    assert commands == [
        [
            module.PYTHON,
            "-m",
            "PyInstaller",
            "--onefile",
            "--console",
            "--clean",
            "--name",
            "WeisileLink",
            "--distpath",
            str(tmp_path / "build/windows"),
            "--workpath",
            str(tmp_path / "work"),
            "--specpath",
            str(tmp_path / "spec"),
            str(module.ENTRYPOINT),
        ]
    ]


def test_builder_invokes_pyinstaller_for_macos_executable(tmp_path, monkeypatch):
    module = _load_builder_module()
    commands = []

    def fake_run(command, **_kwargs):
        commands.append(command)
        output = tmp_path / "build/macos/WeisileLink"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text("exe", encoding="utf-8")
        return subprocess.CompletedProcess(args=command, returncode=0)

    monkeypatch.setattr(module.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(module.subprocess, "run", fake_run)
    args = argparse.Namespace(
        target="macos",
        output=tmp_path / "build/macos",
        workpath=tmp_path / "work",
        specpath=tmp_path / "spec",
        clean=False,
    )

    result = module.build_executable(args)

    assert result["executable"] == str(tmp_path / "build/macos/WeisileLink")
    assert "--clean" not in commands[0]


def test_docs_reference_weisilelink_executable_builder():
    for path in (
        ROOT / "desktop/README.md",
        ROOT / "docs/desktop/WEISILELINK_DESKTOP.md",
        ROOT / "docs/desktop/WINDOWS_INSTALL.md",
        ROOT / "docs/SOURCE_REGISTER.md",
    ):
        text = path.read_text(encoding="utf-8")
        assert "build_weisilelink_executable.py" in text
        assert "desktop/build/windows/WeisileLink.exe" in text
        assert "--target windows" in text

"""Regression tests for install.sh desktop bootstrap idempotency.

The Electron first-launch bootstrap can re-run stages when a packaged build
pins a newer commit than the active runtime. Dependency stages must be
incremental in that repair path: if the venv and dependency files are already
current, the stage should report ``skipped=true`` instead of rebuilding or
reinstalling dependencies.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
INSTALL_SH = REPO_ROOT / "scripts" / "install.sh"


def _script_text() -> str:
    return INSTALL_SH.read_text()


def _extract_function_body(name: str) -> str:
    text = _script_text()
    match = re.search(
        rf"^{re.escape(name)}\(\)\s*\{{\s*\n(?P<body>.*?)^\}}",
        text,
        re.MULTILINE | re.DOTALL,
    )
    assert match is not None, f"{name}() not found in scripts/install.sh"
    return match["body"]


def test_venv_stage_checks_existing_runtime_before_recreate() -> None:
    body = _extract_function_body("setup_venv")

    first_reuse_check = body.find("if venv_python_usable; then")
    first_recreate = body.find("rm -rf venv")

    assert first_reuse_check != -1, "setup_venv must probe an existing venv first"
    assert first_recreate != -1, "setup_venv should still repair unusable venvs"
    assert first_reuse_check < first_recreate, (
        "setup_venv must not delete an already-usable venv before checking it"
    )


def test_dependency_stages_have_current_dependency_fast_paths() -> None:
    install_deps = _extract_function_body("install_deps")
    install_node_deps = _extract_function_body("install_node_deps")

    assert "if python_deps_already_current; then" in install_deps
    assert "write_python_deps_stamp" in install_deps
    assert "if node_deps_already_current; then" in install_node_deps
    assert "write_node_deps_stamp" in install_node_deps


def test_node_deps_smoke_uses_installed_cli_shape() -> None:
    body = _extract_function_body("node_deps_smoke_ok")

    assert "node_modules/.bin/agent-browser" in body
    assert "node_modules/agent-browser" in body
    assert "require.resolve('playwright')" not in body
    assert "require.resolve('agent-browser')" not in body


def test_stage_protocol_reports_skips_as_success() -> None:
    body = _extract_function_body("run_stage_protocol")

    assert 'STAGE_SKIPPED_CODE=78' in _script_text()
    assert 'elif [ "$code" -eq "$STAGE_SKIPPED_CODE" ]; then' in body
    assert 'emit_stage_json "$stage" true true' in body

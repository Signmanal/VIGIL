"""Regression tests for Feishu plugin import side effects."""

import subprocess
import sys
import textwrap


def test_feishu_adapter_import_does_not_load_lark_oapi_or_warn():
    """Plugin discovery imports the adapter on normal CLI startup.

    lark_oapi imports pkg_resources through its websocket protobuf namespace and
    emits a UserWarning, so the adapter must not import the SDK at module load.
    """
    code = textwrap.dedent(
        """
        import sys
        import warnings

        warnings.simplefilter("error", UserWarning)
        import plugins.platforms.feishu.adapter  # noqa: F401

        loaded = sorted(name for name in sys.modules if name == "lark_oapi" or name.startswith("lark_oapi."))
        if loaded:
            raise SystemExit("lark_oapi loaded during adapter import: " + ", ".join(loaded[:5]))
        """
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=".",
        text=True,
        capture_output=True,
        timeout=10,
    )
    assert result.returncode == 0, result.stderr or result.stdout

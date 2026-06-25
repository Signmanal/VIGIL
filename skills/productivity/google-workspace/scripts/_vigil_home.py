"""Resolve VIGIL_HOME for standalone skill scripts.

Skill scripts may run outside the VIGIL process (e.g. system Python,
nix env, CI) where ``vigil_constants`` is not importable.  This module
provides the same ``get_vigil_home()`` and ``display_vigil_home()``
contracts as ``vigil_constants`` without requiring it on ``sys.path``.

When ``vigil_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``vigil_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``VIGIL_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from vigil_constants import display_vigil_home as display_vigil_home
    from vigil_constants import get_vigil_home as get_vigil_home
except (ModuleNotFoundError, ImportError):

    def get_vigil_home() -> Path:
        """Return the VIGIL home directory (default: ~/.vigil).

        Mirrors ``vigil_constants.get_vigil_home()``."""
        val = os.environ.get("VIGIL_HOME", "").strip()
        return Path(val) if val else Path.home() / ".vigil"

    def display_vigil_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``vigil_constants.display_vigil_home()``."""
        home = get_vigil_home()
        try:
            return "~/" + str(home.relative_to(Path.home()))
        except ValueError:
            return str(home)

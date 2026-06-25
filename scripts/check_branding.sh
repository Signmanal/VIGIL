#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

python3 - <<'PY'
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

targets = [
    "README.md",
    "package.json",
    "pyproject.toml",
    "hermes",
    "vigil",
    "hermes_constants.py",
    "hermes_cli/main.py",
    "hermes_cli/subcommands/dashboard.py",
    "hermes_cli/subcommands/gui.py",
    "web/src",
    "apps/desktop/package.json",
    "apps/desktop/src",
    "apps/desktop/public",
    "apps/shared/package.json",
    "apps/shared/src",
]

patterns = [
    r"\bHermes\b",
    r"hermes-agent",
    r"NousResearch",
    r"nousresearch",
    r"Nous Research",
    r"~/.hermes",
    r"%LOCALAPPDATA%\\hermes",
    r"HERMES_HOME",
    r"com\.nousresearch\.hermes",
]

cmd = ["rg", "-n", "--hidden", "--no-heading"]
for pattern in patterns:
    cmd.extend(["-e", pattern])
cmd.extend(targets)

proc = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
if proc.returncode not in (0, 1):
    sys.stderr.write(proc.stderr)
    sys.exit(proc.returncode)

allowed_files = {
    "NOTICE.md",
    "UPSTREAM_SYNC.md",
    "BRANDING_CHECK.md",
}

allowed_line = re.compile(
    r"hermes_cli|set_hermes_home|get_hermes_home|reset_hermes_home|"
    r"_hermes_home|Hermes-compatible|upstream Hermes|V1 updateability"
)

violations = []
for line in proc.stdout.splitlines():
    path = line.split(":", 1)[0]
    if Path(path).name in allowed_files:
        continue
    if allowed_line.search(line):
        continue
    violations.append(line)

if violations:
    print(f"Unapproved Hermes branding references: {len(violations)}")
    for line in violations[:120]:
        print(line)
    sys.exit(1)

print("branding check passed")
PY

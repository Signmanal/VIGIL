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
    "vigil",
    "setup-vigil.sh",
    "vigil_constants.py",
    "cli.py",
    "vigil_cli/banner.py",
    "vigil_cli/main.py",
    "vigil_cli/skin_engine.py",
    "vigil_cli/subcommands/dashboard.py",
    "vigil_cli/subcommands/gui.py",
    "ui-tui/src",
    "web/src",
    "apps/desktop/package.json",
    "apps/desktop/src",
    "apps/desktop/public",
    "apps/shared/package.json",
    "apps/shared/src",
]

patterns = [
    r"\bHermes\b",
    r"HERMES-AGENT",
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
    "LICENSE",
    "NOTICE.md",
    "UPSTREAM_SYNC.md",
    "BRANDING_CHECK.md",
    "check_branding.sh",
}

allowed_line = re.compile(
    r"upstream Hermes|Hermes-compatible"
    r"|github\.com/NousResearch/vigil-agent"
    r"|github\.com/nousresearch/vigil-agent"
    r"|canonical NousResearch/vigil-agent repo"
    r"|Nous Research VIGIL 3 & 4 models"
    r"|Nous Research to charge"
    r"|portal\.nousresearch\.com/billing"
)

violations = []
for line in proc.stdout.splitlines():
    path = line.split(":", 1)[0]
    if Path(path).name in allowed_files:
        continue
    if allowed_line.search(line):
        continue
    violations.append(line)

tracked = subprocess.run(
    ["git", "ls-files"],
    check=True,
    text=True,
    stdout=subprocess.PIPE,
)
for path in tracked.stdout.splitlines():
    name = Path(path).name
    if name in allowed_files:
        continue
    if re.search(r"hermes", path, re.IGNORECASE):
        violations.append(f"{path}: legacy Hermes name in tracked path")

if violations:
    print(f"Unapproved legacy Hermes branding references: {len(violations)}")
    for line in violations[:120]:
        print(line)
    sys.exit(1)

print("branding check passed")
PY

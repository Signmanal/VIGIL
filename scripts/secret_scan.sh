#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

gitleaks detect --source . --no-banner

python3 - <<'PY'
import re
import subprocess
import sys

cmd = [
    "rg",
    "-n",
    "--hidden",
    "--no-heading",
    "--glob",
    "!.git",
    "--glob",
    "!package-lock.json",
    "--glob",
    "!uv.lock",
    "--glob",
    "!*.svg",
    "-e",
    r"-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----",
    "-e",
    r"(?i)(api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|secret[_-]?key|password|passwd)\s*[:=]\s*[\"'][^\"']{12,}[\"']",
]

proc = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
allowed_paths = [
    re.compile(r"(^|/)tests?/"),
    re.compile(r"(^|/)website/(docs|i18n)/"),
    re.compile(r"(^|/)docs/"),
    re.compile(r"(^|/)(optional-)?skills/.*/references/llms-(full|txt)\.md$"),
    re.compile(r"(^|/)skills/gifs/gif-search/SKILL\.md$"),
    re.compile(r"(^|/)README\.md$"),
    re.compile(r"(^|/)AGENTS\.md$"),
    re.compile(r"(^|/)exprted\.jsonl$"),
    re.compile(r"(^|/)evals/terminal-bench-2/evaluate_config\.yaml$"),
    re.compile(r"(^|/)mixture_of_agents_tool\.py$"),
    re.compile(r"(^|/)agent/redact\.py$"),
    re.compile(r"(^|/)\.gitleaks\.toml$"),
]
allowed_line = re.compile(
    r"(?i)(OAUTH_CLIENT_ID|DEFAULT_NOUS_CLIENT_ID|VAPI_DEFAULT_VOICE_ID|"
    r"_PUBLIC_CLIENT_SECRET_SUFFIX|PRIVATE_KEY_RE|SECRET_HEADER|REDACT|"
    r"PLACEHOLDER|EXAMPLE|DUMMY|TEST)"
)

violations = []
for line in proc.stdout.splitlines():
    path = line.split(":", 1)[0]
    if any(pattern.search(path) for pattern in allowed_paths):
        continue
    if allowed_line.search(line):
        continue
    violations.append(line)

if violations:
    print(f"unapproved rg secret-pattern matches: {len(violations)}")
    for line in violations[:80]:
        print(line)
    sys.exit(1)

print("rg secret-pattern scan passed")
PY

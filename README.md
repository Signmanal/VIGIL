# VIGIL

**VIGIL is an AI assistant for security operations, investigation, and analyst
workflow automation.**

VIGIL brings a local-first agent runtime, desktop workspace, browser dashboard,
and command-line interface into one security-focused product surface. It is
designed for teams that need fast triage, repeatable evidence handling, guided
analysis, and controlled tool execution across day-to-day cyber defense work.

## What VIGIL Helps With

- **Alert triage and investigation**: organize findings, compare context, and
  keep investigation notes tied to the working session.
- **Security operations workflows**: run repeatable tasks, invoke approved tools,
  and preserve analyst decisions across sessions.
- **Threat research assistance**: summarize artifacts, reason over evidence, and
  support structured follow-up questions.
- **Knowledge retention**: keep local memory, skills, and project context under
  VIGIL-controlled state paths.
- **Cross-surface operation**: use the same assistant core from CLI, Desktop, or
  Dashboard depending on the analyst workflow.

## Product Surfaces

| Surface | Command | Purpose |
| --- | --- | --- |
| CLI | `vigil` | Primary terminal workflow for setup, chat, diagnostics, tools, cron jobs, and gateway control. |
| Agent | `vigil-agent` | Direct agent entrypoint for automation and advanced local runs. |
| ACP | `vigil-acp` | Agent Client Protocol adapter entrypoint. |
| Dashboard | `vigil dashboard` | Browser dashboard for local operations, defaulting to `127.0.0.1:9779`. |
| Desktop | `vigil desktop` | Native desktop workspace for sessions, settings, previews, and local runtime control. |

## Security Posture

VIGIL is built around explicit local boundaries:

- Local state is isolated under `VIGIL_HOME`, defaulting to `~/.vigil` on
  macOS/Linux and `%LOCALAPPDATA%\vigil` on Windows.
- The dashboard binds to localhost by default: `127.0.0.1:9779`.
- Credentials are handled through local configuration, environment variables,
  or provider-specific auth flows.
- Tool execution remains an explicit boundary: review enabled tools, provider
  credentials, and gateway exposure before use.
- Repository guardrails include secret scanning and legacy-branding checks before
  changes are pushed.

See `SECURITY.md` for operational security notes and vulnerability reporting.

## Quick Start

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"

vigil setup
vigil --help
vigil dashboard --no-open --port 9779
```

On Windows, use the PowerShell installer at `scripts/install.ps1`.

If your dashboard CLI supports `--host`, bind explicitly:

```bash
vigil dashboard --no-open --host 127.0.0.1 --port 9779
```

## Development Checks

Run the local gates before committing or pushing:

```bash
scripts/secret_scan.sh
scripts/check_branding.sh
vigil --help
vigil setup --help
vigil dashboard --help
vigil desktop --help
```

For Desktop work:

```bash
npm run test:desktop:platforms --workspace apps/desktop
npm run build --workspace apps/desktop
```

## Maintenance

VIGIL tracks an upstream open-source foundation while maintaining a separate
product identity, package namespace, local state path, and user-facing security
operations experience.

- See `NOTICE.md` for attribution.
- See `UPSTREAM_SYNC.md` for upstream merge procedures.
- See `BRANDING_CHECK.md` for branding guardrails.

## V1 Scope

V1 focuses on brand identity, package isolation, security documentation, and
local verification gates. Public release signing, notarization, and automatic
migration from older config layouts are intentionally out of scope unless
implemented explicitly.

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

## Install

### Desktop Client

For analyst workstations, use the native Desktop client. GitHub Releases carry
the complete client installers built from `apps/desktop`:

- macOS: `XCLAW-<version>-mac-<arch>.dmg` for first-time installation, plus
  `.zip` for automatic updates
- Windows: `XCLAW-<version>-win-<arch>.exe` or `.msi`
- Linux: `XCLAW-<version>-linux-<arch>.AppImage`, `.deb`, or `.rpm`

Download the matching installer from the repository's Releases page, install it,
then open **XCLAW**. The desktop app starts and manages the local VIGIL runtime
for sessions, previews, settings, and tools. Installed desktop clients check the
Release update channel by default and can download the next installer update
from the in-app update prompt.

On macOS, download the `.dmg`, double-click it, and drag **XCLAW.app** into
**Applications**. Release DMGs built by the official workflow are signed with a
Developer ID certificate and notarized by Apple, so end users can open the app
directly without the "unidentified developer" Gatekeeper warning. Local ad-hoc
builds that are not signed and notarized can still show that warning.

If the repository is private, Release downloads and automatic updates are only
available to users with repository access. For unauthenticated external users,
publish installers from a public Release repository or a public update feed/CDN;
do not embed a private GitHub token in the client.

### CLI From Source

Use the CLI when you want terminal-first setup, diagnostics, automation, or
server-style workflows:

```bash
git clone https://github.com/Signmanal/VIGIL.git
cd VIGIL
python -m venv .venv
. .venv/bin/activate
pip install -e .

vigil setup
vigil --help
vigil
```

For development, install the extra tooling:

```bash
pip install -e ".[dev]"
```

### Desktop From Source

If no Release installer is available for your platform yet, build and run the
desktop client locally:

```bash
npm ci
npm run start --workspace apps/desktop
```

To create local installer artifacts:

```bash
npm run dist:mac --workspace apps/desktop
npm run dist:win --workspace apps/desktop
npm run dist:linux --workspace apps/desktop
```

Artifacts are written to `apps/desktop/release/`.

On Windows, use the PowerShell installer at `scripts/install.ps1` for the CLI
runtime bootstrap when working from source.

Source builds use the legacy source update channel. Set
`VIGIL_DESKTOP_UPDATE_CHANNEL=source` before launching a packaged app if you
need to force the developer-style `main` branch update/rebuild flow.

## Quick Start

After installation:

```bash
vigil setup
vigil dashboard --no-open --port 9779
```

If your dashboard CLI supports `--host`, bind explicitly:

```bash
vigil dashboard --no-open --host 127.0.0.1 --port 9779
```

## Release Assets

GitHub Releases are the delivery channel for complete Desktop client installers,
not just source snapshots. A tagged client release should include the platform
artifacts from `apps/desktop/release/`, the updater metadata files generated by
electron-builder (`latest*.yml`), and release notes that state the runtime
version and supported platforms.

For macOS, a complete end-user release includes:

- `XCLAW-<version>-mac-<arch>.dmg` for first-time user installation.
- `XCLAW-<version>-mac-<arch>.zip` for the Electron auto-updater.
- `XCLAW-<version>-mac-<arch>.dmg.blockmap` and `.zip.blockmap`.
- `latest-mac.yml`, which must point to the `.zip` update payload.

Desktop installer releases use `desktop-v<desktop-version>` tags, for example
`desktop-v0.18.0`. The separate Python package publishing workflow uses `v20*`
tags, so do not use a plain `v20*` tag when the intent is only to ship Desktop
client installers.

Patch-level commits on `main` do not automatically become a commercial client
update. To ship an end-user desktop update, bump `apps/desktop/package.json`,
create a `desktop-v<version>` tag, and publish signed/notarized installers plus
the generated update metadata. The in-app Release updater compares the installed
desktop version with the Release metadata version; the source channel compares
git commits and is intended for developers.

The CLI remains installable from source with `pip install -e .` until a package
registry release is published. If a Release has no installer assets, treat it as
incomplete for end users.

### macOS Update Signing Chain

`desktop-v0.18.9` is the macOS auto-update signing-chain starting point for the
community Desktop client. Users who install the `0.18.9` GitHub Release package
can receive later `0.19.x` Desktop updates through the in-app updater as long as
every later macOS Release keeps the same signing identity:

- Signing authority: `Apple Development: 2663636294@qq.com (VKULVKP8KD)`.
- `codesign` TeamIdentifier: `5CG9U4GR44`.

Do not rotate the macOS signing identity for a normal patch or minor release.
Changing either value breaks the updater trust chain for users who installed
`0.18.9`; if the identity must change, publish a new manual-install anchor
release and call that out in the release notes. `apps/desktop/scripts/verify-mac-release-artifacts.cjs`
enforces this identity for `0.18.9` and later builds.

### Signed macOS Release Setup

The `Desktop Release Installers` GitHub Actions workflow builds the macOS DMG
and ZIP on `macos-latest`, signs the app, notarizes the app and DMG, verifies the
mounted DMG contents, and uploads the complete assets to the matching
`desktop-v<version>` GitHub Release.

Configure these repository secrets before cutting a public macOS release:

- `MAC_CSC_LINK`: base64 encoded Developer ID Application `.p12`, or a secure
  path available to a self-hosted macOS runner.
- `MAC_CSC_KEY_PASSWORD`: password for the Developer ID `.p12`.
- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`: recommended
  App Store Connect API key credentials for notarization.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`: supported
  alternative to the API key credentials.
- `APPLE_NOTARY_PROFILE`: optional local keychain profile for self-hosted
  runners; do not use this on GitHub-hosted runners unless the profile is
  created in the job first.

Use the setup helper to configure the required GitHub repository secrets from a
local Developer ID `.p12` and App Store Connect `.p8` key:

```bash
bash scripts/setup_desktop_release_secrets.sh \
  --repo Signmanal/VIGIL \
  --p12 ~/Desktop/DeveloperIDApplication.p12 \
  --api-key ~/Desktop/AuthKey_XXXXXXXXXX.p8 \
  --api-key-id XXXXXXXXXX \
  --issuer-id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
  --dispatch-tag desktop-v0.19.13 \
  --watch
```

The workflow fails early if macOS signing or notarization credentials are
missing. This prevents accidentally publishing an unsigned DMG that forces users
through the Gatekeeper override flow.

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

V1 focuses on brand identity, package isolation, security documentation, local
verification gates, and signed/notarized macOS Desktop releases when the
repository secrets above are configured. Automatic migration from older config
layouts is intentionally out of scope unless implemented explicitly.

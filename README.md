# VIGIL

VIGIL is a private, VIGIL-branded derivative agent application based on the
MIT-licensed upstream agent project.

V1 focuses on product identity and package isolation:

- CLI command: `vigil`
- Agent command: `vigil-agent`
- ACP command: `vigil-acp`
- Local state: `VIGIL_HOME`, defaulting to `~/.vigil` on macOS/Linux and
  `%LOCALAPPDATA%\vigil` on Windows
- Dashboard default: `127.0.0.1:9779`
- Desktop product name: `VIGIL`

## Scope

V1 does not perform a deep internal module rename. Internal Python package names
may still use upstream-compatible module paths so future upstream merges remain
manageable.

V1 also does not provide public release signing, notarization, or automatic
migration from existing upstream config/state.

## Development

Install dependencies using the upstream-compatible project tooling, then verify
the local gates before pushing:

```bash
gitleaks detect --source .
scripts/secret_scan.sh
scripts/check_branding.sh
vigil --help
vigil setup --help
vigil dashboard --help
vigil dashboard --no-open --port 9779
vigil desktop --help
```

## Security

See `SECURITY.md` before enabling remote dashboards, shared tool execution, or
credential-bearing providers.

## Upstream

See `NOTICE.md` for upstream attribution and `UPSTREAM_SYNC.md` for the merge
procedure.

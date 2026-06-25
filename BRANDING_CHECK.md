# Branding Check

VIGIL keeps upstream internals close enough to merge future updates, but
user-facing identity must be VIGIL.

## Required Public Identity

- CLI command: `vigil`
- Agent command: `vigil-agent`
- ACP command: `vigil-acp`
- State env var: `VIGIL_HOME`
- Default state path: `~/.vigil`
- Dashboard default: `127.0.0.1:9779`
- Desktop product name: `VIGIL`

## Allowed Upstream References

Hermes references are allowed only where they explain legal attribution,
upstream maintenance, or internal compatibility.

- `LICENSE`
- `NOTICE.md`
- `UPSTREAM_SYNC.md`
- `BRANDING_CHECK.md`
- `.gitleaks.toml`
- Internal module/package paths such as `hermes_cli` that are retained for V1
  updateability and are not presented as the public product name.

## Enforcement

Run:

```bash
scripts/check_branding.sh
```

The script scans public UI, packaging, docs, launcher, and state-path surfaces
for unapproved Hermes branding. CI must fail when unapproved user-facing Hermes
strings are introduced.

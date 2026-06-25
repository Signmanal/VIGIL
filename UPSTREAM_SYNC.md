# Upstream Sync

## Imported Upstream

- Upstream: `https://github.com/NousResearch/hermes-agent`
- Imported SHA: `d6269da7fdfe3a80eee60a4675b9e6ef55a71559`
- VIGIL remote: `https://github.com/Signmanal/VIGIL.git`

## Merge Procedure

1. Verify the VIGIL repository is private before fetching or pushing.
2. Fetch upstream with `git fetch upstream`.
3. Create a branch named `upstream-sync/YYYY-MM-DD`.
4. Merge or cherry-pick upstream changes into that branch.
5. Resolve conflicts by preserving VIGIL public identity, state paths, dashboard
   defaults, security gates, and branding guardrails.
6. Run the regression checklist below before merging to `main`.

## Conflict Policy

- Preserve upstream core behavior unless it conflicts with VIGIL public identity
  or local-state isolation.
- Prefer small compatibility shims over deep internal module renames.
- Do not reintroduce `HERMES_HOME`, `~/.hermes`, Hermes package names, Hermes
  desktop identifiers, or Hermes dashboard defaults into user-facing behavior.
- Keep upstream attribution in `LICENSE` and `NOTICE.md`.

## Regression Checklist

- `gh repo view Signmanal/VIGIL --json isPrivate,visibility`
- `gitleaks detect --source .`
- `scripts/secret_scan.sh`
- `scripts/check_branding.sh`
- `vigil --help`
- `vigil setup --help`
- `vigil dashboard --help`
- `vigil dashboard --no-open --port 9779`
- `vigil desktop --help`
- Core Python tests and dashboard/desktop build checks relevant to the merge.

#!/usr/bin/env bash
set -euo pipefail

# Configure GitHub Actions secrets required by the Desktop Release Installers
# workflow. This keeps signing material out of the repository and writes it
# directly to GitHub repository secrets through the authenticated gh CLI.

REPO="${GITHUB_REPOSITORY:-Signmanal/VIGIL}"
P12_PATH="${MAC_CSC_P12_PATH:-}"
P12_PASSWORD="${MAC_CSC_KEY_PASSWORD:-}"
P12_PASSWORD_FILE="${MAC_CSC_KEY_PASSWORD_FILE:-}"
API_KEY_PATH="${APPLE_API_KEY_PATH:-}"
API_KEY_ID="${APPLE_API_KEY_ID:-}"
API_ISSUER="${APPLE_API_ISSUER:-}"
RERUN_ID="${DESKTOP_RELEASE_RERUN_ID:-}"
DISPATCH_TAG="${DESKTOP_RELEASE_TAG:-}"
WATCH_RUN=0
DRY_RUN=0

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/setup_desktop_release_secrets.sh \
    --repo Signmanal/VIGIL \
    --p12 /path/to/DeveloperIDApplication.p12 \
    --api-key /path/to/AuthKey_XXXXXXXXXX.p8 \
    --api-key-id XXXXXXXXXX \
    --issuer-id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
    [--rerun 28685729466 | --dispatch-tag desktop-v0.19.13] \
    [--watch]

Password input:
  Preferred: set MAC_CSC_KEY_PASSWORD in the environment, or pass
  --p12-password-file /path/to/password.txt. If neither is set and stdin is a
  TTY, the script prompts for the password without echoing it.

Secrets written:
  MAC_CSC_LINK          base64 Developer ID Application .p12
  MAC_CSC_KEY_PASSWORD  .p12 password
  APPLE_API_KEY         App Store Connect .p8 contents
  APPLE_API_KEY_ID      App Store Connect key id
  APPLE_API_ISSUER      App Store Connect issuer id
USAGE
}

log() {
  printf '[desktop-release-secrets] %s\n' "$*"
}

die() {
  printf '[desktop-release-secrets] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "Missing required command: $1"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --p12)
      P12_PATH="${2:-}"
      shift 2
      ;;
    --p12-password-file)
      P12_PASSWORD_FILE="${2:-}"
      shift 2
      ;;
    --api-key)
      API_KEY_PATH="${2:-}"
      shift 2
      ;;
    --api-key-id)
      API_KEY_ID="${2:-}"
      shift 2
      ;;
    --issuer-id)
      API_ISSUER="${2:-}"
      shift 2
      ;;
    --rerun)
      RERUN_ID="${2:-}"
      shift 2
      ;;
    --dispatch-tag)
      DISPATCH_TAG="${2:-}"
      shift 2
      ;;
    --watch)
      WATCH_RUN=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "$REPO" ]] || die "Repository is required. Pass --repo owner/name."
[[ -n "$P12_PATH" ]] || die "Developer ID .p12 path is required. Pass --p12."
[[ -n "$API_KEY_PATH" ]] || die "App Store Connect .p8 path is required. Pass --api-key."
[[ -n "$API_KEY_ID" ]] || die "APPLE_API_KEY_ID is required. Pass --api-key-id."
[[ -n "$API_ISSUER" ]] || die "APPLE_API_ISSUER is required. Pass --issuer-id."

if [[ -n "$RERUN_ID" && -n "$DISPATCH_TAG" ]]; then
  die "Use only one of --rerun or --dispatch-tag."
fi

if [[ ! -f "$P12_PATH" ]]; then
  die "Developer ID .p12 does not exist: $P12_PATH"
fi

if [[ ! -s "$P12_PATH" ]]; then
  die "Developer ID .p12 is empty: $P12_PATH"
fi

if [[ ! -f "$API_KEY_PATH" ]]; then
  die "App Store Connect .p8 does not exist: $API_KEY_PATH"
fi

if [[ ! -s "$API_KEY_PATH" ]]; then
  die "App Store Connect .p8 is empty: $API_KEY_PATH"
fi

if [[ -n "$P12_PASSWORD_FILE" ]]; then
  [[ -f "$P12_PASSWORD_FILE" ]] || die "Password file does not exist: $P12_PASSWORD_FILE"
  P12_PASSWORD="$(tr -d '\r\n' < "$P12_PASSWORD_FILE")"
fi

if [[ -z "$P12_PASSWORD" ]]; then
  if [[ -t 0 ]]; then
    printf 'Developer ID .p12 password: ' >&2
    read -r -s P12_PASSWORD
    printf '\n' >&2
  else
    die "Set MAC_CSC_KEY_PASSWORD or pass --p12-password-file."
  fi
fi

require_cmd gh
require_cmd python3
require_cmd grep
require_cmd tr

if [[ "$DRY_RUN" -eq 0 ]]; then
  gh auth status >/dev/null
fi

if ! grep -q 'BEGIN PRIVATE KEY' "$API_KEY_PATH"; then
  die "App Store Connect key does not look like a .p8 private key: $API_KEY_PATH"
fi

if [[ ! "$API_KEY_ID" =~ ^[A-Z0-9]{10}$ ]]; then
  die "APPLE_API_KEY_ID should be a 10-character uppercase alphanumeric key id."
fi

if [[ ! "$API_ISSUER" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]]; then
  die "APPLE_API_ISSUER should be a UUID."
fi

validate_p12() {
  if ! command -v openssl >/dev/null 2>&1; then
    log "Skipping .p12 validation because openssl is not installed."
    return
  fi

  local subject
  subject="$(
    MAC_CSC_KEY_PASSWORD="$P12_PASSWORD" \
      openssl pkcs12 -in "$P12_PATH" -nokeys -clcerts -passin env:MAC_CSC_KEY_PASSWORD 2>/dev/null |
      openssl x509 -noout -subject 2>/dev/null || true
  )"

  [[ -n "$subject" ]] || die "Could not read .p12. Check the file and password."

  if [[ "$subject" != *"Developer ID Application"* ]]; then
    die ".p12 does not appear to contain a Developer ID Application certificate."
  fi

  log "Validated Developer ID Application certificate."
}

p12_base64_length() {
  python3 - "$P12_PATH" <<'PY'
from pathlib import Path
import base64
import sys
print(len(base64.b64encode(Path(sys.argv[1]).read_bytes()).decode("ascii")))
PY
}

set_secret_value() {
  local name="$1"
  local value="$2"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Would set secret $name on $REPO."
    return
  fi

  printf '%s' "$value" | gh secret set "$name" --repo "$REPO" >/dev/null
  log "Set secret $name."
}

set_secret_file() {
  local name="$1"
  local file="$2"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Would set secret $name from $file on $REPO."
    return
  fi

  gh secret set "$name" --repo "$REPO" < "$file" >/dev/null
  log "Set secret $name."
}

set_p12_secret() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Would base64 encode $P12_PATH and set MAC_CSC_LINK on $REPO."
    return
  fi

  python3 - "$P12_PATH" <<'PY' | gh secret set MAC_CSC_LINK --repo "$REPO" >/dev/null
from pathlib import Path
import base64
import sys
sys.stdout.write(base64.b64encode(Path(sys.argv[1]).read_bytes()).decode("ascii"))
PY
  log "Set secret MAC_CSC_LINK."
}

validate_p12

encoded_len="$(p12_base64_length)"
if [[ "$encoded_len" -gt 48000 ]]; then
  die "Base64 .p12 is ${encoded_len} bytes; GitHub secrets are limited to about 48 KB. Re-export the .p12 without extra certificate-chain entries."
fi

log "Configuring GitHub Actions secrets for $REPO."
set_p12_secret
set_secret_value MAC_CSC_KEY_PASSWORD "$P12_PASSWORD"
set_secret_file APPLE_API_KEY "$API_KEY_PATH"
set_secret_value APPLE_API_KEY_ID "$API_KEY_ID"
set_secret_value APPLE_API_ISSUER "$API_ISSUER"

if [[ "$DRY_RUN" -eq 0 ]]; then
  log "Configured secrets:"
  gh secret list --repo "$REPO" | grep -E '^(MAC_CSC_LINK|MAC_CSC_KEY_PASSWORD|APPLE_API_KEY|APPLE_API_KEY_ID|APPLE_API_ISSUER)[[:space:]]' || true
fi

if [[ -n "$RERUN_ID" ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Would rerun GitHub Actions run $RERUN_ID."
  else
    log "Rerunning GitHub Actions run $RERUN_ID."
    gh run rerun "$RERUN_ID" --repo "$REPO"
    if [[ "$WATCH_RUN" -eq 1 ]]; then
      gh run watch "$RERUN_ID" --repo "$REPO" --exit-status
    fi
  fi
elif [[ -n "$DISPATCH_TAG" ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Would dispatch desktop-release.yml for $DISPATCH_TAG."
  else
    log "Dispatching desktop-release.yml for $DISPATCH_TAG."
    gh workflow run desktop-release.yml --repo "$REPO" -f confirm_tag="$DISPATCH_TAG"
    if [[ "$WATCH_RUN" -eq 1 ]]; then
      sleep 5
      run_id="$(gh run list --repo "$REPO" --workflow desktop-release.yml --branch "$DISPATCH_TAG" --limit 1 --json databaseId --jq '.[0].databaseId')"
      [[ -n "$run_id" ]] || die "Could not find dispatched workflow run for $DISPATCH_TAG."
      gh run watch "$run_id" --repo "$REPO" --exit-status
    fi
  fi
else
  log "Secrets are configured. Re-run the failed Desktop Release workflow or pass --dispatch-tag desktop-v<version>."
fi

const fs = require('node:fs')
const path = require('node:path')

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function collectPathCandidates(value, out = []) {
  if (!value) return out
  if (typeof value === 'string') {
    out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPathCandidates(item, out)
    return out
  }
  if (typeof value !== 'object') return out

  collectPathCandidates(value.path, out)
  collectPathCandidates(value.file, out)
  collectPathCandidates(value.filePath, out)
  collectPathCandidates(value.downloadedFile, out)
  collectPathCandidates(value.downloadedFiles, out)
  collectPathCandidates(value.files, out)
  return out
}

function defaultReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function uniquePaths(paths) {
  return Array.from(new Set(paths.filter(Boolean).map(item => String(item))))
}

function resolveDownloadedMacReleaseZip({
  downloadResult,
  cacheDirs = [],
  fileExists = fs.existsSync,
  readJson = defaultReadJson,
  readdirSync = fs.readdirSync
} = {}) {
  const candidates = collectPathCandidates(downloadResult)

  for (const cacheDir of cacheDirs) {
    if (!cacheDir) continue

    try {
      const info = readJson(path.join(cacheDir, 'update-info.json'))
      if (info?.fileName) candidates.push(path.join(cacheDir, info.fileName))
    } catch {
      // Cache metadata is best-effort; fall back to directory scanning below.
    }

    try {
      for (const entry of readdirSync(cacheDir)) {
        if (String(entry).toLowerCase().endsWith('.zip')) {
          candidates.push(path.join(cacheDir, entry))
        }
      }
    } catch {
      // Missing cache dir is normal on first install.
    }
  }

  return (
    uniquePaths(candidates).find(candidate => {
      return candidate.toLowerCase().endsWith('.zip') && fileExists(candidate)
    }) || null
  )
}

function buildMacReleaseInstallScript({ appPid, zipPath, targetApp, logPath }) {
  if (!zipPath) throw new Error('zipPath is required')
  if (!targetApp) throw new Error('targetApp is required')

  const pid = Number.isInteger(Number(appPid)) ? Number(appPid) : 0
  const appName = path.basename(targetApp)
  const installLog = logPath || path.join(path.dirname(targetApp), 'xclaw-release-update.log')

  return `#!/bin/bash
set -u
APP_PID=${pid}
ZIP=${shellQuote(zipPath)}
DST=${shellQuote(targetApp)}
APP_NAME=${shellQuote(appName)}
LOG=${shellQuote(installLog)}

/bin/mkdir -p "$(/usr/bin/dirname "$LOG")" 2>/dev/null || true
log() {
  /bin/echo "$(/bin/date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"
}

WORK="$(/usr/bin/mktemp -d "\${TMPDIR:-/tmp}/xclaw-release-update.XXXXXX")" || exit 1
cleanup() {
  /bin/rm -rf "$WORK" 2>/dev/null || true
  /bin/rm -f -- "$0" 2>/dev/null || true
}
trap cleanup EXIT

log "starting release install zip=$ZIP dst=$DST"
if [ ! -f "$ZIP" ]; then
  log "missing downloaded zip"
  exit 1
fi

if ! /usr/bin/ditto -x -k "$ZIP" "$WORK" >> "$LOG" 2>&1; then
  log "extract failed"
  exit 1
fi

SRC="$WORK/$APP_NAME"
if [ ! -d "$SRC" ]; then
  log "extracted app not found: $SRC"
  /usr/bin/find "$WORK" -maxdepth 2 -name "*.app" >> "$LOG" 2>&1 || true
  exit 1
fi

for _ in $(/usr/bin/seq 1 240); do
  if [ "$APP_PID" -le 0 ] || ! /bin/kill -0 "$APP_PID" 2>/dev/null; then
    break
  fi
  /bin/sleep 0.5
done

if [ "$APP_PID" -gt 0 ] && /bin/kill -0 "$APP_PID" 2>/dev/null; then
  log "app still running after wait; aborting"
  exit 1
fi

NEW="$DST.vigil-update-new"
OLD="$DST.vigil-update-old"
/bin/rm -rf "$NEW" "$OLD" 2>/dev/null || true

if ! /usr/bin/ditto "$SRC" "$NEW" >> "$LOG" 2>&1; then
  log "copy extracted app failed"
  exit 1
fi

if [ -d "$DST" ]; then
  if ! /bin/mv "$DST" "$OLD" >> "$LOG" 2>&1; then
    log "move current app aside failed"
    /bin/rm -rf "$NEW" 2>/dev/null || true
    exit 1
  fi
fi

if ! /bin/mv "$NEW" "$DST" >> "$LOG" 2>&1; then
  log "activate new app failed"
  if [ -d "$OLD" ] && [ ! -d "$DST" ]; then
    /bin/mv "$OLD" "$DST" >> "$LOG" 2>&1 || true
  fi
  exit 1
fi

/bin/rm -rf "$OLD" 2>/dev/null || true
/usr/bin/xattr -dr com.apple.quarantine "$DST" >> "$LOG" 2>&1 || true
/usr/bin/open "$DST" >> "$LOG" 2>&1 || true
log "release install completed"
`
}

module.exports = {
  buildMacReleaseInstallScript,
  resolveDownloadedMacReleaseZip
}

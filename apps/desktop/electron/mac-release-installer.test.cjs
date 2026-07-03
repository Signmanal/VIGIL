const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  buildMacReleaseInstallScript,
  resolveDownloadedMacReleaseZip
} = require('./mac-release-installer.cjs')

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xclaw-mac-release-installer-'))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('resolveDownloadedMacReleaseZip uses direct download result zip first', () =>
  withTempDir(dir => {
    const zipPath = path.join(dir, 'XCLAW-0.20.0-mac-arm64.zip')
    fs.writeFileSync(zipPath, '')

    const resolved = resolveDownloadedMacReleaseZip({
      downloadResult: [zipPath],
      cacheDirs: []
    })

    assert.equal(resolved, zipPath)
  }))

test('resolveDownloadedMacReleaseZip falls back to pending update-info metadata', () =>
  withTempDir(dir => {
    const pending = path.join(dir, 'pending')
    fs.mkdirSync(pending)
    const zipPath = path.join(pending, 'XCLAW-0.20.0-mac-arm64.zip')
    fs.writeFileSync(zipPath, '')
    fs.writeFileSync(path.join(pending, 'update-info.json'), JSON.stringify({ fileName: path.basename(zipPath) }))

    const resolved = resolveDownloadedMacReleaseZip({
      downloadResult: [],
      cacheDirs: [pending]
    })

    assert.equal(resolved, zipPath)
  }))

test('buildMacReleaseInstallScript extracts the downloaded zip and relaunches the app', () => {
  const script = buildMacReleaseInstallScript({
    appPid: 1234,
    zipPath: "/tmp/XCLAW's update.zip",
    targetApp: '/Users/me/Applications/XCLAW.app',
    logPath: '/tmp/xclaw-release-update.log'
  })

  assert.match(script, /APP_PID=1234/)
  assert.match(script, /\/usr\/bin\/ditto -x -k "\$ZIP" "\$WORK"/)
  assert.match(script, /PlistBuddy -c 'Print :CFBundleIdentifier'/)
  assert.match(script, /bundle id mismatch/)
  assert.match(script, /\/usr\/bin\/codesign --verify --deep --strict --verbose=2 "\$SRC"/)
  assert.match(script, /\/usr\/bin\/open "\$DST"/)
  assert.match(script, /com\.apple\.quarantine/)
  assert.match(script, /'\/tmp\/XCLAW'\\''s update\.zip'/)
})

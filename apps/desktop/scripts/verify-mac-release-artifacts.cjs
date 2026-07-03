const fs = require('node:fs')
const crypto = require('node:crypto')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const releaseDir = path.join(root, 'release')
const pkg = require(path.join(root, 'package.json'))
const expectedVersion = pkg.version
const productName = pkg.build?.productName || 'XCLAW'
const SIGNING_CHAIN_START_VERSION = '0.18.9'
const EXPECTED_MAC_SIGNING_AUTHORITY = 'Apple Development: 2663636294@qq.com (VKULVKP8KD)'
const EXPECTED_MAC_SIGNING_TEAM_IDENTIFIER = '5CG9U4GR44'
const versionRequiresPinnedSigning = compareSemver(expectedVersion, SIGNING_CHAIN_START_VERSION) >= 0
const allowUnsignedMacRelease = process.env.VIGIL_ALLOW_UNSIGNED_MAC_RELEASE === '1'
const explicitRequireSigning = process.env.VIGIL_REQUIRE_MAC_SIGNING === '1'
const requireSigning = explicitRequireSigning || (!allowUnsignedMacRelease && versionRequiresPinnedSigning)
const requireGatekeeper = process.env.VIGIL_REQUIRE_MAC_GATEKEEPER === '1'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
    fail(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`)
  }
  return `${result.stdout || ''}${result.stderr || ''}`
}

function compareSemver(left, right) {
  const parse = (value) =>
    String(value)
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)
  const a = parse(left)
  const b = parse(right)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const delta = (a[i] || 0) - (b[i] || 0)
    if (delta !== 0) return delta
  }
  return 0
}

function listFiles() {
  if (!fs.existsSync(releaseDir)) {
    fail(`Missing release directory: ${releaseDir}`)
  }
  return fs.readdirSync(releaseDir)
}

function firstMatching(files, regex, label) {
  const match = files.find((name) => regex.test(name))
  if (!match) {
    fail(`Missing ${label} in ${releaseDir}`)
  }
  return path.join(releaseDir, match)
}

function readPlistValue(plistPath, key) {
  return run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath]).trim()
}

function mountDmg(dmgPath) {
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'xclaw-dmg-'))
  run('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint])
  return {
    mountPoint,
    cleanup: () => {
      try {
        run('hdiutil', ['detach', mountPoint])
      } catch {
        // Best-effort cleanup.
      }
      try {
        fs.rmSync(mountPoint, { force: true, recursive: true })
      } catch {
        // Best-effort cleanup.
      }
    },
  }
}

function assertLatestMacYml(latestPath) {
  const text = fs.readFileSync(latestPath, 'utf8')
  if (!new RegExp(`^version: ${expectedVersion}$`, 'm').test(text)) {
    fail(`latest-mac.yml does not point to version ${expectedVersion}`)
  }
  if (!/^path: .*\.zip$/m.test(text)) {
    fail('latest-mac.yml must point to the macOS zip asset for electron-updater')
  }

  const pathMatch = text.match(/^path: (.+)$/m)
  const topShaMatch = text.match(/^sha512: (.+)$/m)
  if (!pathMatch || !topShaMatch) {
    fail('latest-mac.yml is missing top-level path or sha512')
  }
  const pathInfo = fileDigest(path.join(releaseDir, pathMatch[1]))
  if (pathInfo.sha512 !== topShaMatch[1]) {
    fail(`latest-mac.yml top-level sha512 does not match ${pathMatch[1]}`)
  }

  const entryRegex = / {2}- url: (.+)\n {4}sha512: (.+)\n {4}size: (\d+)/g
  let entryCount = 0
  for (const match of text.matchAll(entryRegex)) {
    entryCount += 1
    const name = match[1]
    const expectedSha = match[2]
    const expectedSize = Number(match[3])
    const actual = fileDigest(path.join(releaseDir, name))
    if (actual.sha512 !== expectedSha) {
      fail(`latest-mac.yml sha512 does not match ${name}`)
    }
    if (actual.size !== expectedSize) {
      fail(`latest-mac.yml size does not match ${name}`)
    }
  }
  if (entryCount === 0) {
    fail('latest-mac.yml does not list any update files')
  }
}

function fileDigest(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`latest-mac.yml references missing file: ${filePath}`)
  }
  const data = fs.readFileSync(filePath)
  return {
    sha512: crypto.createHash('sha512').update(data).digest('base64'),
    size: fs.statSync(filePath).size,
  }
}

function assertUpdaterMetadata(appPath) {
  const metadataPath = path.join(appPath, 'Contents', 'Resources', 'app-update.yml')
  if (!fs.existsSync(metadataPath)) {
    fail(`Missing updater metadata: ${metadataPath}`)
  }
  const metadata = fs.readFileSync(metadataPath, 'utf8')
  for (const expected of ['provider: github', 'owner: Signmanal', 'repo: VIGIL']) {
    if (!metadata.includes(expected)) {
      fail(`app-update.yml is missing ${expected}`)
    }
  }
  if (/^private:/m.test(metadata)) {
    fail('app-update.yml must not include private: true for public community releases')
  }
}

function assertSigned(appPath, dmgPath) {
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
  assertPinnedSigningIdentity(appPath)
  if (requireGatekeeper) {
    run('spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath])
    run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmgPath])
  }
}

function assertPinnedSigningIdentity(appPath) {
  const output = runCapture('codesign', ['-dv', '--verbose=4', appPath])
  const authorityLine = `Authority=${EXPECTED_MAC_SIGNING_AUTHORITY}`
  const teamLine = `TeamIdentifier=${EXPECTED_MAC_SIGNING_TEAM_IDENTIFIER}`
  if (!output.includes(authorityLine)) {
    fail(`macOS signing authority changed. Expected ${authorityLine}`)
  }
  if (!output.includes(teamLine)) {
    fail(`macOS signing TeamIdentifier changed. Expected ${teamLine}`)
  }
}

if (process.platform !== 'darwin') {
  fail('macOS release artifact verification must run on macOS.')
}

const files = listFiles()
const dmgPath = firstMatching(files, new RegExp(`^${productName}-${expectedVersion}-mac-.*\\.dmg$`), 'macOS DMG')
firstMatching(files, new RegExp(`^${productName}-${expectedVersion}-mac-.*\\.zip$`), 'macOS ZIP')
firstMatching(files, new RegExp(`^${productName}-${expectedVersion}-mac-.*\\.dmg\\.blockmap$`), 'macOS DMG blockmap')
firstMatching(files, new RegExp(`^${productName}-${expectedVersion}-mac-.*\\.zip\\.blockmap$`), 'macOS ZIP blockmap')
assertLatestMacYml(path.join(releaseDir, 'latest-mac.yml'))

const mounted = mountDmg(dmgPath)
try {
  const appPath = path.join(mounted.mountPoint, `${productName}.app`)
  const applicationsLink = path.join(mounted.mountPoint, 'Applications')
  if (!fs.existsSync(appPath)) {
    fail(`DMG does not contain ${productName}.app`)
  }
  if (!fs.existsSync(applicationsLink)) {
    fail('DMG does not contain the Applications shortcut')
  }
  const actualVersion = readPlistValue(path.join(appPath, 'Contents', 'Info.plist'), 'CFBundleShortVersionString')
  if (actualVersion !== expectedVersion) {
    fail(`DMG app version mismatch: expected ${expectedVersion}, got ${actualVersion}`)
  }
  assertUpdaterMetadata(appPath)
  if (requireSigning) {
    assertSigned(appPath, dmgPath)
  }
} finally {
  mounted.cleanup()
}

console.log(
  `macOS release artifacts verified: version=${expectedVersion}, dmg=${path.basename(dmgPath)}, signing=${
    requireSigning
      ? `${EXPECTED_MAC_SIGNING_AUTHORITY} / ${EXPECTED_MAC_SIGNING_TEAM_IDENTIFIER}`
      : allowUnsignedMacRelease
        ? 'unsigned-allowed'
        : 'not-required'
  }, gatekeeper=${requireGatekeeper ? 'required' : 'not-required'}`
)

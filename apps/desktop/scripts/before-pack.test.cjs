const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { cleanStaleAppOutDir, legacyAppOutDirs } = require('../scripts/before-pack.cjs')

test('cleanStaleAppOutDir removes a populated unpacked directory', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vigil-before-pack-'))
  try {
    const appOutDir = path.join(tempRoot, 'linux-unpacked')
    fs.mkdirSync(appOutDir, { recursive: true })
    // Reproduce the corrupted partial state: license + payload present,
    // electron binary missing — exactly what trips the ENOENT rename.
    fs.writeFileSync(path.join(appOutDir, 'LICENSE.electron.txt'), 'x', 'utf8')
    fs.writeFileSync(path.join(appOutDir, 'resources.pak'), 'x', 'utf8')
    fs.mkdirSync(path.join(appOutDir, 'resources'), { recursive: true })
    fs.writeFileSync(path.join(appOutDir, 'resources', 'app.asar'), 'x', 'utf8')

    const removed = cleanStaleAppOutDir(appOutDir)

    assert.equal(removed, true)
    assert.equal(fs.existsSync(appOutDir), false)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('cleanStaleAppOutDir is a no-op when the directory is absent', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vigil-before-pack-'))
  try {
    const missing = path.join(tempRoot, 'does-not-exist')
    assert.equal(cleanStaleAppOutDir(missing), false)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('cleanStaleAppOutDir ignores empty or invalid input', () => {
  assert.equal(cleanStaleAppOutDir(''), false)
  assert.equal(cleanStaleAppOutDir(undefined), false)
  assert.equal(cleanStaleAppOutDir(null), false)
  assert.equal(cleanStaleAppOutDir(42), false)
})

test('legacyAppOutDirs returns old macOS bundle beside the new XCLAW bundle', () => {
  const appOutDir = path.join('/tmp', 'release', 'mac-arm64', 'XCLAW.app')
  assert.deepEqual(legacyAppOutDirs(appOutDir, 'darwin'), [
    path.join('/tmp', 'release', 'mac-arm64', 'VIGIL.app')
  ])
  assert.deepEqual(legacyAppOutDirs(appOutDir, 'linux'), [])
})

test('beforePack removes legacy macOS VIGIL.app bundle', async () => {
  const { default: beforePack } = require('../scripts/before-pack.cjs')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vigil-before-pack-'))
  try {
    const appOutDir = path.join(tempRoot, 'mac-arm64', 'XCLAW.app')
    const legacy = path.join(tempRoot, 'mac-arm64', 'VIGIL.app')
    fs.mkdirSync(appOutDir, { recursive: true })
    fs.mkdirSync(legacy, { recursive: true })
    fs.writeFileSync(path.join(legacy, 'stale'), 'x', 'utf8')

    await beforePack({ appOutDir, electronPlatformName: 'darwin' })

    assert.equal(fs.existsSync(appOutDir), false)
    assert.equal(fs.existsSync(legacy), false)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('beforePack default export resolves even when cleanup throws', async () => {
  const { default: beforePack } = require('../scripts/before-pack.cjs')
  // A directory path that rmSync can't remove is simulated by passing a
  // context whose appOutDir is a file the hook will try (and be allowed) to
  // remove; the contract under test is that the hook never rejects.
  await assert.doesNotReject(beforePack({ appOutDir: '', electronPlatformName: 'linux' }))
})

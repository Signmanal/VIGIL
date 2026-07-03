const assert = require('node:assert/strict')
const test = require('node:test')

const { commitsMatch, normalizeCommit, resolveRuntimeSyncStatus } = require('./runtime-sync.cjs')

test('normalizeCommit accepts git commit prefixes only', () => {
  assert.equal(normalizeCommit('ABCDEF1'), 'abcdef1')
  assert.equal(normalizeCommit('  ' + 'a'.repeat(40) + '  '), 'a'.repeat(40))
  assert.equal(normalizeCommit('main'), '')
  assert.equal(normalizeCommit('123'), '')
})

test('commitsMatch accepts exact and prefix matches', () => {
  assert.equal(commitsMatch('abcdef1234567890', 'abcdef1234567890'), true)
  assert.equal(commitsMatch('abcdef1234567890', 'abcdef1'), true)
  assert.equal(commitsMatch('abcdef1', 'abcdef1234567890'), true)
  assert.equal(commitsMatch('abcdef1234567890', '1234567'), false)
})

test('resolveRuntimeSyncStatus skips unpinned or non-packaged builds', () => {
  assert.equal(
    resolveRuntimeSyncStatus({
      isPackaged: false,
      installStamp: { commit: 'abcdef1234567890' },
      activeCommit: '1234567890abcdef',
      activeReady: true
    }).needsRepair,
    false
  )

  assert.equal(
    resolveRuntimeSyncStatus({
      isPackaged: true,
      installStamp: null,
      activeCommit: '1234567890abcdef',
      activeReady: true
    }).needsRepair,
    false
  )
})

test('resolveRuntimeSyncStatus waits for normal bootstrap when active runtime is not ready', () => {
  const status = resolveRuntimeSyncStatus({
    isPackaged: true,
    installStamp: { commit: 'abcdef1234567890' },
    activeCommit: '',
    activeReady: false
  })

  assert.equal(status.needsRepair, false)
  assert.equal(status.reason, 'active-runtime-not-ready')
})

test('resolveRuntimeSyncStatus accepts a matching packaged runtime', () => {
  const status = resolveRuntimeSyncStatus({
    isPackaged: true,
    installStamp: { commit: 'abcdef1234567890' },
    activeCommit: 'abcdef1',
    activeReady: true
  })

  assert.equal(status.needsRepair, false)
  assert.equal(status.reason, 'runtime-matches-package')
})

test('resolveRuntimeSyncStatus repairs a stale active runtime', () => {
  const status = resolveRuntimeSyncStatus({
    isPackaged: true,
    installStamp: { commit: 'abcdef1234567890' },
    activeCommit: '1234567890abcdef',
    activeReady: true
  })

  assert.equal(status.needsRepair, true)
  assert.equal(status.reason, 'packaged-runtime-mismatch')
  assert.equal(status.expectedCommit, 'abcdef1234567890')
  assert.equal(status.activeCommit, '1234567890abcdef')
})

test('resolveRuntimeSyncStatus repairs when active commit cannot be read', () => {
  const status = resolveRuntimeSyncStatus({
    isPackaged: true,
    installStamp: { commit: 'abcdef1234567890' },
    activeCommit: '',
    activeReady: true
  })

  assert.equal(status.needsRepair, true)
  assert.equal(status.reason, 'active-commit-missing')
})

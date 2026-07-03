'use strict'

const COMMIT_RE = /^[0-9a-f]{7,40}$/i

function normalizeCommit(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return COMMIT_RE.test(text) ? text : ''
}

function commitsMatch(expected, actual) {
  const expectedCommit = normalizeCommit(expected)
  const actualCommit = normalizeCommit(actual)
  if (!expectedCommit || !actualCommit) return false
  return expectedCommit === actualCommit || expectedCommit.startsWith(actualCommit) || actualCommit.startsWith(expectedCommit)
}

function resolveRuntimeSyncStatus({ isPackaged, installStamp, activeCommit, activeReady }) {
  const expectedCommit = normalizeCommit(installStamp?.commit)
  const currentCommit = normalizeCommit(activeCommit)

  if (!isPackaged || !expectedCommit) {
    return {
      needsRepair: false,
      reason: 'unpinned-runtime',
      expectedCommit: expectedCommit || undefined,
      activeCommit: currentCommit || undefined
    }
  }

  if (!activeReady) {
    return {
      needsRepair: false,
      reason: 'active-runtime-not-ready',
      expectedCommit,
      activeCommit: currentCommit || undefined
    }
  }

  if (!currentCommit) {
    return {
      needsRepair: true,
      reason: 'active-commit-missing',
      expectedCommit
    }
  }

  if (!commitsMatch(expectedCommit, currentCommit)) {
    return {
      needsRepair: true,
      reason: 'packaged-runtime-mismatch',
      expectedCommit,
      activeCommit: currentCommit
    }
  }

  return {
    needsRepair: false,
    reason: 'runtime-matches-package',
    expectedCommit,
    activeCommit: currentCommit
  }
}

module.exports = {
  normalizeCommit,
  commitsMatch,
  resolveRuntimeSyncStatus
}

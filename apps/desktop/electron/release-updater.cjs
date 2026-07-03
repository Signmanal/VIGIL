function normalizeVersion(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function releaseStatusFromUpdateInfo(info, currentVersion, now = Date.now()) {
  const current = normalizeVersion(currentVersion)
  const version = normalizeVersion(info?.version)
  const hasUpdate = Boolean(version && version !== current)

  return {
    supported: true,
    channel: 'release',
    behind: hasUpdate ? 1 : 0,
    currentSha: current ? `release:${current}` : undefined,
    targetSha: hasUpdate ? `release:${version}` : undefined,
    releaseVersion: version || undefined,
    releaseName: typeof info?.releaseName === 'string' ? info.releaseName : undefined,
    message: hasUpdate ? `XCLAW ${version}` : undefined,
    fetchedAt: now
  }
}

function releaseUnsupportedStatus(reason, message, now = Date.now()) {
  return {
    supported: false,
    channel: 'release',
    reason,
    message,
    fetchedAt: now
  }
}

function releaseErrorStatus(error, now = Date.now()) {
  const message = error instanceof Error ? error.message : String(error)

  return {
    supported: true,
    channel: 'release',
    error: 'release-check-failed',
    message,
    fetchedAt: now
  }
}

function withSourceChannel(status) {
  return { ...status, channel: 'source' }
}

module.exports = {
  normalizeVersion,
  releaseErrorStatus,
  releaseStatusFromUpdateInfo,
  releaseUnsupportedStatus,
  withSourceChannel
}

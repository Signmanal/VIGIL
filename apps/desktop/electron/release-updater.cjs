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
  const rawMessage = error instanceof Error ? error.message : String(error)
  const privateGitHubHint = /GitHub|latest-mac\.yml|releases?|404|Not Found/i.test(rawMessage)
  const message = privateGitHubHint
    ? '无法访问 GitHub Release 更新通道。如果仓库是私有仓库，请确认本机已运行 `gh auth login`，且 token 具有 repo 权限。'
    : rawMessage

  return {
    supported: true,
    channel: 'release',
    error: privateGitHubHint ? 'private-release-check-failed' : 'release-check-failed',
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

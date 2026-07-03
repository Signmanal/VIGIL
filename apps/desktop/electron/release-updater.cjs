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
  const githubReleaseHint = /GitHub|latest-mac\.yml|releases?|404|Not Found/i.test(rawMessage)
  const message = githubReleaseHint
    ? '无法访问 GitHub Release 更新通道。请确认网络可访问 GitHub，且最新 Release 已包含当前平台的更新元数据；macOS 需要 latest-mac.yml。私有仓库才需要 `gh auth login` 或 GH_TOKEN/GITHUB_TOKEN。'
    : rawMessage

  return {
    supported: true,
    channel: 'release',
    error: githubReleaseHint ? 'release-channel-check-failed' : 'release-check-failed',
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

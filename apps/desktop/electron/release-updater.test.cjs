const assert = require('node:assert/strict')
const test = require('node:test')

const {
  releaseErrorStatus,
  releaseStatusFromUpdateInfo,
  releaseUnsupportedStatus,
  withSourceChannel
} = require('./release-updater.cjs')

test('releaseStatusFromUpdateInfo reports one available release version', () => {
  const status = releaseStatusFromUpdateInfo({ version: '0.18.0', releaseName: 'XCLAW 0.18.0' }, '0.17.2', 123)

  assert.equal(status.channel, 'release')
  assert.equal(status.supported, true)
  assert.equal(status.behind, 1)
  assert.equal(status.currentSha, 'release:0.17.2')
  assert.equal(status.targetSha, 'release:0.18.0')
  assert.equal(status.releaseVersion, '0.18.0')
  assert.equal(status.releaseName, 'XCLAW 0.18.0')
  assert.equal(status.fetchedAt, 123)
})

test('releaseStatusFromUpdateInfo reports current when versions match', () => {
  const status = releaseStatusFromUpdateInfo({ version: '0.17.2' }, '0.17.2', 123)

  assert.equal(status.behind, 0)
  assert.equal(status.targetSha, undefined)
})

test('releaseUnsupportedStatus keeps release channel diagnostics', () => {
  const status = releaseUnsupportedStatus('no-updater', 'missing metadata', 123)

  assert.equal(status.supported, false)
  assert.equal(status.channel, 'release')
  assert.equal(status.reason, 'no-updater')
  assert.equal(status.message, 'missing metadata')
})

test('releaseErrorStatus maps thrown errors into check failures', () => {
  const status = releaseErrorStatus(new Error('network down'), 123)

  assert.equal(status.supported, true)
  assert.equal(status.channel, 'release')
  assert.equal(status.error, 'release-check-failed')
  assert.equal(status.message, 'network down')
})

test('releaseErrorStatus maps private GitHub 404s to an actionable message', () => {
  const status = releaseErrorStatus(new Error('HttpError: 404 Not Found latest-mac.yml GitHub'), 123)

  assert.equal(status.supported, true)
  assert.equal(status.channel, 'release')
  assert.equal(status.error, 'private-release-check-failed')
  assert.match(status.message, /gh auth login/)
})

test('withSourceChannel marks legacy git update status', () => {
  assert.deepEqual(withSourceChannel({ supported: true, behind: 2 }), {
    supported: true,
    behind: 2,
    channel: 'source'
  })
})

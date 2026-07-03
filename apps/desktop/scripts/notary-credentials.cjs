const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function trimEnv(name) {
  return String(process.env[name] || '').trim()
}

function inlineKeyLooksValid(value) {
  return value.includes('BEGIN PRIVATE KEY') && value.includes('END PRIVATE KEY')
}

function resolveApiKeyPath(rawValue) {
  const value = String(rawValue || '').trim()
  if (!value) return { keyPath: '', cleanup: () => {} }

  if (fs.existsSync(value)) {
    return { keyPath: value, cleanup: () => {} }
  }

  if (!inlineKeyLooksValid(value)) {
    throw new Error('APPLE_API_KEY must be a file path or inline .p8 key content')
  }

  const tempPath = path.join(os.tmpdir(), `vigil-notary-${Date.now()}-${process.pid}.p8`)
  fs.writeFileSync(tempPath, value, 'utf8')
  return {
    keyPath: tempPath,
    cleanup: () => {
      try {
        fs.rmSync(tempPath, { force: true })
      } catch {
        // Best-effort cleanup.
      }
    },
  }
}

function missingNames(names) {
  return names.filter((name) => !trimEnv(name))
}

function configuredNames(names) {
  return names.filter((name) => trimEnv(name))
}

function resolveNotarySubmission({ required = false } = {}) {
  const profile = trimEnv('APPLE_NOTARY_PROFILE')
  if (profile) {
    return {
      mode: 'keychain-profile',
      args: ['--keychain-profile', profile],
      cleanup: () => {},
    }
  }

  const apiNames = ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']
  const apiMissing = missingNames(apiNames)
  const apiConfigured = configuredNames(apiNames)
  if (apiConfigured.length > 0 && apiMissing.length === 0) {
    const { keyPath, cleanup } = resolveApiKeyPath(process.env.APPLE_API_KEY)
    return {
      mode: 'api-key',
      args: [
        '--key',
        keyPath,
        '--key-id',
        trimEnv('APPLE_API_KEY_ID'),
        '--issuer',
        trimEnv('APPLE_API_ISSUER'),
      ],
      cleanup,
    }
  }

  const appleIdNames = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
  const appleIdMissing = missingNames(appleIdNames)
  const appleIdConfigured = configuredNames(appleIdNames)
  if (appleIdConfigured.length > 0 && appleIdMissing.length === 0) {
    return {
      mode: 'apple-id',
      args: [
        '--apple-id',
        trimEnv('APPLE_ID'),
        '--password',
        trimEnv('APPLE_APP_SPECIFIC_PASSWORD'),
        '--team-id',
        trimEnv('APPLE_TEAM_ID'),
      ],
      cleanup: () => {},
    }
  }

  if (apiConfigured.length > 0) {
    throw new Error(`Incomplete Apple API notarization credentials: missing ${apiMissing.join(', ')}`)
  }

  if (appleIdConfigured.length > 0) {
    throw new Error(`Incomplete Apple ID notarization credentials: missing ${appleIdMissing.join(', ')}`)
  }

  if (required) {
    throw new Error(
      'Notarization credentials are required: set APPLE_NOTARY_PROFILE, or APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER, or APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID'
    )
  }

  return null
}

module.exports = {
  resolveNotarySubmission,
}

const { resolveNotarySubmission } = require('./notary-credentials.cjs')

function trimEnv(name) {
  return String(process.env[name] || '').trim()
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (process.platform !== 'darwin') {
  fail('macOS release signing must run on a macOS runner.')
}

const missingSigning = ['CSC_LINK', 'CSC_KEY_PASSWORD'].filter((name) => !trimEnv(name))
if (missingSigning.length > 0) {
  fail(`Missing macOS code signing environment: ${missingSigning.join(', ')}`)
}

let submission
try {
  submission = resolveNotarySubmission({ required: true })
} catch (error) {
  fail(error.message)
}

submission.cleanup()
console.log(`macOS release environment is ready: signing certificate configured, notarization mode=${submission.mode}`)

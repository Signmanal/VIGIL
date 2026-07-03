const fs = require('node:fs')
const { execFile } = require('node:child_process')
const { resolveNotarySubmission } = require('./notary-credentials.cjs')

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        // Intentionally omit args from the rejection message: callers pass
        // notarization credentials (key id, issuer, key file path) here, and
        // surfacing them in error output would land in CI logs.
        reject(new Error(`${command} failed: ${stderr?.trim() || stdout?.trim() || error.message}`))
        return
      }
      resolve()
    })
  })
}

async function main() {
  const artifactPath = process.argv[2]
  if (!artifactPath || !fs.existsSync(artifactPath)) {
    throw new Error(`Missing artifact to notarize: ${artifactPath || '(none)'}`)
  }

  const submission = resolveNotarySubmission({ required: true })
  try {
    await run('xcrun', ['notarytool', 'submit', artifactPath, ...submission.args, '--wait'])
    await run('xcrun', ['stapler', 'staple', '-v', artifactPath])
  } finally {
    submission.cleanup()
  }
}

main().catch(() => {
  console.error('Notarization failed. Check configuration and command output in secure CI logs.')
  process.exit(1)
})

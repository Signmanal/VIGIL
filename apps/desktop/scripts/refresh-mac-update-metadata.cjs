const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const releaseDir = path.join(__dirname, '..', 'release')
const metadataPath = path.join(releaseDir, 'latest-mac.yml')

function fail(message) {
  console.error(message)
  process.exit(1)
}

function fileInfo(name) {
  const filePath = path.join(releaseDir, name)
  if (!fs.existsSync(filePath)) {
    fail(`latest-mac.yml references missing file: ${name}`)
  }
  const data = fs.readFileSync(filePath)
  return {
    sha512: crypto.createHash('sha512').update(data).digest('base64'),
    size: fs.statSync(filePath).size,
  }
}

if (!fs.existsSync(metadataPath)) {
  fail(`Missing ${metadataPath}`)
}

const lines = fs.readFileSync(metadataPath, 'utf8').split(/\r?\n/)
let currentUrl = ''
let pathTarget = ''

for (let index = 0; index < lines.length; index += 1) {
  const urlMatch = lines[index].match(/^(\s*)- url: (.+)$/)
  if (urlMatch) {
    currentUrl = urlMatch[2].trim()
    continue
  }

  const pathMatch = lines[index].match(/^path: (.+)$/)
  if (pathMatch) {
    pathTarget = pathMatch[1].trim()
    continue
  }

  if (currentUrl && lines[index].match(/^\s+sha512: /)) {
    lines[index] = `${lines[index].match(/^(\s*)/)[1]}sha512: ${fileInfo(currentUrl).sha512}`
    continue
  }

  if (currentUrl && lines[index].match(/^\s+size: /)) {
    lines[index] = `${lines[index].match(/^(\s*)/)[1]}size: ${fileInfo(currentUrl).size}`
    currentUrl = ''
    continue
  }

  if (pathTarget && lines[index].match(/^sha512: /)) {
    lines[index] = `sha512: ${fileInfo(pathTarget).sha512}`
  }
}

fs.writeFileSync(metadataPath, `${lines.join('\n').replace(/\n+$/, '')}\n`)
console.log(`Refreshed macOS update metadata: ${metadataPath}`)

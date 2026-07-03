'use strict'

/**
 * Stage the small runtime dependency closure required by electron-updater.
 *
 * The desktop build intentionally returns false from beforeBuild so
 * electron-builder does not collect the whole workspace node_modules tree.
 * That keeps packages deterministic, but it also means any main-process
 * runtime dependency must be staged explicitly. Renderer dependencies are
 * bundled by Vite; release auto-updates are not, because main.cjs loads
 * electron-updater at runtime.
 */

const fs = require('node:fs')
const { createRequire } = require('node:module')
const path = require('node:path')

const APP_ROOT = path.resolve(__dirname, '..')
const STAGE_ROOT = path.join(APP_ROOT, 'build', 'updater-node-modules')
const STAGE_NODE_MODULES = path.join(STAGE_ROOT, 'node_modules')
const appRequire = createRequire(path.join(APP_ROOT, 'package.json'))

const ROOT_PACKAGES = ['electron-updater']

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true })
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true })
}

function packageJsonPath(packageName) {
  return appRequire.resolve(`${packageName}/package.json`)
}

function packageRoot(packageName) {
  return path.dirname(packageJsonPath(packageName))
}

function destinationFor(packageName) {
  return path.join(STAGE_NODE_MODULES, ...packageName.split('/'))
}

function readPackage(packageName) {
  const pkgPath = packageJsonPath(packageName)
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
}

function copyPackage(packageName) {
  const source = packageRoot(packageName)
  const dest = destinationFor(packageName)
  rmrf(dest)
  ensureDir(path.dirname(dest))
  fs.cpSync(source, dest, {
    recursive: true,
    dereference: true,
    filter: sourcePath => !sourcePath.includes(`${path.sep}.cache${path.sep}`)
  })
}

function stagePackage(packageName, seen = new Set(), optional = false) {
  if (seen.has(packageName)) {
    return
  }

  let pkg
  try {
    pkg = readPackage(packageName)
  } catch {
    if (optional) {
      console.warn(`[stage-updater-deps] optional dependency missing: ${packageName}`)
      return
    }
    throw new Error(
      `stage-updater-deps: cannot resolve ${packageName}. Run \`npm install\` at the workspace root first.`
    )
  }

  seen.add(packageName)
  copyPackage(packageName)

  for (const dep of Object.keys(pkg.dependencies || {}).sort()) {
    stagePackage(dep, seen)
  }
  for (const dep of Object.keys(pkg.optionalDependencies || {}).sort()) {
    stagePackage(dep, seen, true)
  }
}

function main() {
  rmrf(STAGE_ROOT)
  ensureDir(STAGE_NODE_MODULES)

  const seen = new Set()
  for (const packageName of ROOT_PACKAGES) {
    stagePackage(packageName, seen)
  }

  console.log(`[stage-updater-deps] staged ${seen.size} packages for release updater`)
}

main()

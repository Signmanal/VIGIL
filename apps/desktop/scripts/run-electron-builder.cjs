"use strict"

// Resolve electronDist at runtime (#38673, #47917): electron-builder 26.8.x can
// re-unpack a broken Electron.app; reusing the installed dist dodges that.
// npm workspace hoisting is non-deterministic — require.resolve finds electron
// wherever it landed. Dist present → -c.electronDist=<abs>/dist; absent → let
// electron-builder fetch via @electron/get (electronVersion + ELECTRON_MIRROR).

const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

function electronDistDir() {
  try {
    return path.join(path.dirname(require.resolve("electron/package.json")), "dist")
  } catch {
    return null
  }
}

function distBinary(dist) {
  if (process.platform === "darwin") {
    return path.join(dist, "Electron.app", "Contents", "MacOS", "Electron")
  }
  if (process.platform === "win32") {
    return path.join(dist, "electron.exe")
  }
  return path.join(dist, "electron")
}

function electronBuilderCli() {
  const pkgJson = require.resolve("electron-builder/package.json")
  const bin = require(pkgJson).bin
  const rel = typeof bin === "string" ? bin : bin["electron-builder"]
  return path.join(path.dirname(pkgJson), rel)
}

function wantsUnsignedMacRelease(cliArgs) {
  return (
    process.platform === "darwin" &&
    process.env.VIGIL_DESKTOP_UNSIGNED_MAC_RELEASE === "1" &&
    cliArgs.some(arg => arg === "--mac" || arg === "-m" || arg.startsWith("--mac="))
  )
}

const dist = electronDistDir()
const args = []
if (dist && fs.existsSync(distBinary(dist))) {
  args.push(`-c.electronDist=${dist}`)
} else {
  console.warn(
    "[run-electron-builder] no local electron dist; electron-builder will fetch " +
      "via @electron/get (electronVersion + ELECTRON_MIRROR)."
  )
}
const cliArgs = process.argv.slice(2)
args.push(...cliArgs)

if (wantsUnsignedMacRelease(cliArgs)) {
  args.push(
    "-c.mac.identity=null",
    "-c.mac.hardenedRuntime=false",
    "-c.mac.entitlements=null",
    "-c.mac.entitlementsInherit=null"
  )
}

const result = spawnSync(process.execPath, [electronBuilderCli(), ...args], {
  stdio: "inherit",
})
if (result.error) {
  console.error(`[run-electron-builder] spawn failed: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status == null ? 1 : result.status)

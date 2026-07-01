const assert = require('node:assert/strict')
const test = require('node:test')

const { createLinkTitleWindow, linkTitleWindowOptions, readLinkTitle } = require('./link-title-window.cjs')

function makeFakeBrowserWindow() {
  const calls = { audioMuted: [] }
  const FakeBrowserWindow = function (options) {
    this.options = options
    this.webContents = {
      setAudioMuted(value) {
        calls.audioMuted.push(value)
      }
    }
  }

  return { FakeBrowserWindow, calls }
}

test('linkTitleWindowOptions keeps the offscreen, hardened defaults', () => {
  const session = { id: 'link-titles' }
  const options = linkTitleWindowOptions(session)

  assert.equal(options.show, false)
  assert.equal(options.webPreferences.session, session)
  assert.equal(options.webPreferences.contextIsolation, true)
  assert.equal(options.webPreferences.sandbox, true)
  assert.equal(options.webPreferences.nodeIntegration, false)
})

test('createLinkTitleWindow mutes audio so historical links never autoplay sound', () => {
  // Regression for #49505: the hidden title-fetch window loaded YouTube/watch
  // URLs (to read their <title>) without muting, leaking ~2s of audio on every
  // history re-render.
  const { FakeBrowserWindow, calls } = makeFakeBrowserWindow()

  const window = createLinkTitleWindow(FakeBrowserWindow, { id: 'link-titles' })

  assert.ok(window instanceof FakeBrowserWindow)
  assert.deepEqual(calls.audioMuted, [true])
})

test('createLinkTitleWindow still returns the window if muting throws', () => {
  const ThrowingBrowserWindow = function (options) {
    this.options = options
    this.webContents = {
      setAudioMuted() {
        throw new Error('webContents unavailable')
      }
    }
  }

  const window = createLinkTitleWindow(ThrowingBrowserWindow, { id: 'link-titles' })

  assert.ok(window instanceof ThrowingBrowserWindow)
})

test('readLinkTitle returns the current title from a live window', () => {
  assert.equal(
    readLinkTitle({
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        getTitle: () => ' Example '
      }
    }),
    ' Example '
  )
})

test('readLinkTitle tolerates windows destroyed before delayed title reads', () => {
  assert.equal(readLinkTitle({ isDestroyed: () => true }), '')
  assert.equal(
    readLinkTitle({
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => true,
        getTitle: () => {
          throw new Error('should not read a destroyed webContents')
        }
      }
    }),
    ''
  )
})

test('readLinkTitle swallows Electron destroyed-object races', () => {
  const destroyedWindow = {
    isDestroyed: () => false,
    get webContents() {
      throw new TypeError('Object has been destroyed')
    }
  }

  assert.equal(readLinkTitle(destroyedWindow), '')
})

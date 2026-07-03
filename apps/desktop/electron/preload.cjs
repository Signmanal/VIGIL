const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('vigilDesktop', {
  getConnection: profile => ipcRenderer.invoke('vigil:connection', profile),
  revalidateConnection: () => ipcRenderer.invoke('vigil:connection:revalidate'),
  touchBackend: profile => ipcRenderer.invoke('vigil:backend:touch', profile),
  getGatewayWsUrl: profile => ipcRenderer.invoke('vigil:gateway:ws-url', profile),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('vigil:window:openSession', sessionId, opts),
  openNewSessionWindow: () => ipcRenderer.invoke('vigil:window:openNewSession'),
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('vigil:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('vigil:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('vigil:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('vigil:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('vigil:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('vigil:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('vigil:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('vigil:pet-overlay:state', listener)
      return () => ipcRenderer.removeListener('vigil:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('vigil:pet-overlay:control', listener)
      return () => ipcRenderer.removeListener('vigil:pet-overlay:control', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('vigil:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('vigil:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('vigil:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('vigil:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('vigil:connection-config:test', payload),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('vigil:connection-config:probe', remoteUrl),
  oauthLoginConnectionConfig: remoteUrl => ipcRenderer.invoke('vigil:connection-config:oauth-login', remoteUrl),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('vigil:connection-config:oauth-logout', remoteUrl),
  profile: {
    get: () => ipcRenderer.invoke('vigil:profile:get'),
    set: name => ipcRenderer.invoke('vigil:profile:set', name)
  },
  api: request => ipcRenderer.invoke('vigil:api', request),
  notify: payload => ipcRenderer.invoke('vigil:notify', payload),
  requestMicrophoneAccess: () => ipcRenderer.invoke('vigil:requestMicrophoneAccess'),
  readFileDataUrl: filePath => ipcRenderer.invoke('vigil:readFileDataUrl', filePath),
  readFileText: filePath => ipcRenderer.invoke('vigil:readFileText', filePath),
  selectPaths: options => ipcRenderer.invoke('vigil:selectPaths', options),
  writeClipboard: text => ipcRenderer.invoke('vigil:writeClipboard', text),
  saveImageFromUrl: url => ipcRenderer.invoke('vigil:saveImageFromUrl', url),
  saveImageBuffer: (data, ext) => ipcRenderer.invoke('vigil:saveImageBuffer', { data, ext }),
  saveClipboardImage: () => ipcRenderer.invoke('vigil:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('vigil:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('vigil:watchPreviewFile', url),
  stopPreviewFileWatch: id => ipcRenderer.invoke('vigil:stopPreviewFileWatch', id),
  setTitleBarTheme: payload => ipcRenderer.send('vigil:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('vigil:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('vigil:translucency', payload),
  setPreviewShortcutActive: active => ipcRenderer.send('vigil:previewShortcutActive', Boolean(active)),
  openExternal: url => ipcRenderer.invoke('vigil:openExternal', url),
  openPathInApp: (filePath, appId) => ipcRenderer.invoke('vigil:openPathInApp', filePath, appId),
  openPreviewInBrowser: url => ipcRenderer.invoke('vigil:openPreviewInBrowser', url),
  revealPath: filePath => ipcRenderer.invoke('vigil:revealPath', filePath),
  fetchLinkTitle: url => ipcRenderer.invoke('vigil:fetchLinkTitle', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('vigil:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('vigil:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('vigil:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('vigil:setting:defaultProjectDir:pick')
  },
  revealLogs: () => ipcRenderer.invoke('vigil:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('vigil:logs:recent'),
  readDir: dirPath => ipcRenderer.invoke('vigil:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('vigil:fs:gitRoot', startPath),
  worktrees: cwds => ipcRenderer.invoke('vigil:fs:worktrees', cwds),
  terminal: {
    dispose: id => ipcRenderer.invoke('vigil:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('vigil:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('vigil:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('vigil:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `vigil:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `vigil:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('vigil:close-preview-requested', listener)
    return () => ipcRenderer.removeListener('vigil:close-preview-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('vigil:open-updates', listener)
    return () => ipcRenderer.removeListener('vigil:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('vigil:deep-link', listener)
    return () => ipcRenderer.removeListener('vigil:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('vigil:deep-link-ready'),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('vigil:window-state-changed', listener)
    return () => ipcRenderer.removeListener('vigil:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('vigil:focus-session', listener)
    return () => ipcRenderer.removeListener('vigil:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('vigil:notification-action', listener)
    return () => ipcRenderer.removeListener('vigil:notification-action', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('vigil:preview-file-changed', listener)
    return () => ipcRenderer.removeListener('vigil:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('vigil:backend-exit', listener)
    return () => ipcRenderer.removeListener('vigil:backend-exit', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('vigil:power-resume', listener)
    return () => ipcRenderer.removeListener('vigil:power-resume', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('vigil:boot-progress', listener)
    return () => ipcRenderer.removeListener('vigil:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.cjs (apps/desktop/electron/bootstrap-runner.cjs).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('vigil:bootstrap:get'),
  resetBootstrap: () => ipcRenderer.invoke('vigil:bootstrap:reset'),
  repairBootstrap: () => ipcRenderer.invoke('vigil:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('vigil:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('vigil:bootstrap:event', listener)
    return () => ipcRenderer.removeListener('vigil:bootstrap:event', listener)
  },
  getVersion: () => ipcRenderer.invoke('vigil:version'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('vigil:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('vigil:uninstall:summary'),
    run: mode => ipcRenderer.invoke('vigil:uninstall:run', { mode })
  },
  updates: {
    check: () => ipcRenderer.invoke('vigil:updates:check'),
    apply: opts => ipcRenderer.invoke('vigil:updates:apply', opts),
    getBranch: () => ipcRenderer.invoke('vigil:updates:branch:get'),
    setBranch: name => ipcRenderer.invoke('vigil:updates:branch:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('vigil:updates:progress', listener)
      return () => ipcRenderer.removeListener('vigil:updates:progress', listener)
    }
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('vigil:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('vigil:vscode-theme:search', query)
  }
})

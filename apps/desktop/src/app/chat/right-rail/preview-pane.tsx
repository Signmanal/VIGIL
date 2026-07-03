import { useStore } from '@nanostores/react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SetTitlebarToolGroup, TitlebarTool } from '@/app/shell/titlebar-controls'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tip } from '@/components/ui/tooltip'
import type { VIGILPathOpenApp } from '@/global'
import { type Translations, useI18n } from '@/i18n'
import { isDesktopFsRemoteMode } from '@/lib/desktop-fs'
import { Bug, ChevronDown, ExternalLink, FolderOpen, Globe, Maximize2, Minimize2, Vscode } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { $previewServerRestart, failPreviewServerRestart, type PreviewTarget } from '@/store/preview'

import {
  clampConsoleHeight,
  compactUrl,
  formatLogLine,
  isNearConsoleBottom,
  PreviewConsolePanel,
  PreviewConsoleTitlebarIcon
} from './preview-console'
import { type ConsoleEntry, createPreviewConsoleState } from './preview-console-state'
import { LocalFilePreview, PreviewEmptyState } from './preview-file'

type PreviewWebview = HTMLElement & {
  closeDevTools?: () => void
  getURL?: () => string
  isDevToolsOpened?: () => boolean
  openDevTools?: () => void
  reload?: () => void
  reloadIgnoringCache?: () => void
}

interface PreviewPaneProps {
  embedded?: boolean
  onRestartServer?: (url: string, context?: string) => Promise<string>
  reloadRequest?: number
  setTitlebarToolGroup?: SetTitlebarToolGroup
  target: PreviewTarget
}

interface PreviewLoadErrorState {
  code?: number
  description: string
  url: string
}

const FILE_RELOAD_DEBOUNCE_MS = 200
const SERVER_RESTART_TIMEOUT_MS = 45_000

function filePathForPreviewTarget(target: PreviewTarget): string {
  if (target.path) {
    return target.path
  }

  try {
    const url = new URL(target.url)

    return url.protocol === 'file:' ? decodeURIComponent(url.pathname) : ''
  } catch {
    return target.kind === 'file' ? target.url : ''
  }
}

function previewActionClass(active = false) {
  return cn(
    'inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-[0.6875rem] font-medium transition-colors',
    active
      ? 'border-primary/35 bg-primary/15 text-primary'
      : 'border-border/70 bg-background/70 text-muted-foreground hover:bg-accent hover:text-foreground'
  )
}

function loadErrorTitle(error: PreviewLoadErrorState, copy: Translations['preview']['web']): string {
  const description = error.description.toLowerCase()

  if (description.includes('module script') || description.includes('mime type')) {
    return copy.appFailedToBoot
  }

  if (description.includes('connection') || description.includes('refused') || description.includes('not found')) {
    return copy.serverNotFound
  }

  return copy.failedToLoad
}

function isModuleMimeError(message: string): boolean {
  const lower = message.toLowerCase()

  return lower.includes('failed to load module script') && lower.includes('mime type')
}

function PreviewLoadError({
  consoleHeight = 0,
  error,
  onRestartServer,
  onRetry,
  restarting
}: {
  consoleHeight?: number
  error: PreviewLoadErrorState
  onRestartServer?: () => void
  onRetry: () => void
  restarting?: boolean
}) {
  const { t } = useI18n()
  const copy = t.preview.web

  return (
    <PreviewEmptyState
      body={
        <>
          <a
            className="pointer-events-auto block font-mono text-muted-foreground/90 underline decoration-current/20 underline-offset-4 transition-colors hover:text-foreground"
            href={error.url}
            onClick={event => {
              event.preventDefault()
              void window.vigilDesktop?.openExternal(error.url)
            }}
          >
            {compactUrl(error.url)}
            {error.code ? ` (${error.code})` : ''}
          </a>
          <div className="mt-1 text-[0.6875rem] text-muted-foreground/70">{error.description}</div>
        </>
      }
      consoleHeight={consoleHeight}
      primaryAction={{ label: copy.tryAgain, onClick: onRetry }}
      secondaryAction={
        onRestartServer
          ? {
              disabled: restarting,
              label: restarting ? copy.restarting : copy.askRestart,
              onClick: onRestartServer
            }
          : undefined
      }
      title={loadErrorTitle(error, copy)}
    />
  )
}

const TITLEBAR_GROUP_ID = 'preview'

function PreviewToolbarButton({
  active,
  children,
  disabled,
  label,
  onClick
}: {
  active?: boolean
  children: ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Tip label={label}>
      <button
        aria-label={label}
        className={cn(previewActionClass(active), 'disabled:cursor-default disabled:opacity-50')}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
    </Tip>
  )
}

function PreviewOpenMenu({
  canOpenBrowser,
  canOpenLocalPath,
  onOpenBrowser,
  onOpenLocal
}: {
  canOpenBrowser: boolean
  canOpenLocalPath: boolean
  onOpenBrowser: () => void
  onOpenLocal: (app: VIGILPathOpenApp) => void
}) {
  const { t } = useI18n()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={previewActionClass()} type="button">
          <ExternalLink className="size-3.5" />
          <span>{t.preview.openWith}</span>
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t.preview.openWith}</DropdownMenuLabel>
        <DropdownMenuItem disabled={!canOpenBrowser} onSelect={onOpenBrowser}>
          <Globe className="size-3.5" />
          {t.preview.openInBrowser}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canOpenLocalPath} onSelect={() => onOpenLocal('vscode')}>
          <Vscode className="size-3.5" />
          {t.preview.openInVsCode}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canOpenLocalPath} onSelect={() => onOpenLocal('cursor')}>
          <ExternalLink className="size-3.5" />
          {t.preview.openInCursor}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canOpenLocalPath} onSelect={() => onOpenLocal('system')}>
          <ExternalLink className="size-3.5" />
          {t.preview.openInDefaultApp}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canOpenLocalPath} onSelect={() => onOpenLocal('choose')}>
          <ExternalLink className="size-3.5" />
          {t.preview.chooseLocalApp}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PreviewPane({
  embedded = false,
  onRestartServer,
  reloadRequest = 0,
  setTitlebarToolGroup,
  target
}: PreviewPaneProps) {
  const { t } = useI18n()
  const copy = t.preview.web
  const [consoleState] = useState(() => createPreviewConsoleState())
  const consoleBodyRef = useRef<HTMLDivElement | null>(null)
  const consoleShouldStickRef = useRef(true)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const lastReloadRequestRef = useRef(reloadRequest)
  const lastRestartEventRef = useRef('')
  const previewContentRef = useRef<HTMLDivElement | null>(null)
  const webviewRef = useRef<PreviewWebview | null>(null)
  const previewServerRestart = useStore($previewServerRestart)
  const consoleHeight = useStore(consoleState.$height)
  const consoleOpen = useStore(consoleState.$open)
  const [currentUrl, setCurrentUrl] = useState(target.url)
  const [devtoolsOpen, setDevtoolsOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [renderHtmlAsWeb, setRenderHtmlAsWeb] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<PreviewLoadErrorState | null>(null)
  const [localReloadKey, setLocalReloadKey] = useState(0)
  const isHtmlFile = target.kind === 'file' && target.previewKind === 'html'
  const localPath = filePathForPreviewTarget(target)
  const canOpenLocalPath = Boolean(localPath && target.kind === 'file' && window.vigilDesktop)
  const isWebPreview = target.kind === 'url' || (isHtmlFile && (target.renderMode !== 'source' || renderHtmlAsWeb))
  const canOpenBrowser = target.kind === 'url' || isHtmlFile
  const currentLabel = compactUrl(currentUrl)

  const previewLabel =
    target.label && target.label.replace(/\/$/, '') !== currentLabel.replace(/\/$/, '') ? target.label : currentLabel

  const restartingServer =
    previewServerRestart?.status === 'running' &&
    (previewServerRestart.url === target.url || previewServerRestart.url === currentUrl)

  const startConsoleResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()

      const handle = event.currentTarget
      const pointerId = event.pointerId
      const startY = event.clientY
      const startHeight = consoleHeight
      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect
      let active = true

      handle.setPointerCapture?.(pointerId)

      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'

      const handleMove = (moveEvent: PointerEvent) => {
        if (!active) {
          return
        }

        consoleState.setHeight(clampConsoleHeight(startHeight + startY - moveEvent.clientY))
      }

      const cleanup = () => {
        if (!active) {
          return
        }

        active = false
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        handle.releasePointerCapture?.(pointerId)
        window.removeEventListener('pointermove', handleMove, true)
        window.removeEventListener('pointerup', cleanup, true)
        window.removeEventListener('pointercancel', cleanup, true)
        window.removeEventListener('blur', cleanup)
        handle.removeEventListener('lostpointercapture', cleanup)
      }

      window.addEventListener('pointermove', handleMove, true)
      window.addEventListener('pointerup', cleanup, true)
      window.addEventListener('pointercancel', cleanup, true)
      window.addEventListener('blur', cleanup)
      handle.addEventListener('lostpointercapture', cleanup)
    },
    [consoleHeight, consoleState]
  )

  const reloadPreview = useCallback(() => {
    setLoadError(null)

    if (!isWebPreview) {
      setLocalReloadKey(key => key + 1)

      return
    }

    if (webviewRef.current?.reloadIgnoringCache) {
      webviewRef.current.reloadIgnoringCache()
    } else {
      webviewRef.current?.reload?.()
    }
  }, [isWebPreview])

  const appendConsoleEntry = useCallback(
    (entry: Omit<ConsoleEntry, 'id'>) => {
      consoleShouldStickRef.current = isNearConsoleBottom(consoleBodyRef.current)
      consoleState.append(entry)
    },
    [consoleState]
  )

  const restartServer = useCallback(async () => {
    if (!onRestartServer) {
      return
    }

    // Auto-open the preview console so the user can see progress events
    // streaming back from the background agent. Without this, clicking
    // "Ask VIGIL to restart the server" looked like it did nothing —
    // the work was happening, but in a collapsed pane.
    consoleState.setOpen(true)

    try {
      const context = consoleState.$logs.get().slice(-12).map(formatLogLine).join('\n')
      const taskId = await onRestartServer(currentUrl, context || undefined)

      appendConsoleEntry({
        level: 1,
        message: copy.lookingRestart(taskId)
      })

      notify({
        kind: 'info',
        title: copy.restartingTitle,
        message: copy.restartingMessage,
        durationMs: 4000
      })
    } catch (error) {
      appendConsoleEntry({
        level: 2,
        message: copy.startRestartFailed(error instanceof Error ? error.message : String(error))
      })
      notifyError(error, copy.restartFailed)
    }
  }, [appendConsoleEntry, consoleState, copy, currentUrl, onRestartServer])

  const openBrowser = useCallback(() => {
    const opener = window.vigilDesktop?.openPreviewInBrowser ?? window.vigilDesktop?.openExternal

    if (!opener) {
      return
    }

    void opener(currentUrl).catch(error => notifyError(error, t.preview.openFailed))
  }, [currentUrl, t.preview.openFailed])

  const openLocal = useCallback(
    (app: VIGILPathOpenApp) => {
      if (!localPath) {
        return
      }

      const opener = window.vigilDesktop?.openPathInApp
      if (!opener) {
        void window.vigilDesktop?.openExternal?.(target.url).catch(error => notifyError(error, t.preview.openFailed))

        return
      }

      void opener(localPath, app).catch(error => notifyError(error, t.preview.openFailed))
    },
    [localPath, t.preview.openFailed, target.url]
  )

  const revealFile = useCallback(() => {
    if (!localPath) {
      return
    }

    const revealer = window.vigilDesktop?.revealPath
    if (!revealer) {
      void window.vigilDesktop?.openExternal?.(target.url).catch(error => notifyError(error, t.preview.openFailed))

      return
    }

    void revealer(localPath).catch(error => notifyError(error, t.preview.openFailed))
  }, [localPath, t.preview.openFailed, target.url])

  const toggleDevTools = useCallback(() => {
    const webview = webviewRef.current

    if (!webview?.openDevTools) {
      return
    }

    if (webview.isDevToolsOpened?.()) {
      webview.closeDevTools?.()
      setDevtoolsOpen(false)

      return
    }

    webview.openDevTools()
    setDevtoolsOpen(true)
  }, [])

  useEffect(() => {
    if (!setTitlebarToolGroup) {
      return
    }

    const tools: TitlebarTool[] = [
      ...(isWebPreview
        ? [
            {
              active: consoleOpen,
              icon: <PreviewConsoleTitlebarIcon consoleState={consoleState} />,
              id: `${TITLEBAR_GROUP_ID}-console`,
              label: consoleOpen ? copy.hideConsole : copy.showConsole,
              onSelect: () => consoleState.setOpen(open => !open)
            },
            {
              active: devtoolsOpen,
              icon: <Bug />,
              id: `${TITLEBAR_GROUP_ID}-devtools`,
              label: devtoolsOpen ? copy.hideDevTools : copy.openDevTools,
              onSelect: toggleDevTools
            }
          ]
        : [])
    ]

    setTitlebarToolGroup(TITLEBAR_GROUP_ID, tools)

    return () => setTitlebarToolGroup(TITLEBAR_GROUP_ID, [])
  }, [consoleOpen, consoleState, copy, devtoolsOpen, isWebPreview, setTitlebarToolGroup, toggleDevTools])

  useEffect(() => {
    setRenderHtmlAsWeb(false)
  }, [target.renderMode, target.url])

  useEffect(() => {
    if (!expanded) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded])

  useEffect(() => {
    if (!consoleOpen) {
      return
    }

    consoleShouldStickRef.current = true

    const handle = window.requestAnimationFrame(() => {
      const consoleBody = consoleBodyRef.current
      consoleBody?.scrollTo({ top: consoleBody.scrollHeight })
    })

    return () => window.cancelAnimationFrame(handle)
  }, [consoleOpen])

  useEffect(() => {
    if (
      !previewServerRestart ||
      !previewServerRestart.message ||
      (previewServerRestart.url !== target.url && previewServerRestart.url !== currentUrl)
    ) {
      return
    }

    const eventKey = `${previewServerRestart.taskId}:${previewServerRestart.status}:${previewServerRestart.message || ''}`

    if (eventKey === lastRestartEventRef.current) {
      return
    }

    lastRestartEventRef.current = eventKey
    appendConsoleEntry({
      level: previewServerRestart.status === 'error' ? 2 : 1,
      message:
        previewServerRestart.status === 'running'
          ? previewServerRestart.message
          : previewServerRestart.status === 'complete'
            ? copy.finishedRestarting(previewServerRestart.message)
            : copy.failedRestarting(previewServerRestart.message || copy.unknownError)
    })

    if (previewServerRestart.status === 'complete') {
      reloadPreview()
      notify({
        kind: 'success',
        title: copy.restartedTitle,
        message: previewServerRestart.message?.slice(0, 160) || copy.reloadingNow,
        durationMs: 3500
      })
    } else if (previewServerRestart.status === 'error') {
      notify({
        kind: 'warning',
        title: copy.restartFailedTitle,
        message: previewServerRestart.message?.slice(0, 200) || copy.restartFailedMessage,
        durationMs: 6000
      })
    }
  }, [appendConsoleEntry, copy, currentUrl, previewServerRestart, reloadPreview, target.url])

  useEffect(() => {
    if (!restartingServer || !previewServerRestart) {
      return
    }

    const taskId = previewServerRestart.taskId

    const timer = window.setTimeout(() => {
      failPreviewServerRestart(taskId, copy.stillWorking)
    }, SERVER_RESTART_TIMEOUT_MS)

    return () => window.clearTimeout(timer)
  }, [copy.stillWorking, previewServerRestart, restartingServer])

  useEffect(() => {
    if (reloadRequest === lastReloadRequestRef.current) {
      return
    }

    lastReloadRequestRef.current = reloadRequest

    if (target.kind !== 'url') {
      return
    }

    appendConsoleEntry({
      level: 1,
      message: copy.workspaceReloading
    })
    reloadPreview()
  }, [appendConsoleEntry, copy.workspaceReloading, reloadPreview, reloadRequest, target.kind])

  useEffect(() => {
    if (
      target.kind !== 'file' ||
      isDesktopFsRemoteMode() ||
      !window.vigilDesktop?.watchPreviewFile ||
      !window.vigilDesktop?.onPreviewFileChanged
    ) {
      return
    }

    let active = true
    let pendingReloadCount = 0
    let pendingReloadUrl = ''
    let reloadTimer: ReturnType<typeof setTimeout> | null = null
    let watchId = ''

    const flushReload = () => {
      if (!active || pendingReloadCount === 0) {
        return
      }

      const changedCount = pendingReloadCount
      const changedUrl = pendingReloadUrl

      pendingReloadCount = 0
      pendingReloadUrl = ''

      appendConsoleEntry({
        level: 1,
        message:
          changedCount === 1
            ? copy.fileChanged(compactUrl(changedUrl))
            : copy.filesChanged(changedCount, compactUrl(changedUrl))
      })

      reloadPreview()
    }

    const unsubscribe = window.vigilDesktop.onPreviewFileChanged(payload => {
      if (!active || payload.id !== watchId) {
        return
      }

      pendingReloadCount += 1
      pendingReloadUrl = payload.url

      if (reloadTimer) {
        clearTimeout(reloadTimer)
      }

      reloadTimer = setTimeout(() => {
        reloadTimer = null
        flushReload()
      }, FILE_RELOAD_DEBOUNCE_MS)
    })

    void window.vigilDesktop
      .watchPreviewFile(target.url)
      .then(watch => {
        if (!active) {
          void window.vigilDesktop?.stopPreviewFileWatch?.(watch.id)

          return
        }

        watchId = watch.id
      })
      .catch(error => {
        appendConsoleEntry({
          level: 2,
          message: copy.watchFailed(error instanceof Error ? error.message : String(error))
        })
      })

    return () => {
      active = false
      unsubscribe()

      if (reloadTimer) {
        clearTimeout(reloadTimer)
      }

      if (watchId) {
        void window.vigilDesktop?.stopPreviewFileWatch?.(watchId)
      }
    }
  }, [appendConsoleEntry, copy, reloadPreview, target.kind, target.url])

  useEffect(() => {
    const host = hostRef.current

    if (!host) {
      return
    }

    host.replaceChildren()
    webviewRef.current = null
    setCurrentUrl(target.url)
    setDevtoolsOpen(false)
    setLoadError(null)
    consoleState.reset()
    setLoading(true)

    if (!isWebPreview) {
      setLoading(false)

      return
    }

    const webview = document.createElement('webview') as PreviewWebview
    webview.className = 'flex h-full w-full flex-1 bg-transparent'
    webview.setAttribute('partition', 'persist:vigil-preview')
    webview.setAttribute('src', target.url)
    webview.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no,sandbox=yes')

    const onConsole = (event: Event) => {
      const detail = event as Event & {
        level?: number
        line?: number
        message?: string
        sourceId?: string
      }

      const message = detail.message || ''

      appendConsoleEntry({
        level: detail.level ?? 0,
        line: detail.line,
        message,
        source: detail.sourceId
      })

      if ((detail.level ?? 0) >= 3 && isModuleMimeError(message)) {
        setLoadError({
          description: copy.moduleMimeDescription,
          url: webview.getURL?.() || target.url
        })
        setLoading(false)
      }
    }

    const onNavigate = (event: Event) => {
      const detail = event as Event & { url?: string }

      if (detail.url) {
        setLoadError(null)
        setCurrentUrl(detail.url)
      }
    }

    const onFail = (event: Event) => {
      const detail = event as Event & {
        errorCode?: number
        errorDescription?: string
        validatedURL?: string
      }

      const errorCode = detail.errorCode

      if (errorCode === -3) {
        return
      }

      appendConsoleEntry({
        level: 3,
        message: copy.loadFailedConsole(errorCode, detail.errorDescription || detail.validatedURL || copy.unknownError)
      })
      setLoadError({
        code: errorCode,
        description: detail.errorDescription || copy.unreachableDescription,
        url: detail.validatedURL || webview.getURL?.() || target.url
      })
      setLoading(false)
    }

    const onStart = () => setLoading(true)
    const onStop = () => setLoading(false)

    webview.addEventListener('console-message', onConsole)
    webview.addEventListener('did-fail-load', onFail)
    webview.addEventListener('did-navigate', onNavigate)
    webview.addEventListener('did-navigate-in-page', onNavigate)
    webview.addEventListener('did-start-loading', onStart)
    webview.addEventListener('did-stop-loading', onStop)
    host.appendChild(webview)
    webviewRef.current = webview

    return () => {
      webview.removeEventListener('console-message', onConsole)
      webview.removeEventListener('did-fail-load', onFail)
      webview.removeEventListener('did-navigate', onNavigate)
      webview.removeEventListener('did-navigate-in-page', onNavigate)
      webview.removeEventListener('did-start-loading', onStart)
      webview.removeEventListener('did-stop-loading', onStop)
      webview.remove()
    }
  }, [appendConsoleEntry, consoleState, copy, isWebPreview, target.url])

  return (
    <aside
      className={cn(
        'relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-transparent text-muted-foreground',
        expanded &&
          'fixed inset-3 z-[160] rounded-xl border border-border bg-background/95 shadow-2xl backdrop-blur-xl'
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            'pointer-events-none flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/85 px-2 py-1.5 backdrop-blur',
            !embedded && 'min-h-(--titlebar-height)'
          )}
        >
          <div className="min-w-0 flex-1">
            <Tip label={copy.openTarget(currentUrl)}>
              <button
                className="pointer-events-auto block max-w-full truncate text-left text-xs font-medium text-foreground underline-offset-4 decoration-current/20 transition-colors hover:text-primary hover:underline"
                onClick={canOpenBrowser ? openBrowser : () => openLocal('system')}
                type="button"
              >
                {previewLabel || copy.fallbackTitle}
              </button>
            </Tip>
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            {isHtmlFile && (
              <PreviewToolbarButton
                active={isWebPreview}
                label={isWebPreview ? t.preview.sourceMode : t.preview.webPreviewMode}
                onClick={() => setRenderHtmlAsWeb(value => !value)}
              >
                <Globe className="size-3.5" />
                <span className="hidden sm:inline">{isWebPreview ? t.preview.source : t.preview.webPreview}</span>
              </PreviewToolbarButton>
            )}
            <PreviewOpenMenu
              canOpenBrowser={canOpenBrowser}
              canOpenLocalPath={canOpenLocalPath}
              onOpenBrowser={openBrowser}
              onOpenLocal={openLocal}
            />
            <PreviewToolbarButton disabled={!canOpenLocalPath} label={t.preview.revealFile} onClick={revealFile}>
              <FolderOpen className="size-3.5" />
            </PreviewToolbarButton>
            <PreviewToolbarButton
              active={expanded}
              label={expanded ? t.preview.collapsePreview : t.preview.expandPreview}
              onClick={() => setExpanded(value => !value)}
            >
              {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </PreviewToolbarButton>
          </div>
        </div>

        <div
          className="pointer-events-auto relative min-h-0 flex-1 overflow-hidden bg-transparent"
          ref={previewContentRef}
        >
          <div
            className={cn(
              'absolute inset-0 flex bg-transparent',
              (!isWebPreview || loadError) && 'pointer-events-none opacity-0'
            )}
            ref={hostRef}
          />
          {!isWebPreview && <LocalFilePreview reloadKey={localReloadKey} target={target} />}
          {loadError && (
            <PreviewLoadError
              consoleHeight={consoleOpen ? consoleHeight : 0}
              error={loadError}
              onRestartServer={target.kind === 'url' && onRestartServer ? () => void restartServer() : undefined}
              onRetry={reloadPreview}
              restarting={restartingServer}
            />
          )}

          {isWebPreview && consoleOpen && (
            <PreviewConsolePanel
              consoleBodyRef={consoleBodyRef}
              consoleShouldStickRef={consoleShouldStickRef}
              consoleState={consoleState}
              startConsoleResize={startConsoleResize}
            />
          )}
        </div>
      </div>
    </aside>
  )
}

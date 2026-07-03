import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $connection } from '@/store/session'

import { PreviewPane } from './preview-pane'

const desktopWindow = window as unknown as { vigilDesktop?: Partial<Window['vigilDesktop']> }

function installDesktopBridge(partial: Partial<Window['vigilDesktop']>) {
  desktopWindow.vigilDesktop = partial
}

describe('PreviewPane console state', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(Date.now()), 0)
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
  })

  afterEach(() => {
    cleanup()
    $connection.set(null)
    delete desktopWindow.vigilDesktop
    vi.unstubAllGlobals()
  })

  it('does not watch backend-only remote filesystem previews locally', () => {
    const watchPreviewFile = vi.fn(async () => ({ id: 'watch-1', path: '/remote/file.txt' }))
    const onPreviewFileChanged = vi.fn(() => vi.fn())
    $connection.set({ mode: 'remote' } as never)
    installDesktopBridge({
      onPreviewFileChanged,
      watchPreviewFile
    })

    render(
      <PreviewPane
        setTitlebarToolGroup={vi.fn()}
        target={{
          kind: 'file',
          label: 'file.txt',
          path: '/remote/file.txt',
          previewKind: 'text',
          source: '/remote/file.txt',
          url: 'file:///remote/file.txt'
        }}
      />
    )

    expect(watchPreviewFile).not.toHaveBeenCalled()
    expect(onPreviewFileChanged).not.toHaveBeenCalled()
  })

  it('does not rebuild the pane titlebar group for streamed console logs', () => {
    const setTitlebarToolGroup = vi.fn()

    const rendered = render(
      <PreviewPane
        setTitlebarToolGroup={setTitlebarToolGroup}
        target={{
          kind: 'url',
          label: 'Preview',
          source: 'http://localhost:5174',
          url: 'http://localhost:5174'
        }}
      />
    )

    const initialCalls = setTitlebarToolGroup.mock.calls.length
    const webview = rendered.container.querySelector('webview')

    expect(webview).toBeInstanceOf(HTMLElement)

    act(() => {
      webview?.dispatchEvent(
        Object.assign(new Event('console-message'), {
          level: 0,
          message: 'streamed log line',
          sourceId: 'http://localhost:5174/src/main.tsx'
        })
      )
    })

    expect(setTitlebarToolGroup).toHaveBeenCalledTimes(initialCalls)
  })

  it('can switch an HTML file from source preview to webpage preview', () => {
    const rendered = render(
      <PreviewPane
        embedded
        target={{
          kind: 'file',
          label: 'prototype.html',
          path: '/tmp/prototype.html',
          previewKind: 'html',
          renderMode: 'source',
          source: '/tmp/prototype.html',
          url: 'file:///tmp/prototype.html'
        }}
      />
    )

    expect(rendered.container.querySelector('webview')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Preview as webpage' }))

    expect(rendered.container.querySelector('webview')).toBeInstanceOf(HTMLElement)
  })

  it('does not show the removed expand preview control', () => {
    render(
      <PreviewPane
        embedded
        target={{
          kind: 'file',
          label: 'prototype.html',
          path: '/tmp/prototype.html',
          previewKind: 'html',
          source: '/tmp/prototype.html',
          url: 'file:///tmp/prototype.html'
        }}
      />
    )

    expect(screen.queryByRole('button', { name: 'Expand preview' })).toBeNull()
  })

  it('opens local preview files with the selected IDE', async () => {
    const openPathInApp = vi.fn(async () => ({ app: 'vscode' as const, ok: true, path: '/tmp/prototype.html' }))
    installDesktopBridge({
      openPathInApp
    })

    render(
      <PreviewPane
        embedded
        target={{
          kind: 'file',
          label: 'prototype.html',
          path: '/tmp/prototype.html',
          previewKind: 'html',
          source: '/tmp/prototype.html',
          url: 'file:///tmp/prototype.html'
        }}
      />
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open with' }))
    await screen.findByRole('menu')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in VS Code' }))

    await waitFor(() => expect(openPathInApp).toHaveBeenCalledWith('/tmp/prototype.html', 'vscode'))
  })
})

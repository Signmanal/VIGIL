import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocalFilePreview } from './preview-file'

describe('LocalFilePreview', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('offers a system open action for binary files', async () => {
    const openExternal = vi.fn(async () => undefined)

    vi.stubGlobal('window', {
      ...window,
      vigilDesktop: {
        openExternal
      }
    })

    render(
      <LocalFilePreview
        reloadKey={0}
        target={{
          binary: true,
          kind: 'file',
          label: 'evidence.zip',
          path: '/tmp/evidence.zip',
          previewKind: 'binary',
          source: '/tmp/evidence.zip',
          url: 'file:///tmp/evidence.zip'
        }}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Open file' }))

    expect(openExternal).toHaveBeenCalledWith('file:///tmp/evidence.zip')
  })
})

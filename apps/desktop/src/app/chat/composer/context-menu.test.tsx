import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

import { ContextMenu } from './context-menu'
import type { ChatBarState } from './types'

const state: ChatBarState = {
  model: {
    canSwitch: true,
    model: 'gpt-5.5',
    provider: 'openai'
  },
  tools: {
    enabled: true,
    label: '添加'
  },
  voice: {
    active: false,
    enabled: true
  }
}

function renderMenu(overrides: Partial<React.ComponentProps<typeof ContextMenu>> = {}) {
  const props = {
    onInsertText: vi.fn(),
    onOpenUrlDialog: vi.fn(),
    onPasteClipboardImage: vi.fn(),
    onPickFiles: vi.fn(),
    onPickFolders: vi.fn(),
    onPickImages: vi.fn(),
    state,
    ...overrides
  }

  render(
    <I18nProvider configClient={null} initialLocale="zh">
      <ContextMenu {...props} />
    </I18nProvider>
  )

  return props
}

async function openMenu() {
  fireEvent.pointerDown(screen.getByRole('button', { name: '添加' }))

  return screen.findByRole('menu')
}

describe('ContextMenu attachment actions', () => {
  afterEach(() => {
    cleanup()
  })

  it('dispatches each attachment menu action from the dropdown', async () => {
    const actions = renderMenu()

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '文件…' }))
    expect(actions.onPickFiles).toHaveBeenCalledTimes(1)

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '文件夹…' }))
    expect(actions.onPickFolders).toHaveBeenCalledTimes(1)

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '图片…' }))
    expect(actions.onPickImages).toHaveBeenCalledTimes(1)

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '粘贴图片' }))
    expect(actions.onPasteClipboardImage).toHaveBeenCalledTimes(1)

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'URL…' }))
    expect(actions.onOpenUrlDialog).toHaveBeenCalledTimes(1)
  })

  it('opens prompt snippets from the dropdown', async () => {
    renderMenu()

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '提示词片段…' }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('提示词片段')).toBeTruthy()
  })
})

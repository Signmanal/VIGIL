import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

import { UninstallSection } from './uninstall-section'

function installUninstallBridge(agentInstalled = true) {
  const summary = vi.fn().mockResolvedValue({
    agent_installed: agentInstalled,
    running_app_path: '/Applications/XCLAW.app'
  })

  const run = vi.fn()

  Object.defineProperty(window, 'vigilDesktop', {
    configurable: true,
    value: {
      uninstall: { run, summary }
    }
  })

  return { run, summary }
}

function renderUninstallSection() {
  return render(
    <I18nProvider configClient={null} initialLocale="zh">
      <UninstallSection />
    </I18nProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'vigilDesktop')
})

describe('UninstallSection', () => {
  it('describes local removal controls and keeps options collapsed by default', async () => {
    installUninstallBridge()
    renderUninstallSection()

    expect(await screen.findByText('本机组件清理')).toBeTruthy()
    expect(screen.queryByText('仅卸载桌面应用')).toBeNull()
  })

  it('shows uninstall choices only after the user expands the section', async () => {
    installUninstallBridge()
    renderUninstallSection()

    fireEvent.click(await screen.findByRole('button', { name: '显示卸载选项' }))

    await waitFor(() => expect(screen.getByText('仅卸载桌面应用')).toBeTruthy())
    expect(screen.getByText('卸载应用和 Agent，保留数据')).toBeTruthy()
    expect(screen.getByText('卸载全部内容')).toBeTruthy()
  })
})

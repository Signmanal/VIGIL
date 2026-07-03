import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSkills = vi.fn()
const getToolsets = vi.fn()
const getSkillHubSources = vi.fn()
const browseSkillHub = vi.fn()
const searchSkillHub = vi.fn()
const installSkillHub = vi.fn()
const toggleSkill = vi.fn()
const toggleToolset = vi.fn()
const getToolsetConfig = vi.fn()
const selectToolsetProvider = vi.fn()

vi.mock('@/vigil', () => ({
  browseSkillHub: (...args: unknown[]) => browseSkillHub(...args),
  getSkills: () => getSkills(),
  getToolsets: () => getToolsets(),
  getSkillHubSources: () => getSkillHubSources(),
  searchSkillHub: (...args: unknown[]) => searchSkillHub(...args),
  installSkillHub: (...args: unknown[]) => installSkillHub(...args),
  toggleSkill: (name: string, enabled: boolean) => toggleSkill(name, enabled),
  toggleToolset: (name: string, enabled: boolean) => toggleToolset(name, enabled),
  getToolsetConfig: (name: string) => getToolsetConfig(name),
  selectToolsetProvider: (toolset: string, provider: string) => selectToolsetProvider(toolset, provider),
  deleteEnvVar: vi.fn(),
  revealEnvVar: vi.fn(),
  setEnvVar: vi.fn()
}))

// Notifications hit nanostores/timers we don't care about here.
vi.mock('@/store/notifications', () => ({
  notify: vi.fn(),
  notifyError: vi.fn()
}))

function toolset(overrides: Record<string, unknown> = {}) {
  return {
    name: 'web',
    label: 'Web Search',
    description: 'web_search, web_extract',
    enabled: true,
    available: true,
    configured: true,
    tools: ['web_search', 'web_extract'],
    ...overrides
  }
}

function renderSkills(route = '/skills?tab=toolsets') {
  return import('./index').then(({ SkillsView }) =>
    render(
      <MemoryRouter initialEntries={[route]}>
        <SkillsView />
      </MemoryRouter>
    )
  )
}

beforeEach(() => {
  getSkills.mockResolvedValue([])
  getToolsets.mockResolvedValue([toolset()])
  getSkillHubSources.mockResolvedValue({
    featured: [],
    index_available: false,
    installed: {},
    sources: [{ id: 'skills-sh', label: 'skills.sh' }]
  })
  browseSkillHub.mockResolvedValue({ installed: {}, results: [], source_counts: {}, timed_out: [] })
  searchSkillHub.mockResolvedValue({ installed: {}, results: [], source_counts: {}, timed_out: [] })
  installSkillHub.mockResolvedValue({ ok: true, pid: 123, name: 'skills-install' })
  toggleToolset.mockResolvedValue({ ok: true, name: 'web', enabled: false })
  getToolsetConfig.mockResolvedValue({ has_category: false, active_provider: null, providers: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SkillsView toolset management', () => {
  it('renders a switch for each toolset and toggles it off', async () => {
    await renderSkills()

    const sw = await screen.findByRole('switch', { name: 'Toggle Web Search toolset' })
    expect(sw.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(sw)

    await waitFor(() => expect(toggleToolset).toHaveBeenCalledWith('web', false))
  })

  it('renders toolset titles without leading emoji', async () => {
    getToolsets.mockResolvedValue([toolset({ name: 'cronjob', label: '⏰ Cron Jobs', description: 'cron tools' })])

    await renderSkills()

    expect(await screen.findByText('Cron Jobs')).toBeTruthy()
    expect(screen.queryByText(/⏰/)).toBeNull()
  })

  it('keeps the configured pill alongside the switch', async () => {
    await renderSkills()

    await screen.findByRole('switch', { name: 'Toggle Web Search toolset' })
    expect(screen.getByText('Configured')).toBeTruthy()
  })

  it('expands the provider config panel when the configured pill is clicked', async () => {
    await renderSkills()

    const configureBtn = await screen.findByRole('button', { name: 'Configure Web Search' })
    fireEvent.click(configureBtn)

    await waitFor(() => expect(getToolsetConfig).toHaveBeenCalledWith('web'))
  })

  it('installs direct market identifiers from the skills market tab', async () => {
    await renderSkills('/skills?tab=market')

    const search = await screen.findByPlaceholderText('Search skills.sh or paste owner/repo...')
    fireEvent.change(search, { target: { value: 'owner/repo' } })

    const install = await screen.findByRole('button', { name: 'Install owner/repo directly' })
    fireEvent.click(install)

    await waitFor(() => expect(installSkillHub).toHaveBeenCalledWith('owner/repo'))
  })

  it('browses the default market source before search without rendering source cards', async () => {
    getSkillHubSources.mockResolvedValue({
      featured: [],
      index_available: true,
      installed: {},
      sources: [
        { available: true, id: 'vigil-index', label: 'VIGIL Index' },
        { id: 'github', label: 'GitHub', rate_limited: true }
      ]
    })
    browseSkillHub.mockResolvedValue({
      installed: {},
      results: [
        {
          description: 'Generate incident reports',
          identifier: 'security/incident-reporter',
          name: 'Incident Reporter',
          repo: null,
          source: 'vigil-index',
          tags: ['security'],
          trust_level: 'trusted'
        }
      ],
      source_counts: { 'skills-sh': 1 },
      timed_out: []
    })

    await renderSkills('/skills?tab=market')

    expect(screen.queryByText('Configured sources')).toBeNull()
    expect(screen.queryByText('VIGIL Index')).toBeNull()
    expect(screen.queryByText('GitHub')).toBeNull()
    expect(await screen.findByText('Incident Reporter')).toBeTruthy()
    expect(browseSkillHub).toHaveBeenCalledWith('skills-sh')

    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    await waitFor(() => expect(installSkillHub).toHaveBeenCalledWith('security/incident-reporter'))
  })

  it('keeps configured sources in the dropdown only', async () => {
    getSkillHubSources.mockResolvedValue({
      featured: [],
      index_available: true,
      installed: {},
      sources: [
        { available: true, id: 'skills-sh', label: 'skills.sh' },
        { available: true, id: 'browse-sh', label: 'browse.sh' }
      ]
    })
    browseSkillHub.mockResolvedValue({ installed: {}, results: [], source_counts: {}, timed_out: [] })

    await renderSkills('/skills?tab=market')

    expect(await screen.findByText('skills.sh')).toBeTruthy()
    expect(screen.queryByText('browse-sh')).toBeNull()
    expect(screen.queryByText('Configured sources')).toBeNull()
    expect(browseSkillHub).toHaveBeenCalledWith('skills-sh')
  })

  it('uses a generic market open button label', async () => {
    await renderSkills('/skills?tab=market')

    expect(await screen.findByRole('button', { name: 'Open' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open skills.sh' })).toBeNull()
  })

  it('exposes DasClaw as a marketplace source with its plaza URL', async () => {
    const { buildSkillMarketSourceOptions, skillMarketUrlForSource } = await import('./index')
    const options = buildSkillMarketSourceOptions([], 'All sources')

    expect(options).toContainEqual({
      id: 'dasclaw',
      label: 'DasClaw',
      url: 'https://skills.das-security.cn/dasclaw-frontend/skills-plaza'
    })
    expect(skillMarketUrlForSource('dasclaw', options)).toBe(
      'https://skills.das-security.cn/dasclaw-frontend/skills-plaza'
    )
  })
})

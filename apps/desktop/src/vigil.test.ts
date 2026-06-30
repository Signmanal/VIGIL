import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  browseSkillHub,
  getSessionMessages,
  getSkillHubSources,
  installSkillHub,
  listAllProfileSessions,
  listSessions,
  searchSkillHub
} from './vigil'

const emptySessionsResponse = {
  limit: 0,
  offset: 0,
  sessions: [],
  total: 0
}

describe('VIGIL REST session helpers', () => {
  let api: ReturnType<typeof vi.fn>

  beforeEach(() => {
    api = vi.fn().mockResolvedValue(emptySessionsResponse)
    Object.defineProperty(window, 'vigilDesktop', {
      configurable: true,
      value: { api }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, 'vigilDesktop')
  })

  it('uses a longer timeout for the single-profile session list', async () => {
    await listSessions(50, 1)

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/sessions?limit=50&offset=0&min_messages=1&archived=exclude&order=recent',
        timeoutMs: 60_000
      })
    )
  })

  it('uses a longer timeout for the all-profile session list', async () => {
    await listAllProfileSessions(50, 1)

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/profiles/sessions?limit=50&offset=0&min_messages=1&archived=exclude&order=recent&profile=all',
        timeoutMs: 60_000
      })
    )
  })

  it('tags cross-profile message reads for Electron routing and backend lookup', async () => {
    api.mockResolvedValue({ messages: [], session_id: 'session-1' })

    await getSessionMessages('session-1', 'xiaoxuxu')

    expect(api).toHaveBeenCalledWith({
      path: '/api/sessions/session-1/messages?profile=xiaoxuxu',
      profile: 'xiaoxuxu'
    })
  })

  it('uses a longer timeout for Skill Hub source listing', async () => {
    await getSkillHubSources()

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/skills/hub/sources',
        timeoutMs: 60_000
      })
    )
  })

  it('uses a longer timeout for Skill Hub browse and search calls', async () => {
    await browseSkillHub('skills-sh')
    await searchSkillHub('browser', 'skills-sh')

    expect(api).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: '/api/skills/hub/browse?source=skills-sh&limit=100',
        timeoutMs: 60_000
      })
    )
    expect(api).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: '/api/skills/hub/search?q=browser&source=skills-sh&limit=20',
        timeoutMs: 60_000
      })
    )
  })

  it('uses a longer timeout for Skill Hub installs', async () => {
    await installSkillHub('owner/repo')

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/skills/hub/install',
        method: 'POST',
        body: { identifier: 'owner/repo' },
        timeoutMs: 60_000
      })
    )
  })
})

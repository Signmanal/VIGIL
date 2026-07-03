import { describe, expect, it } from 'vitest'

import { resolveUpdateCopy } from './update-copy'

const copy = {
  availableTitle: 'New update available',
  availableBody: 'A new version of XCLAW is ready to install.',
  availableTitleRelease: 'New XCLAW version available',
  availableBodyRelease: 'A signed desktop installer is ready to download and install.',
  availableTitleBackend: 'Backend update available',
  availableBodyBackend: 'A newer version of the connected XCLAW backend is ready to install.',
  availableBodyNoChangelog: 'A newer version is ready. Release notes aren’t available for this install type.'
}

describe('resolveUpdateCopy', () => {
  it('client target with commits: client title + client body', () => {
    const r = resolveUpdateCopy({ target: 'client', shownItems: 5, copy })
    expect(r.title).toBe('New update available')
    expect(r.body).toBe('A new version of XCLAW is ready to install.')
  })

  it('backend target with commits: names the backend in title and body', () => {
    const r = resolveUpdateCopy({ target: 'backend', shownItems: 5, copy })
    expect(r.title).toBe('Backend update available')
    expect(r.body).toContain('backend')
  })

  it('no changelog (pip/non-git backend): degrades honestly, still names backend target in title', () => {
    const r = resolveUpdateCopy({ target: 'backend', shownItems: 0, copy })
    expect(r.title).toBe('Backend update available')
    // Body must NOT pretend there are notes — it states they're unavailable.
    expect(r.body).toBe(copy.availableBodyNoChangelog)
  })

  it('no changelog on client: same honest degrade', () => {
    const r = resolveUpdateCopy({ target: 'client', shownItems: 0, copy })
    expect(r.title).toBe('New update available')
    expect(r.body).toBe(copy.availableBodyNoChangelog)
  })

  it('release client update uses installer copy even without commit rows', () => {
    const r = resolveUpdateCopy({ channel: 'release', target: 'client', shownItems: 0, copy })
    expect(r.title).toBe('New XCLAW version available')
    expect(r.body).toBe('A signed desktop installer is ready to download and install.')
  })
})

import { describe, expect, it } from 'vitest'

import type { VIGILWorktreeInfo } from '@/global'
import type { SessionInfo } from '@/types/vigil'

import {
  projectGroupsFor,
  projectScopedGroupsFor,
  uniqueCwds,
  workspaceGroupsFor,
  workspaceTreeFor,
  type WorktreeResolver
} from './workspace-groups'

let nextId = 0

function makeSession(cwd: null | string, overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    archived: false,
    cwd,
    ended_at: null,
    id: `s${nextId++}`,
    input_tokens: 0,
    is_active: false,
    last_active: 1_000,
    message_count: 1,
    model: 'claude',
    output_tokens: 0,
    preview: null,
    source: 'cli',
    started_at: 1_000,
    title: null,
    tool_call_count: 0,
    ...overrides
  }
}

const labels = (sessions: SessionInfo[]) => workspaceGroupsFor(sessions, 'No workspace').map(g => g.label)

describe('workspaceGroupsFor', () => {
  it('groups by full cwd, not by basename — same-named folders are separate groups', () => {
    const groups = workspaceGroupsFor(
      [makeSession('/a/vigil-agent/apps/desktop'), makeSession('/a/vigil-agent-wt-rtl/apps/desktop')],
      'No workspace'
    )

    expect(groups).toHaveLength(2)
  })

  it('disambiguates colliding basenames by walking up the path', () => {
    expect(
      labels([makeSession('/a/vigil-agent/apps/desktop'), makeSession('/a/vigil-agent-wt-rtl/apps/desktop')])
    ).toEqual(['vigil-agent/apps/desktop', 'vigil-agent-wt-rtl/apps/desktop'])
  })

  it('leaves a unique basename as its short label', () => {
    expect(labels([makeSession('/a/vigil-agent/apps/desktop'), makeSession('/b/heval-py')])).toEqual([
      'desktop',
      'heval-py'
    ])
  })

  it('grows the prefix past one segment when the parent also collides', () => {
    expect(labels([makeSession('/x/proj/apps/desktop'), makeSession('/y/proj/apps/desktop')])).toEqual([
      'x/proj/apps/desktop',
      'y/proj/apps/desktop'
    ])
  })

  it('keeps the synthetic no-workspace group untouched even if a real group shares its label', () => {
    const groups = workspaceGroupsFor([makeSession(null), makeSession('/a/No workspace')], 'No workspace')
    const noWorkspace = groups.find(g => g.path === null)

    expect(noWorkspace?.label).toBe('No workspace')
  })
})

describe('projectGroupsFor', () => {
  it('renders manually-added projects even before they have sessions', () => {
    const groups = projectGroupsFor(['/workspace/xclaw'], [])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      label: 'xclaw',
      mode: 'project',
      path: '/workspace/xclaw',
      sessions: []
    })
  })

  it('groups sessions in the project root and descendants', () => {
    const groups = projectGroupsFor(
      ['/workspace/xclaw'],
      [makeSession('/workspace/xclaw'), makeSession('/workspace/xclaw/apps/desktop'), makeSession('/workspace/other')]
    )

    expect(groups[0].sessions).toHaveLength(2)
  })

  it('dedupes equivalent project paths', () => {
    const groups = projectGroupsFor(['/workspace/xclaw/', '/workspace/xclaw'], [])

    expect(groups).toHaveLength(1)
  })
})

describe('projectScopedGroupsFor', () => {
  it('keeps manual projects and adds unassigned workspaces without duplicating sessions', () => {
    const projectSession = makeSession('/workspace/xclaw/apps/desktop')
    const otherSession = makeSession('/workspace/other')
    const groups = projectScopedGroupsFor(['/workspace/xclaw'], [projectSession, otherSession], 'No workspace')

    expect(groups.map(group => group.label)).toEqual(['xclaw', 'other'])
    expect(groups[0]).toMatchObject({
      mode: 'project',
      path: '/workspace/xclaw',
      removable: true,
      sessions: [projectSession]
    })
    expect(groups[1]).toMatchObject({
      mode: 'project',
      path: '/workspace/other',
      removable: false,
      sessions: [otherSession]
    })
  })

  it('places sessions without cwd under the no-workspace project group', () => {
    const session = makeSession(null)
    const groups = projectScopedGroupsFor([], [session], 'No workspace')

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      label: 'No workspace',
      mode: 'project',
      path: null,
      removable: false,
      sessions: [session]
    })
  })
})

const info = (
  over: Partial<VIGILWorktreeInfo> & Pick<VIGILWorktreeInfo, 'repoRoot' | 'worktreeRoot'>
): VIGILWorktreeInfo => ({
  branch: null,
  isMainWorktree: false,
  ...over
})

describe('workspaceTreeFor', () => {
  it('heuristic nests `<repo>-wt-<branch>` under its sibling repo', () => {
    const tree = workspaceTreeFor(
      [makeSession('/www/vigil-agent'), makeSession('/www/vigil-agent-wt-rtl')],
      'No workspace'
    )

    expect(tree).toHaveLength(1)
    expect(tree[0].label).toBe('vigil-agent')
    expect(tree[0].groups.map(g => g.label).sort()).toEqual(['rtl', 'vigil-agent'])
  })

  it('git metadata is authoritative — worktrees group by repoRoot regardless of directory naming', () => {
    const resolver: WorktreeResolver = cwd => {
      if (cwd === '/www/vigil-agent') {
        return info({
          repoRoot: '/www/vigil-agent',
          worktreeRoot: '/www/vigil-agent',
          isMainWorktree: true,
          branch: 'main'
        })
      }

      if (cwd === '/elsewhere/ha-rtl') {
        return info({ repoRoot: '/www/vigil-agent', worktreeRoot: '/elsewhere/ha-rtl', branch: 'rtl' })
      }

      return null
    }

    const tree = workspaceTreeFor(
      [makeSession('/www/vigil-agent'), makeSession('/elsewhere/ha-rtl')],
      'No workspace',
      resolver
    )

    expect(tree).toHaveLength(1)
    expect(tree[0].label).toBe('vigil-agent')
    // The main checkout labels by directory (its branch is transient — using it
    // would misattribute old sessions to the currently checked-out branch);
    // linked worktrees label by branch.
    expect(tree[0].groups.map(g => g.label)).toEqual(['vigil-agent', 'rtl'])
  })

  it('a standalone directory is its own parent (always parent → worktree → sessions)', () => {
    const tree = workspaceTreeFor([makeSession('/www/heval-node')], 'No workspace')

    expect(tree).toHaveLength(1)
    expect(tree[0].label).toBe('heval-node')
    expect(tree[0].groups).toHaveLength(1)
    expect(tree[0].groups[0].label).toBe('heval-node')
  })

  it('aggregates session counts across a repo’s worktrees', () => {
    const tree = workspaceTreeFor(
      [makeSession('/www/ha'), makeSession('/www/ha-wt-x'), makeSession('/www/ha-wt-x')],
      'No workspace'
    )

    const parent = tree.find(p => p.label === 'ha')

    expect(parent?.sessionCount).toBe(3)
  })

  it('no-workspace sessions form their own parent', () => {
    const tree = workspaceTreeFor([makeSession(null)], 'No workspace')

    expect(tree).toHaveLength(1)
    expect(tree[0].label).toBe('No workspace')
    expect(tree[0].path).toBeNull()
  })
})

describe('uniqueCwds', () => {
  it('dedupes and drops empty/whitespace cwds', () => {
    expect(uniqueCwds([makeSession('/a'), makeSession('/a'), makeSession(null), makeSession('   ')])).toEqual(['/a'])
  })
})

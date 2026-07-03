import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo, SessionMessage } from '@/types/vigil'

const getSessionMessages = vi.fn()
const listAllProfileSessions = vi.fn()

vi.mock('@/vigil', () => ({
  getSessionMessages: (...args: unknown[]) => getSessionMessages(...args),
  listAllProfileSessions: (...args: unknown[]) => listAllProfileSessions(...args)
}))

import {
  artifactIdsForRetentionCleanup,
  type ArtifactRecord,
  ArtifactsView,
  collectArtifactsForSession,
  normalizeArtifactRetentionPolicy,
  readArtifactRetentionPolicy
} from './index'

beforeEach(() => {
  window.localStorage.clear()
  getSessionMessages.mockReset()
  listAllProfileSessions.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    ended_at: null,
    id: 'session-1',
    input_tokens: 0,
    is_active: false,
    last_active: 1000,
    message_count: 1,
    model: null,
    output_tokens: 0,
    preview: null,
    source: null,
    started_at: 1000,
    title: 'Session',
    tool_call_count: 0,
    ...overrides
  }
}

describe('collectArtifactsForSession', () => {
  it('does not index plain reference links from assistant text', () => {
    const artifacts = collectArtifactsForSession(makeSession(), [
      {
        content: 'Reference: https://example.com/docs/getting-started',
        role: 'assistant',
        timestamp: 2000
      }
    ])

    expect(artifacts).toHaveLength(0)
  })

  it('indexes generated download links present in tool JSON payloads', () => {
    const messages: SessionMessage[] = [
      {
        content: JSON.stringify({ download_url: 'https://example.com/reports/latest.html' }),
        role: 'tool',
        timestamp: 3000
      }
    ]

    const artifacts = collectArtifactsForSession(makeSession({ id: 'session-2' }), messages)

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      href: 'https://example.com/reports/latest.html',
      kind: 'link',
      value: 'https://example.com/reports/latest.html'
    })
  })

  it('classifies generated report paths separately from generic files', () => {
    const session = makeSession({ cwd: '/Users/alice/work' })

    const artifacts = collectArtifactsForSession(session, [
      {
        content: 'Saved report: ./reports/incident-summary.md\nArchive: ./dist/bundle.zip',
        role: 'assistant',
        timestamp: 4000
      }
    ])

    expect(artifacts).toHaveLength(2)
    expect(artifacts.find(artifact => artifact.value === './reports/incident-summary.md')).toMatchObject({
      cwd: '/Users/alice/work',
      kind: 'report',
      label: 'incident-summary.md'
    })
    expect(artifacts.find(artifact => artifact.value === './dist/bundle.zip')).toMatchObject({
      kind: 'file',
      label: 'bundle.zip'
    })
  })

  it('keeps generated html pages in links and skips ordinary local files', () => {
    const artifacts = collectArtifactsForSession(makeSession(), [
      {
        content: [
          'Generated output: `/Users/alice/workspace/demo/outputs/dashboard.html`',
          '读取文件：`/Users/alice/Downloads/old-report.pdf`'
        ].join('\n'),
        role: 'assistant',
        timestamp: 4500
      }
    ])

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      kind: 'link',
      label: 'dashboard.html',
      value: '/Users/alice/workspace/demo/outputs/dashboard.html'
    })
  })

  it('classifies report tool outputs as reports', () => {
    const artifacts = collectArtifactsForSession(makeSession(), [
      {
        content: JSON.stringify({ report_path: '/tmp/vigil-audit-report.html' }),
        role: 'tool',
        timestamp: 5000
      }
    ])

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      href: 'file:///tmp/vigil-audit-report.html',
      kind: 'report',
      label: 'vigil-audit-report.html'
    })
  })

  it('indexes report paths after Chinese punctuation in assistant text', () => {
    const artifacts = collectArtifactsForSession(makeSession(), [
      {
        content: '文件路径：/Users/alice/.vigil/skills/xsiam-cli/workspace/ueba_risk_report_20260630/index.html。',
        role: 'assistant',
        timestamp: 6000
      }
    ])

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      href: 'file:///Users/alice/.vigil/skills/xsiam-cli/workspace/ueba_risk_report_20260630/index.html',
      kind: 'report',
      label: 'index.html'
    })
  })

  it('indexes generated workspace-relative report artifacts from assistant text', () => {
    const session = makeSession({ cwd: '/Users/alice/.vigil/skills/xsiam-cli' })

    const artifacts = collectArtifactsForSession(session, [
      {
        content: [
          '报告文件：',
          '- HTML 报告：`workspace/ailog_analysis/artifacts/raw-log-analysis-report-admin.html`',
          '- Markdown 报告：`workspace/ailog_analysis/artifacts/raw-log-analysis-report-admin.md`',
          '- 证据包：`workspace/ailog_analysis/artifacts/evidence-package-admin.json`',
          '- 原始采样：`workspace/ailog_analysis/artifacts/raw-log-sample-admin.ndjson`'
        ].join('\n'),
        role: 'assistant',
        timestamp: 7000
      }
    ])

    expect(artifacts).toHaveLength(4)
    expect(artifacts.find(artifact => artifact.value.endsWith('.html'))).toMatchObject({
      cwd: '/Users/alice/.vigil/skills/xsiam-cli',
      kind: 'report',
      label: 'raw-log-analysis-report-admin.html'
    })
    expect(artifacts.find(artifact => artifact.value.endsWith('.md'))).toMatchObject({
      kind: 'report',
      label: 'raw-log-analysis-report-admin.md'
    })
    expect(artifacts.find(artifact => artifact.value.endsWith('evidence-package-admin.json'))).toMatchObject({
      kind: 'file',
      label: 'evidence-package-admin.json'
    })
    expect(artifacts.find(artifact => artifact.value.endsWith('.ndjson'))).toMatchObject({
      kind: 'file',
      label: 'raw-log-sample-admin.ndjson'
    })
  })

  it('orders artifacts newest first, including same-timestamp later outputs', () => {
    const artifacts = collectArtifactsForSession(makeSession(), [
      {
        content: '旧产物：`workspace/reports/old-report.md`',
        role: 'assistant',
        timestamp: 8000
      },
      {
        content: [
          '同一时间的早产物：`workspace/reports/same-time-first.md`',
          '同一时间的晚产物：`workspace/reports/same-time-second.md`'
        ].join('\n'),
        role: 'assistant',
        timestamp: 9000
      },
      {
        content: '最新产物：`workspace/reports/new-report.md`',
        role: 'assistant',
        timestamp: 10000
      }
    ])

    expect(artifacts.map(artifact => artifact.label)).toEqual([
      'new-report.md',
      'same-time-second.md',
      'same-time-first.md',
      'old-report.md'
    ])
  })

  it('keeps the latest occurrence when the same artifact is mentioned again', () => {
    const artifacts = collectArtifactsForSession(makeSession(), [
      {
        content: '第一次：`workspace/reports/reused-report.md`',
        role: 'assistant',
        timestamp: 11000
      },
      {
        content: '第二次：`workspace/reports/reused-report.md`',
        role: 'assistant',
        timestamp: 12000
      }
    ])

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      label: 'reused-report.md',
      timestamp: 12000000
    })
  })

  it('indexes ailog report, evidence, and summary artifacts but excludes skill references', () => {
    const session = makeSession({ cwd: '/Users/alice/.agents/skills/ueba-rule-generator' })

    const artifacts = collectArtifactsForSession(session, [
      {
        content: [
          '报告文件：',
          '- HTML 报告：`/Users/alice/workspace/ailog_analysis/artifacts/raw-log-analysis-report-admin.html`',
          '- Markdown 报告：`/Users/alice/workspace/ailog_analysis/artifacts/raw-log-analysis-report-admin.md`',
          '- 统一证据包：`/Users/alice/workspace/ailog_analysis/artifacts/evidence-package-admin.json`',
          '- 查询摘要：`/Users/alice/workspace/ailog_analysis/artifacts/raw-log-summary-admin.json`',
          '参考文件：`/Users/alice/.agents/skills/ueba-rule-generator/references/create_empty_rule.md`'
        ].join('\n'),
        role: 'assistant',
        timestamp: 13000
      }
    ])

    expect(artifacts.map(artifact => artifact.label)).toEqual([
      'raw-log-summary-admin.json',
      'evidence-package-admin.json',
      'raw-log-analysis-report-admin.md',
      'raw-log-analysis-report-admin.html'
    ])
    expect(artifacts.find(artifact => artifact.label === 'raw-log-summary-admin.json')).toMatchObject({ kind: 'file' })
    expect(artifacts.find(artifact => artifact.label === 'evidence-package-admin.json')).toMatchObject({ kind: 'file' })
    expect(artifacts.find(artifact => artifact.label === 'raw-log-analysis-report-admin.md')).toMatchObject({
      kind: 'report'
    })
    expect(artifacts.find(artifact => artifact.label === 'raw-log-analysis-report-admin.html')).toMatchObject({
      kind: 'report'
    })
    expect(artifacts.some(artifact => artifact.label === 'create_empty_rule.md')).toBe(false)
  })
})

function makeArtifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    cwd: null,
    href: 'file:///tmp/a.md',
    id: 'a',
    kind: 'report',
    label: 'a.md',
    sessionId: 'session-1',
    sessionTitle: 'Session',
    sortIndex: 0,
    timestamp: 1_000_000,
    value: '/tmp/a.md',
    ...overrides
  }
}

describe('artifactIdsForRetentionCleanup', () => {
  it('marks artifacts older than the retention window', () => {
    const now = Date.UTC(2026, 6, 3)
    const old = makeArtifact({ id: 'old', timestamp: now - 8 * 24 * 60 * 60 * 1000 })
    const recent = makeArtifact({ id: 'recent', timestamp: now - 2 * 24 * 60 * 60 * 1000 })

    expect(Array.from(artifactIdsForRetentionCleanup([old, recent], now))).toEqual(['old'])
  })

  it('uses custom retention policy values', () => {
    const now = Date.UTC(2026, 6, 3)
    const eightDaysOld = makeArtifact({ id: 'eight-days-old', timestamp: now - 8 * 24 * 60 * 60 * 1000 })

    expect(Array.from(artifactIdsForRetentionCleanup([eightDaysOld], now, { days: 10, limit: 500 }))).toEqual([])
    expect(Array.from(artifactIdsForRetentionCleanup([eightDaysOld], now, { days: 7, limit: 500 }))).toEqual([
      'eight-days-old'
    ])
  })

  it('marks the oldest artifacts beyond the retention count limit', () => {
    const now = Date.UTC(2026, 6, 3)

    const artifacts = Array.from({ length: 501 }, (_, index) =>
      makeArtifact({
        id: `artifact-${index}`,
        sortIndex: index,
        timestamp: now
      })
    )

    expect(Array.from(artifactIdsForRetentionCleanup(artifacts, now))).toEqual(['artifact-0'])
  })

  it('normalizes persisted retention policy values', () => {
    window.localStorage.setItem(
      'vigil.desktop.artifacts.retention.policy.v1',
      JSON.stringify({ days: 30, limit: 1000 })
    )

    expect(readArtifactRetentionPolicy()).toEqual({ days: 30, limit: 1000 })
    expect(normalizeArtifactRetentionPolicy({ days: -1, limit: 'bad' })).toEqual({ days: 7, limit: 500 })
  })
})

describe('ArtifactsView retention policy', () => {
  it('expands deletion policy and moves old generated local files to Trash', async () => {
    const trashPath = vi.fn(async (path: string) => ({ ok: true, path }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    Object.defineProperty(window, 'vigilDesktop', {
      configurable: true,
      value: {
        trashPath
      }
    })

    const session = makeSession({ cwd: '/workspace/project', id: 'retention-session', title: 'Retention Session' })
    listAllProfileSessions.mockResolvedValue({ sessions: [session] })
    getSessionMessages.mockResolvedValue({
      messages: [
        {
          content: '旧报告：`workspace/reports/old-report.md`\n引用：`https://example.com/reference`',
          role: 'assistant',
          timestamp: 1000
        }
      ]
    })

    render(createElement(MemoryRouter, null, createElement(ArtifactsView)))

    expect(await screen.findByText('old-report.md')).toBeTruthy()

    const policy = screen.getByRole('button', { name: /Retention and deletion policy/i })
    expect(policy.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(policy)
    expect(policy.getAttribute('aria-expanded')).toBe('true')

    fireEvent.change(screen.getByLabelText('Days to keep'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Maximum outputs'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }))

    expect(JSON.parse(window.localStorage.getItem('vigil.desktop.artifacts.retention.policy.v1') || '{}')).toEqual({
      days: 30,
      limit: 1000
    })
    expect(screen.getByText(/Keeps the last 30 days and up to 1000 outputs visible/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete old output files' }))

    await waitFor(() => expect(screen.queryByText('old-report.md')).toBeNull())
    expect(trashPath).toHaveBeenCalledWith('/workspace/project/workspace/reports/old-report.md')
    expect(screen.getAllByText(/1 deleted output record/).length).toBeGreaterThan(0)
  })
})

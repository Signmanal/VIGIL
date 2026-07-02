import { describe, expect, it } from 'vitest'

import type { SessionInfo, SessionMessage } from '@/types/vigil'

import { collectArtifactsForSession } from './index'

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
  it('indexes plain https links from assistant text', () => {
    const artifacts = collectArtifactsForSession(makeSession(), [
      {
        content: 'Reference: https://example.com/docs/getting-started',
        role: 'assistant',
        timestamp: 2000
      }
    ])

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      href: 'https://example.com/docs/getting-started',
      kind: 'link',
      value: 'https://example.com/docs/getting-started'
    })
  })

  it('indexes http links present in tool JSON payloads', () => {
    const messages: SessionMessage[] = [
      {
        content: JSON.stringify({ source_url: 'https://example.com/changelog/latest' }),
        role: 'tool',
        timestamp: 3000
      }
    ]

    const artifacts = collectArtifactsForSession(makeSession({ id: 'session-2' }), messages)

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      href: 'https://example.com/changelog/latest',
      kind: 'link',
      value: 'https://example.com/changelog/latest'
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
    expect(artifacts.find(artifact => artifact.value.endsWith('.json'))).toMatchObject({
      kind: 'file',
      label: 'evidence-package-admin.json'
    })
    expect(artifacts.find(artifact => artifact.value.endsWith('.ndjson'))).toMatchObject({
      kind: 'file',
      label: 'raw-log-sample-admin.ndjson'
    })
  })
})

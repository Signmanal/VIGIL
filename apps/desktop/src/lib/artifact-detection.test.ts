import { describe, expect, it } from 'vitest'

import {
  artifactKind,
  artifactTimestampMs,
  collectGeneratedArtifactTargetsFromText,
  collectGeneratedArtifactTargetsFromToolResult,
  isGeneratedArtifactTarget,
  previewArtifactPriority
} from './artifact-detection'

describe('artifact detection', () => {
  it('extracts generated report and evidence artifacts from assistant summaries', () => {
    const targets = collectGeneratedArtifactTargetsFromText(
      [
        '报告文件：',
        '- HTML 报告：`/Users/alice/workspace/ailog_analysis/artifacts/raw-log-analysis-report-admin.html`',
        '- Markdown 报告：`/Users/alice/workspace/ailog_analysis/artifacts/raw-log-analysis-report-admin.md`',
        '- 统一证据包：`/Users/alice/workspace/ailog_analysis/artifacts/evidence-package-admin.json`',
        '- 平台上下文：`/Users/alice/workspace/ailog_analysis/artifacts/platform-context-admin.json`',
        '- 原始日志采样：`/Users/alice/workspace/ailog_analysis/artifacts/raw-log-sample-admin.ndjson`',
        '- 查询摘要：`/Users/alice/workspace/ailog_analysis/artifacts/raw-log-summary-admin.json`'
      ].join('\n')
    )

    expect(targets).toEqual([
      '/Users/alice/workspace/ailog_analysis/artifacts/raw-log-analysis-report-admin.html',
      '/Users/alice/workspace/ailog_analysis/artifacts/raw-log-analysis-report-admin.md',
      '/Users/alice/workspace/ailog_analysis/artifacts/evidence-package-admin.json',
      '/Users/alice/workspace/ailog_analysis/artifacts/platform-context-admin.json',
      '/Users/alice/workspace/ailog_analysis/artifacts/raw-log-sample-admin.ndjson',
      '/Users/alice/workspace/ailog_analysis/artifacts/raw-log-summary-admin.json'
    ])
  })

  it('excludes skill reference and example files unless they are generated artifacts', () => {
    expect(
      isGeneratedArtifactTarget(
        '/Users/alice/.agents/skills/ueba-rule-generator/references/create_empty_rule.md',
        '参考文件'
      )
    ).toBe(false)
    expect(
      isGeneratedArtifactTarget(
        '/Users/alice/.agents/skills/ueba-rule-generator/examples/INDEX.md',
        '参考文件'
      )
    ).toBe(false)
    expect(
      isGeneratedArtifactTarget(
        '/Users/alice/.agents/skills/ueba-rule-generator/workspace/artifacts/generated-report.md',
        '报告文件'
      )
    ).toBe(true)
  })

  it('does not treat ordinary local files as generated outputs', () => {
    expect(
      collectGeneratedArtifactTargetsFromText('读取文件：`/Users/alice/Downloads/old-report.pdf`，用于参考。')
    ).toEqual([])
    expect(isGeneratedArtifactTarget('/Users/alice/Downloads/old-report.pdf', '文件路径')).toBe(false)
  })

  it('classifies generated html pages without report semantics as links', () => {
    const target = '/Users/alice/workspace/demo/outputs/dashboard.html'

    expect(isGeneratedArtifactTarget(target, 'Generated output: dashboard page')).toBe(true)
    expect(artifactKind(target)).toBe('link')
  })

  it('collects generated tool output artifacts but skips read-only tool results', () => {
    const result = {
      report_path: '/Users/alice/workspace/ailog_analysis/artifacts/raw-log-analysis-report-admin.html',
      summary_path: '/Users/alice/workspace/ailog_analysis/artifacts/raw-log-summary-admin.json'
    }

    expect(collectGeneratedArtifactTargetsFromToolResult(result, 'terminal')).toEqual([
      '/Users/alice/workspace/ailog_analysis/artifacts/raw-log-analysis-report-admin.html',
      '/Users/alice/workspace/ailog_analysis/artifacts/raw-log-summary-admin.json'
    ])
    expect(collectGeneratedArtifactTargetsFromToolResult(result, 'read_file')).toEqual([])
  })

  it('normalizes second-based timestamps to milliseconds', () => {
    expect(artifactTimestampMs(1_783_084_800)).toBe(1_783_084_800_000)
    expect(artifactTimestampMs(1_783_084_800_000)).toBe(1_783_084_800_000)
  })

  it('classifies and prioritizes reports ahead of auxiliary files', () => {
    expect(artifactKind('/tmp/raw-log-analysis-report-admin.html')).toBe('report')
    expect(artifactKind('/tmp/evidence-package-admin.json')).toBe('report')
    expect(previewArtifactPriority('/tmp/raw-log-analysis-report-admin.html')).toBeGreaterThan(
      previewArtifactPriority('/tmp/raw-log-sample-admin.ndjson')
    )
  })
})

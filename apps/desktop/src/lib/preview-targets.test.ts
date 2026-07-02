import { describe, expect, it } from 'vitest'

import {
  extractPreviewTargets,
  isPreviewableTarget,
  previewTargetFromInlineText,
  previewTargetFromMarkdownHref,
  previewTargetsFromChatText,
  stripPreviewTargets
} from './preview-targets'

describe('preview target detection', () => {
  it('does not infer preview targets from raw paths or URLs', () => {
    expect(extractPreviewTargets('Preview: http://localhost:5173/')).toEqual([])
    expect(extractPreviewTargets('Open index.html\n/tmp/demo.html\nhttp://localhost:5173/')).toEqual([])
  })

  it('decodes preview markdown hrefs', () => {
    expect(previewTargetFromMarkdownHref('#preview/%2Ftmp%2Fdemo.html')).toBe('/tmp/demo.html')
    expect(previewTargetFromMarkdownHref('#preview:%2Ftmp%2Fdemo.html')).toBe('/tmp/demo.html')
    expect(previewTargetFromMarkdownHref('#media:%2Ftmp%2Fdemo.mp4')).toBeNull()
  })

  it('extracts preview targets from already-rendered preview markers', () => {
    expect(extractPreviewTargets('[Preview: demo.html](#preview:%2Ftmp%2Fdemo.html)')).toEqual(['/tmp/demo.html'])
  })

  it('detects generated local files from assistant text', () => {
    const text = [
      '`workspace/ailog_today_deep_report/artifacts/final-report.html`',
      '`workspace/ailog_today_deep_report/build_final_deep_report.py`',
      '`workspace/ailog_today_deep_report/raw-search-hourly-probe.mjs`'
    ].join('\n')

    expect(previewTargetsFromChatText(text)).toEqual([
      'workspace/ailog_today_deep_report/artifacts/final-report.html',
      'workspace/ailog_today_deep_report/build_final_deep_report.py',
      'workspace/ailog_today_deep_report/raw-search-hourly-probe.mjs'
    ])
  })

  it('allows inline generated file paths but not arbitrary remote URLs', () => {
    expect(previewTargetFromInlineText('workspace/report/final.html')).toBe('workspace/report/final.html')
    expect(isPreviewableTarget('workspace/report/build.py')).toBe(true)
    expect(isPreviewableTarget('https://example.com/report.html')).toBe(false)
    expect(isPreviewableTarget('/tmp/archive.zip')).toBe(false)
  })

  it('strips preview targets from visible assistant text', () => {
    expect(stripPreviewTargets('ready\n/tmp/mycelium-bunnies.html\nopen it')).toBe(
      'ready\n/tmp/mycelium-bunnies.html\nopen it'
    )
    expect(stripPreviewTargets('[Preview: demo.html](#preview:%2Ftmp%2Fdemo.html)\nopen it')).toBe('open it')
  })
})

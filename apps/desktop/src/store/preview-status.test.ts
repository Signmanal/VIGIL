import { beforeEach, describe, expect, it } from 'vitest'

import {
  $previewStatusBySession,
  clearPreviewArtifacts,
  dismissPreviewArtifact,
  recordPreviewArtifact,
  selectPreviewArtifactsForDisplay
} from './preview-status'

beforeEach(() => $previewStatusBySession.set({}))

describe('recordPreviewArtifact', () => {
  it('appends new targets newest-last and is idempotent', () => {
    recordPreviewArtifact('s1', '/a/index.html', '/work')
    recordPreviewArtifact('s1', '/a/about.html', '/work')
    recordPreviewArtifact('s1', '/a/index.html', '/work')

    expect($previewStatusBySession.get().s1.map(i => i.id)).toEqual(['/a/index.html', '/a/about.html'])
  })

  it('keeps preview artifacts isolated by session id', () => {
    recordPreviewArtifact('s1', '/a/old-session-report.html', '/work/old')
    recordPreviewArtifact('s2', '/b/current-session-report.html', '/work/current')

    expect($previewStatusBySession.get().s1.map(i => i.id)).toEqual(['/a/old-session-report.html'])
    expect($previewStatusBySession.get().s2.map(i => i.id)).toEqual(['/b/current-session-report.html'])
  })

  it('caps the stored list and derives a label', () => {
    for (let n = 1; n <= 45; n += 1) {
      recordPreviewArtifact('s1', `/a/p${n}.html`, '/work')
    }

    const list = $previewStatusBySession.get().s1
    expect(list).toHaveLength(40)
    expect(list[0].id).toBe('/a/p6.html')
    expect(list[39].label).toBe('p45.html')
  })

  it('selects report artifacts for display before auxiliary files', () => {
    recordPreviewArtifact('s1', '/a/evidence-package-admin.json', '/work')
    recordPreviewArtifact('s1', '/a/platform-context-admin.json', '/work')
    recordPreviewArtifact('s1', '/a/raw-log-sample-admin.ndjson', '/work')
    recordPreviewArtifact('s1', '/a/raw-log-summary-admin.json', '/work')
    recordPreviewArtifact('s1', '/a/raw-log-analysis-report-admin.html', '/work')
    recordPreviewArtifact('s1', '/a/raw-log-analysis-report-admin.md', '/work')

    const list = $previewStatusBySession.get().s1
    const displayIds = selectPreviewArtifactsForDisplay(list).map(item => item.id)

    expect(displayIds).toHaveLength(4)
    expect(displayIds).toEqual([
      '/a/raw-log-analysis-report-admin.md',
      '/a/raw-log-analysis-report-admin.html',
      '/a/evidence-package-admin.json',
      '/a/raw-log-summary-admin.json'
    ])
  })

  it('returns every artifact when the display limit is expanded', () => {
    recordPreviewArtifact('s1', '/a/evidence-package-admin.json', '/work')
    recordPreviewArtifact('s1', '/a/platform-context-admin.json', '/work')
    recordPreviewArtifact('s1', '/a/raw-log-sample-admin.ndjson', '/work')
    recordPreviewArtifact('s1', '/a/raw-log-summary-admin.json', '/work')
    recordPreviewArtifact('s1', '/a/raw-log-analysis-report-admin.html', '/work')
    recordPreviewArtifact('s1', '/a/raw-log-analysis-report-admin.md', '/work')

    const list = $previewStatusBySession.get().s1
    const displayIds = selectPreviewArtifactsForDisplay(list, list.length).map(item => item.id)

    expect(displayIds).toHaveLength(6)
    expect(displayIds.slice(0, 2)).toEqual([
      '/a/raw-log-analysis-report-admin.md',
      '/a/raw-log-analysis-report-admin.html'
    ])
  })

  it('dismiss and clear remove rows', () => {
    recordPreviewArtifact('s1', '/a/index.html', '/work')
    recordPreviewArtifact('s1', '/a/about.html', '/work')
    dismissPreviewArtifact('s1', '/a/index.html')
    expect($previewStatusBySession.get().s1.map(i => i.id)).toEqual(['/a/about.html'])

    clearPreviewArtifacts('s1')
    expect($previewStatusBySession.get().s1).toBeUndefined()
  })
})

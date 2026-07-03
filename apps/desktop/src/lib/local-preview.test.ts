import { describe, expect, it } from 'vitest'

import { localPreviewTarget } from '@/lib/local-preview'

describe('localPreviewTarget', () => {
  it('keeps pdf and image files clickable as inline preview targets', () => {
    expect(localPreviewTarget('/tmp/report.pdf')?.previewKind).toBe('html')
    expect(localPreviewTarget('/tmp/chart.avif')?.previewKind).toBe('image')
  })

  it('treats common generated artifacts as text previews', () => {
    const target = localPreviewTarget('outputs/events.jsonl', '/workspace/project')

    expect(target).toMatchObject({
      kind: 'file',
      language: 'json',
      path: '/workspace/project/outputs/events.jsonl',
      previewKind: 'text'
    })
  })
})

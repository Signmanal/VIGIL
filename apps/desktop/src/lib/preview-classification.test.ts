import { describe, expect, it } from 'vitest'

import {
  previewExtension,
  previewKindForExtension,
  previewLanguage,
  previewMimeType
} from '@/lib/preview-classification'

describe('preview classification', () => {
  it('classifies webview, image, source, and data file types', () => {
    expect(previewKindForExtension('.pdf')).toBe('html')
    expect(previewKindForExtension('.png')).toBe('image')
    expect(previewKindForExtension('.jsonl')).toBe('text')
    expect(previewKindForExtension('.zip', true)).toBe('binary')
  })

  it('normalizes extension, language, and mime metadata', () => {
    expect(previewExtension('/tmp/report.final.PDF?download=1')).toBe('.pdf')
    expect(previewLanguage('.env')).toBe('dotenv')
    expect(previewLanguage('.ndjson')).toBe('json')
    expect(previewMimeType('.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    expect(previewMimeType('.unknown')).toBe('application/octet-stream')
  })
})

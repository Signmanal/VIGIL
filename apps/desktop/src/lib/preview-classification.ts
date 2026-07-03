import previewFileTypes from '../../electron/preview-file-types.json'

import type { PreviewTarget } from '@/store/preview'

type PreviewKind = NonNullable<PreviewTarget['previewKind']>

const HTML_EXTENSIONS = new Set(previewFileTypes.htmlExtensions)
const WEBVIEW_EXTENSIONS = new Set(previewFileTypes.webviewExtensions)
const IMAGE_EXTENSIONS = new Set(previewFileTypes.imageExtensions)
const MIME_BY_EXT: Record<string, string> = previewFileTypes.mimeByExt
const LANGUAGE_BY_EXT: Record<string, string> = previewFileTypes.languageByExt

export function previewExtension(value: string) {
  const clean = value.split(/[?#]/, 1)[0] || value
  const idx = clean.lastIndexOf('.')

  return idx >= 0 ? clean.slice(idx).toLowerCase() : ''
}

export function previewMimeType(ext: string) {
  return MIME_BY_EXT[ext.toLowerCase()] || 'application/octet-stream'
}

export function previewLanguage(ext: string) {
  return LANGUAGE_BY_EXT[ext.toLowerCase()] || 'text'
}

export function previewKindForExtension(ext: string, binary = false): PreviewKind {
  const normalized = ext.toLowerCase()

  if (HTML_EXTENSIONS.has(normalized) || WEBVIEW_EXTENSIONS.has(normalized)) {
    return 'html'
  }

  if (IMAGE_EXTENSIONS.has(normalized)) {
    return 'image'
  }

  return binary ? 'binary' : 'text'
}

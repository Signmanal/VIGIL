import { mediaExternalUrl } from './media'
import { isPreviewableTarget, previewTargetsFromChatText } from './preview-targets'

export type ArtifactKind = 'report' | 'image' | 'file' | 'link'

const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g
const URL_RE = /https?:\/\/[^\s<>"')]+/g
const PATH_RE = /(^|[\s("'`：,，])((?:\/|~\/|\.\.?\/)[^\s"'`<>，。；、]+(?:\.[a-z0-9]{1,10})?)/gi
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp)(?:[?#].*)?$/i

const REPORT_EXT_RE =
  /\.(?:html?|md|markdown|pdf|txt|log|jsonl?|ndjson|csv|tsv|xml|ya?ml|toml|docx?|xlsx?|pptx?)(?:[?#].*)?$/i

const FILE_EXT_RE =
  /\.(?:png|jpe?g|gif|webp|svg|bmp|html?|md|markdown|pdf|txt|log|jsonl?|ndjson|csv|tsv|xml|ya?ml|toml|docx?|xlsx?|pptx?|zip|tar|gz|mp3|wav|mp4|mov)(?:[?#].*)?$/i

const REPORT_HINT_RE =
  /(report|summary|analysis|audit|findings|review|assessment|diagnostic|diagnosis|investigation|brief|insight|evidence-package|报告|報告|分析|总结|總結|汇总|匯總|审计|審計|稽核|复盘|復盤|诊断|診斷|证据|證據)/i

const ALWAYS_REPORT_EXT_RE = /\.(?:html?|md|markdown|pdf|docx?|pptx?)(?:[?#].*)?$/i
const KEY_HINT_RE = /(path|file|url|image|artifact|output|download|result|target|report|summary|analysis|evidence)/i
const RELATIVE_ROOT_PATH_RE = /^[A-Za-z0-9_.@-]+\//

const GENERATED_CONTEXT_RE =
  /(generated|created|saved|wrote|written|exported|output|outputs|artifact|artifacts|report|reports|evidence|summary|analysis|download|file path|生成|创建|建立|保存|已保存|写入|导出|输出|产物|报告|證據|证据|摘要|总结|分析|文件|路径|路徑)/i

const GENERATED_DIR_SEGMENTS = new Set([
  'artifact',
  'artifacts',
  'generated',
  'output',
  'outputs',
  'report',
  'reports'
])

const REFERENCE_DIR_SEGMENTS = new Set(['examples', 'references'])

const READ_ONLY_TOOL_NAMES = new Set([
  'read_file',
  'search_files',
  'list_directory',
  'directory_tree',
  'grep',
  'rg',
  'find'
])

export function normalizeArtifactValue(value: string): string {
  return value
    .trim()
    .replace(/^`|`$/g, '')
    .replace(/[),.;，。；、]+$/, '')
}

export function artifactTimestampMs(value: number | null | undefined, fallback = Date.now()): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback
  }

  return value < 1_000_000_000_000 ? value * 1000 : value
}

function looksLikePathOrUrl(value: string): boolean {
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('file://') ||
    value.startsWith('data:image/') ||
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('~/') ||
    RELATIVE_ROOT_PATH_RE.test(value)
  )
}

export function looksLikeArtifact(value: string): boolean {
  const normalized = normalizeArtifactValue(value)

  if (/^(?:https?:\/\/|data:image\/)/.test(normalized)) {
    return true
  }

  if (isPreviewableTarget(normalized)) {
    return true
  }

  if (looksLikePathOrUrl(normalized) && (IMAGE_EXT_RE.test(normalized) || FILE_EXT_RE.test(normalized))) {
    return true
  }

  return normalized.startsWith('/') && normalized.includes('.')
}

export function artifactLabel(value: string): string {
  try {
    const url = new URL(value)
    const item = url.pathname.split('/').filter(Boolean).pop()

    return item || value
  } catch {
    const parts = value.split(/[\\/]/).filter(Boolean)

    return parts.pop() || value
  }
}

export function looksLikeReport(value: string): boolean {
  const normalized = normalizeArtifactValue(value)

  if (normalized.startsWith('data:image/') || IMAGE_EXT_RE.test(normalized)) {
    return false
  }

  if (!REPORT_EXT_RE.test(normalized)) {
    return false
  }

  if (ALWAYS_REPORT_EXT_RE.test(normalized)) {
    return true
  }

  return REPORT_HINT_RE.test(artifactLabel(normalized))
}

export function artifactKind(value: string): ArtifactKind {
  const normalized = normalizeArtifactValue(value)

  if (normalized.startsWith('data:image/') || IMAGE_EXT_RE.test(normalized)) {
    return 'image'
  }

  if (looksLikeReport(normalized)) {
    return 'report'
  }

  if (
    normalized.startsWith('/') ||
    normalized.startsWith('./') ||
    normalized.startsWith('../') ||
    normalized.startsWith('~/') ||
    normalized.startsWith('file://') ||
    RELATIVE_ROOT_PATH_RE.test(normalized)
  ) {
    return 'file'
  }

  return 'link'
}

export function artifactHref(value: string): string {
  const normalized = normalizeArtifactValue(value)

  if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('data:')) {
    return normalized
  }

  if (normalized.startsWith('file://') || normalized.startsWith('/')) {
    return mediaExternalUrl(normalized)
  }

  return normalized
}

function pathSegments(value: string): string[] {
  const normalized = normalizeArtifactValue(value)
    .replace(/^file:\/\//i, '')
    .replace(/^~\//, '')

  return normalized
    .split(/[\\/]+/)
    .map(segment => segment.trim().toLowerCase())
    .filter(Boolean)
}

function hasGeneratedArtifactAnchor(value: string): boolean {
  const segments = pathSegments(value)
  const joined = segments.join('/')

  return (
    segments.some(segment => GENERATED_DIR_SEGMENTS.has(segment)) ||
    /(?:^|[/_-])(?:artifact|artifacts|generated|output|outputs|report|reports)(?:[/_-]|$)/i.test(joined)
  )
}

function isReferencePath(value: string): boolean {
  const segments = pathSegments(value)

  if (hasGeneratedArtifactAnchor(value)) {
    return false
  }

  if (segments.some(segment => REFERENCE_DIR_SEGMENTS.has(segment))) {
    return true
  }

  if (segments.includes('optional-skills')) {
    return true
  }

  return segments.includes('.agents') && segments.includes('skills')
}

function hasGeneratedContext(text: string): boolean {
  return GENERATED_CONTEXT_RE.test(text)
}

export function isGeneratedArtifactTarget(value: string, context = ''): boolean {
  const normalized = normalizeArtifactValue(value)

  if (!normalized || !looksLikeArtifact(normalized) || isReferencePath(normalized)) {
    return false
  }

  if (hasGeneratedArtifactAnchor(normalized)) {
    return true
  }

  if (looksLikeReport(normalized)) {
    return hasGeneratedContext(`${context}\n${artifactLabel(normalized)}`)
  }

  if (IMAGE_EXT_RE.test(normalized) || FILE_EXT_RE.test(normalized)) {
    return hasGeneratedContext(`${context}\n${artifactLabel(normalized)}`)
  }

  return /^https?:\/\//i.test(normalized) && hasGeneratedContext(context)
}

function uniqueGeneratedTargets(values: string[], context: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const value of values) {
    const normalized = normalizeArtifactValue(value)

    if (!seen.has(normalized) && isGeneratedArtifactTarget(normalized, context)) {
      seen.add(normalized)
      out.push(normalized)
    }
  }

  return out
}

export function collectGeneratedArtifactTargetsFromText(text: string): string[] {
  const candidates: string[] = []

  for (const target of previewTargetsFromChatText(text)) {
    candidates.push(target)
  }

  for (const match of text.matchAll(MARKDOWN_IMAGE_RE)) {
    candidates.push(match[2] || '')
  }

  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const start = match.index ?? 0

    if (start > 0 && text[start - 1] === '!') {
      continue
    }

    candidates.push(match[2] || '')
  }

  for (const match of text.matchAll(URL_RE)) {
    candidates.push(match[0] || '')
  }

  for (const match of text.matchAll(PATH_RE)) {
    candidates.push(match[2] || '')
  }

  return uniqueGeneratedTargets(candidates, text)
}

function parseMaybeJson(value: string): unknown {
  if (!value.trim()) {
    return null
  }

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function collectStringValues(value: unknown, keyPath: string, visit: (value: string, keyPath: string) => void): void {
  if (typeof value === 'string') {
    visit(value, keyPath)

    const parsed = parseMaybeJson(value)

    if (parsed !== null) {
      collectStringValues(parsed, keyPath, visit)
    }

    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStringValues(item, `${keyPath}.${index}`, visit))

    return
  }

  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      collectStringValues(item, keyPath ? `${keyPath}.${key}` : key, visit)
    })
  }
}

export function collectGeneratedArtifactTargetsFromToolResult(result: unknown, toolName?: null | string): string[] {
  if (toolName && READ_ONLY_TOOL_NAMES.has(toolName)) {
    return []
  }

  const candidates: string[] = []

  collectStringValues(result, 'tool_result', (value, keyPath) => {
    const normalized = normalizeArtifactValue(value)

    if (!normalized) {
      return
    }

    if ((KEY_HINT_RE.test(keyPath) || looksLikePathOrUrl(normalized)) && looksLikeArtifact(normalized)) {
      candidates.push(normalized)
    }

    for (const target of collectGeneratedArtifactTargetsFromText(value)) {
      candidates.push(target)
    }
  })

  return uniqueGeneratedTargets(candidates, JSON.stringify(result ?? ''))
}

export function previewArtifactPriority(value: string): number {
  const normalized = normalizeArtifactValue(value)
  const label = artifactLabel(normalized)

  if (ALWAYS_REPORT_EXT_RE.test(normalized) && REPORT_HINT_RE.test(label)) {
    return 50
  }

  if (/evidence-package/i.test(label)) {
    return 30
  }

  if (/summary|analysis|report|报告|分析|总结/i.test(label)) {
    return 20
  }

  if (looksLikeReport(normalized)) {
    return 40
  }

  if (IMAGE_EXT_RE.test(normalized)) {
    return 10
  }

  return 0
}

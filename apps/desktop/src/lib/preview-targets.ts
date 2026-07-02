const PREVIEW_MARKDOWN_RE = /\[Preview:[^\]]+\]\((?<href>#preview[:/][^)]+)\)/gi
const CHAT_PREVIEW_MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g
const CHAT_PREVIEW_PATH_RE =
  /(^|[\s("'`：,，])((?:file:\/\/|\/|~\/|\.{1,2}\/|[A-Za-z0-9_.@-]+\/)[^\s"'`<>，。；、]+(?:\.[a-z0-9]{1,10})(?:[?#][^\s"'`<>，。；、]*)?)/gi
const PREVIEWABLE_TARGET_EXT_RE =
  /\.(?:bmp|c|conf|cpp|css|csv|gif|go|graphql|h|hpp|html?|java|jpe?g|js|json|jsonl|jsx|log|lua|markdown|md|mjs|ndjson|pdf|png|py|rb|rs|sh|sql|svg|toml|ts|tsx|tsv|txt|webp|xml|ya?ml|zsh)(?:[?#].*)?$/i

export function normalizePreviewTargetCandidate(value: string): string {
  return value
    .trim()
    .replace(/^`|`$/g, '')
    .replace(/[),.;，。；、]+$/, '')
}

export function isPreviewableTarget(value: string): boolean {
  const target = normalizePreviewTargetCandidate(value)

  return Boolean(
    target &&
      (/^file:\/\//i.test(target) ||
        (/^(?:\/|~\/|\.{1,2}\/|[A-Za-z0-9_.@-]+\/).+/i.test(target) &&
          PREVIEWABLE_TARGET_EXT_RE.test(target)) ||
        /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(target))
  )
}

export function previewTargetFromInlineText(text: string): string | null {
  const target = normalizePreviewTargetCandidate(text)

  return isPreviewableTarget(target) ? target : null
}

export function previewTargetsFromChatText(text: string): string[] {
  const targets = new Set<string>()

  for (const match of text.matchAll(CHAT_PREVIEW_MARKDOWN_LINK_RE)) {
    const target = previewTargetFromInlineText(match[2] || '')

    if (target) {
      targets.add(target)
    }
  }

  for (const match of text.matchAll(CHAT_PREVIEW_PATH_RE)) {
    const target = previewTargetFromInlineText(match[2] || '')

    if (target) {
      targets.add(target)
    }
  }

  return Array.from(targets)
}

export function stripPreviewTargets(text: string): string {
  return text
    .replace(PREVIEW_MARKDOWN_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function extractPreviewTargets(text: string): string[] {
  const targets: string[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(PREVIEW_MARKDOWN_RE)) {
    const target = previewTargetFromMarkdownHref(match.groups?.href)

    if (target && !seen.has(target)) {
      seen.add(target)
      targets.push(target)
    }
  }

  return targets
}

export function previewMarkdownHref(target: string): string {
  return `#preview/${encodeURIComponent(target)}`
}

export function previewTargetFromMarkdownHref(href?: string): string | null {
  if (!href?.startsWith('#preview:') && !href?.startsWith('#preview/')) {
    return null
  }

  try {
    return decodeURIComponent(href.slice('#preview'.length + 1))
  } catch {
    return null
  }
}

export function previewName(target: string): string {
  try {
    const url = new URL(target)

    if (url.protocol === 'file:') {
      return decodeURIComponent(url.pathname).split(/[\\/]/).filter(Boolean).pop() || target
    }

    const file = url.pathname.split('/').filter(Boolean).pop()

    return file || url.host
  } catch {
    return target.split(/[\\/]/).filter(Boolean).pop() || target
  }
}

export function previewDisplayLabel(target: string): string {
  const escaped = previewName(target).replace(/[[\]\\]/g, '\\$&')

  return `Preview: ${escaped}`
}

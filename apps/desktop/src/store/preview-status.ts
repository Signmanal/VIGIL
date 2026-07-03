import { atom } from 'nanostores'

import { normalizeArtifactValue, previewArtifactPriority } from '@/lib/artifact-detection'
import { previewName } from '@/lib/preview-targets'

/**
 * Session-scoped feed of previewable artifacts (reports, HTML files, localhost dev URLs)
 * a tool produced. Surfaced as compact links in the composer status stack —
 * NOT auto-opened and NOT a bulky inline card. Click opens the rail preview or
 * the browser; both are manual.
 *
 * Fed from the tool row itself (see tool-fallback.tsx) using the same detected
 * target the inline card used, so detection parity is exact.
 */
export interface PreviewArtifact {
  /** cwd captured at detection so a relative path still resolves on click. */
  cwd: string
  /** Dedupe key + display id (the raw target). */
  id: string
  label: string
  target: string
}

const MAX_STORED_PER_SESSION = 40
export const MAX_VISIBLE_PREVIEW_ARTIFACTS = 4

export const $previewStatusBySession = atom<Record<string, PreviewArtifact[]>>({})

const writePreviews = (sid: string, items: PreviewArtifact[]) => {
  const current = $previewStatusBySession.get()

  if (items.length === 0) {
    if (!current[sid]) {
      return
    }

    const next = { ...current }
    delete next[sid]
    $previewStatusBySession.set(next)

    return
  }

  $previewStatusBySession.set({ ...current, [sid]: items })
}

/**
 * Record a detected artifact, newest last, capped. Idempotent: a target already
 * in the list keeps its slot (the tool row re-registers on every render, so this
 * must not churn the atom or reorder rows).
 */
export function recordPreviewArtifact(sid: string, target: string, cwd: string) {
  const raw = normalizeArtifactValue(target)

  if (!sid || !raw) {
    return
  }

  const list = $previewStatusBySession.get()[sid] ?? []

  if (list.some(item => item.id === raw)) {
    return
  }

  writePreviews(sid, [...list, { cwd, id: raw, label: previewName(raw), target: raw }].slice(-MAX_STORED_PER_SESSION))
}

export function selectPreviewArtifactsForDisplay(
  items: PreviewArtifact[],
  limit = MAX_VISIBLE_PREVIEW_ARTIFACTS
): PreviewArtifact[] {
  return items
    .map((item, index) => ({ index, item, priority: previewArtifactPriority(item.target) }))
    .sort((left, right) => right.priority - left.priority || right.index - left.index)
    .slice(0, limit)
    .map(entry => entry.item)
}

export function dismissPreviewArtifact(sid: string, id: string) {
  const list = $previewStatusBySession.get()[sid]

  if (list) {
    writePreviews(
      sid,
      list.filter(item => item.id !== id)
    )
  }
}

export function clearPreviewArtifacts(sid: string) {
  writePreviews(sid, [])
}

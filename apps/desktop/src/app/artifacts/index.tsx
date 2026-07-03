import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ZoomableImage } from '@/components/chat/zoomable-image'
import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { CopyButton } from '@/components/ui/copy-button'
import {
  Pagination,
  PaginationButton,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination'
import { TextTab, TextTabMeta } from '@/components/ui/text-tab'
import { Tip } from '@/components/ui/tooltip'
import { type Translations, useI18n } from '@/i18n'
import {
  artifactHref,
  artifactKind,
  type ArtifactKind,
  artifactLabel,
  artifactTimestampMs,
  collectGeneratedArtifactTargetsFromText,
  collectGeneratedArtifactTargetsFromToolResult,
  looksLikeArtifact,
  normalizeArtifactValue
} from '@/lib/artifact-detection'
import { sessionTitle } from '@/lib/chat-runtime'
import { ExternalLinkIcon, hostPathLabel, urlSlugTitleLabel, useLinkTitle } from '@/lib/external-link'
import { FileImage, FileText, FolderOpen, Link2, MonitorPlay } from '@/lib/icons'
import { normalizeOrLocalPreviewTarget } from '@/lib/local-preview'
import { cn } from '@/lib/utils'
import { notifyError } from '@/store/notifications'
import type { PreviewTarget } from '@/store/preview'
import type { SessionInfo, SessionMessage } from '@/types/vigil'
import { getSessionMessages, listAllProfileSessions } from '@/vigil'

import { PreviewPane } from '../chat/right-rail/preview-pane'
import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import { PAGE_INSET_NEG_X, PAGE_INSET_X } from '../layout-constants'
import { PageSearchShell } from '../page-search-shell'
import { sessionRoute } from '../routes'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

type ArtifactFilter = 'all' | ArtifactKind
const ARTIFACT_FILTERS: readonly ArtifactFilter[] = ['all', 'report', 'image', 'file', 'link']
const TABLE_KIND_RANK: Record<ArtifactKind, number> = { report: 0, image: 1, file: 2, link: 3 }

export interface ArtifactRecord {
  id: string
  kind: ArtifactKind
  value: string
  href: string
  label: string
  cwd?: null | string
  sessionId: string
  sessionTitle: string
  sortIndex: number
  timestamp: number
}

interface ArtifactPreviewState {
  artifact: ArtifactRecord
  target: PreviewTarget
}

const ARTIFACT_TIME_FMT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short'
})

const ARTIFACT_RETENTION_DAYS = 7
const ARTIFACT_RETENTION_LIMIT = 500
const ARTIFACT_RETENTION_STORAGE_KEY = 'vigil.desktop.artifacts.hidden.v1'
const ARTIFACT_RETENTION_WINDOW_MS = ARTIFACT_RETENTION_DAYS * 24 * 60 * 60 * 1000

function messageText(message: SessionMessage): string {
  if (typeof message.content === 'string' && message.content.trim()) {
    return message.content
  }

  if (typeof message.text === 'string' && message.text.trim()) {
    return message.text
  }

  if (typeof message.context === 'string' && message.context.trim()) {
    return message.context
  }

  return ''
}

function collectArtifactsFromMessage(message: SessionMessage, pushValue: (value: string) => void): void {
  const text = messageText(message)

  if (text) {
    for (const target of collectGeneratedArtifactTargetsFromText(text)) {
      pushValue(target)
    }
  }

  if (message.role === 'tool') {
    for (const target of collectGeneratedArtifactTargetsFromToolResult(message.content, message.tool_name)) {
      pushValue(target)
    }
  }
}

export function collectArtifactsForSession(session: SessionInfo, messages: SessionMessage[]): ArtifactRecord[] {
  const found = new Map<string, ArtifactRecord>()
  const title = sessionTitle(session)
  let sortIndex = 0

  for (const message of messages) {
    if (message.role !== 'assistant' && message.role !== 'tool') {
      continue
    }

    collectArtifactsFromMessage(message, candidate => {
      const value = normalizeArtifactValue(candidate)

      if (!value || !looksLikeArtifact(value)) {
        return
      }

      const key = `${session.id}:${value}`
      const timestamp = artifactTimestampMs(message.timestamp ?? session.last_active ?? session.started_at)

      const nextRecord: ArtifactRecord = {
        id: key,
        kind: artifactKind(value),
        value,
        href: artifactHref(value),
        label: artifactLabel(value),
        cwd: session.cwd ?? null,
        sessionId: session.id,
        sessionTitle: title,
        sortIndex: sortIndex++,
        timestamp
      }

      const existing = found.get(key)

      if (existing && compareArtifactsNewestFirst(existing, nextRecord) <= 0) {
        return
      }

      found.set(key, nextRecord)
    })
  }

  return Array.from(found.values()).sort(compareArtifactsNewestFirst)
}

function compareArtifactsNewestFirst(left: ArtifactRecord, right: ArtifactRecord): number {
  const byTimestamp = right.timestamp - left.timestamp

  if (byTimestamp !== 0) {
    return byTimestamp
  }

  return right.sortIndex - left.sortIndex
}

function compareArtifactsForTable(left: ArtifactRecord, right: ArtifactRecord): number {
  const byKind = TABLE_KIND_RANK[left.kind] - TABLE_KIND_RANK[right.kind]

  return byKind || compareArtifactsNewestFirst(left, right)
}

function readHiddenArtifactIds(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set()
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(ARTIFACT_RETENTION_STORAGE_KEY) || '[]')

    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeHiddenArtifactIds(ids: Set<string>) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(ARTIFACT_RETENTION_STORAGE_KEY, JSON.stringify(Array.from(ids)))
}

export function artifactIdsForRetentionCleanup(artifacts: ArtifactRecord[], now = Date.now()): Set<string> {
  const cleanup = new Set<string>()
  const cutoff = now - ARTIFACT_RETENTION_WINDOW_MS
  let kept = 0

  for (const artifact of [...artifacts].sort(compareArtifactsNewestFirst)) {
    if (artifact.timestamp < cutoff || kept >= ARTIFACT_RETENTION_LIMIT) {
      cleanup.add(artifact.id)
    } else {
      kept += 1
    }
  }

  return cleanup
}

function mergeRetentionCleanup(artifacts: ArtifactRecord[], hiddenIds: Set<string>): { added: number; ids: Set<string> } {
  const next = new Set(hiddenIds)
  let added = 0

  for (const id of artifactIdsForRetentionCleanup(artifacts)) {
    if (!next.has(id)) {
      next.add(id)
      added += 1
    }
  }

  return { added, ids: next }
}

function formatArtifactTime(timestamp: number): string {
  return ARTIFACT_TIME_FMT.format(new Date(timestamp))
}

function pageRangeLabel(total: number, page: number, pageSize: number, a: Translations['artifacts']): string {
  if (total === 0) {
    return a.zero
  }

  const start = (page - 1) * pageSize + 1
  const end = Math.min(total, page * pageSize)

  return a.rangeOf(start, end, total)
}

function paginationItems(page: number, pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }

  const pages: Array<number | 'ellipsis'> = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(pageCount - 1, page + 1)

  if (start > 2) {
    pages.push('ellipsis')
  }

  for (let nextPage = start; nextPage <= end; nextPage += 1) {
    pages.push(nextPage)
  }

  if (end < pageCount - 1) {
    pages.push('ellipsis')
  }

  pages.push(pageCount)

  return pages
}

type CellCtx = {
  onOpenChat: (sessionId: string) => void
  onPreview: (artifact: ArtifactRecord) => void | Promise<void>
}

interface ArtifactColumn {
  Cell: (props: { artifact: ArtifactRecord; ctx: CellCtx }) => React.ReactElement
  bodyClassName: string
  header: (filter: ArtifactFilter, a: Translations['artifacts']) => string
  id: 'location' | 'primary' | 'session'
  width: (filter: ArtifactFilter) => string
}

const itemsLabel = (f: ArtifactFilter, a: Translations['artifacts']) =>
  f === 'report' ? a.itemsReport : f === 'link' ? a.itemsLink : f === 'file' ? a.itemsFile : a.itemsGeneric

function artifactKindLabel(kind: ArtifactKind, a: Translations['artifacts']): string {
  return kind === 'report' ? a.kindReport : kind === 'image' ? a.kindImage : kind === 'link' ? a.kindLink : a.kindFile
}

function artifactKindIcon(kind: ArtifactKind) {
  return kind === 'image' ? FileImage : kind === 'link' ? Link2 : FileText
}

function groupTableArtifacts(
  artifacts: readonly ArtifactRecord[],
  filter: ArtifactFilter
): Array<{ artifacts: ArtifactRecord[]; kind: ArtifactKind }> {
  const kinds: readonly ArtifactKind[] = filter === 'all' ? ['report', 'file', 'link'] : [filter]

  return kinds
    .filter(kind => kind !== 'image')
    .map(kind => ({ artifacts: artifacts.filter(artifact => artifact.kind === kind), kind }))
    .filter(section => section.artifacts.length > 0)
}

interface ArtifactsViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

export function ArtifactsView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: ArtifactsViewProps) {
  const { t } = useI18n()
  const a = t.artifacts
  const navigate = useNavigate()
  const [artifacts, setArtifacts] = useState<ArtifactRecord[] | null>(null)
  const [hiddenArtifactIds, setHiddenArtifactIds] = useState<Set<string>>(() => readHiddenArtifactIds())
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [selectedPreview, setSelectedPreview] = useState<ArtifactPreviewState | null>(null)

  const [kindFilter, setKindFilter] = useRouteEnumParam('tab', ARTIFACT_FILTERS, 'all')

  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(() => new Set())
  const [imagePage, setImagePage] = useState(1)
  const [filePage, setFilePage] = useState(1)

  const refreshArtifacts = useCallback(async () => {
    setRefreshing(true)

    try {
      const sessions = (await listAllProfileSessions(30, 1)).sessions
      const results = await Promise.allSettled(sessions.map(session => getSessionMessages(session.id, session.profile)))
      const nextArtifacts: ArtifactRecord[] = []

      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') {
          return
        }

        const session = sessions[index]
        nextArtifacts.push(...collectArtifactsForSession(session, result.value.messages))
      })

      setHiddenArtifactIds(readHiddenArtifactIds())
      setArtifacts(nextArtifacts.sort(compareArtifactsNewestFirst))
    } catch (err) {
      notifyError(err, a.failedLoad)
      setArtifacts([])
    } finally {
      setRefreshing(false)
    }
  }, [a])

  useRefreshHotkey(refreshArtifacts)

  useEffect(() => {
    void refreshArtifacts()
  }, [refreshArtifacts])

  useEffect(() => {
    setImagePage(1)
    setFilePage(1)
  }, [artifacts, kindFilter, query])

  const retainedArtifacts = useMemo(
    () => (artifacts || []).filter(artifact => !hiddenArtifactIds.has(artifact.id)),
    [artifacts, hiddenArtifactIds]
  )

  const retentionCleanupCount = useMemo(() => {
    if (!artifacts) {
      return 0
    }

    const cleanupIds = artifactIdsForRetentionCleanup(artifacts)

    return Array.from(cleanupIds).filter(id => !hiddenArtifactIds.has(id)).length
  }, [artifacts, hiddenArtifactIds])

  const hiddenArtifactCount = useMemo(
    () => (artifacts || []).filter(artifact => hiddenArtifactIds.has(artifact.id)).length,
    [artifacts, hiddenArtifactIds]
  )

  const visibleArtifacts = useMemo(() => {
    const q = query.trim().toLowerCase()

    return retainedArtifacts
      .filter(artifact => {
        if (kindFilter !== 'all' && artifact.kind !== kindFilter) {
          return false
        }

        if (!q) {
          return true
        }

        return (
          artifact.label.toLowerCase().includes(q) ||
          artifact.value.toLowerCase().includes(q) ||
          artifact.sessionTitle.toLowerCase().includes(q)
        )
      })
      .sort(compareArtifactsNewestFirst)
  }, [kindFilter, query, retainedArtifacts])

  const visibleImageArtifacts = useMemo(
    () => visibleArtifacts.filter(artifact => artifact.kind === 'image'),
    [visibleArtifacts]
  )

  const visibleFileArtifacts = useMemo(
    () => visibleArtifacts.filter(artifact => artifact.kind !== 'image').sort(compareArtifactsForTable),
    [visibleArtifacts]
  )

  const imagePageCount = Math.max(1, Math.ceil(visibleImageArtifacts.length / 24))
  const filePageCount = Math.max(1, Math.ceil(visibleFileArtifacts.length / 100))
  const currentImagePage = Math.min(imagePage, imagePageCount)
  const currentFilePage = Math.min(filePage, filePageCount)

  const pagedImageArtifacts = useMemo(
    () => visibleImageArtifacts.slice((currentImagePage - 1) * 24, currentImagePage * 24),
    [currentImagePage, visibleImageArtifacts]
  )

  const pagedFileArtifacts = useMemo(
    () => visibleFileArtifacts.slice((currentFilePage - 1) * 100, currentFilePage * 100),
    [currentFilePage, visibleFileArtifacts]
  )

  const pagedFileSections = useMemo(() => groupTableArtifacts(pagedFileArtifacts, kindFilter), [
    kindFilter,
    pagedFileArtifacts
  ])

  const counts = useMemo(() => {
    const all = retainedArtifacts

    return {
      all: all.length,
      report: all.filter(artifact => artifact.kind === 'report').length,
      image: all.filter(artifact => artifact.kind === 'image').length,
      file: all.filter(artifact => artifact.kind === 'file').length,
      link: all.filter(artifact => artifact.kind === 'link').length
    }
  }, [retainedArtifacts])

  const artifactSessionCount = useMemo(() => {
    const artifactSessionIds = new Set(retainedArtifacts.map(artifact => artifact.sessionId))

    return artifactSessionIds.size
  }, [retainedArtifacts])

  const cleanupArtifactsNow = useCallback(() => {
    if (!artifacts) {
      return
    }

    setHiddenArtifactIds(current => {
      const retention = mergeRetentionCleanup(artifacts, current)

      writeHiddenArtifactIds(retention.ids)

      return retention.ids
    })
  }, [artifacts])

  const restoreHiddenArtifacts = useCallback(() => {
    const empty = new Set<string>()

    writeHiddenArtifactIds(empty)
    setHiddenArtifactIds(empty)
  }, [])

  const previewArtifact = useCallback(
    async (artifact: ArtifactRecord) => {
      const rawTarget = artifact.kind === 'link' ? artifact.href : artifact.value

      try {
        const preview = await normalizeOrLocalPreviewTarget(rawTarget, artifact.cwd || undefined)

        if (!preview) {
          throw new Error(`Could not open preview target: ${rawTarget}`)
        }

        setSelectedPreview({ artifact, target: preview })
      } catch (err) {
        notifyError(err, a.previewFailed)
      }
    },
    [a]
  )

  const markImageFailed = useCallback((id: string) => {
    setFailedImageIds(current => {
      if (current.has(id)) {
        return current
      }

      return new Set(current).add(id)
    })
  }, [])

  const cellCtx: CellCtx = {
    onOpenChat: sessionId => navigate(sessionRoute(sessionId)),
    onPreview: previewArtifact
  }

  return (
    <PageSearchShell
      {...props}
      onSearchChange={setQuery}
      searchHidden={counts.all === 0}
      searchPlaceholder={a.search}
      searchTrailingAction={
        <Button
          aria-label={refreshing ? a.refreshing : a.refresh}
          className="text-(--ui-text-tertiary) hover:bg-transparent hover:text-foreground"
          disabled={refreshing}
          onClick={() => void refreshArtifacts()}
          size="icon-xs"
          title={refreshing ? a.refreshing : a.refresh}
          type="button"
          variant="ghost"
        >
          <Codicon name="refresh" size="0.875rem" spinning={refreshing} />
        </Button>
      }
      searchValue={query}
      tabs={
        <>
          <TextTab active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
            {a.tabAll} <TextTabMeta>({counts.all})</TextTabMeta>
          </TextTab>
          <TextTab active={kindFilter === 'report'} onClick={() => setKindFilter('report')}>
            {a.tabReports} <TextTabMeta>({counts.report})</TextTabMeta>
          </TextTab>
          <TextTab active={kindFilter === 'image'} onClick={() => setKindFilter('image')}>
            {a.tabImages} <TextTabMeta>({counts.image})</TextTabMeta>
          </TextTab>
          <TextTab active={kindFilter === 'file'} onClick={() => setKindFilter('file')}>
            {a.tabFiles} <TextTabMeta>({counts.file})</TextTabMeta>
          </TextTab>
          <TextTab active={kindFilter === 'link'} onClick={() => setKindFilter('link')}>
            {a.tabLinks} <TextTabMeta>({counts.link})</TextTabMeta>
          </TextTab>
        </>
      }
    >
      {!artifacts ? (
        <PageLoader label={a.indexing} />
      ) : visibleArtifacts.length === 0 && hiddenArtifactCount === 0 ? (
        <div className="grid h-full place-items-center px-6 text-center">
          <div>
            <div className="text-sm font-medium">{a.noArtifactsTitle}</div>
            <div className="mt-1 text-xs text-muted-foreground">{a.noArtifactsDesc}</div>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'grid h-full min-h-0 gap-3',
            selectedPreview && 'xl:grid-cols-[minmax(0,1fr)_minmax(24rem,38vw)]'
          )}
        >
          <div className="min-h-0 overflow-y-auto">
            <div className={cn('flex flex-col gap-3 pb-2', PAGE_INSET_X)}>
              <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-3">
                <ReportStatCard icon={<FileText className="size-4" />} label={a.statArtifacts} value={counts.all} />
                <ReportStatCard
                  icon={<FolderOpen className="size-4" />}
                  label={a.statSessions}
                  value={artifactSessionCount}
                />
                <ReportStatCard icon={<Link2 className="size-4" />} label={a.statReports} value={counts.report} />
              </div>

              <ArtifactRetentionPanel
                a={a}
                hiddenCount={hiddenArtifactCount}
                onCleanup={cleanupArtifactsNow}
                onRestore={restoreHiddenArtifacts}
                pendingCleanupCount={retentionCleanupCount}
              />

              {visibleImageArtifacts.length > 0 && (
                <section className="flex flex-col">
                  <div
                    className={cn(
                      'sticky top-0 z-10 flex h-7 items-center gap-3 overflow-x-auto bg-background',
                      PAGE_INSET_NEG_X,
                      PAGE_INSET_X
                    )}
                  >
                    <ArtifactsPagination
                      className="ml-auto justify-end px-0"
                      itemLabel={a.itemsImage}
                      onPageChange={setImagePage}
                      page={currentImagePage}
                      pageSize={24}
                      total={visibleImageArtifacts.length}
                    />
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] items-start gap-2 pt-1.5">
                    {pagedImageArtifacts.map(artifact => (
                      <ArtifactImageCard
                        artifact={artifact}
                        failedImage={failedImageIds.has(artifact.id)}
                        key={artifact.id}
                        onImageError={markImageFailed}
                        onOpenChat={sessionId => navigate(sessionRoute(sessionId))}
                        onPreview={previewArtifact}
                      />
                    ))}
                  </div>
                </section>
              )}

              {visibleFileArtifacts.length > 0 && (
                <section className="flex flex-col gap-2">
                  <div
                    className={cn(
                      'sticky top-0 z-10 flex h-7 items-center gap-3 overflow-x-auto bg-background',
                      PAGE_INSET_NEG_X,
                      PAGE_INSET_X
                    )}
                  >
                    <ArtifactsPagination
                      className="ml-auto justify-end px-0"
                      itemLabel={itemsLabel(kindFilter, a)}
                      onPageChange={setFilePage}
                      page={currentFilePage}
                      pageSize={100}
                      total={visibleFileArtifacts.length}
                    />
                  </div>
                  {pagedFileSections.map(section => (
                    <ArtifactTableSection
                      artifacts={section.artifacts}
                      ctx={cellCtx}
                      filter={kindFilter}
                      kind={section.kind}
                      key={section.kind}
                    />
                  ))}
                </section>
              )}
            </div>
          </div>
          {selectedPreview && (
            <ArtifactInlinePreview
              preview={selectedPreview}
              onClose={() => setSelectedPreview(null)}
              onOpenChat={sessionId => navigate(sessionRoute(sessionId))}
            />
          )}
        </div>
      )}
    </PageSearchShell>
  )
}

function ReportStatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background) px-3 py-2">
      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-(--ui-bg-tertiary) text-(--ui-text-tertiary)">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[0.65rem] uppercase tracking-[0.08em] text-(--ui-text-tertiary)">{label}</div>
        <div className="text-base font-semibold tabular-nums text-(--ui-text-primary)">{value}</div>
      </div>
    </div>
  )
}

function ArtifactRetentionPanel({
  a,
  hiddenCount,
  onCleanup,
  onRestore,
  pendingCleanupCount
}: {
  a: Translations['artifacts']
  hiddenCount: number
  onCleanup: () => void
  onRestore: () => void
  pendingCleanupCount: number
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background)">
      <button
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        onClick={() => setExpanded(current => !current)}
        type="button"
      >
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground">{a.retentionTitle}</div>
          <div className="mt-0.5 text-[0.68rem] leading-4 text-muted-foreground">
            {pendingCleanupCount > 0
              ? a.retentionPending(pendingCleanupCount)
              : hiddenCount > 0
                ? a.retentionHidden(hiddenCount)
                : a.retentionScope}
          </div>
        </div>
        <Codicon className="shrink-0 text-muted-foreground" name={expanded ? 'chevron-up' : 'chevron-down'} size="1rem" />
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-(--ui-stroke-tertiary) px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-[0.68rem] leading-4 text-muted-foreground">
            <div>{a.retentionPolicy(ARTIFACT_RETENTION_DAYS, ARTIFACT_RETENTION_LIMIT)}</div>
            <div className="mt-0.5">
              {hiddenCount > 0 ? a.retentionHidden(hiddenCount) : a.retentionScope}
              {pendingCleanupCount > 0 ? ` · ${a.retentionPending(pendingCleanupCount)}` : ''}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button disabled={pendingCleanupCount === 0} onClick={onCleanup} size="xs" type="button" variant="outline">
              {a.retentionCleanNow}
            </Button>
            <Button disabled={hiddenCount === 0} onClick={onRestore} size="xs" type="button" variant="ghost">
              {a.retentionRestore}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

interface ArtifactsPaginationProps {
  className?: string
  itemLabel: string
  onPageChange: (page: number) => void
  page: number
  pageSize: number
  total: number
}

function ArtifactsPagination({ className, itemLabel, onPageChange, page, pageSize, total }: ArtifactsPaginationProps) {
  const { t } = useI18n()
  const a = t.artifacts
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className={cn('flex h-6 items-center justify-between gap-2 px-1', className)}>
      <div className="shrink-0 text-[0.62rem] text-muted-foreground">
        {pageRangeLabel(total, page, pageSize, a)} {itemLabel}
      </div>
      {pageCount > 1 && (
        <Pagination className="mx-0 w-auto min-w-0 justify-end">
          <PaginationContent className="gap-0.5">
            <PaginationItem>
              <PaginationPrevious disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))} />
            </PaginationItem>
            {paginationItems(page, pageCount).map((item, index) => (
              <PaginationItem key={`${item}-${index}`}>
                {item === 'ellipsis' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationButton
                    aria-label={a.goToPage(itemLabel, item)}
                    isActive={page === item}
                    onClick={() => onPageChange(item)}
                  >
                    {item}
                  </PaginationButton>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                disabled={page >= pageCount}
                onClick={() => onPageChange(Math.min(pageCount, page + 1))}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}

interface ArtifactImageCardProps {
  artifact: ArtifactRecord
  failedImage: boolean
  onImageError: (id: string) => void
  onOpenChat: (sessionId: string) => void
  onPreview: (artifact: ArtifactRecord) => void | Promise<void>
}

function ArtifactImageCard({ artifact, failedImage, onImageError, onOpenChat, onPreview }: ArtifactImageCardProps) {
  const { t } = useI18n()
  const a = t.artifacts
  const kindLabel = artifactKindLabel(artifact.kind, a)

  return (
    <article className="group/artifact overflow-hidden rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background)">
      <div
        className={cn(
          'relative flex h-40 w-full items-center justify-center overflow-hidden border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) p-1.5',
          failedImage && 'cursor-default'
        )}
      >
        {!failedImage && (
          <ZoomableImage
            alt={artifact.label}
            className="max-h-40 max-w-full cursor-zoom-in rounded-md object-contain"
            containerClassName="max-h-full"
            decoding="async"
            loading="lazy"
            onError={() => onImageError(artifact.id)}
            slot="artifact-media"
            src={artifact.href}
          />
        )}
      </div>

      <div className="space-y-1.5 p-2">
        <div className="min-w-0">
          <div className="mb-0.5 flex items-center gap-1 text-[0.625rem] uppercase tracking-[0.08em] text-(--ui-text-tertiary)">
            <FileImage className="size-3" />
            {kindLabel}
          </div>
          <div className="truncate text-[length:var(--conversation-caption-font-size)] font-medium">
            {artifact.label}
          </div>
          <div className="mt-0.5 truncate text-[0.625rem] text-(--ui-text-tertiary)">{artifact.value}</div>
        </div>

        <div className="truncate text-[0.625rem] text-(--ui-text-tertiary)">
          {artifact.sessionTitle} · {formatArtifactTime(artifact.timestamp)}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button onClick={() => void onPreview(artifact)} size="xs" type="button" variant="textStrong">
            <MonitorPlay className="size-3" />
            {a.preview}
          </Button>
          <Button onClick={() => onOpenChat(artifact.sessionId)} size="xs" type="button" variant="textStrong">
            <FolderOpen className="size-3" />
            {a.chat}
          </Button>
        </div>
      </div>
    </article>
  )
}

// Single click target for any row cell. Padding lives here, NOT on the <td>, so
// the entire cell area is hoverable and clickable.
function ArtifactCellAction({
  children,
  onClick,
  title
}: {
  children: React.ReactNode
  onClick?: () => void
  title?: string
}) {
  return (
    <button
      className="flex h-full w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) font-normal text-(--ui-text-secondary) no-underline underline-offset-4 decoration-current/20 transition-colors hover:text-foreground hover:underline"
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}

function PrimaryCell({ artifact, ctx }: { artifact: ArtifactRecord; ctx: CellCtx }) {
  const isLink = artifact.kind === 'link'
  const Icon = artifactKindIcon(artifact.kind)
  const fetchedTitle = useLinkTitle(isLink ? artifact.href : null)
  const label = isLink ? fetchedTitle || urlSlugTitleLabel(artifact.href) : artifact.label

  return (
    <ArtifactCellAction
      onClick={() => void ctx.onPreview(artifact)}
      title={label}
    >
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center self-start rounded-md bg-(--ui-bg-tertiary) text-(--ui-text-tertiary)">
        <Icon className="size-3.5" />
      </span>
      <span className={cn('min-w-0 flex-1', isLink ? 'wrap-anywhere' : 'truncate')}>
        {label}
        {isLink && <ExternalLinkIcon />}
      </span>
    </ArtifactCellAction>
  )
}

function LocationCell({ artifact }: { artifact: ArtifactRecord; ctx: CellCtx }) {
  const { t } = useI18n()
  const isUrl = /^https?:\/\//i.test(artifact.value)
  const value = isUrl ? hostPathLabel(artifact.value) : artifact.value
  const copyLabel = isUrl ? t.artifacts.copyUrl : t.artifacts.copyPath

  return (
    <div className="group/location flex min-w-0 items-center gap-1.5">
      <Tip label={artifact.value}>
        <div
          className={cn(
            'min-w-0 flex-1 truncate text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)',
            isUrl ? 'font-normal' : 'font-mono'
          )}
        >
          {value}
        </div>
      </Tip>
      <CopyButton
        appearance="icon"
        buttonSize="icon-xs"
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/location:opacity-100"
        iconClassName="size-3.5"
        label={copyLabel}
        text={artifact.value}
        title={copyLabel}
      />
    </div>
  )
}

function SessionCell({ artifact, ctx }: { artifact: ArtifactRecord; ctx: CellCtx }) {
  return (
    <ArtifactCellAction onClick={() => ctx.onOpenChat(artifact.sessionId)} title={artifact.sessionTitle}>
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{artifact.sessionTitle}</span>
        <span className="truncate text-[0.6875rem] font-normal text-(--ui-text-tertiary)">
          {formatArtifactTime(artifact.timestamp)}
        </span>
      </span>
    </ArtifactCellAction>
  )
}

function ArtifactInlinePreview({
  onClose,
  onOpenChat,
  preview
}: {
  onClose: () => void
  onOpenChat: (sessionId: string) => void
  preview: ArtifactPreviewState
}) {
  const { t } = useI18n()
  const a = t.artifacts
  const Icon = artifactKindIcon(preview.artifact.kind)

  return (
    <aside className="mx-2 mb-2 flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-(--ui-stroke-tertiary) bg-background shadow-sm xl:sticky xl:top-2 xl:mr-3 xl:h-[calc(100vh-var(--titlebar-height)-5.5rem)]">
      <div className="flex min-h-11 items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-(--ui-bg-tertiary) text-(--ui-text-tertiary)">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground">{preview.artifact.label}</div>
          <div className="truncate text-[0.65rem] text-(--ui-text-tertiary)">
            {artifactKindLabel(preview.artifact.kind, a)} · {preview.artifact.sessionTitle}
          </div>
        </div>
        <Button onClick={() => onOpenChat(preview.artifact.sessionId)} size="xs" type="button" variant="ghost">
          {a.chat}
        </Button>
        <Button aria-label={t.common.close} onClick={onClose} size="icon-xs" type="button" variant="ghost">
          <Codicon name="close" size="0.875rem" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <PreviewPane embedded target={preview.target} />
      </div>
    </aside>
  )
}

function ArtifactTableSection({
  artifacts,
  ctx,
  filter,
  kind
}: {
  artifacts: readonly ArtifactRecord[]
  ctx: CellCtx
  filter: ArtifactFilter
  kind: ArtifactKind
}) {
  const { t } = useI18n()
  const Icon = artifactKindIcon(kind)

  return (
    <section className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background)">
      {filter === 'all' && (
        <div className="flex h-8 items-center gap-2 border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-2.5 text-[0.65rem] font-medium uppercase tracking-[0.08em] text-(--ui-text-tertiary)">
          <Icon className="size-3.5" />
          {artifactKindLabel(kind, t.artifacts)}
          <span className="font-normal normal-case tracking-normal">({artifacts.length})</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <ArtifactTable artifacts={artifacts} ctx={ctx} filter={kind} />
      </div>
    </section>
  )
}

const ARTIFACT_COLUMNS: readonly ArtifactColumn[] = [
  {
    Cell: PrimaryCell,
    bodyClassName: 'p-0',
    header: (filter, a) =>
      filter === 'report'
        ? a.colTitleReport
        : filter === 'link'
          ? a.colTitleLink
          : filter === 'file'
            ? a.colTitleFile
            : a.colTitleDefault,
    id: 'primary',
    width: filter => (filter === 'link' ? 'w-[50%]' : 'w-[35%]')
  },
  {
    Cell: LocationCell,
    bodyClassName: 'px-2.5 py-1.5',
    header: (filter, a) =>
      filter === 'report'
        ? a.colLocationReport
        : filter === 'link'
          ? a.colLocationLink
          : filter === 'file'
            ? a.colLocationFile
            : a.colLocationDefault,
    id: 'location',
    width: filter => (filter === 'link' ? 'w-[30%]' : 'w-[41%]')
  },
  {
    Cell: SessionCell,
    bodyClassName: 'p-0',
    header: (_filter, a) => a.colSession,
    id: 'session',
    width: filter => (filter === 'link' ? 'w-[20%]' : 'w-[24%]')
  }
]

function ArtifactTable({
  artifacts,
  ctx,
  filter
}: {
  artifacts: readonly ArtifactRecord[]
  ctx: CellCtx
  filter: ArtifactFilter
}) {
  const { t } = useI18n()

  return (
    <table className="w-full min-w-176 table-fixed text-left text-[length:var(--conversation-caption-font-size)]">
      <thead className="border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-[0.625rem] uppercase tracking-[0.08em] text-(--ui-text-tertiary)">
        <tr>
          {ARTIFACT_COLUMNS.map(col => (
            <th className={cn(col.width(filter), 'px-2.5 py-1.5 font-medium')} key={col.id}>
              {col.header(filter, t.artifacts)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {artifacts.map(artifact => (
          <tr className="group/artifact" key={artifact.id}>
            {ARTIFACT_COLUMNS.map(col => {
              const Cell = col.Cell

              return (
                <td className={cn('align-middle', col.bodyClassName)} key={col.id}>
                  <Cell artifact={artifact} ctx={ctx} />
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

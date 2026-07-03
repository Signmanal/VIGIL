import { useStore } from '@nanostores/react'
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useElapsedSeconds } from '@/components/chat/activity-timer'
import { ActivityTimerText } from '@/components/chat/activity-timer-text'
import { Button } from '@/components/ui/button'
import { FadeText } from '@/components/ui/fade-text'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { type Translations, useI18n } from '@/i18n'
import { AlertCircle, Brain, CheckCircle2, Cpu, Link2, NotebookTabs, Sparkles } from '@/lib/icons'
import { profileColorSoft, resolveProfileColor } from '@/lib/profile-color'
import { useEnterAnimation } from '@/lib/use-enter-animation'
import { cn } from '@/lib/utils'
import {
  $activeGatewayProfile,
  $profileColors,
  $profiles,
  normalizeProfileKey,
  refreshActiveProfile
} from '@/store/profile'
import {
  $subagentsBySession,
  allSubagents,
  buildSubagentTree,
  type SubagentNode,
  type SubagentStatus,
  type SubagentStreamEntry
} from '@/store/subagents'
import { openSessionInNewWindow } from '@/store/windows'
import type { ProfileInfo } from '@/types/vigil'

import { OverlayView } from '../overlays/overlay-view'
import { PROFILES_ROUTE } from '../routes'

// Mirrors statusGlyph() in tool-fallback.tsx so subagent rows speak the
// same visual vocabulary as the chat tool blocks.
function statusGlyph(status: SubagentStatus, a: Translations['agents']): ReactNode {
  if (status === 'running' || status === 'queued') {
    return (
      <GlyphSpinner
        ariaLabel={a.running}
        className="size-3.5 shrink-0 text-[0.95rem] text-muted-foreground/80"
        spinner="breathe"
      />
    )
  }

  if (status === 'failed' || status === 'interrupted') {
    return <AlertCircle aria-label={a.failed} className="size-3.5 shrink-0 text-destructive" />
  }

  return <CheckCircle2 aria-label={a.done} className="size-3.5 shrink-0 text-emerald-600/85 dark:text-emerald-400/85" />
}

const STREAM_TONE: Record<SubagentStreamEntry['kind'], string> = {
  progress: 'text-muted-foreground/75',
  summary: 'text-foreground/85',
  thinking: 'text-muted-foreground/80',
  tool: 'text-foreground/85'
}

function streamGlyph(entry: SubagentStreamEntry): ReactNode {
  if (entry.isError) {
    return <AlertCircle aria-hidden className="mt-0.5 size-3 shrink-0 text-destructive" />
  }

  if (entry.kind === 'tool') {
    return <span aria-hidden className="mt-0.5 size-1.5 shrink-0 rounded-full bg-foreground/55" />
  }

  if (entry.kind === 'summary') {
    return <CheckCircle2 aria-hidden className="mt-0.5 size-3 shrink-0 text-emerald-600/85 dark:text-emerald-400/85" />
  }

  if (entry.kind === 'thinking') {
    return (
      <span aria-hidden className="font-mono text-[0.7rem] leading-none text-muted-foreground/70">
        …
      </span>
    )
  }

  return <span aria-hidden className="mt-0.5 size-1 shrink-0 rounded-full bg-muted-foreground/55" />
}

interface AgentsViewProps {
  onClose: () => void
}

export function AgentsView({ onClose }: AgentsViewProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const subagentsBySession = useStore($subagentsBySession)
  const profiles = useStore($profiles)
  const profileColors = useStore($profileColors)
  const activeGatewayProfile = useStore($activeGatewayProfile)
  const activeProfileKey = normalizeProfileKey(activeGatewayProfile)

  // Aggregate every session, matching the status-bar indicator — a subagent
  // running in a background session must still be visible here, or the two
  // desync ("Agents N running" vs an empty tree).
  const tree = useMemo(() => buildSubagentTree(allSubagents(subagentsBySession)), [subagentsBySession])

  const activeProfile = useMemo(
    () =>
      profiles.find(profile => normalizeProfileKey(profile.name) === activeProfileKey) ??
      fallbackProfile(activeProfileKey),
    [activeProfileKey, profiles]
  )

  const activeProfileColor = resolveProfileColor(activeProfile.name, profileColors)

  useEffect(() => {
    void refreshActiveProfile()
  }, [])

  return (
    <OverlayView
      closeLabel={t.agents.close}
      contentClassName="px-5 pt-5 pb-4 sm:px-6"
      onClose={onClose}
      rootClassName="mx-auto max-w-5xl"
    >
      <header className="mb-3 flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t.agents.title}</h2>
          <p className="text-xs text-muted-foreground/80">{t.agents.subtitle}</p>
          <p className="mt-1 max-w-2xl text-[0.68rem] leading-relaxed text-muted-foreground/70">
            {t.agents.roleHint}
          </p>
        </div>
        <Button
          className="shrink-0"
          onClick={() => {
            navigate(PROFILES_ROUTE)
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          {t.agents.manageRoles}
        </Button>
      </header>
      <ActiveProfileCard
        color={activeProfileColor}
        onManage={() => navigate(PROFILES_ROUTE)}
        profile={activeProfile}
      />
      <SubagentTree tree={tree} />
    </OverlayView>
  )
}

function profileDisplayName(profile: ProfileInfo): string {
  const displayName = profile.display_name?.trim()

  return displayName || profile.name
}

function enabledSkillCount(profile: ProfileInfo): number {
  return profile.enabled_skill_count ?? profile.skill_count
}

function fallbackProfile(name: string): ProfileInfo {
  const key = normalizeProfileKey(name)

  return {
    has_env: false,
    is_default: key === 'default',
    mcp_count: 0,
    model: null,
    name: key,
    path: '',
    provider: null,
    skill_count: 0,
    tool_count: 0
  }
}

function ExpertMetric({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-background/45 px-2 py-1 text-[0.68rem] text-muted-foreground/85">
      <span className="text-muted-foreground/70">{icon}</span>
      <span>{children}</span>
    </span>
  )
}

function ActiveProfileCard({
  color,
  onManage,
  profile
}: {
  color: null | string
  onManage: () => void
  profile: ProfileInfo
}) {
  const { t } = useI18n()
  const displayName = profileDisplayName(profile)
  const showsAlias = displayName !== profile.name
  const accent = color ?? 'var(--dt-primary)'
  const description = profile.description?.trim() || t.agents.currentExpertNoDescription

  const style = {
    '--active-expert-accent': accent,
    '--active-expert-soft': color ? profileColorSoft(color, 14) : 'color-mix(in srgb, var(--dt-primary) 14%, transparent)'
  } as CSSProperties

  const meta = [
    showsAlias ? profile.name : '',
    profile.is_default ? t.profiles.default : '',
    profile.provider,
    profile.model,
    profile.has_env ? t.profiles.env : ''
  ].filter(Boolean)

  return (
    <section className="mb-4 grid gap-2">
      <div>
        <p className="text-[0.68rem] font-semibold tracking-[0.18em] text-primary/85 uppercase">
          {t.agents.currentExpertTitle}
        </p>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground/70">{t.agents.currentExpertDesc}</p>
      </div>
      <article
        className="relative overflow-hidden rounded-2xl border border-border/65 bg-card/70 p-4 shadow-sm shadow-black/5 ring-1 ring-white/5"
        style={style}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[var(--active-expert-accent)]" />
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--active-expert-soft)] text-[var(--active-expert-accent)] ring-1 ring-[var(--active-expert-accent)]/20">
            <Brain className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-[0.95rem] leading-snug font-semibold text-foreground/95">{displayName}</h3>
                {meta.length > 0 ? (
                  <p className="mt-1 truncate text-[0.68rem] text-muted-foreground/75">{meta.join(' · ')}</p>
                ) : null}
              </div>
              <span className="shrink-0 rounded-full bg-primary/12 px-2 py-1 text-[0.64rem] font-medium text-primary">
                {t.agents.activeBadge}
              </span>
            </div>
            <p className="mt-3 line-clamp-2 text-[0.78rem] leading-relaxed text-muted-foreground/80">{description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/55 pt-3">
              <ExpertMetric icon={<NotebookTabs className="size-3.5" />}>
                {t.agents.skillMetric(enabledSkillCount(profile), profile.skill_count)}
              </ExpertMetric>
              <ExpertMetric icon={<Cpu className="size-3.5" />}>{t.agents.toolMetric(profile.tool_count ?? 0)}</ExpertMetric>
              <ExpertMetric icon={<Link2 className="size-3.5" />}>{t.agents.mcpMetric(profile.mcp_count ?? 0)}</ExpertMetric>
              <button
                className="rounded-full bg-background/55 px-2 py-1 text-[0.68rem] font-medium text-foreground/80 transition-colors hover:bg-background/80"
                onClick={onManage}
                type="button"
              >
                {t.agents.manageCurrentExpert}
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>
  )
}

const fmtDuration = (seconds: number | undefined, a: Translations['agents']) => {
  if (!seconds || seconds <= 0) {
    return ''
  }

  if (seconds < 60) {
    return a.durationSeconds(seconds.toFixed(1))
  }

  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)

  return a.durationMinutes(m, s)
}

const fmtTokens = (value: number | undefined, a: Translations['agents']) => {
  if (!value) {
    return ''
  }

  return value >= 1000 ? a.tokensK((value / 1000).toFixed(1)) : a.tokens(value)
}

const fmtAge = (updatedAt: number, nowMs: number, a: Translations['agents']) => {
  const s = Math.max(0, Math.round((nowMs - updatedAt) / 1000))

  if (s < 2) {
    return a.ageNow
  }

  if (s < 60) {
    return a.ageSeconds(s)
  }

  const m = Math.floor(s / 60)

  if (m < 60) {
    return a.ageMinutes(m)
  }

  return a.ageHours(Math.floor(m / 60))
}

const flatten = (nodes: readonly SubagentNode[]): SubagentNode[] =>
  nodes.flatMap(node => [node, ...flatten(node.children)])

const isLive = (node: SubagentNode) => node.status === 'running' || node.status === 'queued'

interface RootGroup {
  id: string
  delegationIndex: number
  nodes: SubagentNode[]
  taskCount: number
}

function groupDelegations(roots: readonly SubagentNode[]): RootGroup[] {
  const groups: RootGroup[] = []
  let n = 0

  for (const node of roots) {
    const prev = groups.at(-1)
    const prevTail = prev?.nodes.at(-1)
    const closeInTime = prevTail ? Math.abs(node.startedAt - prevTail.startedAt) <= 5_000 : false
    const sameShape = prev && node.taskCount > 1 && prev.taskCount === node.taskCount
    const uniqueStep = prev ? !prev.nodes.some(item => item.taskIndex === node.taskIndex) : false

    if (prev && sameShape && closeInTime && uniqueStep) {
      prev.nodes.push(node)

      continue
    }

    if (node.taskCount > 1) {
      n += 1
      groups.push({ id: `delegation-${n}`, delegationIndex: n, nodes: [node], taskCount: node.taskCount })

      continue
    }

    groups.push({ id: node.id, delegationIndex: 0, nodes: [node], taskCount: node.taskCount })
  }

  return groups
}

function SubagentTree({ tree }: { tree: SubagentNode[] }) {
  const { t } = useI18n()
  const flat = useMemo(() => flatten(tree), [tree])
  const groups = useMemo(() => groupDelegations(tree), [tree])
  const [nowMs, setNowMs] = useState(() => Date.now())

  const activeNodes = flat.filter(isLive)
  const active = activeNodes.length
  const failed = flat.filter(n => n.status === 'failed' || n.status === 'interrupted').length
  const tools = flat.reduce((sum, n) => sum + (n.toolCount ?? 0), 0)
  const files = flat.reduce((sum, n) => sum + n.filesRead.length + n.filesWritten.length, 0)
  const tokens = flat.reduce((sum, n) => sum + (n.inputTokens ?? 0) + (n.outputTokens ?? 0), 0)
  const cost = flat.reduce((sum, n) => sum + (n.costUsd ?? 0), 0)

  useEffect(() => {
    if (active <= 0 || typeof window === 'undefined') {
      return
    }

    const id = window.setInterval(() => setNowMs(Date.now()), 500)

    return () => window.clearInterval(id)
  }, [active])

  if (tree.length === 0) {
    return (
      <div className="grid place-items-center gap-3 py-12 text-center">
        <Sparkles className="size-6 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground/90">{t.agents.emptyTitle}</p>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground/75">{t.agents.emptyDesc}</p>
      </div>
    )
  }

  const summary = [
    t.agents.agentsCount(flat.length),
    active > 0 ? t.agents.activeCount(active) : '',
    failed > 0 ? t.agents.failedCount(failed) : '',
    tools > 0 ? t.agents.toolsCount(tools) : '',
    files > 0 ? t.agents.filesCount(files) : '',
    tokens > 0 ? fmtTokens(tokens, t.agents) : '',
    cost > 0 ? `$${cost.toFixed(2)}` : ''
  ].filter(Boolean)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      {activeNodes.length > 0 ? <ActiveExpertCards nodes={activeNodes} nowMs={nowMs} /> : null}
      <p className="shrink-0 text-[0.7rem] text-muted-foreground/70">{summary.join(' · ')}</p>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-1">
        <div className="flex min-w-0 flex-col gap-6">
          {groups.map(group => (
            <DelegationGroup group={group} key={group.id} nowMs={nowMs} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ActiveExpertCards({ nodes, nowMs }: { nodes: SubagentNode[]; nowMs: number }) {
  const { t } = useI18n()

  return (
    <section className="grid gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold tracking-[0.18em] text-primary/85 uppercase">
            {t.agents.activeExpertsTitle(nodes.length)}
          </p>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground/70">{t.agents.activeExpertsDesc}</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {nodes.map(node => (
          <ActiveExpertCard key={node.id} node={node} nowMs={nowMs} />
        ))}
      </div>
    </section>
  )
}

function ActiveExpertCard({ node, nowMs }: { node: SubagentNode; nowMs: number }) {
  const { t } = useI18n()
  const elapsed = useElapsedSeconds(true, `subagent-card:${node.id}`)

  const durationSeconds =
    typeof node.durationSeconds === 'number' ? Math.max(0, Math.round(node.durationSeconds)) : elapsed

  const tokenText = fmtTokens((node.inputTokens ?? 0) + (node.outputTokens ?? 0), t.agents)
  const fileCount = node.filesRead.length + node.filesWritten.length
  const latest = node.currentTool ? t.agents.currentTool(node.currentTool) : (node.stream.at(-1)?.text ?? t.agents.waiting)
  const initial = node.goal.trim().slice(0, 2).toLocaleUpperCase() || 'AI'
  const statusText = node.status === 'queued' ? t.agents.queued : t.agents.running

  const meta = [
    statusText,
    fmtDuration(durationSeconds, t.agents),
    node.model,
    node.taskCount > 1 ? t.agents.taskProgress(node.taskIndex + 1, node.taskCount) : ''
  ].filter(Boolean)

  const metrics = [
    node.toolCount ? t.agents.toolsCount(node.toolCount) : '',
    fileCount ? t.agents.filesCount(fileCount) : '',
    tokenText,
    t.agents.updatedAgo(fmtAge(node.updatedAt, nowMs, t.agents))
  ].filter(Boolean)

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border/65 bg-card/65 p-4 shadow-sm shadow-black/5 ring-1 ring-white/5 transition-colors hover:border-primary/35">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary/85" />
      <div className="flex min-w-0 items-start gap-3">
        <span className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-sm font-semibold text-primary ring-1 ring-primary/15">
          {initial}
          <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border border-background bg-background">
            {statusGlyph(node.status, t.agents)}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-[0.9rem] leading-snug font-semibold text-foreground/95">{node.goal}</h3>
              {meta.length > 0 ? (
                <p className="mt-1 truncate text-[0.68rem] text-muted-foreground/75">{meta.join(' · ')}</p>
              ) : null}
            </div>
            {node.sessionId ? (
              <Button
                className="shrink-0 text-[0.66rem]"
                onClick={() => void openSessionInNewWindow(node.sessionId!, { watch: true })}
                size="micro"
                type="button"
                variant="secondary"
              >
                {t.agents.openExpert}
              </Button>
            ) : null}
          </div>
          <p className="mt-3 line-clamp-2 text-[0.73rem] leading-relaxed text-muted-foreground/85">{latest}</p>
          {metrics.length > 0 ? (
            <p className="mt-3 truncate border-t border-border/55 pt-2 text-[0.66rem] text-muted-foreground/65">
              {metrics.join(' · ')}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function DelegationGroup({ group, nowMs }: { group: RootGroup; nowMs: number }) {
  const { t } = useI18n()

  if (group.nodes.length === 1 && group.taskCount <= 1) {
    return <SubagentRow node={group.nodes[0]!} nowMs={nowMs} />
  }

  const activeWorkers = group.nodes.filter(n => n.status === 'running' || n.status === 'queued').length

  return (
    <section className="grid min-w-0 gap-3">
      <p className="text-[0.66rem] font-medium uppercase tracking-wider text-muted-foreground/70">
        {group.delegationIndex > 0 ? t.agents.delegation(group.delegationIndex) : ''}{' '}
        <span className="text-muted-foreground/50">·</span> {t.agents.workers(group.nodes.length)}
        {activeWorkers > 0 ? <span className="text-primary/85"> · {t.agents.workersActive(activeWorkers)}</span> : null}
      </p>
      <div className="grid min-w-0 gap-4">
        {group.nodes.map(node => (
          <SubagentRow key={node.id} node={node} nowMs={nowMs} />
        ))}
      </div>
    </section>
  )
}

function StreamLine({
  active,
  entry,
  parentRunning,
  rowKey
}: {
  active: boolean
  entry: SubagentStreamEntry
  parentRunning: boolean
  rowKey: string
}) {
  const { t } = useI18n()
  const enterRef = useEnterAnimation(parentRunning, `subagent-stream:${rowKey}`)
  const isMono = entry.kind === 'tool'
  const tone = entry.isError ? 'text-destructive' : STREAM_TONE[entry.kind]

  return (
    <div className="flex min-w-0 items-baseline gap-2 text-[0.72rem] leading-relaxed" ref={enterRef}>
      <span className="flex h-[0.95rem] shrink-0 items-center">{streamGlyph(entry)}</span>
      <span className={cn('min-w-0 flex-1 wrap-anywhere', tone, isMono && 'font-mono text-[0.69rem]')}>
        {entry.text}
        {active ? (
          <GlyphSpinner
            ariaLabel={t.agents.streaming}
            className="ml-1 inline-block size-2.5 align-middle text-muted-foreground/70"
            spinner="breathe"
          />
        ) : null}
      </span>
    </div>
  )
}

function SubagentRow({ node, depth = 0, nowMs }: { node: SubagentNode; depth?: number; nowMs: number }) {
  const { t } = useI18n()
  const running = node.status === 'running' || node.status === 'queued'
  const elapsed = useElapsedSeconds(running, `subagent:${node.id}`)

  const durationSeconds =
    typeof node.durationSeconds === 'number' ? Math.max(0, Math.round(node.durationSeconds)) : elapsed

  const [open, setOpen] = useState(() => running || depth < 2)
  const enterRef = useEnterAnimation(true, `subagent-row:${node.id}`)

  useEffect(() => {
    if (running) {
      setOpen(true)
    }
  }, [running])

  const visibleRows = open ? node.stream.slice(-10) : node.stream.slice(-2)
  const fileLines = [...node.filesWritten.map(p => `+ ${p}`), ...node.filesRead.map(p => `· ${p}`)]

  const subtitle = [
    node.model,
    fmtDuration(durationSeconds, t.agents),
    node.toolCount ? t.agents.toolsCount(node.toolCount) : '',
    fmtTokens((node.inputTokens ?? 0) + (node.outputTokens ?? 0), t.agents),
    t.agents.updatedAgo(fmtAge(node.updatedAt, nowMs, t.agents))
  ].filter(Boolean)

  return (
    <div className={cn('grid min-w-0 max-w-full gap-2', depth > 0 && 'pl-4')} data-slot="tool-block" ref={enterRef}>
      <button
        aria-expanded={open}
        className="group flex w-full min-w-0 items-start gap-2.5 text-left"
        onClick={() => setOpen(v => !v)}
        type="button"
      >
        <span className="mt-0.5 flex h-[1.1rem] shrink-0 items-center">{statusGlyph(node.status, t.agents)}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              'wrap-anywhere text-[0.82rem] font-medium leading-[1.1rem] text-foreground/90 transition-colors group-hover:text-foreground',
              running && 'shimmer text-foreground/65'
            )}
          >
            {node.goal}
          </span>
          {subtitle.length > 0 ? (
            <FadeText className="text-[0.66rem] leading-[1.05rem] text-muted-foreground/65">
              {subtitle.join(' · ')}
            </FadeText>
          ) : null}
        </span>
        {running ? <ActivityTimerText className="mt-1 shrink-0 text-[0.6rem]" seconds={durationSeconds} /> : null}
      </button>

      {visibleRows.length > 0 ? (
        <div className="grid min-w-0 gap-1 pl-6" data-selectable-text="true">
          {visibleRows.map((entry, i) => (
            <StreamLine
              active={running && i === visibleRows.length - 1}
              entry={entry}
              key={`${entry.kind}:${entry.at}:${i}`}
              parentRunning={running}
              rowKey={`${node.id}:${entry.kind}:${entry.at}`}
            />
          ))}
        </div>
      ) : null}

      {open && fileLines.length > 0 ? (
        <div className="grid min-w-0 gap-0.5 pl-6" data-selectable-text="true">
          <p className="text-[0.58rem] font-medium tracking-wider text-muted-foreground/60 uppercase">
            {t.agents.files}
          </p>
          {fileLines.slice(0, 8).map(line => (
            <p className="wrap-break-word font-mono text-[0.67rem] leading-relaxed text-muted-foreground/80" key={line}>
              {line}
            </p>
          ))}
          {fileLines.length > 8 ? (
            <p className="font-mono text-[0.67rem] leading-relaxed text-muted-foreground/65">
              {t.agents.moreFiles(fileLines.length - 8)}
            </p>
          ) : null}
        </div>
      ) : null}

      {node.children.length > 0 ? (
        <div className="grid min-w-0 gap-3 pl-6">
          {node.children.map(child => (
            <SubagentRow depth={depth + 1} key={child.id} node={child} nowMs={nowMs} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

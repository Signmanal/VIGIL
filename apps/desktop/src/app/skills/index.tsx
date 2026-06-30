import type * as React from 'react'
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { TextTab, TextTabMeta } from '@/components/ui/text-tab'
import {
  getSkillHubSources,
  getSkills,
  getToolsets,
  installSkillHub,
  searchSkillHub,
  toggleSkill,
  toggleToolset
} from '@/vigil'
import { useI18n } from '@/i18n'
import { openExternalLink } from '@/lib/external-link'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import type { SkillHubResult, SkillHubSourceInfo, SkillInfo, ToolsetInfo } from '@/types/vigil'

import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import { PAGE_INSET_X } from '../layout-constants'
import { PageSearchShell } from '../page-search-shell'
import { ComputerUsePanel } from '../settings/computer-use-panel'
import { asText, includesQuery, prettyName, toolNames, toolsetDisplayLabel } from '../settings/helpers'
import { ToolsetConfigPanel } from '../settings/toolset-config-panel'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

const SKILLS_MODES = ['skills', 'toolsets', 'market'] as const
type SkillsMode = (typeof SKILLS_MODES)[number]
const SKILLS_MARKET_URL = 'https://www.skills.sh/'
const DIRECT_SKILL_IDENTIFIER_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

function categoryFor(skill: SkillInfo): string {
  return asText(skill.category) || 'general'
}

function filteredSkills(skills: SkillInfo[], query: string, category: string | null): SkillInfo[] {
  const q = query.trim().toLowerCase()

  return skills
    .filter(skill => {
      if (category && categoryFor(skill) !== category) {
        return false
      }

      if (!q) {
        return true
      }

      return includesQuery(skill.name, q) || includesQuery(skill.description, q) || includesQuery(skill.category, q)
    })
    .sort((a, b) => asText(a.name).localeCompare(asText(b.name)))
}

function filteredToolsets(toolsets: ToolsetInfo[], query: string): ToolsetInfo[] {
  const q = query.trim().toLowerCase()

  return toolsets
    .filter(toolset => {
      if (!q) {
        return true
      }

      const label = toolsetDisplayLabel(toolset)

      return (
        includesQuery(toolset.name, q) ||
        includesQuery(label, q) ||
        includesQuery(toolset.label, q) ||
        includesQuery(toolset.description, q) ||
        toolNames(toolset).some(name => includesQuery(name, q))
      )
    })
    .sort((a, b) => toolsetDisplayLabel(a).localeCompare(toolsetDisplayLabel(b)))
}

interface SkillsViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

export function SkillsView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: SkillsViewProps) {
  const { t } = useI18n()
  const [mode, setMode] = useRouteEnumParam('tab', SKILLS_MODES, 'skills')

  const [query, setQuery] = useState('')
  const [skills, setSkills] = useState<SkillInfo[] | null>(null)
  const [toolsets, setToolsets] = useState<ToolsetInfo[] | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [savingSkill, setSavingSkill] = useState<string | null>(null)
  const [savingToolset, setSavingToolset] = useState<string | null>(null)
  const [expandedToolset, setExpandedToolset] = useState<string | null>(null)

  const refreshCapabilities = useCallback(async () => {
    setRefreshing(true)

    try {
      const [nextSkills, nextToolsets] = await Promise.all([getSkills(), getToolsets()])
      setSkills(nextSkills)
      setToolsets(nextToolsets)
    } catch (err) {
      notifyError(err, t.skills.skillsLoadFailed)
    } finally {
      setRefreshing(false)
    }
  }, [t])

  const refreshToolsets = useCallback(() => {
    getToolsets()
      .then(setToolsets)
      .catch(err => notifyError(err, t.skills.toolsetsRefreshFailed))
  }, [t])

  useRefreshHotkey(refreshCapabilities)

  useEffect(() => {
    void refreshCapabilities()
  }, [refreshCapabilities])

  const categories = useMemo(() => {
    if (!skills) {
      return []
    }

    const counts = new Map<string, number>()

    for (const skill of skills) {
      const key = categoryFor(skill)
      counts.set(key, (counts.get(key) || 0) + 1)
    }

    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({ key, count }))
  }, [skills])

  const visibleSkills = useMemo(
    () => (skills ? filteredSkills(skills, query, mode === 'skills' ? activeCategory : null) : []),
    [activeCategory, mode, query, skills]
  )

  const visibleToolsets = useMemo(() => (toolsets ? filteredToolsets(toolsets, query) : []), [query, toolsets])

  const skillGroups = useMemo(() => {
    const groups = new Map<string, SkillInfo[]>()

    for (const skill of visibleSkills) {
      const key = categoryFor(skill)
      groups.set(key, [...(groups.get(key) || []), skill])
    }

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [visibleSkills])

  const totalSkills = skills?.length || 0
  const enabledToolsets = toolsets?.filter(toolset => toolset.enabled).length || 0

  async function handleToggleSkill(skill: SkillInfo, enabled: boolean) {
    setSavingSkill(skill.name)

    try {
      await toggleSkill(skill.name, enabled)
      setSkills(current => current?.map(row => (row.name === skill.name ? { ...row, enabled } : row)) ?? current)
      notify({
        kind: 'success',
        title: enabled ? t.skills.skillEnabled : t.skills.skillDisabled,
        message: t.skills.appliesToNewSessions(skill.name)
      })
    } catch (err) {
      notifyError(err, t.skills.failedToUpdate(skill.name))
    } finally {
      setSavingSkill(null)
    }
  }

  async function handleToggleToolset(toolset: ToolsetInfo, enabled: boolean) {
    setSavingToolset(toolset.name)

    try {
      await toggleToolset(toolset.name, enabled)
      setToolsets(
        current =>
          current?.map(row => (row.name === toolset.name ? { ...row, enabled, available: enabled } : row)) ?? current
      )
      notify({
        kind: 'success',
        title: enabled ? t.skills.toolsetEnabled : t.skills.toolsetDisabled,
        message: t.skills.appliesToNewSessions(toolsetDisplayLabel(toolset))
      })
    } catch (err) {
      notifyError(err, t.skills.failedToUpdate(toolsetDisplayLabel(toolset)))
    } finally {
      setSavingToolset(null)
    }
  }

  return (
    <PageSearchShell
      {...props}
      filters={
        mode === 'skills' && categories.length > 0 ? (
          <>
            <TextTab active={activeCategory === null} onClick={() => setActiveCategory(null)}>
              {t.skills.all} <TextTabMeta>{totalSkills}</TextTabMeta>
            </TextTab>
            {categories.map(category => (
              <TextTab
                active={activeCategory === category.key}
                key={category.key}
                onClick={() => setActiveCategory(activeCategory === category.key ? null : category.key)}
              >
                {prettyName(category.key)} <TextTabMeta>{category.count}</TextTabMeta>
              </TextTab>
            ))}
          </>
        ) : undefined
      }
      onSearchChange={setQuery}
      searchHidden={
        mode === 'skills' ? (skills?.length ?? 0) === 0 : mode === 'toolsets' ? (toolsets?.length ?? 0) === 0 : false
      }
      searchPlaceholder={
        mode === 'skills'
          ? t.skills.searchSkills
          : mode === 'toolsets'
            ? t.skills.searchToolsets
            : t.skills.searchMarket
      }
      searchTrailingAction={
        <Button
          aria-label={refreshing ? t.skills.refreshing : t.skills.refresh}
          className="text-(--ui-text-tertiary) hover:bg-transparent hover:text-foreground"
          disabled={refreshing}
          onClick={() => void refreshCapabilities()}
          size="icon-xs"
          title={refreshing ? t.skills.refreshing : t.skills.refresh}
          type="button"
          variant="ghost"
        >
          <Codicon name="refresh" size="0.875rem" spinning={refreshing} />
        </Button>
      }
      searchValue={query}
      tabs={
        <>
          <TextTab active={mode === 'skills'} onClick={() => setMode('skills')}>
            {t.skills.tabSkills}
          </TextTab>
          <TextTab active={mode === 'toolsets'} onClick={() => setMode('toolsets')}>
            {t.skills.tabToolsets}
          </TextTab>
          <TextTab active={mode === 'market'} onClick={() => setMode('market')}>
            {t.skills.tabMarket}
          </TextTab>
        </>
      }
    >
      {!skills || !toolsets ? (
        <PageLoader label={t.skills.loading} />
      ) : mode === 'skills' ? (
        <div className={cn('h-full overflow-y-auto py-3', PAGE_INSET_X)}>
          {visibleSkills.length === 0 ? (
            <EmptyState description={t.skills.noSkillsDesc} title={t.skills.noSkillsTitle} />
          ) : (
            <div className="space-y-4">
              {skillGroups.map(([category, list]) => (
                <div className="space-y-1.5" key={category}>
                  {activeCategory === null && (
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {prettyName(category)}
                    </div>
                  )}
                  <div>
                    {list.map(skill => (
                      <div
                        className="grid gap-3 px-0 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                        key={skill.name}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{skill.name}</div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {asText(skill.description) || t.skills.noDescription}
                          </p>
                        </div>
                        <Switch
                          checked={skill.enabled}
                          disabled={savingSkill === skill.name}
                          onCheckedChange={checked => void handleToggleSkill(skill, checked)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : mode === 'toolsets' ? (
        <div className={cn('h-full overflow-y-auto py-3', PAGE_INSET_X)}>
          {visibleToolsets.length === 0 ? (
            <EmptyState description={t.skills.noToolsetsDesc} title={t.skills.noToolsetsTitle} />
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                {t.skills.toolsetsEnabled(enabledToolsets, toolsets.length)}
              </div>
              <div>
                {visibleToolsets.map(toolset => {
                  const tools = toolNames(toolset)
                  const label = toolsetDisplayLabel(toolset)
                  const expanded = expandedToolset === toolset.name

                  return (
                    <div className="px-0 py-2.5" key={toolset.name}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-medium">{label}</div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            aria-expanded={expanded}
                            aria-label={t.skills.configureToolset(label)}
                            className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            onClick={() =>
                              setExpandedToolset(current => (current === toolset.name ? null : toolset.name))
                            }
                            type="button"
                          >
                            <StatusPill active={toolset.configured}>
                              {toolset.configured ? t.skills.configured : t.skills.needsKeys}
                            </StatusPill>
                          </button>
                          <Switch
                            aria-label={t.skills.toggleToolset(label)}
                            checked={toolset.enabled}
                            disabled={savingToolset === toolset.name}
                            onCheckedChange={checked => void handleToggleToolset(toolset, checked)}
                          />
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {asText(toolset.description) || t.skills.noDescription}
                      </p>
                      {tools.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {tools.map(name => (
                            <span
                              className="rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5 font-mono text-[0.65rem] text-(--ui-text-tertiary)"
                              key={name}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                      {expanded && toolset.name === 'computer_use' && (
                        <ComputerUsePanel onConfiguredChange={refreshToolsets} />
                      )}
                      {expanded && <ToolsetConfigPanel onConfiguredChange={refreshToolsets} toolset={toolset.name} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <SkillMarketPanel onInstalled={refreshCapabilities} query={query} />
      )}
    </PageSearchShell>
  )
}

function isDirectSkillIdentifier(value: string): boolean {
  return DIRECT_SKILL_IDENTIFIER_RE.test(value.trim())
}

function SkillMarketPanel({ onInstalled, query }: { onInstalled: () => Promise<void>; query: string }) {
  const { t } = useI18n()
  const [sources, setSources] = useState<SkillHubSourceInfo[]>([])
  const [source, setSource] = useState('all')
  const [featured, setFeatured] = useState<SkillHubResult[]>([])
  const [results, setResults] = useState<SkillHubResult[]>([])
  const [installed, setInstalled] = useState<Record<string, unknown>>({})
  const [loadingSources, setLoadingSources] = useState(false)
  const [searching, setSearching] = useState(false)
  const [installing, setInstalling] = useState<null | string>(null)
  const [error, setError] = useState<null | string>(null)
  const deferredQuery = useDeferredValue(query.trim())

  useEffect(() => {
    let cancelled = false
    setLoadingSources(true)

    void getSkillHubSources()
      .then(payload => {
        if (cancelled) {
          return
        }

        setSources(payload.sources || [])
        setFeatured(payload.featured || [])
        setInstalled(payload.installed || {})
      })
      .catch(err => {
        if (!cancelled) {
          notifyError(err, t.skills.marketSearchFailed)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSources(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [t])

  useEffect(() => {
    if (deferredQuery.length < 2) {
      setResults([])
      setError(null)

      return
    }

    let cancelled = false
    setSearching(true)
    setError(null)

    void searchSkillHub(deferredQuery, source)
      .then(payload => {
        if (cancelled) {
          return
        }

        setResults(payload.results || [])
        setInstalled(payload.installed || {})
      })
      .catch(err => {
        if (!cancelled) {
          setResults([])
          setError(err instanceof Error ? err.message : t.skills.marketSearchFailed)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearching(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [deferredQuery, source, t])

  const sourceOptions = useMemo(() => {
    const known = new Map<string, SkillHubSourceInfo>()

    for (const item of sources) {
      known.set(item.id, item)
    }

    if (!known.has('skills-sh')) {
      known.set('skills-sh', { id: 'skills-sh', label: 'skills.sh' })
    }

    return [{ id: 'all', label: t.skills.marketAllSources }, ...Array.from(known.values())]
  }, [sources, t])

  async function handleInstall(identifier: string) {
    setInstalling(identifier)

    try {
      await installSkillHub(identifier)
      notify({
        kind: 'success',
        title: t.skills.marketInstalling,
        message: t.skills.marketInstallStarted(identifier)
      })
      await onInstalled()
    } catch (err) {
      notifyError(err, t.skills.marketInstallFailed(identifier))
    } finally {
      setInstalling(null)
    }
  }

  const directIdentifier = isDirectSkillIdentifier(deferredQuery) ? deferredQuery : null
  const directAlreadyListed = directIdentifier ? results.some(result => result.identifier === directIdentifier) : false
  const featuredForSource = useMemo(
    () => (source === 'all' ? featured : featured.filter(item => item.source === source)),
    [featured, source]
  )
  const marketSources = sourceOptions.filter(option => option.id !== 'all')

  const sourceStatus = (option: SkillHubSourceInfo): string => {
    if (option.rate_limited) {
      return t.skills.marketSourceRateLimited
    }

    if (option.available === false) {
      return t.skills.marketSourceUnavailable
    }

    return t.skills.marketSourceReady
  }

  const renderResultCards = (items: SkillHubResult[]) => (
    <div className="space-y-2">
      {items.map(result => {
        const isInstalled = Boolean(installed[result.identifier])
        const isInstalling = installing === result.identifier

        return (
          <div
            className="grid gap-3 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            key={result.identifier}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="truncate text-sm font-medium">{result.name}</div>
                <Badge variant="outline">{t.skills.marketTrust(result.trust_level)}</Badge>
                <Badge variant="muted">{t.skills.marketSourceLabel(result.source)}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {result.description || t.skills.noDescription}
              </p>
              <div className="mt-1 truncate font-mono text-[0.68rem] text-muted-foreground">{result.identifier}</div>
            </div>
            <Button
              disabled={isInstalled || isInstalling}
              onClick={() => void handleInstall(result.identifier)}
              size="sm"
              type="button"
              variant={isInstalled ? 'outline' : 'default'}
            >
              {isInstalled
                ? t.skills.marketInstalled
                : isInstalling
                  ? t.skills.marketInstalling
                  : t.skills.marketInstall}
            </Button>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className={cn('h-full overflow-y-auto py-4', PAGE_INSET_X)}>
      <div className="mx-auto max-w-4xl space-y-4">
        <section className="rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{t.skills.marketTitle}</h3>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{t.skills.marketDesc}</p>
            </div>
            <Button onClick={() => openExternalLink(SKILLS_MARKET_URL)} size="sm" type="button" variant="outline">
              <Codicon name="link-external" size="0.8rem" />
              {t.skills.marketOpen}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium" htmlFor="skill-market-source">
              {t.skills.marketSource}
            </label>
            <Select onValueChange={setSource} value={source}>
              <SelectTrigger className="h-8 w-52 rounded-md" id="skill-market-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sourceOptions.map(option => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingSources && <span className="text-xs text-muted-foreground">{t.skills.marketLoading}</span>}
          </div>

          {marketSources.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t.skills.marketSourcesTitle}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {marketSources.map(option => {
                  const active = source === option.id

                  return (
                    <button
                      className={cn(
                        'rounded-md border px-3 py-2 text-left transition-colors',
                        active
                          ? 'border-primary/70 bg-primary/10 text-foreground'
                          : 'border-(--ui-stroke-secondary) bg-(--ui-bg-primary) text-foreground/85 hover:bg-(--ui-bg-tertiary)'
                      )}
                      key={option.id}
                      onClick={() => setSource(option.id)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{option.label}</span>
                        <Badge variant={option.rate_limited || option.available === false ? 'outline' : 'muted'}>
                          {sourceStatus(option)}
                        </Badge>
                      </div>
                      <div className="mt-1 truncate font-mono text-[0.68rem] text-muted-foreground">{option.id}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {directIdentifier && !directAlreadyListed && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) px-3 py-2">
            <div className="min-w-0">
              <div className="truncate font-mono text-xs">{directIdentifier}</div>
              <div className="text-[0.68rem] text-muted-foreground">{SKILLS_MARKET_URL}</div>
            </div>
            <Button
              disabled={installing === directIdentifier}
              onClick={() => void handleInstall(directIdentifier)}
              size="sm"
              type="button"
            >
              {installing === directIdentifier
                ? t.skills.marketInstalling
                : t.skills.marketDirectInstall(directIdentifier)}
            </Button>
          </div>
        )}

        {deferredQuery.length < 2 ? (
          featuredForSource.length > 0 ? (
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">{t.skills.marketFeaturedTitle}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.skills.marketFeaturedDesc}</p>
              </div>
              {renderResultCards(featuredForSource)}
            </section>
          ) : (
            <EmptyState description={t.skills.marketEmptyDesc} title={t.skills.marketEmptyTitle} />
          )
        ) : searching ? (
          <PageLoader className="min-h-52" label={t.skills.marketLoading} />
        ) : error ? (
          <EmptyState description={error} title={t.skills.marketSearchFailed} />
        ) : results.length === 0 ? (
          <EmptyState description={t.skills.marketNoResultsDesc} title={t.skills.marketNoResultsTitle} />
        ) : (
          renderResultCards(results)
        )}
      </div>
    </div>
  )
}

function StatusPill({ active, children }: { active: boolean; children: string }) {
  return (
    <Badge
      className={
        active ? 'bg-(--ui-bg-tertiary) text-(--ui-text-secondary)' : 'bg-(--ui-bg-quinary) text-(--ui-text-tertiary)'
      }
    >
      {children}
    </Badge>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-52 place-items-center text-center">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}

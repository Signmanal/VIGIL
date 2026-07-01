import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  createProfile,
  deleteProfile,
  getProfiles,
  getProfileSetupCommand,
  getProfileSoul,
  getSkills,
  getVIGILConfigRecord,
  type ProfileInfo,
  renameProfile,
  saveVIGILConfig,
  setApiRequestProfile,
  toggleSkill,
  updateProfileSoul
} from '@/vigil'
import { useI18n } from '@/i18n'
import { AlertTriangle, Save, Terminal, Trash2, Users } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { selectProfile } from '@/store/profile'
import type { SkillInfo, VIGILConfigRecord } from '@/types/vigil'

import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { OverlayMain, OverlayNewButton, OverlaySidebar, OverlaySplitLayout } from '../overlays/overlay-split-layout'
import { OverlayView } from '../overlays/overlay-view'
import { SETTINGS_ROUTE, SKILLS_ROUTE } from '../routes'
import {
  applyMcpSelectionToConfig,
  enabledMcpServerNames,
  getMcpServers,
  mcpTransportLabel,
  ProfileMcpPicker,
  type ProfileMcpSelection
} from './profile-mcp-picker'
import { ProfileSkillPicker, type ProfileSkillSelection } from './profile-skill-picker'

const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

function isValidProfileName(name: string): boolean {
  return PROFILE_NAME_RE.test(name.trim())
}

interface ProfilesViewProps {
  onClose: () => void
}

export function ProfilesView({ onClose }: ProfilesViewProps) {
  const { t } = useI18n()
  const p = t.profiles
  const [profiles, setProfiles] = useState<null | ProfileInfo[]>(null)
  const [selectedName, setSelectedName] = useState<null | string>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<null | ProfileInfo>(null)
  const [deleting, setDeleting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const { profiles: list } = await getProfiles()
      setProfiles(list)
      setSelectedName(current => {
        if (current && list.some(p => p.name === current)) {
          return current
        }

        return list.find(p => p.is_default)?.name ?? list[0]?.name ?? null
      })
    } catch (err) {
      notifyError(err, p.failedLoad)
    }
  }, [p])

  useRefreshHotkey(refresh)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selected = useMemo(() => {
    if (!profiles) {
      return null
    }

    return profiles.find(p => p.name === selectedName) ?? profiles[0] ?? null
  }, [profiles, selectedName])

  const handleCreate = useCallback(
    async (
      name: string,
      cloneFrom: null | string,
      skillSelection?: ProfileSkillSelection,
      mcpSelection?: ProfileMcpSelection
    ) => {
      const trimmed = name.trim()

      if (!isValidProfileName(trimmed)) {
        throw new Error(p.nameHint)
      }

      await createProfile({
        name: trimmed,
        clone_from: cloneFrom,
        ...(skillSelection?.touched ? { keep_skills: skillSelection.selected } : {})
      })
      if (mcpSelection?.touched) {
        const cfg = await getVIGILConfigRecord(trimmed)
        await saveVIGILConfig(applyMcpSelectionToConfig(cfg, mcpSelection), trimmed)
      }
      notify({ kind: 'success', title: p.created, message: trimmed })
      setSelectedName(trimmed)
      await refresh()
    },
    [p, refresh]
  )

  const handleRename = useCallback(
    async (from: string, to: string): Promise<void> => {
      const target = to.trim()

      if (target === from) {
        return
      }

      if (!isValidProfileName(target)) {
        throw new Error(p.nameHint)
      }

      await renameProfile(from, target)
      notify({ kind: 'success', title: p.renamed, message: `${from} → ${target}` })
      setSelectedName(target)
      await refresh()
    },
    [p, refresh]
  )

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) {
      return
    }

    setDeleting(true)

    try {
      await deleteProfile(pendingDelete.name)
      notify({ kind: 'success', title: p.deleted, message: pendingDelete.name })
      setPendingDelete(null)
      setSelectedName(null)
      await refresh()
    } catch (err) {
      notifyError(err, p.failedDelete)
    } finally {
      setDeleting(false)
    }
  }, [p, pendingDelete, refresh])

  return (
    <OverlayView closeLabel={p.close} onClose={onClose}>
      {!profiles ? (
        <PageLoader label={p.loading} />
      ) : (
        <OverlaySplitLayout>
          <OverlaySidebar>
            <OverlayNewButton label={p.newProfile} onClick={() => setCreateOpen(true)} />
            {profiles.map(profile => (
              <ProfileRow
                active={selected?.name === profile.name}
                key={profile.name}
                onSelect={() => setSelectedName(profile.name)}
                profile={profile}
              />
            ))}
            {profiles.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">{p.noProfiles}</p>
            )}
          </OverlaySidebar>

          <OverlayMain className="px-0">
            {selected ? (
              <ProfileDetail
                key={selected.name}
                onDelete={() => setPendingDelete(selected)}
                onRename={newName => handleRename(selected.name, newName)}
                onRefresh={() => void refresh()}
                profile={selected}
              />
            ) : (
              <div className="grid h-full place-items-center px-6 py-12 text-center text-sm text-muted-foreground">
                <div>
                  <Users className="mx-auto size-6 text-muted-foreground/60" />
                  <p className="mt-3">{p.selectPrompt}</p>
                </div>
              </div>
            )}
          </OverlayMain>
        </OverlaySplitLayout>
      )}

      <CreateProfileDialog
        onClose={() => setCreateOpen(false)}
        onCreate={async (name, cloneFrom, skillSelection, mcpSelection) =>
          handleCreate(name, cloneFrom, skillSelection, mcpSelection)
        }
        open={createOpen}
        profiles={profiles ?? []}
      />

      <Dialog onOpenChange={open => !open && !deleting && setPendingDelete(null)} open={pendingDelete !== null}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{p.deleteTitle}</DialogTitle>
            <DialogDescription>
              {pendingDelete ? (
                <>
                  {p.deleteDescPrefix}
                  <span className="font-medium text-foreground">{pendingDelete.name}</span>
                  {p.deleteDescMid}
                  <span className="font-mono text-xs">{pendingDelete.path}</span>
                  {p.deleteDescSuffix}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={deleting} onClick={() => setPendingDelete(null)} variant="outline">
              {t.common.cancel}
            </Button>
            <Button disabled={deleting} onClick={() => void handleConfirmDelete()} variant="destructive">
              {deleting ? p.deleting : t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OverlayView>
  )
}

function ProfileRow({ active, onSelect, profile }: { active: boolean; onSelect: () => void; profile: ProfileInfo }) {
  const { t } = useI18n()
  const p = t.profiles

  return (
    <button
      className={cn(
        'flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
        active ? 'bg-accent text-foreground' : 'text-foreground/85 hover:bg-accent/60'
      )}
      onClick={onSelect}
      type="button"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{profile.name}</span>
        {profile.is_default && <span className="text-[0.6rem] text-primary">{p.default}</span>}
      </span>
      <span className="text-[0.66rem] text-muted-foreground">
        {p.skills(profile.skill_count)}
        {profile.has_env ? ` · ${p.env}` : ''}
      </span>
    </button>
  )
}

function ProfileDetail({
  onDelete,
  onRename,
  onRefresh,
  profile
}: {
  onDelete: () => void
  onRename: (newName: string) => Promise<void>
  onRefresh: () => void
  profile: ProfileInfo
}) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const p = t.profiles
  const [copying, setCopying] = useState(false)

  const openProfileScoped = useCallback(
    (path: string) => {
      setApiRequestProfile(profile.name)
      selectProfile(profile.name)
      navigate(path)
    },
    [navigate, profile.name]
  )

  const handleCopySetup = useCallback(async () => {
    setCopying(true)

    try {
      const { command } = await getProfileSetupCommand(profile.name)
      await navigator.clipboard.writeText(command)
      notify({ kind: 'success', title: p.setupCopied, message: command })
    } catch (err) {
      notifyError(err, p.failedCopy)
    } finally {
      setCopying(false)
    }
  }, [p, profile.name])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
          <header className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold tracking-tight">{profile.name}</h3>
                  {profile.is_default && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium text-primary">
                      {p.defaultBadge}
                    </span>
                  )}
                  {profile.has_env && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                      .env
                    </span>
                  )}
                </div>
                <p className="mt-1 font-mono text-[0.7rem] text-muted-foreground" title={profile.path}>
                  {profile.path}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button disabled={copying} onClick={() => void handleCopySetup()} size="sm" variant="outline">
                  <Terminal />
                  {copying ? p.copying : p.copySetup}
                </Button>
                <Button onClick={() => openProfileScoped(SKILLS_ROUTE)} size="sm" variant="outline">
                  {p.startingSkills}
                </Button>
                <Button onClick={() => openProfileScoped(`${SETTINGS_ROUTE}?tab=mcp`)} size="sm" variant="outline">
                  MCP
                </Button>
                {!profile.is_default && (
                  <Button
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={onDelete}
                    size="sm"
                    variant="ghost"
                  >
                    <Trash2 />
                    {t.common.delete}
                  </Button>
                )}
              </div>
            </div>

            <p className="rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) px-3 py-2 text-xs leading-5 text-muted-foreground">
              {p.setupCommandHint}
            </p>

            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <DetailRow label={p.modelLabel}>
                {profile.model ? (
                  <>
                    <span className="font-mono">{profile.model}</span>
                    {profile.provider && <span className="text-muted-foreground"> · {profile.provider}</span>}
                  </>
                ) : (
                  <span className="text-muted-foreground">{p.notSet}</span>
                )}
              </DetailRow>
              <DetailRow label={p.skillsLabel}>{profile.skill_count}</DetailRow>
            </dl>
          </header>

          <ProfileEditor onRefresh={onRefresh} onRename={onRename} profile={profile} />
        </div>
      </div>
    </div>
  )
}

function DetailRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  )
}

function sortedSkillNames(skills: readonly SkillInfo[]): string[] {
  return skills
    .filter(skill => skill.enabled)
    .map(skill => skill.name)
    .sort()
}

function sortedSetValues(values: ReadonlySet<string>): string[] {
  return [...values].sort()
}

function sameStringList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false
  }

  return a.every((value, index) => value === b[index])
}

function sameStringSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return sameStringList(sortedSetValues(a), sortedSetValues(b))
}

function ProfileEditor({
  onRefresh,
  onRename,
  profile
}: {
  onRefresh: () => void
  onRename: (newName: string) => Promise<void>
  profile: ProfileInfo
}) {
  const { t } = useI18n()
  const p = t.profiles
  const [name, setName] = useState(profile.name)
  const [soul, setSoul] = useState('')
  const [originalSoul, setOriginalSoul] = useState('')
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [originalSkills, setOriginalSkills] = useState<Set<string>>(new Set())
  const [config, setConfig] = useState<VIGILConfigRecord | null>(null)
  const [mcpEnabled, setMcpEnabled] = useState<Set<string>>(new Set())
  const [originalMcp, setOriginalMcp] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<null | string>(null)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError(null)
    setName(profile.name)
    setSoul('')
    setOriginalSoul('')
    setSkills([])
    setOriginalSkills(new Set())
    setConfig(null)
    setMcpEnabled(new Set())
    setOriginalMcp(new Set())

    void Promise.all([getProfileSoul(profile.name), getSkills(profile.name), getVIGILConfigRecord(profile.name)])
      .then(([loadedSoul, loadedSkills, loadedConfig]) => {
        if (cancelled) {
          return
        }

        const sortedSkills = [...loadedSkills].sort((a, b) => a.name.localeCompare(b.name))
        const enabledSkills = new Set(sortedSkillNames(sortedSkills))
        const servers = getMcpServers(loadedConfig)
        const enabledMcp = new Set(enabledMcpServerNames(servers))

        setSoul(loadedSoul.content)
        setOriginalSoul(loadedSoul.content)
        setSkills(sortedSkills)
        setOriginalSkills(enabledSkills)
        setConfig(loadedConfig)
        setMcpEnabled(enabledMcp)
        setOriginalMcp(enabledMcp)
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : p.failedLoad)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [p.failedLoad, profile.name])

  const servers = useMemo(() => getMcpServers(config), [config])
  const mcpNames = useMemo(() => Object.keys(servers).sort(), [servers])
  const selectedSkillNames = useMemo(() => sortedSkillNames(skills), [skills])
  const trimmedName = name.trim()
  const nameDirty = !profile.is_default && trimmedName !== profile.name
  const nameInvalid = nameDirty && (!trimmedName || !isValidProfileName(trimmedName))
  const skillsDirty = !sameStringList(selectedSkillNames, sortedSetValues(originalSkills))
  const mcpDirty = !sameStringSet(mcpEnabled, originalMcp)
  const soulDirty = soul !== originalSoul
  const dirty = nameDirty || skillsDirty || mcpDirty || soulDirty
  const selectedMcpCount = mcpEnabled.size

  function resetDrafts() {
    setName(profile.name)
    setSoul(originalSoul)
    setSkills(prev => prev.map(skill => ({ ...skill, enabled: originalSkills.has(skill.name) })))
    setMcpEnabled(new Set(originalMcp))
    setError(null)
  }

  function toggleSkillDraft(skillName: string, enabled: boolean) {
    setSkills(prev => prev.map(skill => (skill.name === skillName ? { ...skill, enabled } : skill)))
  }

  function toggleMcpDraft(name: string, enabled: boolean) {
    setMcpEnabled(prev => {
      const next = new Set(prev)

      if (enabled) {
        next.add(name)
      } else {
        next.delete(name)
      }

      return next
    })
  }

  function setAllSkills(enabled: boolean) {
    setSkills(prev => prev.map(skill => ({ ...skill, enabled })))
  }

  function setAllMcp(enabled: boolean) {
    setMcpEnabled(enabled ? new Set(mcpNames) : new Set())
  }

  async function handleSave() {
    if (nameInvalid) {
      setError(p.invalidName(p.nameHint))

      return
    }

    setSaving(true)
    setError(null)

    try {
      if (soulDirty) {
        await updateProfileSoul(profile.name, soul)
      }

      const changedSkills = skills.filter(skill => originalSkills.has(skill.name) !== skill.enabled)
      for (const skill of changedSkills) {
        await toggleSkill(skill.name, skill.enabled, profile.name)
      }

      if (config && mcpDirty) {
        const nextServers = { ...servers }
        for (const serverName of mcpNames) {
          const nextServer = { ...servers[serverName] }
          if (mcpEnabled.has(serverName)) {
            delete nextServer.disabled
          } else {
            nextServer.disabled = true
          }
          nextServers[serverName] = nextServer
        }

        const nextConfig = { ...config, mcp_servers: nextServers }
        await saveVIGILConfig(nextConfig, profile.name)
        setConfig(nextConfig)
      }

      if (nameDirty) {
        await onRename(trimmedName)
      } else {
        const nextSkillSet = new Set(selectedSkillNames)
        setOriginalSoul(soul)
        setOriginalSkills(nextSkillSet)
        setOriginalMcp(new Set(mcpEnabled))
        notify({ kind: 'success', title: p.profileSaved, message: profile.name })
        onRefresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : p.failedSaveProfile)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {p.editProfile}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">{p.editProfileDesc}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty && <span className="text-[0.65rem] text-muted-foreground">{p.unsavedChanges}</span>}
          <Button disabled={!dirty || saving || loading} onClick={resetDrafts} size="sm" variant="outline">
            {p.resetChanges}
          </Button>
          <Button disabled={!dirty || nameInvalid || saving || loading} onClick={() => void handleSave()} size="sm">
            <Save />
            {saving ? p.saving : p.saveProfile}
          </Button>
        </div>
      </div>

      {loading ? (
        <PageLoader className="min-h-44" label={p.loading} />
      ) : (
        <>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="profile-edit-name">
              {p.nameLabel}
            </label>
            <Input
              aria-invalid={nameInvalid}
              disabled={profile.is_default || saving}
              id="profile-edit-name"
              onChange={event => setName(event.target.value)}
              value={name}
            />
            <p
              className={cn(
                'text-[0.66rem] leading-4',
                nameInvalid ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {profile.is_default ? p.defaultNameLocked : p.nameHint}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h5 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {p.startingSkills}
                  </h5>
                  <p className="text-xs text-muted-foreground">{p.profileSkillsDesc}</p>
                </div>
                <span className="text-[0.65rem] text-muted-foreground">
                  {p.skillsSelected(selectedSkillNames.length, skills.length)}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  disabled={saving || skills.length === 0}
                  onClick={() => setAllSkills(true)}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  {p.selectAllSkills}
                </Button>
                <Button
                  disabled={saving || skills.length === 0}
                  onClick={() => setAllSkills(false)}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  {p.clearSkills}
                </Button>
              </div>

              <div className="max-h-56 overflow-y-auto rounded-md border border-(--ui-stroke-secondary) bg-background/30">
                {skills.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">{p.noSkillsAvailable}</div>
                ) : (
                  skills.map(skill => (
                    <label
                      className={cn(
                        'flex cursor-pointer items-start gap-2 border-b border-(--ui-stroke-secondary) px-3 py-2 last:border-b-0',
                        saving && 'cursor-not-allowed opacity-60'
                      )}
                      key={skill.name}
                    >
                      <input
                        checked={skill.enabled}
                        className="mt-0.5"
                        disabled={saving}
                        onChange={event => toggleSkillDraft(skill.name, event.currentTarget.checked)}
                        type="checkbox"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">{skill.name}</span>
                        {skill.description && (
                          <span className="mt-0.5 block line-clamp-2 text-[0.68rem] leading-4 text-muted-foreground">
                            {skill.description}
                          </span>
                        )}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h5 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    MCP
                  </h5>
                  <p className="text-xs text-muted-foreground">{p.profileMcpDesc}</p>
                </div>
                <span className="text-[0.65rem] text-muted-foreground">
                  {p.skillsSelected(selectedMcpCount, mcpNames.length)}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  disabled={saving || mcpNames.length === 0}
                  onClick={() => setAllMcp(true)}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  {p.selectAllSkills}
                </Button>
                <Button
                  disabled={saving || mcpNames.length === 0}
                  onClick={() => setAllMcp(false)}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  {p.clearSkills}
                </Button>
              </div>

              <div className="max-h-56 overflow-y-auto rounded-md border border-(--ui-stroke-secondary) bg-background/30">
                {mcpNames.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">{p.noProfileMcpAvailable}</div>
                ) : (
                  mcpNames.map(name => {
                    const server = servers[name]

                    return (
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-2 border-b border-(--ui-stroke-secondary) px-3 py-2 last:border-b-0',
                          saving && 'cursor-not-allowed opacity-60'
                        )}
                        key={name}
                      >
                        <input
                          checked={mcpEnabled.has(name)}
                          className="mt-0.5"
                          disabled={saving}
                          onChange={event => toggleMcpDraft(name, event.currentTarget.checked)}
                          type="checkbox"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium">{name}</span>
                          <span className="mt-0.5 block truncate text-[0.68rem] leading-4 text-muted-foreground">
                            {mcpTransportLabel(server)}
                            {typeof server.command === 'string' ? ` · ${server.command}` : ''}
                            {typeof server.url === 'string' ? ` · ${server.url}` : ''}
                          </span>
                        </span>
                      </label>
                    )
                  })
                )}
              </div>
            </section>
          </div>

          <section className="space-y-2">
            <div>
              <h5 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                SOUL.md
              </h5>
              <p className="text-xs text-muted-foreground">{p.soulDesc}</p>
            </div>
            <Textarea
              className="min-h-72 font-mono text-xs leading-5"
              disabled={saving}
              onChange={event => setSoul(event.target.value)}
              placeholder={!soul.trim() ? p.emptySoul : undefined}
              value={soul}
            />
          </section>
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </section>
  )
}

function CreateProfileDialog({
  onClose,
  onCreate,
  open,
  profiles
}: {
  onClose: () => void
  onCreate: (
    name: string,
    cloneFrom: null | string,
    skillSelection: ProfileSkillSelection,
    mcpSelection: ProfileMcpSelection
  ) => Promise<void>
  open: boolean
  profiles: ProfileInfo[]
}) {
  const { t } = useI18n()
  const p = t.profiles
  const [name, setName] = useState('')
  const [cloneFrom, setCloneFrom] = useState<null | string>('default')
  const [skillSelection, setSkillSelection] = useState<ProfileSkillSelection>({ selected: [], touched: false })
  const [mcpSelection, setMcpSelection] = useState<ProfileMcpSelection>({ selected: [], servers: {}, touched: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<null | string>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setName('')
    setCloneFrom('default')
    setSkillSelection({ selected: [], touched: false })
    setMcpSelection({ selected: [], servers: {}, touched: false })
    setError(null)
    setSaving(false)
  }, [open])

  const trimmed = name.trim()
  const invalid = trimmed !== '' && !isValidProfileName(trimmed)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!trimmed || invalid) {
      setError(invalid ? p.invalidName(p.nameHint) : p.nameRequired)

      return
    }

    setSaving(true)
    setError(null)

    try {
      await onCreate(trimmed, cloneFrom, skillSelection, mcpSelection)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : p.failedCreate)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog onOpenChange={value => !value && !saving && onClose()} open={open}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{p.newProfile}</DialogTitle>
          <DialogDescription>{p.createDesc}</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="new-profile-name">
              {p.nameLabel}
            </label>
            <Input
              aria-invalid={invalid}
              autoFocus
              id="new-profile-name"
              onChange={event => setName(event.target.value)}
              placeholder="my-profile"
              value={name}
            />
            <p className={cn('text-[0.66rem] leading-4', invalid ? 'text-destructive' : 'text-muted-foreground')}>
              {p.nameHint}
            </p>
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="new-profile-clone-from">
              {p.cloneFrom}
            </label>
            <Select
              onValueChange={value => setCloneFrom(value === '__none__' ? null : value)}
              value={cloneFrom ?? '__none__'}
            >
              <SelectTrigger className="h-9 rounded-md" id="new-profile-clone-from">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{p.cloneFromNone}</SelectItem>
                {profiles.map(profile => (
                  <SelectItem key={profile.name} value={profile.name}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{p.cloneFromDesc}</p>
          </div>

          <ProfileSkillPicker
            active={open}
            disabled={saving}
            onSelectionChange={setSkillSelection}
            sourceProfile={cloneFrom}
          />

          <ProfileMcpPicker
            active={open}
            disabled={saving}
            onSelectionChange={setMcpSelection}
            sourceProfile={cloneFrom}
          />

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter>
            <Button disabled={saving} onClick={onClose} type="button" variant="outline">
              {t.common.cancel}
            </Button>
            <Button disabled={saving || !trimmed || invalid} type="submit">
              {saving ? p.creating : p.createAction}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  getAuxiliaryModels,
  getGlobalModelInfo,
  getGlobalModelOptions,
  getVIGILConfigRecord,
  getRecommendedDefaultModel,
  saveVIGILConfig,
  setEnvVar,
  setModelAssignment
} from '@/vigil'
import type { AuxiliaryModelsResponse, ModelOptionProvider, StaleAuxAssignment } from '@/vigil'
import { useI18n } from '@/i18n'
import { AlertTriangle, Cpu, Loader2 } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notifyError } from '@/store/notifications'
import { startManualLocalEndpoint, startManualProviderOAuth } from '@/store/onboarding'
import type { VIGILConfigRecord } from '@/types/vigil'

import { CONTROL_TEXT } from './constants'
import { getNested, setNested } from './helpers'
import { ListRow, LoadingState, Pill, SectionHeading } from './primitives'

// XCLAW' reasoning levels (VALID_REASONING_EFFORTS); `none` = thinking off.
// Empty config = XCLAW default (medium), shown as Medium.
const EFFORT_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

// agent.service_tier stores "fast"/"priority"/"on" for fast; anything else is
// normal (mirrors tui_gateway _load_service_tier).
const isFastTier = (tier: unknown): boolean =>
  ['fast', 'priority', 'on'].includes(String(tier ?? '').trim().toLowerCase())

// Reuse the composer's effort labels (`xhigh` shows as "Max", else 1:1).
const effortLabelKey = (v: string) => (v === 'xhigh' ? 'max' : v) as 'high' | 'low' | 'max' | 'medium' | 'minimal'

// A provider row is "ready" to pick a model from when it reports models. The
// backend now surfaces the full `vigil model` universe (every canonical
// provider), so unconfigured providers come back with `authenticated:false`
// and an empty `models` list — those need a setup step before a model exists.
function isProviderReady(p?: ModelOptionProvider): boolean {
  return !!p && (p.authenticated === true || (p.models?.length ?? 0) > 0)
}

function auxProviderNeedsSetup(slot: StaleAuxAssignment, providers: readonly ModelOptionProvider[]): boolean {
  const provider = (slot.provider ?? '').trim().toLowerCase()

  if (!provider || provider === 'auto') {
    return false
  }

  return !isProviderReady(providers.find(row => row.slug.toLowerCase() === provider))
}

// Mirrors `_AUX_TASK_SLOTS` in vigil_cli/web_server.py. Friendly labels and
// hints make the assignments readable; raw task keys (vision, mcp, …) are
// opaque to most users.
interface AuxTaskMeta {
  key: string
}

const AUX_TASKS: readonly AuxTaskMeta[] = [
  { key: 'vision' },
  { key: 'web_extract' },
  { key: 'compression' },
  { key: 'skills_hub' },
  { key: 'approval' },
  { key: 'mcp' },
  { key: 'title_generation' },
  { key: 'curator' }
]

const NO_PROVIDERS: readonly ModelOptionProvider[] = [{ name: '—', slug: '', models: [] }]

interface StaleAuxWarningProps {
  actionLabel: string
  applying: boolean
  message: (count: number, tasks: string, provider: string) => string
  onReset: () => void
  slots: readonly StaleAuxAssignment[]
  taskLabel: (key: string) => string
}

// Shared notice: auxiliary tasks pinned to a provider that is not currently
// connected/configured. A different connected provider is a valid override.
function StaleAuxWarning({ actionLabel, applying, message, onReset, slots, taskLabel }: StaleAuxWarningProps) {
  if (!slots.length) {
    return null
  }

  const provider = slots[0].provider
  const allSameProvider = slots.every(slot => slot.provider === provider)
  const names = slots.map(slot => taskLabel(slot.task)).join(', ')

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="grow">
        {message(slots.length, names, allSameProvider ? provider : 'other providers')}
      </span>
      <Button disabled={applying} onClick={onReset} size="sm" variant="textStrong">
        {actionLabel}
      </Button>
    </div>
  )
}

interface ModelSettingsProps {
  /** Notified after the main model is applied, so live UI stores can sync. */
  onMainModelChanged?: (provider: string, model: string) => void
}

export function ModelSettings({ onMainModelChanged }: ModelSettingsProps) {
  const { t } = useI18n()
  const m = t.settings.model
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mainModel, setMainModel] = useState<{ model: string; provider: string } | null>(null)
  const [providers, setProviders] = useState<ModelOptionProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [auxiliary, setAuxiliary] = useState<AuxiliaryModelsResponse | null>(null)
  // Full profile config, kept so the reasoning/speed defaults round-trip
  // (read agent.* → write back the whole record) like the generic config page.
  const [config, setConfig] = useState<VIGILConfigRecord | null>(null)
  const [applying, setApplying] = useState(false)
  const [editingAuxTask, setEditingAuxTask] = useState<null | string>(null)
  const [auxDraft, setAuxDraft] = useState<{ model: string; provider: string }>({ model: '', provider: '' })
  // Aux slots reported by the backend immediately after a main-model switch.
  // The backend can report a different provider; the UI only warns if that
  // provider is no longer connected/configured.
  const [switchStaleAux, setSwitchStaleAux] = useState<StaleAuxAssignment[]>([])
  // Inline API-key entry for picking an unconfigured `api_key` provider in
  // place — mirrors the onboarding ApiKeyForm but scoped to the model picker.
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [auxApiKeyDraft, setAuxApiKeyDraft] = useState('')
  const [activating, setActivating] = useState(false)
  const [auxActivating, setAuxActivating] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [modelInfo, modelOptions, auxiliaryModels, cfg] = await Promise.all([
        getGlobalModelInfo(),
        getGlobalModelOptions(),
        getAuxiliaryModels(),
        getVIGILConfigRecord()
      ])

      setMainModel({ model: modelInfo.model, provider: modelInfo.provider })
      setProviders(modelOptions.providers || [])
      setSelectedProvider(prev => prev || modelInfo.provider)
      setSelectedModel(prev => prev || modelInfo.model)
      setAuxiliary(auxiliaryModels)
      setConfig(cfg)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const providerOptions = providers.length ? providers : NO_PROVIDERS

  const selectedProviderRow = useMemo(
    () => providers.find(provider => provider.slug === selectedProvider),
    [providers, selectedProvider]
  )

  const selectedProviderModels = selectedProviderRow?.models ?? []

  // An unconfigured provider was picked: no credentials yet, so there are no
  // models to choose. `api_key` providers can be activated inline (paste key);
  // OAuth / external flows hand off to the onboarding sign-in.
  const needsSetup = !!selectedProvider && !isProviderReady(selectedProviderRow)
  const setupIsApiKey = needsSetup && selectedProviderRow?.auth_type === 'api_key' && !!selectedProviderRow?.key_env

  // Clear any half-typed key when switching provider so it can't leak across.
  useEffect(() => {
    setApiKeyDraft('')
  }, [selectedProvider])

  const auxDraftProviderModels = useMemo(
    () => providers.find(provider => provider.slug === auxDraft.provider)?.models ?? [],
    [auxDraft.provider, providers]
  )

  const auxDraftProviderRow = useMemo(
    () => providers.find(provider => provider.slug === auxDraft.provider),
    [auxDraft.provider, providers]
  )

  const auxDraftNeedsSetup = !!auxDraft.provider && !isProviderReady(auxDraftProviderRow)
  const auxDraftSetupIsApiKey = auxDraftNeedsSetup && auxDraftProviderRow?.auth_type === 'api_key' && !!auxDraftProviderRow?.key_env

  useEffect(() => {
    setAuxApiKeyDraft('')
  }, [auxDraft.provider])

  const auxiliaryTaskLabel = useCallback((key: string) => m.tasks[key]?.label ?? key, [m.tasks])

  const visibleSwitchStaleAux = useMemo(
    () => switchStaleAux.filter(slot => auxProviderNeedsSetup(slot, providers)),
    [providers, switchStaleAux]
  )

  // Persistent setup issue: any aux slot pinned to a provider that is not ready
  // to serve models. Connected providers intentionally remain valid overrides,
  // even when they differ from the current main model.
  const persistentStaleAux = useMemo<StaleAuxAssignment[]>(() => {
    if (!auxiliary) {
      return []
    }

    return auxiliary.tasks
      .map(entry => ({ task: entry.task, provider: entry.provider, model: entry.model }))
      .filter(entry => auxProviderNeedsSetup(entry, providers))
  }, [auxiliary, providers])

  // Capabilities of the APPLIED main model — gates the profile-default
  // reasoning/speed controls the same way the composer picker gates per-model
  // edits (reasoning defaults on, fast defaults off when unreported).
  const mainCaps = useMemo(() => {
    const row = providers.find(provider => provider.slug === mainModel?.provider)

    return mainModel ? row?.capabilities?.[mainModel.model] : undefined
  }, [providers, mainModel])

  const reasoningSupported = mainCaps?.reasoning ?? true
  const fastSupported = mainCaps?.fast ?? false
  const effortValue = String(getNested(config ?? {}, 'agent.reasoning_effort') ?? '').trim().toLowerCase() || 'medium'
  const fastOn = isFastTier(getNested(config ?? {}, 'agent.service_tier'))

  // Persist a single agent.* default by round-tripping the whole config record
  // (PUT /api/config replaces it) — optimistic, with rollback on failure.
  const writeAgentDefault = useCallback(
    async (key: string, value: string) => {
      if (!config) {
        return
      }

      const prev = config
      const next = setNested(config, key, value)
      setConfig(next)

      try {
        await saveVIGILConfig(next)
      } catch (err) {
        setConfig(prev)
        notifyError(err, m.defaultsFailed)
      }
    },
    [config, m.defaultsFailed]
  )

  // Paste an API key for the selected `api_key` provider, persist it, then
  // refresh so the now-authenticated provider's models populate. Auto-selects
  // the recommended default model so the user can Apply in one more click.
  const activateApiKeyProvider = useCallback(async () => {
    const keyEnv = selectedProviderRow?.key_env
    const slug = selectedProviderRow?.slug

    if (!keyEnv || !slug || !apiKeyDraft.trim()) {
      return
    }

    setActivating(true)
    setError('')

    try {
      await setEnvVar(keyEnv, apiKeyDraft.trim())
      setApiKeyDraft('')

      // Pick a sensible default for the freshly-activated provider (mirrors
      // `vigil model` curation). Best-effort — fall through to the refreshed
      // model list if it fails.
      let nextModel = ''

      try {
        const rec = await getRecommendedDefaultModel(slug)
        nextModel = rec.model || ''
      } catch {
        nextModel = ''
      }

      const options = await getGlobalModelOptions()
      setProviders(options.providers || [])
      const refreshedRow = options.providers?.find(p => p.slug === slug)
      const fallbackModel = refreshedRow?.models?.[0] ?? ''
      setSelectedModel(nextModel || fallbackModel)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setActivating(false)
    }
  }, [apiKeyDraft, selectedProviderRow])

  const activateAuxApiKeyProvider = useCallback(async () => {
    const keyEnv = auxDraftProviderRow?.key_env
    const slug = auxDraftProviderRow?.slug

    if (!keyEnv || !slug || !auxApiKeyDraft.trim()) {
      return
    }

    setAuxActivating(true)
    setError('')

    try {
      await setEnvVar(keyEnv, auxApiKeyDraft.trim())
      setAuxApiKeyDraft('')

      let nextModel = ''

      try {
        const rec = await getRecommendedDefaultModel(slug)
        nextModel = rec.model || ''
      } catch {
        nextModel = ''
      }

      const options = await getGlobalModelOptions()
      setProviders(options.providers || [])
      const refreshedRow = options.providers?.find(p => p.slug === slug)
      const fallbackModel = refreshedRow?.models?.[0] ?? ''
      setAuxDraft(prev => ({ ...prev, model: nextModel || fallbackModel }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAuxActivating(false)
    }
  }, [auxApiKeyDraft, auxDraftProviderRow])

  // OAuth / external providers can't be activated with a pasted key — hand off
  // to the shared onboarding flow scoped to this provider's real sign-in. The
  // custom / local endpoint is NOT an OAuth provider, so it gets the dedicated
  // local-endpoint form (URL + optional API key) instead of being dead-ended
  // on the OAuth picker (the original "booted back to the first screen" loop).
  const startProviderSetup = useCallback(() => {
    const slug = selectedProviderRow?.slug

    if (!slug) {
      return
    }

    const lower = slug.toLowerCase()

    if (lower === 'custom' || lower === 'local' || lower.startsWith('custom:')) {
      startManualLocalEndpoint()
    } else {
      startManualProviderOAuth(slug)
    }
  }, [selectedProviderRow])

  const startAuxProviderSetup = useCallback(() => {
    const slug = auxDraftProviderRow?.slug

    if (!slug) {
      return
    }

    const lower = slug.toLowerCase()

    if (lower === 'custom' || lower === 'local' || lower.startsWith('custom:')) {
      startManualLocalEndpoint()
    } else {
      startManualProviderOAuth(slug)
    }
  }, [auxDraftProviderRow])

  const applyMainModel = useCallback(async () => {
    if (!selectedProvider || !selectedModel) {
      return
    }

    setApplying(true)
    setError('')

    try {
      const result = await setModelAssignment({
        confirm_expensive_model: true,
        model: selectedModel,
        provider: selectedProvider,
        scope: 'main'
      })
      const provider = result.provider || selectedProvider
      const model = result.model || selectedModel
      setMainModel({ provider, model })
      setSwitchStaleAux(result.stale_aux ?? [])
      onMainModelChanged?.(provider, model)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }, [onMainModelChanged, refresh, selectedModel, selectedProvider])

  const setAuxiliaryToMain = useCallback(
    async (task: string) => {
      if (!mainModel) {
        return
      }

      setApplying(true)
      setError('')

      try {
        await setModelAssignment({ model: '', provider: 'auto', scope: 'auxiliary', task })
        setSwitchStaleAux(prev => prev.filter(slot => slot.task !== task))
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setApplying(false)
      }
    },
    [mainModel, refresh]
  )

  const applyAuxiliaryDraft = useCallback(
    async (task: string) => {
      if (!auxDraft.provider || !auxDraft.model) {
        return
      }

      setApplying(true)
      setError('')

      try {
        await setModelAssignment({
          confirm_expensive_model: true,
          model: auxDraft.model,
          provider: auxDraft.provider,
          scope: 'auxiliary',
          task
        })
        setEditingAuxTask(null)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setApplying(false)
      }
    },
    [auxDraft, refresh]
  )

  const beginAuxiliaryEdit = useCallback(
    (task: string) => {
      const current = auxiliary?.tasks.find(entry => entry.task === task)

      const initialProvider =
        current?.provider && current.provider !== 'auto' ? current.provider : (mainModel?.provider ?? '')

      const initialModel = current?.model || mainModel?.model || ''
      setAuxDraft({ provider: initialProvider, model: initialModel })
      setEditingAuxTask(task)
    },
    [auxiliary, mainModel]
  )

  const resetAuxiliaryModels = useCallback(async () => {
    if (!mainModel) {
      return
    }

    setApplying(true)
    setError('')

    try {
      await setModelAssignment({
        confirm_expensive_model: true,
        model: mainModel.model,
        provider: mainModel.provider,
        scope: 'auxiliary',
        task: '__reset__'
      })
      setSwitchStaleAux([])
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }, [mainModel, refresh])

  if (loading && !mainModel) {
    return <LoadingState label={m.loading} />
  }

  return (
    <div className="grid gap-6">
      <section>
        <p className="mb-3 text-xs text-muted-foreground">
          {m.appliesDesc}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select onValueChange={setSelectedProvider} value={selectedProvider}>
            <SelectTrigger className={cn('min-w-40', CONTROL_TEXT)}>
              <SelectValue placeholder={m.provider} />
            </SelectTrigger>
            <SelectContent>
              {providerOptions.map(provider => (
                <SelectItem key={provider.slug || 'none'} value={provider.slug || 'none'}>
                  <span className="inline-flex items-center gap-2">
                    <span>{provider.name}</span>
                    {!isProviderReady(provider) && (
                      <span className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                        {m.providerSetupRequired}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {needsSetup ? (
            setupIsApiKey ? (
              <>
                <Input
                  autoComplete="off"
                  className={cn('min-w-60 flex-1', CONTROL_TEXT)}
                  onChange={event => setApiKeyDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      void activateApiKeyProvider()
                    }
                  }}
                  placeholder={m.pasteProviderKey(selectedProviderRow?.key_env ?? 'API key')}
                  type="password"
                  value={apiKeyDraft}
                />
                <Button
                  disabled={!apiKeyDraft.trim() || activating}
                  onClick={() => void activateApiKeyProvider()}
                  size="sm"
                >
                  {activating && <Loader2 className="size-3.5 animate-spin" />}
                  {activating ? m.activatingProvider : m.activateProvider}
                </Button>
              </>
            ) : (
              <Button onClick={startProviderSetup} size="sm" variant="textStrong">
                {m.setupProvider(selectedProviderRow?.name ?? 'provider')}
              </Button>
            )
          ) : (
            <>
              <Select onValueChange={setSelectedModel} value={selectedModel}>
                <SelectTrigger className={cn('min-w-60', CONTROL_TEXT)}>
                  <SelectValue placeholder={m.model} />
                </SelectTrigger>
                <SelectContent>
                  {(selectedProviderModels.length ? selectedProviderModels : []).map(model => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!selectedProvider || !selectedModel || applying}
                onClick={() => void applyMainModel()}
                size="sm"
              >
                {applying && <Loader2 className="size-3.5 animate-spin" />}
                {applying ? m.applying : t.common.apply}
              </Button>
            </>
          )}
        </div>
        {needsSetup && !setupIsApiKey && (
          <p className="mt-2 text-xs text-muted-foreground">
            {selectedProviderRow?.auth_type === 'api_key'
              ? `${selectedProviderRow?.name} needs an API key — set it up to choose a model.`
              : `${selectedProviderRow?.name} signs in through your browser — XCLAW runs the flow for you.`}
          </p>
        )}
        {config && mainModel && (reasoningSupported || fastSupported) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="text-xs text-muted-foreground">{m.defaultsLabel}</span>
            {reasoningSupported && (
              <div className="flex items-center gap-2 text-xs">
                {m.reasoning}
                <Select onValueChange={value => void writeAgentDefault('agent.reasoning_effort', value)} value={effortValue}>
                  <SelectTrigger className={cn('min-w-28', CONTROL_TEXT)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EFFORT_VALUES.map(value => (
                      <SelectItem key={value} value={value}>
                        {value === 'none' ? m.reasoningOff : t.shell.modelOptions[effortLabelKey(value)]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {fastSupported && (
              <label className="flex items-center gap-2 text-xs">
                {t.shell.modelOptions.fast}
                <Switch
                  checked={fastOn}
                  onCheckedChange={checked => void writeAgentDefault('agent.service_tier', checked ? 'fast' : 'normal')}
                  size="xs"
                />
              </label>
            )}
          </div>
        )}
        {error && <div className="mt-2 text-xs text-destructive">{error}</div>}
        {visibleSwitchStaleAux.length > 0 && (
          <div className="mt-2">
            <StaleAuxWarning
              actionLabel={m.resetUnavailableAux}
              applying={applying}
              message={m.auxiliaryProviderUnavailable}
              onReset={() => void resetAuxiliaryModels()}
              slots={visibleSwitchStaleAux}
              taskLabel={auxiliaryTaskLabel}
            />
          </div>
        )}
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <SectionHeading icon={Cpu} title={m.auxiliaryTitle} />
          <Button
            disabled={!mainModel || applying}
            onClick={() => void resetAuxiliaryModels()}
            size="sm"
            variant="textStrong"
          >
            {m.resetAllToMain}
          </Button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          {m.auxiliaryDesc}
        </p>
        {visibleSwitchStaleAux.length === 0 && persistentStaleAux.length > 0 && (
          <div className="mb-2.5">
            <StaleAuxWarning
              actionLabel={m.resetUnavailableAux}
              applying={applying}
              message={m.auxiliaryProviderUnavailable}
              onReset={() => void resetAuxiliaryModels()}
              slots={persistentStaleAux}
              taskLabel={auxiliaryTaskLabel}
            />
          </div>
        )}
        <div className="grid gap-1">
          {AUX_TASKS.map(meta => {
            const copy = m.tasks[meta.key] ?? { label: meta.key, hint: meta.key }
            const current = auxiliary?.tasks.find(entry => entry.task === meta.key)
            const isAuto = !current || !current.provider || current.provider === 'auto'
            const isEditing = editingAuxTask === meta.key

            return (
              <ListRow
                action={
                  !isEditing && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        disabled={!mainModel || applying}
                        onClick={() => void setAuxiliaryToMain(meta.key)}
                        size="sm"
                        variant="text"
                      >
                        {m.setToMain}
                      </Button>
                      <Button
                        disabled={!providers.length || applying}
                        onClick={() => beginAuxiliaryEdit(meta.key)}
                        size="sm"
                        variant="textStrong"
                      >
                        {m.change}
                      </Button>
                    </div>
                  )
                }
                below={
                  isEditing && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 pt-1">
                      <Select
                        onValueChange={value => setAuxDraft(prev => ({ ...prev, provider: value, model: '' }))}
                        value={auxDraft.provider}
                      >
                        <SelectTrigger className={cn('min-w-32', CONTROL_TEXT)}>
                          <SelectValue placeholder={m.provider} />
                        </SelectTrigger>
                        <SelectContent>
                          {providerOptions.map(provider => (
                            <SelectItem key={provider.slug || 'none'} value={provider.slug || 'none'}>
                              <span className="inline-flex items-center gap-2">
                                <span>{provider.name}</span>
                                {!isProviderReady(provider) && (
                                  <span className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                                    {m.providerSetupRequired}
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {auxDraftNeedsSetup ? (
                        auxDraftSetupIsApiKey ? (
                          <>
                            <Input
                              autoComplete="off"
                              className={cn('min-w-56 flex-1', CONTROL_TEXT)}
                              onChange={event => setAuxApiKeyDraft(event.target.value)}
                              onKeyDown={event => {
                                if (event.key === 'Enter') {
                                  void activateAuxApiKeyProvider()
                                }
                              }}
                              placeholder={m.pasteProviderKey(auxDraftProviderRow?.key_env ?? 'API key')}
                              type="password"
                              value={auxApiKeyDraft}
                            />
                            <Button
                              disabled={!auxApiKeyDraft.trim() || auxActivating}
                              onClick={() => void activateAuxApiKeyProvider()}
                              size="sm"
                            >
                              {auxActivating && <Loader2 className="size-3.5 animate-spin" />}
                              {auxActivating ? m.activatingProvider : m.activateProvider}
                            </Button>
                          </>
                        ) : (
                          <Button onClick={startAuxProviderSetup} size="sm" variant="textStrong">
                            {m.setupProvider(auxDraftProviderRow?.name ?? 'provider')}
                          </Button>
                        )
                      ) : (
                        <>
                          <Select
                            onValueChange={value => setAuxDraft(prev => ({ ...prev, model: value }))}
                            value={auxDraft.model}
                          >
                            <SelectTrigger className={cn('min-w-48', CONTROL_TEXT)}>
                              <SelectValue placeholder={m.model} />
                            </SelectTrigger>
                            <SelectContent>
                              {(auxDraftProviderModels.length ? auxDraftProviderModels : []).map(model => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            disabled={!auxDraft.provider || !auxDraft.model || applying}
                            onClick={() => void applyAuxiliaryDraft(meta.key)}
                            size="sm"
                          >
                            {applying ? m.applying : t.common.apply}
                          </Button>
                        </>
                      )}
                      <Button onClick={() => setEditingAuxTask(null)} size="sm" variant="ghost">
                        {t.common.cancel}
                      </Button>
                    </div>
                  )
                }
                description={
                  <span className="font-mono text-[0.68rem]">
                    {isAuto
                      ? m.autoUseMain
                      : `${current.provider} · ${current.model || m.providerDefault}`}
                  </span>
                }
                key={meta.key}
                title={
                  <span className="flex items-baseline gap-2">
                    {copy.label}
                    <Pill>{copy.hint}</Pill>
                  </span>
                }
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}

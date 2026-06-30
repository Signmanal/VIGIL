import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { getVIGILConfigRecord } from '@/vigil'
import { useI18n } from '@/i18n'
import { AlertTriangle } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { McpServerConfig, VIGILConfigRecord } from '@/types/vigil'

export interface ProfileMcpSelection {
  selected: string[]
  servers: Record<string, McpServerConfig>
  touched: boolean
}

interface ProfileMcpPickerProps {
  active: boolean
  disabled?: boolean
  onSelectionChange: (selection: ProfileMcpSelection) => void
  sourceProfile: null | string
}

export function getMcpServers(config: VIGILConfigRecord | null): Record<string, McpServerConfig> {
  const raw = config?.mcp_servers

  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, McpServerConfig>) : {}
}

export function enabledMcpServerNames(servers: Record<string, McpServerConfig>): string[] {
  return Object.entries(servers)
    .filter(([, server]) => server?.disabled !== true)
    .map(([name]) => name)
}

export function applyMcpSelectionToConfig(
  config: VIGILConfigRecord,
  selection: ProfileMcpSelection
): VIGILConfigRecord {
  const chosen: Record<string, McpServerConfig> = {}

  for (const name of selection.selected) {
    const server = selection.servers[name]

    if (server) {
      const nextServer = { ...server }
      delete nextServer.disabled
      chosen[name] = nextServer
    }
  }

  const next = { ...config }

  if (Object.keys(chosen).length) {
    next.mcp_servers = chosen
  } else {
    delete next.mcp_servers
  }

  return next
}

export function mcpTransportLabel(server: McpServerConfig): string {
  if (typeof server.transport === 'string') {
    return server.transport
  }

  if (typeof server.url === 'string') {
    return 'http'
  }

  if (typeof server.command === 'string') {
    return 'stdio'
  }

  return 'custom'
}

export function ProfileMcpPicker({
  active,
  disabled = false,
  onSelectionChange,
  sourceProfile
}: ProfileMcpPickerProps) {
  const { t } = useI18n()
  const p = t.profiles
  const [servers, setServers] = useState<Record<string, McpServerConfig>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<null | string>(null)

  const source = sourceProfile || 'default'

  useEffect(() => {
    if (!active) {
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void getVIGILConfigRecord(source)
      .then(config => {
        if (cancelled) {
          return
        }

        const nextServers = getMcpServers(config)
        const initial = enabledMcpServerNames(nextServers)
        setServers(nextServers)
        setSelected(new Set(initial))
        onSelectionChange({ selected: initial, servers: nextServers, touched: false })
      })
      .catch(err => {
        if (cancelled) {
          return
        }

        setServers({})
        setSelected(new Set())
        setError(err instanceof Error ? err.message : p.failedLoadMcp)
        onSelectionChange({ selected: [], servers: {}, touched: false })
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [active, onSelectionChange, p.failedLoadMcp, source])

  const names = useMemo(() => Object.keys(servers).sort(), [servers])

  function publish(next: Set<string>) {
    const value = names.filter(name => next.has(name))
    setSelected(next)
    onSelectionChange({ selected: value, servers, touched: true })
  }

  function toggle(name: string, checked: boolean) {
    const next = new Set(selected)

    if (checked) {
      next.add(name)
    } else {
      next.delete(name)
    }

    publish(next)
  }

  function selectAll() {
    publish(new Set(names))
  }

  function clearAll() {
    publish(new Set())
  }

  const count = selected.size
  const total = names.length

  return (
    <div className="grid gap-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label className="text-xs font-medium">MCP</label>
          <p className="mt-0.5 text-xs text-muted-foreground">{p.startingMcpDesc(source)}</p>
        </div>
        <span className="shrink-0 text-[0.66rem] text-muted-foreground">{p.skillsSelected(count, total)}</span>
      </div>

      <div className="flex gap-2">
        <Button disabled={disabled || loading || total === 0} onClick={selectAll} size="xs" type="button" variant="outline">
          {p.selectAllSkills}
        </Button>
        <Button disabled={disabled || loading || total === 0} onClick={clearAll} size="xs" type="button" variant="outline">
          {p.clearSkills}
        </Button>
      </div>

      <div className="max-h-36 overflow-y-auto rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary)">
        {loading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">{p.loadingMcp}</div>
        ) : error ? (
          <div className="flex items-start gap-2 px-3 py-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : total === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">{p.noMcpAvailable}</div>
        ) : (
          names.map(name => {
            const server = servers[name]

            return (
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-2 border-b border-(--ui-stroke-secondary) px-3 py-2 last:border-b-0',
                  disabled && 'cursor-not-allowed opacity-60'
                )}
                key={name}
              >
                <input
                  checked={selected.has(name)}
                  className="mt-0.5"
                  disabled={disabled}
                  onChange={event => toggle(name, event.currentTarget.checked)}
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
    </div>
  )
}

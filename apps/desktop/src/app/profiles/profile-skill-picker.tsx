import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'
import { AlertTriangle } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { SkillInfo } from '@/types/vigil'
import { getSkills } from '@/vigil'

export interface ProfileSkillSelection {
  selected: string[]
  touched: boolean
}

interface ProfileSkillPickerProps {
  active: boolean
  disabled?: boolean
  onSelectionChange: (selection: ProfileSkillSelection) => void
  sourceProfile: null | string
}

function selectedNames(skills: SkillInfo[]): string[] {
  return skills.filter(skill => skill.enabled).map(skill => skill.name)
}

function searchTextMatches(value: string | undefined, query: string): boolean {
  return (value ?? '').toLowerCase().includes(query)
}

export function ProfileSkillPicker({
  active,
  disabled = false,
  onSelectionChange,
  sourceProfile
}: ProfileSkillPickerProps) {
  const { t } = useI18n()
  const p = t.profiles
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
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
    setSearch('')

    void getSkills(source)
      .then(nextSkills => {
        if (cancelled) {
          return
        }

        const initial = selectedNames(nextSkills)
        setSkills(nextSkills)
        setSelected(new Set(initial))
        onSelectionChange({ selected: initial, touched: false })
      })
      .catch(err => {
        if (cancelled) {
          return
        }

        setSkills([])
        setSelected(new Set())
        setError(err instanceof Error ? err.message : p.failedLoadSkills)
        onSelectionChange({ selected: [], touched: false })
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [active, onSelectionChange, p, source])

  const sortedSkills = useMemo(() => [...skills].sort((a, b) => a.name.localeCompare(b.name)), [skills])

  const filteredSkills = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) {
      return sortedSkills
    }

    return sortedSkills.filter(
      skill =>
        searchTextMatches(skill.name, query) ||
        searchTextMatches(skill.description, query) ||
        searchTextMatches(skill.category, query)
    )
  }, [search, sortedSkills])

  function publish(next: Set<string>) {
    const value = sortedSkills.map(skill => skill.name).filter(name => next.has(name))
    setSelected(next)
    onSelectionChange({ selected: value, touched: true })
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
    publish(new Set(sortedSkills.map(skill => skill.name)))
  }

  function clearAll() {
    publish(new Set())
  }

  const count = selected.size
  const total = sortedSkills.length

  return (
    <div className="grid gap-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label className="text-xs font-medium">{p.startingSkills}</label>
          <p className="mt-0.5 text-xs text-muted-foreground">{p.startingSkillsDesc(source)}</p>
        </div>
        <span className="shrink-0 text-[0.66rem] text-muted-foreground">{p.skillsSelected(count, total)}</span>
      </div>

      <Input
        disabled={disabled || loading || total === 0}
        onChange={event => setSearch(event.target.value)}
        placeholder={p.searchProfileSkills}
        value={search}
      />

      <div className="flex gap-2">
        <Button
          disabled={disabled || loading || total === 0}
          onClick={selectAll}
          size="xs"
          type="button"
          variant="outline"
        >
          {p.selectAllSkills}
        </Button>
        <Button
          disabled={disabled || loading || total === 0}
          onClick={clearAll}
          size="xs"
          type="button"
          variant="outline"
        >
          {p.clearSkills}
        </Button>
      </div>

      <div className="max-h-44 overflow-y-auto rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary)">
        {loading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">{p.loadingSkills}</div>
        ) : error ? (
          <div className="flex items-start gap-2 px-3 py-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : total === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">{p.noSkillsAvailable}</div>
        ) : filteredSkills.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">{p.noSkillSearchResults}</div>
        ) : (
          filteredSkills.map(skill => (
            <label
              className={cn(
                'flex cursor-pointer items-start gap-2 border-b border-(--ui-stroke-secondary) px-3 py-2 last:border-b-0',
                disabled && 'cursor-not-allowed opacity-60'
              )}
              key={skill.name}
            >
              <input
                checked={selected.has(skill.name)}
                className="mt-0.5"
                disabled={disabled}
                onChange={event => toggle(skill.name, event.currentTarget.checked)}
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
    </div>
  )
}

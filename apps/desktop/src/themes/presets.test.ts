import { describe, expect, it } from 'vitest'

import { BUILTIN_THEMES, BUILTIN_THEME_LIST, DEFAULT_SKIN_NAME, DEFAULT_TYPOGRAPHY, EMOJI_FALLBACK } from './presets'

// #40364: none of the UI text/mono fonts carry emoji glyphs, so every font
// stack must end with a color-emoji fallback or emoji render as tofu on
// platforms whose default font lacks them (e.g. Linux).
describe('theme typography emoji fallback (#40364)', () => {
  const stacks: Array<[string, string]> = [
    ['DEFAULT_TYPOGRAPHY.fontSans', DEFAULT_TYPOGRAPHY.fontSans],
    ['DEFAULT_TYPOGRAPHY.fontMono', DEFAULT_TYPOGRAPHY.fontMono],
    // A theme may override only fontMono (fontSans then falls back to the
    // default, which already carries the emoji stack), so skip undefined.
    ...BUILTIN_THEME_LIST.flatMap(theme =>
      (
        [
          [`${theme.name}.fontSans`, theme.typography?.fontSans],
          [`${theme.name}.fontMono`, theme.typography?.fontMono]
        ] as Array<[string, string | undefined]>
      ).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  ]

  it.each(stacks)('%s includes a color-emoji font', (_label, stack) => {
    expect(stack).toMatch(/Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji|(^|,\s*)emoji\b/)
  })

  it('EMOJI_FALLBACK lists the major platform emoji fonts', () => {
    expect(EMOJI_FALLBACK).toContain('Apple Color Emoji')
    expect(EMOJI_FALLBACK).toContain('Segoe UI Emoji')
    expect(EMOJI_FALLBACK).toContain('Noto Color Emoji')
  })
})

describe('sentinel default theme', () => {
  it('is the fresh-install default while preserving nous as a legacy built-in', () => {
    expect(DEFAULT_SKIN_NAME).toBe('sentinel')
    expect(BUILTIN_THEMES[DEFAULT_SKIN_NAME]).toBe(BUILTIN_THEMES.sentinel)
    expect(BUILTIN_THEMES.nous).toBeDefined()
  })

  it('carries the Sentinel Ops palette colors', () => {
    const theme = BUILTIN_THEMES.sentinel
    const colors = new Set([
      ...Object.values(theme.colors),
      ...Object.values(theme.darkColors ?? {}),
      ...Object.values(theme.terminal ?? {})
    ])

    for (const color of [
      '#08111F',
      '#111827',
      '#162033',
      '#1F2937',
      '#38BDF8',
      '#34D399',
      '#F59E0B',
      '#EF4444',
      '#E5E7EB',
      '#9CA3AF',
      '#334155'
    ]) {
      expect(colors).toContain(color)
    }
  })
})

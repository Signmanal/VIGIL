import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ActivityTimerText } from './activity-timer-text'
import { __resetElapsedTimerRegistryForTests, useElapsedSeconds } from './activity-timer'

function Probe({ active, timerKey }: { active: boolean; timerKey?: string }) {
  const elapsed = useElapsedSeconds(active, timerKey)

  return <span data-testid="elapsed">{elapsed}</span>
}

describe('useElapsedSeconds', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    __resetElapsedTimerRegistryForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
    __resetElapsedTimerRegistryForTests()
  })

  it('keeps elapsed time stable across remounts for the same key', () => {
    const first = render(<Probe active timerKey="tool:abc" />)

    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(screen.getByTestId('elapsed').textContent).toBe('5')

    first.unmount()

    act(() => {
      vi.advanceTimersByTime(3_000)
    })

    render(<Probe active timerKey="tool:abc" />)

    expect(screen.getByTestId('elapsed').textContent).toBe('8')
  })
})

describe('ActivityTimerText', () => {
  it('keeps thinking label and elapsed time together', () => {
    render(<ActivityTimerText prefix="思考中" seconds={17} />)

    expect(screen.getByText('思考中 17s')).toBeTruthy()
  })
})

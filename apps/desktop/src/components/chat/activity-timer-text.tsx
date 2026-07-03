import { cn } from '@/lib/utils'

import { formatElapsed } from './activity-timer'

interface ActivityTimerTextProps {
  seconds: number
  className?: string
  prefix?: string
}

export function ActivityTimerText({ seconds, className, prefix }: ActivityTimerTextProps) {
  const elapsed = formatElapsed(seconds)

  return (
    <span
      className={cn(
        // Tinted with --dt-midground (very low alpha) so the timer reads
        // as part of the same "live signal" cluster as the dither block /
        // arc-border / working-session dot, instead of being neutral chrome.
        'shrink-0 font-mono text-[0.56rem] leading-none tracking-[0.02em] text-midground/55 tabular-nums',
        className
      )}
    >
      {prefix ? `${prefix} ${elapsed}` : elapsed}
    </span>
  )
}

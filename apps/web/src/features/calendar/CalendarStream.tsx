import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Temporal } from '@js-temporal/polyfill'

/** Défilement continu borné ; conserve la position visible au recyclage des périodes. */
export function CalendarStream({
  anchor,
  scroll,
  onVisible,
  unit,
  children,
  initialOffset = 0,
}: {
  anchor: Temporal.PlainDate
  scroll: RefObject<HTMLDivElement | null>
  onVisible: (period: Temporal.PlainDate) => void
  unit: 'months' | 'years' | 'days'
  initialOffset?: number
  children: (period: Temporal.PlainDate) => ReactNode
}) {
  const limit = unit === 'years' ? 4 : unit === 'days' ? 5 : 8
  const step = (n: number) =>
    unit === 'years' ? { years: n } : unit === 'days' ? { days: n } : { months: n }
  const [range, setRange] = useState(() => ({
    first:
      anchor.subtract(step(1)).year < 0
        ? Temporal.PlainDate.from('0000-01-01')
        : anchor.subtract(step(1)),
    count: unit === 'months' ? 5 : 3,
  }))
  const container = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const pending = useRef<{ period: string; offset: number } | null>(null)
  const changing = useRef(false)
  useLayoutEffect(() => {
    const element = container.current,
      viewport = element?.closest<HTMLDivElement>('.native-scroll')
    if (!viewport || !element) return
    const saved = pending.current
    const key = saved?.period ?? anchor.toString()
    const target = element.querySelector<HTMLElement>(`[data-period="${key}"]`)
    if (target && (saved || !initialized.current)) {
      viewport.scrollBy({
        top:
          target.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top -
          (saved?.offset ?? -initialOffset),
        behavior: 'instant',
      })
    }
    initialized.current = true
    pending.current = null
    changing.current = false
  }, [range, anchor, scroll, initialOffset])
  useEffect(() => {
    const element = container.current,
      viewport = element?.closest<HTMLDivElement>('.native-scroll')
    if (!viewport || !element) return
    let frame = 0
    const update = () => {
      frame = 0
      const sections = Array.from(element.querySelectorAll<HTMLElement>('[data-period]'))
      const top = viewport.getBoundingClientRect().top
      const current =
        sections.filter((section) => section.getBoundingClientRect().top <= top + 24).at(-1) ??
        sections[0]
      if (!current) return
      const key = current.dataset.period!
      onVisible(Temporal.PlainDate.from(key))
      if (changing.current || viewport.closest('[data-zooming]')) return
      const nearTop =
        viewport.scrollTop < 250 && Temporal.PlainDate.compare(range.first, '0000-01-01') > 0
      const delta =
        unit === 'years'
          ? { years: range.count }
          : unit === 'days'
            ? { days: range.count }
            : { months: range.count }
      const nearEnd =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 500 &&
        canAdd(range.first, delta)
      if (!nearTop && !nearEnd) return
      pending.current = { period: key, offset: current.getBoundingClientRect().top - top }
      changing.current = true
      setRange((previous) =>
        nearTop
          ? {
              first: previous.first.subtract(
                unit === 'years' ? { years: 1 } : unit === 'days' ? { days: 1 } : { months: 1 },
              ),
              count: Math.min(limit, previous.count + 1),
            }
          : {
              first:
                previous.count >= limit
                  ? previous.first.add(
                      unit === 'years'
                        ? { years: 1 }
                        : unit === 'days'
                          ? { days: 1 }
                          : { months: 1 },
                    )
                  : previous.first,
              count: Math.min(limit, previous.count + 1),
            },
      )
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    viewport.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      viewport.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [scroll, onVisible, range, unit, limit])
  return (
    <div ref={container} className="calendar-stream">
      {Array.from({ length: range.count }, (_, index) => {
        if (!canAdd(range.first, step(index))) return null
        const period = range.first.add(step(index))
        return (
          <div key={period.toString()} data-period={period.toString()}>
            {children(period)}
          </div>
        )
      })}
    </div>
  )
}

function canAdd(date: Temporal.PlainDate, delta: Temporal.DurationLike) {
  try {
    return date.add(delta).year <= 275759
  } catch {
    return false
  }
}

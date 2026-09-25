import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Temporal } from '@js-temporal/polyfill'

/** Ajoute les périodes suivantes sans déplacer le scroll ; recycle seulement au repos. */
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
  children: (period: Temporal.PlainDate) => ReactNode
  initialOffset?: number
}) {
  const limit = unit === 'years' ? 10 : 16
  const step = (n: number) =>
    unit === 'years' ? { years: n } : unit === 'days' ? { days: n } : { months: n }
  const [range, setRange] = useState(() => {
    const previous = anchor.subtract(step(5))
    return {
      first: previous.year < 0 ? Temporal.PlainDate.from('0000-01-01') : previous,
      count: 11,
    }
  })
  const container = useRef<HTMLDivElement>(null)
  const touching = useRef(false)
  const initialized = useRef(false)
  const pending = useRef<{ period: string; offset: number } | null>(null)
  useLayoutEffect(() => {
    const element = container.current,
      viewport = element?.closest<HTMLDivElement>('.native-scroll')
    if (!element || !viewport) return
    const saved = pending.current
    const target = element.querySelector<HTMLElement>(
      `[data-period="${saved?.period ?? anchor.toString()}"]`,
    )
    if (target && (saved || !initialized.current)) {
      // Un positionnement absolu évite d'additionner une restauration Safari à notre décalage.
      let offset = saved?.offset ?? -initialOffset
      if (!saved && unit === 'years') {
        const today = target.querySelector<HTMLElement>('.today')
        if (today)
          offset = -Math.max(
            0,
            today.getBoundingClientRect().top -
              target.getBoundingClientRect().top -
              viewport.clientHeight / 2,
          )
      }
      viewport.scrollTo({
        top:
          viewport.scrollTop +
          target.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top -
          offset,
        behavior: 'instant',
      })
    }
    initialized.current = true
    pending.current = null
  }, [range, anchor, scroll, initialOffset, unit])
  useEffect(() => {
    const element = container.current,
      viewport = element?.closest<HTMLDivElement>('.native-scroll')
    if (!element || !viewport) return
    let frame = 0,
      idle = 0,
      changing = false
    const currentSection = () => {
      const sections = Array.from(element.querySelectorAll<HTMLElement>('[data-period]'))
      const top = viewport.getBoundingClientRect().top
      const current =
        sections.filter((section) => section.getBoundingClientRect().top <= top + 24).at(-1) ??
        sections[0]
      return { sections, current, top }
    }
    const settle = () => {
      if (touching.current || changing || viewport.closest('[data-zooming]')) return
      const { sections, current, top } = currentSection()
      if (!current) return
      const index = sections.indexOf(current)
      let first = range.first,
        count = range.count
      if (index < 3 && Temporal.PlainDate.compare(first, '0000-01-01') > 0) {
        for (let n = 0; n < 4; n++) {
          const previous = first.subtract(
            unit === 'years' ? { years: 1 } : unit === 'days' ? { days: 1 } : { months: 1 },
          )
          if (previous.year < 0) break
          first = previous
          count++
        }
      } else if (count > limit && index > 4) {
        const remove = index - 4
        first = first.add(
          unit === 'years'
            ? { years: remove }
            : unit === 'days'
              ? { days: remove }
              : { months: remove },
        )
        count -= remove
      }
      count = Math.min(count, limit)
      if (first.equals(range.first) && count === range.count) return
      // L'ajout en fin n'a jamais besoin d'une compensation de position.
      pending.current = {
        period: current.dataset.period!,
        offset: current.getBoundingClientRect().top - top,
      }
      changing = true
      setRange({ first, count })
    }
    const update = () => {
      frame = 0
      const { current } = currentSection()
      if (current) onVisible(Temporal.PlainDate.from(current.dataset.period!))
      if (changing || viewport.closest('[data-zooming]')) return
      const delta =
        unit === 'years'
          ? { years: range.count }
          : unit === 'days'
            ? { days: range.count }
            : { months: range.count }
      if (
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
          viewport.clientHeight * 1.5 &&
        canAdd(range.first, delta)
      ) {
        changing = true
        setRange((previous) => ({ ...previous, count: previous.count + 4 }))
      }
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
      clearTimeout(idle)
      idle = window.setTimeout(settle, 220)
    }
    const onStart = () => {
      touching.current = true
      clearTimeout(idle)
    }
    const onEnd = () => {
      touching.current = false
      onScroll()
    }
    viewport.addEventListener('scroll', onScroll, { passive: true })
    viewport.addEventListener('touchstart', onStart, { passive: true })
    viewport.addEventListener('touchend', onEnd, { passive: true })
    viewport.addEventListener('touchcancel', onEnd, { passive: true })
    onScroll()
    return () => {
      viewport.removeEventListener('scroll', onScroll)
      viewport.removeEventListener('touchstart', onStart)
      viewport.removeEventListener('touchend', onEnd)
      viewport.removeEventListener('touchcancel', onEnd)
      cancelAnimationFrame(frame)
      clearTimeout(idle)
    }
  }, [range, onVisible, scroll, unit, limit])
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

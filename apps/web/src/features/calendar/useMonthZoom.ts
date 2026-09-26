import { useLayoutEffect, useRef, type RefObject } from 'react'

type Origin = { grid: DOMRect; title: DOMRect; direction: 'in' | 'out'; month?: string }
/** Relie le mois et sa miniature dans les deux sens. */
export function useMonthZoom(view: string, date: string, scroll: RefObject<HTMLDivElement | null>) {
  const source = useRef<Origin | null>(null)
  useLayoutEffect(() => {
    const origin = source.current
    source.current = null
    if (!origin) return
    const viewport = scroll.current
    const root = viewport?.closest<HTMLElement>('.native-calendar')
    if (!viewport || !root) return
    const backwards = origin.direction === 'out'
    if (view !== (backwards ? 'year' : 'month')) return
    const miniature = backwards
      ? viewport.querySelector<HTMLElement>(`.mini-month[data-month="${origin.month}"]`)
      : null
    if (miniature) {
      const rect = miniature.getBoundingClientRect(),
        bounds = viewport.getBoundingClientRect()
      viewport.scrollBy({
        top: rect.top - bounds.top - (viewport.clientHeight - rect.height) / 2,
        behavior: 'instant',
      })
    }
    const grid = backwards
      ? miniature?.querySelector<HTMLElement>('.mini-grid')
      : viewport.querySelector<HTMLElement>('[data-current-anchor] .native-month-grid')
    const title = backwards
      ? miniature?.querySelector<HTMLElement>('h2')
      : root.querySelector<HTMLElement>('.native-heading h1')
    if (
      !grid ||
      !title ||
      typeof grid.animate !== 'function' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return
    const animate = (element: HTMLElement, start: DOMRect) => {
      const target = element.getBoundingClientRect()
      return element.animate(
        [
          {
            transform: `translate(${start.x - target.x}px, ${start.y - target.y}px) scale(${start.width / target.width}, ${start.height / target.height})`,
            opacity: backwards ? 1 : 0.65,
          },
          { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
        ],
        { duration: 460, easing: 'cubic-bezier(.22,.8,.22,1)', fill: 'both' },
      )
    }
    root.dataset.zooming = backwards ? 'out' : 'in'
    if (miniature) miniature.dataset.zoomTarget = 'true'
    const animations = [animate(grid, origin.grid), animate(title, origin.title)]
    if (backwards)
      for (const other of viewport.querySelectorAll<HTMLElement>(
        '.mini-month:not([data-zoom-target])',
      ))
        animations.push(
          other.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, fill: 'both' }),
        )
    const reset = () => {
      animations.forEach((animation) => animation.cancel())
      delete root.dataset.zooming
      if (miniature) delete miniature.dataset.zoomTarget
    }
    void Promise.all(animations.map((animation) => animation.finished))
      .then(reset)
      .catch(() => {})
    return reset
  }, [view, date, scroll])
  return {
    prepareMonthZoom(element: HTMLElement) {
      const grid = element.querySelector('.mini-grid'),
        title = element.querySelector('h2')
      if (grid && title)
        source.current = {
          grid: grid.getBoundingClientRect(),
          title: title.getBoundingClientRect(),
          direction: 'in',
        }
    },
    prepareYearZoom(month: string) {
      const grid = scroll.current?.querySelector(`[data-month="${month}"] .native-month-grid`)
      const title = scroll.current?.closest('.native-calendar')?.querySelector('.native-heading h1')
      if (grid && title)
        source.current = {
          grid: grid.getBoundingClientRect(),
          title: title.getBoundingClientRect(),
          direction: 'out',
          month,
        }
    },
  }
}

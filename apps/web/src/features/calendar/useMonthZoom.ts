import { useLayoutEffect, useRef, type RefObject } from 'react'

/** Relie la grille et le titre du mois à leur position dans la vue annuelle. */
export function useMonthZoom(view: string, date: string, scroll: RefObject<HTMLDivElement | null>) {
  const source = useRef<{ grid: DOMRect; title: DOMRect } | null>(null)
  useLayoutEffect(() => {
    const origin = source.current
    source.current = null
    if (!origin || view !== 'month' || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return
    const root = scroll.current?.closest<HTMLElement>('.native-calendar')
    const grid = scroll.current?.querySelector<HTMLElement>(
      '[data-current-anchor] .native-month-grid',
    )
    const title = root?.querySelector<HTMLElement>('.native-heading h1')
    if (!root || !grid || !title || typeof grid.animate !== 'function') return
    const animate = (element: HTMLElement, start: DOMRect) => {
      const target = element.getBoundingClientRect()
      return element.animate(
        [
          {
            transform: `translate(${start.x - target.x}px, ${start.y - target.y}px) scale(${start.width / target.width}, ${start.height / target.height})`,
            opacity: 0.65,
          },
          { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
        ],
        { duration: 460, easing: 'cubic-bezier(.22,.8,.22,1)', fill: 'both' },
      )
    }
    root.dataset.zooming = 'true'
    const animations = [animate(grid, origin.grid), animate(title, origin.title)]
    void Promise.all(animations.map((animation) => animation.finished))
      .then(() => {
        animations.forEach((animation) => animation.cancel())
        delete root.dataset.zooming
      })
      .catch(() => {})
    return () => {
      animations.forEach((animation) => animation.cancel())
      delete root.dataset.zooming
    }
  }, [view, date, scroll])

  return (element: HTMLElement) => {
    const grid = element.querySelector('.mini-grid'),
      title = element.querySelector('h2')
    if (grid && title)
      source.current = { grid: grid.getBoundingClientRect(), title: title.getBoundingClientRect() }
  }
}

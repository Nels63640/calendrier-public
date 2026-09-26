import { useRef, type PointerEvent, type MouseEvent } from 'react'

/** Distingue le balayage journalier du défilement des heures et de l'appui long. */
export function useDaySwipe(enabled: boolean, onMove: (direction: number) => void) {
  const gesture = useRef<{
    pointer: number
    x: number
    y: number
    started: number
    horizontal: boolean
  } | null>(null)
  const suppressClick = useRef(0)
  function cancel() {
    gesture.current = null
  }
  return {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      cancel()
      if (
        !enabled ||
        !event.isPrimary ||
        event.button !== 0 ||
        !(event.target as Element).closest('.day-scroll, .native-week-strip')
      )
        return
      suppressClick.current = 0
      gesture.current = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        started: performance.now(),
        horizontal: false,
      }
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const value = gesture.current
      if (!value || value.pointer !== event.pointerId) return
      const dx = Math.abs(event.clientX - value.x)
      const dy = Math.abs(event.clientY - value.y)
      if (!value.horizontal) {
        if (dy > 10 && dy >= dx) return cancel()
        if (dx <= 10 || dx <= dy * 1.5) return
        if (performance.now() - value.started >= 450) return cancel()
        value.horizontal = true
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      suppressClick.current = performance.now() + 500
      event.preventDefault()
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      const value = gesture.current
      cancel()
      if (!enabled || !value || value.pointer !== event.pointerId || !value.horizontal) return
      suppressClick.current = performance.now() + 500
      const dx = event.clientX - value.x
      const dy = event.clientY - value.y
      if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onMove(dx < 0 ? 1 : -1)
    },
    onPointerCancel: cancel,
    onLostPointerCapture(event: PointerEvent<HTMLDivElement>) {
      if (event.target === event.currentTarget) cancel()
    },
    onClickCapture(event: MouseEvent<HTMLDivElement>) {
      if (performance.now() < suppressClick.current) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
  }
}

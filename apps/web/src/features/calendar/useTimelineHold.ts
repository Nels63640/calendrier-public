import { useEffect, useRef, type PointerEvent } from 'react'

/** Un appui immobile crée un créneau ; un déplacement laisse le défilement natif agir. */
export function useTimelineHold(onCreate: (minute: number) => void) {
  const pending = useRef<{ timer: number; x: number; y: number; pointer: number } | null>(null)
  const cancel = () => {
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = null
  }
  useEffect(() => {
    const stop = () => {
      if (pending.current) clearTimeout(pending.current.timer)
      pending.current = null
    }
    document.addEventListener('scroll', stop, true)
    window.addEventListener('blur', stop)
    return () => {
      stop()
      document.removeEventListener('scroll', stop, true)
      window.removeEventListener('blur', stop)
    }
  }, [])
  return {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      cancel()
      if (
        event.button !== 0 ||
        !event.isPrimary ||
        (event.target as HTMLElement).closest('button,a,input,select,textarea')
      )
        return
      const x = event.clientX,
        y = event.clientY
      const offset = y - event.currentTarget.getBoundingClientRect().top
      const minute = Math.max(0, Math.min(1425, Math.round(((offset / 50) * 60) / 15) * 15))
      pending.current = {
        x,
        y,
        pointer: event.pointerId,
        timer: window.setTimeout(() => {
          pending.current = null
          onCreate(minute)
        }, 500),
      }
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const value = pending.current
      if (
        value &&
        (event.pointerId !== value.pointer ||
          Math.hypot(event.clientX - value.x, event.clientY - value.y) > 10)
      )
        cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu(event: { preventDefault: () => void }) {
      event.preventDefault()
    },
  }
}

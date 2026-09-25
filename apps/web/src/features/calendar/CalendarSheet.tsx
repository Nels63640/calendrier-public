import { useEffect, useRef, type ReactNode } from 'react'

export function CalendarSheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closing = useRef(false)
  const exitAnimation = useRef<Animation | null>(null)
  function close() {
    if (closing.current) return
    const dialog = ref.current
    if (!dialog || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose()
      return
    }
    closing.current = true
    exitAnimation.current = dialog.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(10px)' },
      ],
      { duration: 130, easing: 'ease-in', fill: 'forwards' },
    )
    void exitAnimation.current.finished.then(onClose).catch(() => {})
  }
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => {
      exitAnimation.current?.cancel()
      dialog?.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="native-sheet"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" onClick={close} aria-label="Fermer">
          Fermer
        </button>
      </header>
      {children}
    </dialog>
  )
}

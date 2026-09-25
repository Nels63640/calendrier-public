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
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => {
      dialog?.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="native-sheet"
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Fermer">
          Fermer
        </button>
      </header>
      {children}
    </dialog>
  )
}

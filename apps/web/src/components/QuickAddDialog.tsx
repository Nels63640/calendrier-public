import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { Icon, type IconName } from './Icon'

const options: { label: string; detail: string; path: string; icon: IconName }[] = [
  {
    label: 'Un événement',
    detail: 'Un moment à retrouver dans le calendrier',
    path: '/calendrier',
    icon: 'calendar',
  },
  {
    label: 'Une tâche',
    detail: 'Les petites choses à ne pas oublier',
    path: '/taches',
    icon: 'tasks',
  },
  {
    label: 'Une course',
    detail: 'Les essentiels pour la maison',
    path: '/courses',
    icon: 'basket',
  },
  {
    label: 'Une période de garde',
    detail: 'Le rythme de votre famille',
    path: '/garde',
    icon: 'people',
  },
]

export function QuickAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (open && dialog && !dialog.open) dialog.showModal()
    if (!open && dialog?.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="quick-dialog"
      aria-labelledby="quick-title"
      aria-describedby="quick-description"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="dialog-top">
        <p className="eyebrow">Un quotidien plus léger</p>
        <button className="icon-button" aria-label="Fermer" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <h2 id="quick-title">Que souhaitez-vous ajouter ?</h2>
      <p id="quick-description" className="muted">
        Choisissez ce que vous souhaitez ajouter à votre foyer.
      </p>
      <div className="quick-options">
        {options.map((option) => (
          <Link className="quick-option" key={option.path} to={option.path} onClick={onClose}>
            <span className="small-icon">
              <Icon name={option.icon} />
            </span>
            <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
            <Icon name="arrow" size={18} />
          </Link>
        ))}
      </div>
    </dialog>
  )
}

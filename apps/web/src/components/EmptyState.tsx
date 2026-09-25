import { Icon, type IconName } from './Icon'

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: IconName
  title: string
  children: string
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  )
}

import type { IconName } from '../components/Icon'

export const navigation: { path: string; label: string; icon: IconName; mobile: boolean }[] = [
  { path: '/', label: 'Accueil', icon: 'home', mobile: true },
  { path: '/calendrier', label: 'Calendrier', icon: 'calendar', mobile: true },
  { path: '/taches', label: 'Tâches', icon: 'tasks', mobile: true },
  { path: '/courses', label: 'Courses', icon: 'basket', mobile: false },
  { path: '/garde', label: 'Garde alternée', icon: 'people', mobile: false },
  { path: '/profil', label: 'Profil', icon: 'profile', mobile: true },
]

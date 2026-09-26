export function notificationContent(input: unknown) {
  const value = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  if (value.kind === 'activity') {
    const routes: Record<string, string> = {
      event: '/calendrier',
      task: '/taches',
      shopping: '/courses',
      child: '/foyer',
      category: '/foyer',
      member: '/foyer',
      invitation: '/foyer',
      profile: '/foyer',
      household: '/foyer',
    }
    const subjects: Record<string, string> = {
      event: 'Un événement',
      task: 'Une tâche',
      shopping: 'La liste de courses',
      child: 'Les informations d’un enfant',
      category: 'Une catégorie',
      member: 'Les membres du foyer',
      invitation: 'Les invitations',
      profile: 'Un profil',
      household: 'Votre foyer',
    }
    const entity =
      typeof value.entity === 'string' && Object.hasOwn(routes, value.entity)
        ? value.entity
        : 'household'
    const action =
      value.action === 'created'
        ? 'Ajout'
        : value.action === 'deleted'
          ? 'Suppression'
          : 'Modification'
    return {
      title: 'Calendrier familial',
      body: action + ' · ' + subjects[entity] + '.',
      tag: typeof value.id === 'string' ? 'activity-' + value.id.slice(0, 80) : 'family-activity',
      url: routes[entity]!,
    }
  }
  // Aucun titre, lieu ou nom de personne sur l’écran verrouillé.
  return {
    title: 'Calendrier familial',
    body:
      value.kind === 'reminder'
        ? 'Un rappel vous attend dans votre espace.'
        : 'Votre notification de test est arrivée.',
    tag: typeof value.id === 'string' ? value.id.slice(0, 80) : 'family-calendar-test',
    url: value.kind === 'reminder' ? '/calendrier' : '/profil/notifications',
  }
}

export function safeNotificationUrl(value: unknown, origin: string) {
  if (typeof value !== 'string') return new URL('/profil/notifications', origin).href
  try {
    const url = new URL(value, origin)
    if (
      url.origin === origin &&
      ['/profil/notifications', '/calendrier', '/taches', '/courses', '/foyer'].includes(
        url.pathname,
      )
    ) {
      return new URL(url.pathname, origin).href
    }
  } catch {
    /* Les liens non valides reviennent à la page de diagnostic. */
  }
  return new URL('/profil/notifications', origin).href
}

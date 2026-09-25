export function notificationContent(input: unknown) {
  const value = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  // Aucun contenu familial dans les notifications d’essai.
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
    if (url.origin === origin && ['/profil/notifications', '/calendrier'].includes(url.pathname)) {
      return new URL(url.pathname, origin).href
    }
  } catch {
    /* Les liens non valides reviennent à la page de diagnostic. */
  }
  return new URL('/profil/notifications', origin).href
}

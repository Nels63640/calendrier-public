import { ZodError } from 'zod'

export class AccountError extends Error {}

export function accountError(error: unknown): AccountError {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  const messages: Record<string, string> = {
    invalid_credentials: 'L’adresse e-mail ou le mot de passe est incorrect.',
    email_not_confirmed:
      'Votre adresse e-mail doit encore être vérifiée. Utilisez le lien « Vérifier mon adresse e-mail ».',
    otp_expired: 'Ce code est incorrect ou expiré. Vous pouvez demander un nouveau code.',
    otp_disabled: 'La vérification par code n’est pas disponible pour le moment.',
    over_email_send_rate_limit:
      'Un e-mail vient déjà d’être demandé. Patientez avant de recommencer.',
    over_request_rate_limit: 'Trop de tentatives. Patientez avant de recommencer.',
    weak_password:
      'Ce mot de passe est trop faible. Choisissez une phrase plus longue et difficile à deviner.',
    same_password: 'Choisissez un mot de passe différent du précédent.',
    session_not_found: 'Votre session a expiré. Connectez-vous de nouveau.',
    refresh_token_not_found: 'Votre session a expiré. Connectez-vous de nouveau.',
    '23514':
      'Le profil contient une valeur non autorisée. Vérifiez le prénom et le fuseau horaire.',
  }
  return new AccountError(
    typeof code === 'string' && messages[code]
      ? messages[code]
      : 'L’opération n’a pas abouti. Vérifiez votre connexion, puis réessayez.',
  )
}

export function formError(error: unknown) {
  if (error instanceof ZodError)
    return error.issues[0]?.message ?? 'Vérifiez les champs du formulaire.'
  if (error instanceof AccountError) return error.message
  return 'L’opération n’a pas abouti. Vous pouvez réessayer.'
}

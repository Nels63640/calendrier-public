import { supabase } from '../../data/supabase'
import { AccountError } from '../auth/auth-errors'
import type { FamilyRecord, EventException, Kind } from '../../../../../packages/domain/src/family'
import { schemas } from '../../../../../packages/domain/src/family'

export interface Household {
  id: string
  name: string
  created_at: string
}
export interface Member {
  user_id: string
  role: 'owner' | 'admin' | 'member'
  first_name: string
}
export interface Snapshot {
  name?: string
  members: Member[]
  records: FamilyRecord[]
  exceptions: EventException[]
  invitations: { id: string; role: string; expires_at: string; used: boolean }[]
}
export const emptySnapshot: Snapshot = { members: [], records: [], exceptions: [], invitations: [] }
export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new AccountError('Connectez votre espace pour continuer.')
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    const message = error.message
    const known: Record<string, string> = {
      CONFLICT:
        'Cette donnée a changé sur un autre appareil. Actualisez puis vérifiez votre saisie avant de recommencer.',
      FORBIDDEN: 'Vous n’avez plus accès à cette action. Actualisez votre espace.',
      INVALID_INVITATION: 'Cette invitation est invalide, expirée ou réservée à une autre adresse.',
      LIMIT: 'La limite de cet espace est atteinte. Réessayez plus tard ou archivez des éléments.',
      IN_USE: 'Cet élément est encore utilisé dans un événement.',
      TRANSFER_OWNERSHIP:
        'Transférez ou supprimez les foyers dont vous êtes propriétaire avant de supprimer votre compte.',
      EXCEPTION_CONFLICT:
        'Cette série possède des exceptions incompatibles avec ce changement. Modifiez une occurrence ou les suivantes.',
      INVALID_MEMBER: 'Une personne sélectionnée ne fait plus partie du foyer.',
      CONFIRMATION: 'Le texte de confirmation ne correspond pas.',
    }
    throw new AccountError(
      known[message] ?? 'L’enregistrement a échoué. Vérifiez les champs et votre connexion.',
    )
  }
  return data as T
}
export async function listHouseholds(): Promise<Household[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('households')
    .select('id,name,created_at')
    .order('created_at')
  if (error)
    throw new AccountError(
      'Impossible de charger vos foyers. Vérifiez la connexion et le raccordement de la base.',
    )
  return data
}
export interface SaveCommand {
  p_household: string
  p_id: string
  p_kind: Kind
  p_payload: unknown
  p_version: number
  p_mutation: string
  p_delete: boolean
}
export function saveCommand(
  household: string,
  kind: Kind,
  payload: unknown,
  existing?: FamilyRecord,
  deleted = false,
): SaveCommand {
  const validated = schemas[kind].parse(payload)
  return {
    p_household: household,
    p_id: existing?.id ?? crypto.randomUUID(),
    p_kind: kind,
    p_payload: validated,
    p_version: existing?.version ?? 0,
    p_mutation: crypto.randomUUID(),
    p_delete: deleted,
  }
}

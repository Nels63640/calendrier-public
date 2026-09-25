import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .email('Indiquez une adresse e-mail valide.')
  .max(254, 'Cette adresse est trop longue.')
export const passwordSchema = z
  .string()
  .min(12, 'Choisissez un mot de passe d’au moins 12 caractères.')
  .max(128, 'Le mot de passe doit contenir au plus 128 caractères.')
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Indiquez votre prénom.')
  .max(60, 'Le prénom doit contenir au plus 60 caractères.')
  .refine((value) => !/[\p{Cc}]/u.test(value), 'Le prénom contient un caractère non autorisé.')
export const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6,10}$/, 'Saisissez le code reçu par e-mail (6 à 10 chiffres).')
export const avatarSchema = z.enum(['profile', 'sun', 'leaf', 'home'])
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('fr', { timeZone: value }).format()
      return !/^[+-]/.test(value)
    } catch {
      return false
    }
  }, 'Choisissez un fuseau horaire reconnu, par exemple Europe/Paris.')

export const profileSchema = z.object({
  first_name: nameSchema,
  avatar: avatarSchema,
  time_zone: timeZoneSchema,
})
export type ProfileValues = z.infer<typeof profileSchema>
export interface Profile extends ProfileValues {
  id: string
  created_at: string
  updated_at: string
}

export function confirmPassword(password: string, confirmation: string) {
  const result = passwordSchema.parse(password)
  if (result !== confirmation) throw new Error('Les deux mots de passe doivent être identiques.')
  return result
}

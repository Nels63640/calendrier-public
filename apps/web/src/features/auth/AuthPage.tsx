import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { PageHeading } from '../../components/PageHeading'
import { useAccount } from './auth-context'
import { accountApi } from './account-api'
import { AccountError } from './auth-errors'
import { useAccountAction } from './useAccountAction'

type Mode = 'connexion' | 'inscription' | 'verification' | 'recuperation'
const titles: Record<Mode, string> = {
  connexion: 'Heureux de vous retrouver',
  inscription: 'Votre quotidien commence ici',
  verification: 'Vérifiez votre adresse',
  recuperation: 'Retrouver votre compte',
}

export function AuthPage({ mode }: { mode: Mode }) {
  const account = useAccount()
  const navigate = useNavigate()
  const action = useAccountAction()
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'request' | 'code' | 'password'>(
    mode === 'verification' ? 'code' : 'request',
  )
  const unavailable = account.status === 'unavailable'
  const codeStep = step === 'code'
  const passwordStep = step === 'password'
  const needsPassword = mode === 'connexion' || mode === 'inscription' || passwordStep

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    void action.run(async () => {
      const password = String(data.get('password') ?? '')
      if ((mode === 'inscription' || passwordStep) && password !== data.get('confirmation'))
        throw new AccountError('Les deux mots de passe doivent être identiques.')
      if (mode === 'connexion') {
        await accountApi.signIn(email, password)
        form.reset()
        navigate('/')
      } else if (mode === 'inscription') {
        const connected = await accountApi.signUp(email, password, String(data.get('first_name')))
        form.reset()
        if (connected) navigate('/')
        else navigate('/auth/verification')
      } else if (passwordStep) {
        await accountApi.changePassword(password)
        form.reset()
        navigate('/')
      } else if (codeStep) {
        await accountApi.verify(
          email,
          String(data.get('code')),
          mode === 'verification' ? 'email' : 'recovery',
        )
        form.reset()
        if (mode === 'verification') navigate('/')
        else setStep('password')
      } else {
        await accountApi.sendCode(email, 'recovery')
        setStep('code')
        return 'Si un compte correspond à cette adresse, un code vous a été envoyé.'
      }
    })
  }

  return (
    <>
      <PageHeading eyebrow="VOTRE ESPACE PERSONNEL" title={titles[mode]}>
        Un compte pour préparer votre organisation en famille.
      </PageHeading>
      <section className="settings-card account-card">
        {unavailable && (
          <p role="status" className="account-notice">
            Les comptes ne sont pas encore activés dans cet espace. Vous pouvez continuer à
            découvrir l’application.
          </p>
        )}
        {mode === 'verification' && (
          <p>Saisissez l’adresse utilisée à l’inscription et le code reçu par e-mail.</p>
        )}
        {passwordStep && <p>Votre code a été vérifié. Choisissez votre nouveau mot de passe.</p>}
        <form onSubmit={submit} className="account-form" aria-busy={action.busy}>
          <fieldset disabled={unavailable || action.busy}>
            {mode === 'inscription' && (
              <label>
                Prénom
                <input name="first_name" autoComplete="given-name" required maxLength={60} />
              </label>
            )}
            {!passwordStep && (
              <label>
                Adresse e-mail
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            )}
            {codeStep && (
              <label>
                Code reçu par e-mail
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6,10}"
                  minLength={6}
                  maxLength={10}
                  required
                />
              </label>
            )}
            {needsPassword && (
              <label>
                {passwordStep ? 'Nouveau mot de passe' : 'Mot de passe'}
                <input
                  name="password"
                  type="password"
                  autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'connexion' ? 1 : 12}
                  maxLength={128}
                  aria-describedby={mode === 'connexion' ? undefined : 'password-help'}
                />
              </label>
            )}
            {(mode === 'inscription' || passwordStep) && (
              <>
                <p id="password-help" className="muted">
                  Au moins 12 caractères. Une longue phrase est facile à retenir.
                </p>
                <label>
                  Confirmer le mot de passe
                  <input
                    name="confirmation"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
              </>
            )}
            <button className="button primary" type="submit">
              {action.busy
                ? 'Un instant…'
                : passwordStep
                  ? 'Enregistrer le mot de passe'
                  : codeStep
                    ? 'Vérifier le code'
                    : mode === 'connexion'
                      ? 'Se connecter'
                      : mode === 'inscription'
                        ? 'Créer mon compte'
                        : 'Recevoir un code'}
            </button>
            {codeStep && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  void action.run(async () => {
                    await accountApi.sendCode(email, mode === 'verification' ? 'email' : 'recovery')
                    return 'Si cette adresse est éligible, un nouveau code a été envoyé.'
                  })
                }}
              >
                Renvoyer un code
              </button>
            )}
          </fieldset>
          <p role={action.failed ? 'alert' : 'status'} className="account-feedback">
            {action.message}
          </p>
        </form>
        <nav className="account-links" aria-label="Accès au compte">
          {mode !== 'connexion' && <Link to="/auth/connexion">J’ai déjà un compte</Link>}
          {mode !== 'inscription' && <Link to="/auth/inscription">Créer un compte</Link>}
          {mode === 'connexion' && (
            <>
              <Link to="/auth/recuperation">Mot de passe oublié</Link>
              <Link to="/auth/verification">Vérifier mon adresse e-mail</Link>
            </>
          )}
          <Link to="/profil">Retour au profil</Link>
        </nav>
      </section>
    </>
  )
}

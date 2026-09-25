import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { PageHeading } from '../../components/PageHeading'
import { useAccountAction } from '../auth/useAccountAction'
import { useAccount } from '../auth/auth-context'
import { useFamily } from './family-context'
import { rpc } from './family-api'
import type { Child, Category } from '../../../../../packages/domain/src/family'

export function HouseholdPage() {
  const account = useAccount(),
    family = useFamily(),
    action = useAccountAction()
  const [token, setToken] = useState('')
  const role = family.snapshot.members.find((m) => m.user_id === account.user?.id)?.role
  const admin = role === 'owner' || role === 'admin'
  const household = family.households.find((h) => h.id === family.active)
  function submit(event: FormEvent<HTMLFormElement>, task: (data: FormData) => Promise<void>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    void action.run(async () => {
      await task(data)
      form.reset()
      await family.refresh()
    })
  }
  return (
    <>
      <PageHeading eyebrow="VOTRE PETIT MONDE" title="Votre foyer">
        Les personnes et les repères qui vous réunissent.
      </PageHeading>
      {!account.user ? (
        <section className="settings-card">
          <p>Connectez-vous pour créer ou rejoindre un foyer.</p>
          <Link to="/auth/connexion" className="button primary">
            Se connecter
          </Link>
        </section>
      ) : (
        <>
          <details className="page-fold" open={!household}>
            <summary>
              {household ? 'Créer ou rejoindre un autre foyer' : 'Créer ou rejoindre un foyer'}
            </summary>
            <div className="family-columns">
              <section className="settings-card">
                <h2>Créer un foyer</h2>
                <form
                  className="account-form"
                  onSubmit={(e) =>
                    submit(e, async (data) => {
                      const id = await rpc<string>('create_household', { p_name: data.get('name') })
                      await family.refresh()
                      family.select(id)
                    })
                  }
                >
                  <fieldset disabled={action.busy}>
                    <label>
                      Nom du foyer
                      <input
                        name="name"
                        required
                        maxLength={100}
                        placeholder="Le nom de votre famille"
                      />
                    </label>
                    <button className="button primary">Créer le foyer</button>
                  </fieldset>
                </form>
              </section>
              <section className="settings-card">
                <h2>Rejoindre un foyer</h2>
                <form
                  className="account-form"
                  onSubmit={(e) =>
                    submit(e, async (data) => {
                      const id = await rpc<string>('accept_invitation', {
                        p_token: String(data.get('code')).trim(),
                      })
                      await family.refresh()
                      family.select(id)
                    })
                  }
                >
                  <fieldset disabled={action.busy}>
                    <label>
                      Code d’invitation
                      <input
                        name="code"
                        required
                        minLength={64}
                        maxLength={64}
                        autoComplete="off"
                      />
                    </label>
                    <button className="button primary">Rejoindre le foyer</button>
                  </fieldset>
                </form>
              </section>
            </div>
          </details>
          {household && (
            <>
              <section className="settings-card">
                <h2>Les membres de {household.name}</h2>
                <ul className="family-list">
                  {family.snapshot.members.map((member) => (
                    <li key={member.user_id}>
                      <div>
                        <strong>{member.first_name}</strong>
                        <span className="muted">
                          {' '}
                          ·{' '}
                          {member.role === 'owner'
                            ? 'Propriétaire'
                            : member.role === 'admin'
                              ? 'Administrateur'
                              : 'Membre'}
                        </span>
                      </div>
                      <div className="row-actions">
                        {role === 'owner' && member.user_id !== account.user?.id && (
                          <>
                            <button
                              className="button"
                              disabled={action.busy}
                              onClick={() => {
                                void action.run(async () => {
                                  await rpc('manage_member', {
                                    p_household: family.active,
                                    p_user: member.user_id,
                                    p_action: member.role === 'admin' ? 'member' : 'admin',
                                  })
                                  await family.refresh()
                                })
                              }}
                            >
                              {member.role === 'admin' ? 'Passer membre' : 'Nommer administrateur'}
                            </button>
                            <details>
                              <summary>Transférer la propriété</summary>
                              <button
                                className="button"
                                onClick={() => {
                                  void action.run(async () => {
                                    await rpc('manage_member', {
                                      p_household: family.active,
                                      p_user: member.user_id,
                                      p_action: 'transfer',
                                    })
                                    await family.refresh()
                                  })
                                }}
                              >
                                Confirmer le transfert à {member.first_name}
                              </button>
                            </details>
                          </>
                        )}
                        {admin &&
                          member.role !== 'owner' &&
                          member.user_id !== account.user?.id && (
                            <details>
                              <summary>Retirer du foyer</summary>
                              <button
                                className="button"
                                onClick={() => {
                                  void action.run(async () => {
                                    await rpc('manage_member', {
                                      p_household: family.active,
                                      p_user: member.user_id,
                                      p_action: 'remove',
                                    })
                                    await family.refresh()
                                  })
                                }}
                              >
                                Confirmer le retrait
                              </button>
                            </details>
                          )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
              {admin && (
                <details className="page-fold">
                  <summary>Inviter un proche</summary>
                  <p>
                    Le code est utilisable une seule fois pendant 7 jours. Transmettez-le à la
                    personne de votre choix.
                  </p>
                  <form
                    className="account-form"
                    onSubmit={(e) =>
                      submit(e, async (data) => {
                        setToken(
                          await rpc<string>('create_invitation', {
                            p_household: family.active,
                            p_email: String(data.get('email') || '') || null,
                            p_role: data.get('role'),
                          }),
                        )
                      })
                    }
                  >
                    <fieldset disabled={action.busy}>
                      <label>
                        Réserver à une adresse e-mail (facultatif)
                        <input name="email" type="email" maxLength={254} />
                      </label>
                      <label>
                        Rôle
                        <select name="role">
                          <option value="member">Membre</option>
                          {role === 'owner' && <option value="admin">Administrateur</option>}
                        </select>
                      </label>
                      <button className="button primary">Créer un code d’invitation</button>
                    </fieldset>
                  </form>
                  {token && (
                    <label className="invite-code">
                      Code à transmettre
                      <input readOnly value={token} onFocus={(e) => e.target.select()} />
                    </label>
                  )}
                  <ul className="family-list">
                    {family.snapshot.invitations
                      .filter((i) => !i.used)
                      .map((i) => (
                        <li key={i.id}>
                          <span>
                            Invitation valable jusqu’au{' '}
                            {new Date(i.expires_at).toLocaleDateString('fr')}
                          </span>
                          <button
                            className="button"
                            onClick={() => {
                              void action.run(async () => {
                                await rpc('revoke_invitation', {
                                  p_household: family.active,
                                  p_id: i.id,
                                })
                                setToken('')
                                await family.refresh()
                              })
                            }}
                          >
                            Révoquer
                          </button>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
              {(['child', 'category'] as const).map((kind) => (
                <details className="page-fold" key={kind}>
                  <summary>{kind === 'child' ? 'Les enfants' : 'Les catégories'}</summary>
                  <p className="muted">
                    {kind === 'child'
                      ? 'Seulement un prénom, une couleur et une illustration. Aucun compte enfant nécessaire.'
                      : 'Des couleurs pour retrouver vos activités en un regard.'}
                  </p>
                  <ul className="family-list">
                    {family.snapshot.records
                      .filter((r) => r.kind === kind)
                      .map((r) => (
                        <li key={r.id}>
                          <span
                            className="color-mark"
                            style={{ background: (r.payload as Child | Category).color }}
                          />
                          <strong>{r.payload.title}</strong>
                          {admin && (
                            <details>
                              <summary>Supprimer</summary>
                              <button
                                className="button"
                                onClick={() => {
                                  void action.run(() => family.save(kind, r.payload, r, true))
                                }}
                              >
                                Confirmer la suppression
                              </button>
                            </details>
                          )}
                        </li>
                      ))}
                  </ul>
                  {admin && (
                    <form
                      className="account-form"
                      onSubmit={(e) =>
                        submit(e, async (data) => {
                          await family.save(kind, {
                            title: data.get('title'),
                            color: data.get('color'),
                            ...(kind === 'child' ? { avatar: data.get('avatar') } : {}),
                          })
                        })
                      }
                    >
                      <fieldset disabled={action.busy}>
                        <label>
                          {kind === 'child' ? 'Prénom de l’enfant' : 'Nom de la catégorie'}
                          <input name="title" required maxLength={120} />
                        </label>
                        <label>
                          Couleur
                          <input type="color" name="color" defaultValue="#ff414b" />
                        </label>
                        {kind === 'child' && (
                          <label>
                            Illustration
                            <select name="avatar">
                              <option value="profile">Silhouette</option>
                              <option value="sun">Soleil</option>
                              <option value="leaf">Feuille</option>
                              <option value="home">Maison</option>
                            </select>
                          </label>
                        )}
                        <button className="button primary">
                          {kind === 'child' ? 'Ajouter un enfant' : 'Ajouter une catégorie'}
                        </button>
                      </fieldset>
                    </form>
                  )}
                </details>
              ))}
              <details className="page-fold">
                <summary>Gérer votre participation</summary>
                {role !== 'owner' ? (
                  <details>
                    <summary>Quitter ce foyer</summary>
                    <p>Les données partagées que vous avez créées restent dans le foyer.</p>
                    <button
                      className="button"
                      onClick={() => {
                        void action.run(async () => {
                          await rpc('manage_member', {
                            p_household: family.active,
                            p_user: account.user?.id,
                            p_action: 'leave',
                          })
                          await family.refresh()
                        })
                      }}
                    >
                      Confirmer mon départ
                    </button>
                  </details>
                ) : (
                  <details>
                    <summary>Supprimer le foyer et toutes ses données</summary>
                    <form
                      className="account-form"
                      onSubmit={(e) =>
                        submit(e, async (data) => {
                          await rpc('delete_household', {
                            p_household: family.active,
                            p_name: data.get('confirmation'),
                          })
                          setToken('')
                          await family.refresh()
                        })
                      }
                    >
                      <p>Cette suppression est définitive pour tous les membres.</p>
                      <label>
                        Recopiez le nom du foyer
                        <input name="confirmation" required autoComplete="off" />
                      </label>
                      <button className="button">Supprimer définitivement le foyer</button>
                    </form>
                  </details>
                )}
              </details>
            </>
          )}
        </>
      )}
      <p role={action.failed ? 'alert' : 'status'} className="account-feedback">
        {action.message}
      </p>
    </>
  )
}

import { useState, type FormEvent } from 'react'
import { PageHeading } from '../../components/PageHeading'
import { useAccount } from '../auth/auth-context'
import { useAccountAction } from '../auth/useAccountAction'
import { useFamily } from './family-context'
import { FamilyGate } from './FamilyShell'
import type { FamilyRecord, Shopping, Task } from '../../../../../packages/domain/src/family'

export function ListsPage({ kind }: { kind: 'shopping' | 'task' }) {
  const family = useFamily(),
    account = useAccount(),
    action = useAccountAction()
  const [editing, setEditing] = useState<FamilyRecord | undefined>()
  const [showDone, setShowDone] = useState(false)
  const tasks = kind === 'task'
  const records = family.snapshot.records.filter((r) => r.kind === kind)
  const value = editing?.payload as Task | Shopping | undefined
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget,
      data = new FormData(form)
    void action.run(async () => {
      const payload = tasks
        ? {
            title: data.get('title'),
            description: data.get('description'),
            assignee: data.get('assignee') || null,
            due: data.get('due') || null,
            timeZone: data.get('timeZone'),
            priority: data.get('priority'),
            status: editing ? (editing.payload as Task).status : 'todo',
            reminders: data.get('reminder') === '' ? [] : [Number(data.get('reminder'))],
          }
        : {
            title: data.get('title'),
            quantity: data.get('quantity'),
            category: data.get('category'),
            done: editing ? (editing.payload as Shopping).done : false,
          }
      await family.save(kind, payload, editing)
      form.reset()
      setEditing(undefined)
      return family.offline ? 'Modification conservée en attente de connexion.' : 'Enregistré.'
    })
  }
  return (
    <>
      <PageHeading
        eyebrow={tasks ? 'UN COUP DE MAIN, ENSEMBLE' : 'LES ESSENTIELS DE LA MAISON'}
        title={tasks ? 'Les tâches' : 'Les courses'}
      >
        {tasks
          ? 'Les petites choses qui font avancer la journée.'
          : 'Une liste commune, à portée de main.'}
      </PageHeading>
      <FamilyGate>
        <section className="settings-card">
          <h2>{editing ? 'Modifier' : tasks ? 'Ajouter une tâche' : 'Ajouter un produit'}</h2>
          <form key={editing?.id ?? 'new'} className="account-form" onSubmit={submit}>
            <fieldset disabled={action.busy}>
              <label>
                {tasks ? 'Titre de la tâche' : 'Produit'}
                <input name="title" required maxLength={120} defaultValue={value?.title} />
              </label>
              {tasks ? (
                <>
                  <label>
                    Description
                    <textarea
                      name="description"
                      maxLength={4000}
                      defaultValue={(value as Task)?.description}
                    />
                  </label>
                  <div className="field-pair">
                    <label>
                      Attribuer à
                      <select name="assignee" defaultValue={(value as Task)?.assignee ?? ''}>
                        <option value="">Personne pour le moment</option>
                        {family.snapshot.members.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.first_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Priorité
                      <select name="priority" defaultValue={(value as Task)?.priority ?? 'normal'}>
                        <option value="low">Tranquillement</option>
                        <option value="normal">Normale</option>
                        <option value="high">Importante</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Échéance (facultative)
                    <input
                      type="datetime-local"
                      name="due"
                      defaultValue={(value as Task)?.due ?? ''}
                    />
                  </label>
                  <label>
                    Fuseau horaire
                    <input
                      name="timeZone"
                      required
                      maxLength={100}
                      defaultValue={
                        (value as Task)?.timeZone ?? account.profile?.time_zone ?? 'UTC'
                      }
                    />
                  </label>
                  <label>
                    Rappel
                    <select name="reminder" defaultValue={(value as Task)?.reminders[0] ?? ''}>
                      <option value="">Aucun</option>
                      <option value="0">À l’échéance</option>
                      <option value="60">Une heure avant</option>
                      <option value="1440">24 heures avant</option>
                    </select>
                  </label>
                </>
              ) : (
                <div className="field-pair">
                  <label>
                    Quantité
                    <input
                      name="quantity"
                      maxLength={80}
                      defaultValue={(value as Shopping)?.quantity}
                      placeholder="2, 500 g…"
                    />
                  </label>
                  <label>
                    Rayon
                    <input
                      name="category"
                      maxLength={80}
                      defaultValue={(value as Shopping)?.category}
                      placeholder="Fruits, frais…"
                    />
                  </label>
                </div>
              )}
              <div className="row-actions">
                <button className="button primary">
                  {editing ? 'Enregistrer' : tasks ? 'Ajouter la tâche' : 'Ajouter le produit'}
                </button>
                {editing && (
                  <button type="button" className="button" onClick={() => setEditing(undefined)}>
                    Annuler
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        </section>
        <p role={action.failed ? 'alert' : 'status'} className="account-feedback">
          {action.message}
        </p>
        <section className="settings-card">
          <div className="section-heading">
            <h2>{tasks ? 'À faire' : 'À prendre'}</h2>
            <label className="check-label">
              <input
                type="checkbox"
                checked={showDone}
                onChange={(e) => setShowDone(e.target.checked)}
              />{' '}
              Voir les éléments terminés
            </label>
          </div>
          {records.length === 0 && (
            <p>Votre liste est vide. Ajoutez le premier élément ci-dessus.</p>
          )}
          <ul className="family-list">
            {records
              .filter(
                (r) =>
                  showDone ||
                  !(tasks ? (r.payload as Task).status === 'done' : (r.payload as Shopping).done),
              )
              .map((record) => {
                const p = record.payload as Task & Shopping
                const done = tasks ? p.status === 'done' : p.done
                return (
                  <li key={record.id} className={done ? 'completed' : ''}>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={done}
                        disabled={action.busy}
                        onChange={() => {
                          void action.run(() =>
                            family.save(
                              kind,
                              {
                                ...p,
                                ...(tasks ? { status: done ? 'todo' : 'done' } : { done: !done }),
                              },
                              record,
                            ),
                          )
                        }}
                      />
                      <span>
                        <strong>{p.title}</strong>
                        <small>
                          {tasks
                            ? `${family.snapshot.members.find((m) => m.user_id === p.assignee)?.first_name ?? 'Non attribuée'}${p.due ? ' · ' + p.due.replace('T', ' à ') : ''}${p.priority === 'high' ? ' · Importante' : ''}`
                            : [p.quantity, p.category].filter(Boolean).join(' · ')}
                        </small>
                      </span>
                    </label>
                    <div className="row-actions">
                      <button
                        className="button"
                        onClick={() => {
                          setEditing(record)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                      >
                        Modifier
                      </button>
                      <details>
                        <summary>Supprimer</summary>
                        <button
                          className="button"
                          onClick={() => {
                            void action.run(() => family.save(kind, p, record, true))
                          }}
                        >
                          Confirmer
                        </button>
                      </details>
                    </div>
                  </li>
                )
              })}
          </ul>
        </section>
      </FamilyGate>
    </>
  )
}

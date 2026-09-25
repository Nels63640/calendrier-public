import { Link } from 'react-router'
import { EmptyState } from '../../components/EmptyState'
import { Icon, type IconName } from '../../components/Icon'
import { PageHeading } from '../../components/PageHeading'

const modules = {
  calendar: {
    title: 'Le calendrier',
    eyebrow: 'LES MOMENTS QUI COMPTENT',
    description: 'Une vue d’ensemble pour trouver du temps ensemble.',
    icon: 'calendar',
    emptyTitle: 'Vos moments prendront place ici',
    emptyText:
      'Rendez-vous, anniversaires et activités : le calendrier partagé sera disponible lors d’une prochaine étape.',
    hints: ['Mois, semaine et journée', 'Partage à votre rythme', 'Rappels personnalisés'],
  },
  tasks: {
    title: 'Les tâches',
    eyebrow: 'UN PEU D’ENTRAIDE',
    description: 'Les petites choses du quotidien, réparties plus simplement.',
    icon: 'tasks',
    emptyTitle: 'À plusieurs, c’est plus léger',
    emptyText:
      'Vous pourrez ajouter une tâche, choisir qui s’en occupe et retrouver les choses à faire dans cet espace.',
    hints: ['Une personne assignée', 'Des priorités simples', 'Une échéance si besoin'],
  },
  shopping: {
    title: 'Les courses',
    eyebrow: 'POUR TOUTE LA MAISON',
    description: 'Une liste commune, pour ne plus rien oublier.',
    icon: 'basket',
    emptyTitle: 'La liste de toute la famille',
    emptyText:
      'Vous pourrez ajouter les produits au fil de vos idées et les cocher pendant les courses. Le partage sera disponible à une prochaine étape.',
    hints: ['Ajout rapide', 'Quantités facultatives', 'Liste partagée'],
  },
  custody: {
    title: 'La garde alternée',
    eyebrow: 'À CHAQUE FAMILLE SON RYTHME',
    description: 'Des repères clairs, avec de la place pour les imprévus.',
    icon: 'people',
    emptyTitle: 'Un planning qui vous ressemble',
    emptyText:
      'Semaines alternées, week-ends ou rythme personnalisé : les périodes de garde et leurs exceptions seront ajoutées lors de la phase dédiée.',
    hints: ['Une couleur par enfant', 'Des rythmes récurrents', 'Des échanges exceptionnels'],
  },
} satisfies Record<
  string,
  {
    title: string
    eyebrow: string
    description: string
    icon: IconName
    emptyTitle: string
    emptyText: string
    hints: string[]
  }
>

export function ModulePage({ module }: { module: keyof typeof modules }) {
  const content = modules[module]
  return (
    <>
      <PageHeading eyebrow={content.eyebrow} title={content.title}>
        {content.description}
      </PageHeading>
      <section className="module-panel">
        <div className="module-panel-header">
          <span className="pill">Bientôt dans votre espace</span>
          <Icon name={content.icon} />
        </div>
        <EmptyState icon={content.icon} title={content.emptyTitle}>
          {content.emptyText}
        </EmptyState>
        <ul className="feature-hints" aria-label="Fonctionnalités prévues">
          {content.hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      </section>
      <Link className="text-link" to="/">
        Retour à l’accueil <Icon name="arrow" size={18} />
      </Link>
    </>
  )
}

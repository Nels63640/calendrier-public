import { Link } from 'react-router'
import { Icon, type IconName } from '../../components/Icon'
import { PageHeading } from '../../components/PageHeading'

const spaces: { title: string; detail: string; path: string; icon: IconName; tone: string }[] = [
  {
    title: 'Le calendrier',
    detail: 'Les rendez-vous et les bons moments.',
    path: '/calendrier',
    icon: 'calendar',
    tone: 'sage',
  },
  {
    title: 'Les tâches',
    detail: 'Un coup de main, chacun à son rythme.',
    path: '/taches',
    icon: 'tasks',
    tone: 'peach',
  },
  {
    title: 'Les courses',
    detail: 'Une liste pour toute la maison.',
    path: '/courses',
    icon: 'basket',
    tone: 'sand',
  },
  {
    title: 'La garde alternée',
    detail: 'Des repères pour chaque enfant.',
    path: '/garde',
    icon: 'people',
    tone: 'lavender',
  },
]

function WelcomeIllustration() {
  return (
    <svg
      className="welcome-illustration"
      viewBox="0 0 300 220"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="168" cy="111" r="90" fill="var(--art-halo)" />
      <circle cx="240" cy="43" r="17" fill="var(--art-sun)" />
      <path
        d="M241 14v-7m26 35h8m-16-20 6-6"
        stroke="var(--art-sun)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g transform="rotate(-7 148 115)">
        <rect
          x="66"
          y="53"
          width="163"
          height="133"
          rx="13"
          fill="var(--art-paper)"
          stroke="var(--art-line)"
          strokeWidth="2"
        />
        <path d="M67 90h161" stroke="var(--art-line)" strokeWidth="2" />
        <path
          d="M102 42v23m88-23v23"
          stroke="var(--art-line)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <rect x="86" y="108" width="26" height="22" rx="5" fill="var(--art-halo)" />
        <rect x="133" y="108" width="26" height="22" rx="5" fill="var(--art-halo)" />
        <rect x="180" y="108" width="26" height="22" rx="5" fill="var(--art-sun)" />
        <rect x="86" y="143" width="26" height="22" rx="5" fill="var(--art-halo)" />
        <rect x="133" y="143" width="26" height="22" rx="5" fill="var(--art-peach)" />
        <path
          d="m139 153 5 5 9-10"
          stroke="var(--art-line)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="180" y="143" width="26" height="22" rx="5" fill="var(--art-halo)" />
      </g>
      <path
        d="M49 193v-53m0 34c-25-1-31-20-24-28 18-1 25 16 24 28Zm0-15c-1-23 13-32 23-28 5 16-9 28-23 28Z"
        fill="var(--art-leaf)"
        stroke="var(--art-line)"
        strokeWidth="2"
      />
      <path
        d="M33 182h32l-5 26H39Z"
        fill="var(--art-peach)"
        stroke="var(--art-line)"
        strokeWidth="2"
      />
      <path d="M27 209h236" stroke="var(--art-line)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function HomePage() {
  return (
    <>
      <PageHeading eyebrow="VOTRE PETIT MONDE, RÉUNI" title="Le quotidien, ensemble.">
        Une place pour les rendez-vous, les petits gestes et les moments qui comptent.
      </PageHeading>
      <section className="welcome-card" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <span className="pill">
            <span className="status-dot" /> Faisons connaissance
          </span>
          <h2 id="welcome-title">
            Chaque famille
            <br />a son propre rythme.
          </h2>
          <p>
            Un espace pour retrouver le vôtre.
            <br />
            Retrouvez votre calendrier familial.
          </p>
          <Link to="/calendrier" className="button primary">
            Découvrir le calendrier <Icon name="arrow" size={18} />
          </Link>
        </div>
        <WelcomeIllustration />
      </section>
      <section aria-labelledby="spaces-title" className="spaces-section">
        <div className="section-heading">
          <h2 id="spaces-title">Tout à sa place</h2>
          <span>Pour alléger vos journées</span>
        </div>
        <div className="spaces-grid">
          {spaces.map((space) => (
            <Link className="space-card" to={space.path} key={space.path}>
              <span className={`space-icon ${space.tone}`}>
                <Icon name={space.icon} size={25} />
              </span>
              <h3>{space.title}</h3>
              <p>{space.detail}</p>
              <span className="card-arrow">
                <Icon name="arrow" size={18} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <aside className="intro-note">
        <span className="small-icon">
          <Icon name="leaf" />
        </span>
        <div>
          <strong>Le début d’une belle organisation</strong>
          <p>
            Connectez-vous puis créez votre foyer, ou rejoignez vos proches avec un code
            d’invitation.
          </p>
        </div>
      </aside>
    </>
  )
}

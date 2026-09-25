import { Link } from 'react-router'
import { PageHeading } from '../../components/PageHeading'

export function NotFoundPage() {
  return (
    <>
      <PageHeading eyebrow="UN PETIT DÉTOUR" title="Cette page est introuvable.">
        Le lien a peut-être changé. Retrouvez votre espace depuis l’accueil.
      </PageHeading>
      <Link to="/" className="button primary">
        Revenir à l’accueil
      </Link>
    </>
  )
}

# Architecture actuelle

React/TypeScript/Vite pour la PWA, packages/domain pour les validations et calculs Temporal, Supabase Auth/PostgreSQL pour les comptes et transactions. GitHub Pages sert les fichiers statiques avec HashRouter. IndexedDB conserve le cache privé borné et les mutations simples hors ligne. Realtime déclenche les relectures, avec reprise au premier plan et interrogation périodique.

Les tables family_records et event_exceptions utilisent des charges JSON validées par le serveur, des versions et des mutations idempotentes. Les fonctions SQL arbitrent rôles, visibilité, invitations et modifications de récurrence. Les personnes concernées ne donnent aucun droit de lecture.

Le serveur de rappels utilise une file durable, un curseur de reprise, des tentatives bornées et une revérification des droits avant prise en charge. La fonction est déployée, les secrets sont dans Vault et le cron ainsi que le déclencheur transactionnel sont actifs. La configuration Vault est accessible uniquement au moteur serveur, après contrôle du secret de déclenchement.

## Conception initiale conservée pour historique

# Architecture validée

Architecture validée par l’utilisateur le 25 septembre 2026. Ne pas développer toutes les phases d’un seul coup.

## Structure

- `apps/web` : React, TypeScript, Vite, React Router ; composants, pages et thèmes.
- `packages/domain` (premier prototype temporel implémenté) : calculs calendaires, récurrences, gardes et rappels indépendants de React.
- Futur `packages/contracts` : modèles d’échanges et validations partagés.
- `supabase` : migration des profils et modèles d’e-mail ; tests PostgreSQL/RLS sous tests/unit.
- `tests/e2e` : parcours critiques de la version construite.
- `docs` : mémoire du projet et limites réellement vérifiées.

Les répertoires futurs et les dépendances associées seront ajoutés lors de leur première utilisation, sans packages vides.

## Stack cible

React + TypeScript + Vite, Supabase Auth/PostgreSQL/Storage/Realtime, fonctions serveur et planification. Hébergement statique envisagé sur Cloudflare Pages. Zod valide les comptes/profils ; TanStack Query et IndexedDB seront introduits dans les prochaines phases de données ; Service Worker/Workbox implémenté dans la phase PWA. Aucun service cloud n’est encore configuré.

Le frontend contient la présentation et les adaptateurs. Le serveur valide les opérations, PostgreSQL arbitre contraintes et transactions. Les notifications temps réel accélèrent les relectures, sans remplacer une reprise après déconnexion.

## Données et autorisations

Entités prévues : profils, foyers, appartenances, invitations, enfants, catégories, entrées calendrier, droits d’accès, personnes concernées, exceptions, détails de garde, listes/articles, tâches, règles de rappels, préférences, abonnements et file de notifications, journal borné de synchronisation.

Un utilisateur peut appartenir à plusieurs foyers. Propriétaire, administrateur et membre sont des rôles d’appartenance. Le rôle administrateur ne donne pas accès aux événements privés d’autrui. Personne concernée et droit de lecture sont deux relations différentes.

RLS et contraintes de cohérence par foyer protègent les lectures et écritures ; les clés privilégiées restent au backend. Les invitations utilisent des jetons aléatoires dont seule l’empreinte est conservée, une expiration et une consommation atomique. Aucune donnée sensible d’enfant inutile.

## Temps, récurrences et garde

Règle de série + exceptions, sans matérialisation infinie. Fuseau IANA et heure locale pour les séries ; instants UTC pour les échéances ; dates civiles distinctes pour les journées entières. Fin exclusive.

Occurrence identifiée par sa date de départ d’origine, même après déplacement. Modifier « celle-ci et les suivantes » fractionne la série en transaction et traite les exceptions explicitement. Les occurrences déplacées depuis l’extérieur de la fenêtre doivent être retrouvées. Tests indispensables pour changements d’heure, chevauchements et fractionnement.

## Notifications et PWA

Installation écran d’accueil et permission volontaire sur iOS/iPadOS compatibles. Push API + Service Worker + VAPID côté serveur. File durable, planification serveur, préférences, contrôle des droits avant envoi, invalidation des rappels modifiés, reprises bornées et suppression des abonnements expirés.

La précision de réception n’est pas garantie. Une réponse positive du service push n’est pas un accusé de lecture.

Hors ligne : lecture d’un cache privé borné, puis opérations simples avec identifiant idempotent et version attendue. Synchronisation au retour de connexion/au premier plan, conflits explicites. Pas de dépendance obligatoire à Background Sync. Retirer un droit ne peut pas effacer immédiatement une copie sur un appareil déconnecté.

## Références vérifiées lors de la conception

- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/functions/schedule-functions
- https://www.rfc-editor.org/rfc/rfc5545
- https://vite.dev/guide/
- https://reactrouter.com/start/declarative/installation

## Outil de recette de la phase 3

Le serveur Node sous scripts/push-proof est indépendant de la production et limité aux essais privés. Le frontend l’appelle via le proxy de Vite Preview ; code privé en mémoire, origine exacte, clés VAPID privées hors dépôt et abonnements temporaires. Le transport de production sera raccordé à l’authentification Supabase lors des phases concernées. Voir PWA_LOCAL_TEST.md.

# Calendrier familial

PWA en français pour organiser les foyers, événements récurrents et gardes, tâches et courses. React, TypeScript et Supabase.

## Développement

Node 24 minimum. Installer avec npm ci, copier apps/web/.env.example vers apps/web/.env.local et renseigner les valeurs publiques Supabase. Lancer npm run dev. Pour la PWA : npm run build puis npm run preview.

## Vérification

npx playwright install chromium webkit puis npm run check. Les tests de comptes utilisent une API simulée ; les tests de droits exécutent PostgreSQL via PGlite. npm run format:check contrôle le format.

## Déploiement

GitHub Pages via .github/workflows/pages.yml, avec navigation par fragment pour préserver les liens directs. Variables du dépôt : VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, puis VITE_VAPID_PUBLIC_KEY après déploiement du serveur de rappels. Aucune clé privilégiée dans le frontend.

La base se prépare avec supabase/INSTALL.sql, une seule fois dans un projet dédié vide. Les migrations individuelles restent la référence. Auth, SMTP et rappels demandent leur configuration serveur : voir [le guide](docs/SUPABASE_SETUP.md).

## Fonctionnalités

- Comptes, profils, foyers, invitations et rôles.
- Calendrier, récurrences, exceptions et gardes, visibilité privée ou partagée.
- Tâches et courses synchronisées, conflits explicites et modifications simples hors connexion.
- Installation PWA, cache privé borné, export et suppression du compte.
- Moteur serveur de rappels préparé ; déploiement, secrets et planification encore requis.

Voir [l’état vérifié](docs/PROJECT_STATE.md), [l’architecture](docs/architecture.md) et [la recette PWA](docs/PWA_LOCAL_TEST.md). Les tests WebKit ne remplacent pas une recette sur iPhone réel.

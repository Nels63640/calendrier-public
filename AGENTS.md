# Calendrier familial : consignes du projet

Projet indépendant du serveur RedM voisin. Travailler uniquement dans ce dossier pour cette application.

- Lire `docs/PROJECT_STATE.md`, `docs/architecture.md` et `docs/decisions.md` avant une modification.
- Français pour l’interface et la documentation. Le nom « Calendrier familial » est provisoire.
- Autorisation du 25 septembre 2026 : l’utilisateur demande de terminer toutes les phases restantes sans nouvelle validation intermédiaire. Poursuivre les tests et documenter les raccordements externes non vérifiés.
- Ne jamais présenter une page d’aperçu comme une fonctionnalité persistante ou connectée.
- Séparer présentation, logique métier et accès aux données. Les packages métier seront introduits avec leurs premiers usages.
- Toute future donnée familiale doit être isolée par foyer en base ; les droits de visibilité d’un événement sont distincts des personnes concernées.
- Ne pas placer de secrets dans le frontend, le dépôt, la documentation ou les logs. Les variables VITE_* sont publiques.
- Préserver les fuseaux IANA, les dates civiles et l’identité d’origine des occurrences ; ne pas convertir une semaine civile en durée fixe.
- Navigation accessible, zones tactiles confortables, safe areas, thèmes système/clair/sombre et réduction des animations.
- Exécuter `npm run check` après une évolution significative. Ne pas confondre Playwright WebKit et une recette sur iPhone réel.
- Mettre à jour l’état et les décisions avec les résultats observés. Aucun déploiement automatique ni passage à la phase suivante.

## Commandes

Depuis cette racine : `npm ci`, `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`.
Installer les navigateurs de test si nécessaire : `npx playwright install chromium webkit`.
Les tests utilisent le build de production ; lancer `npm run build` avant `npm test`.

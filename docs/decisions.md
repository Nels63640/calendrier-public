# Décisions actuelles

25 septembre 2026 : l’utilisateur autorise toutes les phases restantes et le déploiement, fournit son projet Supabase et choisit GitHub Pages. Ces décisions remplacent les pauses entre phases et l’hébergement initialement envisagé. La base est installée manuellement, faute de connexion administrative. Aucun SMTP disponible.

## Historique

# Décisions

## 25 septembre 2026

- L’utilisateur a validé l’architecture proposée et le plan progressif. Le socle et l’interface constituent la première implémentation (phase 2 du plan, phase 1 étant la validation).
- Nouveau dossier indépendant `family-calendar`, situé à côté de `server-data`. Aucun code ou thème RedM réutilisé.
- Nom fonctionnel provisoire « Calendrier familial », sans inventer de famille ni de données personnelles.
- npm workspaces pour le frontend ; aucune infrastructure de monorepo supplémentaire.
- TypeScript 5.9 utilisé pour rester dans la plage de compatibilité annoncée par typescript-eslint. Dépendances effectivement installées verrouillées dans package-lock.json.
- React Router en mode déclaratif ; Vite pour un frontend statique. Cible de compilation Safari 16.4, sans prétendre que cela remplace une recette sur iOS 16.4.
- Police système et Georgia, icônes et illustration SVG locales : aucun téléchargement de police, aucune image tierce.
- Choix du thème enregistré localement, repli fonctionnel lorsque le stockage est refusé. Suivi des changements du système et des autres onglets.
- Pages des modules explicitement présentées comme aperçus. Aucun faux bouton de sauvegarde ni calendrier prétendument synchronisé.
- Aucun compte/cloud créé, aucun déploiement et aucune PWA ou notification déclarée fonctionnelle pendant cette phase.

## Phase 3, poursuite autorisée

- L’utilisateur confirme ne pas avoir d’adresse HTTPS et demande de préparer la recette locale. Aucun déploiement ni tunnel.
- Workbox en injectManifest avec enregistrement explicite du Service Worker, uniquement pour le build ; mise à jour proposée, sans activation immédiate lors d’une saisie.
- Cache statique exclusivement. Les API, abonnements et données futures restent hors de ce cache.
- Outil serveur Node temporaire pour la preuve Web Push, sans avancer la phase des comptes/Supabase. VAPID et code d’accès générés localement, code gardé en mémoire de la page, abonnements en mémoire du serveur avec expiration.
- Le prototype Temporal vérifie le risque des changements d’heure sans prétendre fournir un moteur RRULE complet. Les heures ambiguës/inexistantes sont explicitement rejetées à ce stade.
- Node 24 minimum pour exécuter les outils et tests TypeScript natifs. Pas de dépendance de test supplémentaire nécessaire pour ces fonctions pures et ce serveur.
- Notifications système indisponibles dans Chromium automatisé Windows malgré une permission Playwright ; simulations explicitement documentées. La vraie réception reste à vérifier sur appareil.

## Phase 4, comptes et profils

- Utilisateur sans projet Supabase : préparer le raccordement, sans créer de service cloud.
- Code e-mail saisi dans l’application pour la confirmation et la récupération, afin de ne pas dépendre du navigateur ouvrant le message. Modèles explicites à configurer dans Supabase ; aucune détection de jeton dans les URL.
- SDK Supabase 2.117.2 et Zod 4.6.5. Clés publishable uniquement, validation au build. Mots de passe d’au moins 12 caractères, à imposer aussi côté Auth.
- Table profiles privée par utilisateur avec RLS ; fonctions internes dans private. Déclencheur sur auth.users, sans faire confiance aux métadonnées pour des droits.
- Avatar parmi quatre illustrations locales, sans stockage de photo. Fuseau initial UTC, modifiable par nom IANA.
- Session SDK persistée, profil uniquement en mémoire ; vérification getUser et génération de requête pour empêcher le retour d’un ancien profil après déconnexion. Portée de déconnexion locale explicite.
- PGlite 0.5.8 exécute la vraie migration et les permissions PostgreSQL avec un contrat auth minimal. Ce test ne remplace pas Supabase Auth/PostgREST.
- Build auth-test séparé avec valeurs factices et interceptions HTTP Playwright. Il ne doit jamais être déployé ; les tests ordinaires restent sur le build sans raccordement.

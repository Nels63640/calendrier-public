# Navigation centrée sur le calendrier

L’utilisateur remplace le tableau de bord d’accueil par le calendrier après connexion. Référence visuelle : ses trois captures année/mois/journée sombres. Les fonctions secondaires sont accessibles dans un menu illustré, avec libellés et retour direct ; la simplicité prime sur les panneaux permanents.

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

## 26 septembre 2026 — Palette et navigation temporelle

La demande explicite de noir et rouge sur toutes les pages remplace le choix clair/sombre/système. Les réglages secondaires passent dans des sections repliables. Le calendrier conserve l’accueil connecté et les menus à icônes.

Le défilement vertical recycle un nombre borné de périodes et préserve leur position visible. Années, mois et journées utilisent le même composant. Limites explicites : année 0 (numérotation astronomique) à 275759, dernière année complète du moteur Temporal. Le menu propose un accès direct par année pour éviter des milliers de gestes. Le zoom année-vers-mois utilise les rectangles réels et Web Animations ; il est désactivé en réduction des animations.

## 26 septembre 2026 — Sélection de périodes

Deux jours cochés au minimum activent la création. Une période est continue, du premier au dernier jour inclus ; le compteur distingue les jours cochés des jours couverts. Le formulaire préremplit une journée entière avec fin exclusive en stockage, propose garde/vacances/vacances scolaires/autre et conserve les droits de partage existants. La garde sélectionnée utilise les bornes choisies sans appliquer le modèle automatique une semaine sur deux. Aucun import de calendrier scolaire dans cette demande.

## 26 septembre 2026 — Préserver l’inertie du défilement

Les compensations de position pendant le défilement peuvent interrompre l’inertie Safari. Ajouter les périodes suivantes sans scroll programmatique, charger plusieurs périodes en avance et différer le recyclage avec compensation jusqu’au repos (220 ms et aucun contact). Le retour Aujourd’hui invalide également la légende dérivée de la période précédente et centre le marqueur courant dans l’année.

## 26 septembre 2026 — Supprimer la page Accueil

La demande utilisateur supprime complètement l’ancienne entrée tableau de bord : le calendrier devient la route racine indépendamment de la session. Le lien historique /calendrier reste pris en charge. Les rubriques protégées continuent à exiger une connexion.

## 26 septembre 2026 — Dézoom et icône calendrier

Le retour vers l’année utilise la position réelle de la miniature du mois courant et une animation inverse, désactivée en réduction des animations. L’icône maison est remplacée par un calendrier noir et rouge, sans date fixe trompeuse. Le système iOS conserve la maîtrise du rafraîchissement des icônes déjà installées.

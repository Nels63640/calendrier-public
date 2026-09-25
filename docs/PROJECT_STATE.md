# État actuel : 25 septembre 2026

L’utilisateur autorise la réalisation et la publication de toutes les phases. Hébergement choisi : GitHub Pages, dépôt Nels63640/calendrier-public.

Foyers, invitations, rôles, enfants et catégories, événements avec récurrence/exceptions/gardes, tâches, courses, synchronisation et cache privé sont implémentés. Lecture hors connexion pendant 7 jours ; journal de 100 mutations simples maximum, versions et identifiants idempotents. Export et suppression du compte disponibles.

Validation locale : npm run check réussi, 27 tests unitaires/PostgreSQL et 57 tests navigateur Chromium/WebKit. Auth HTTP simulé dans les tests ; moteur SQL réel via PGlite.

L’utilisateur confirme « success » après INSTALL.sql. L’API réelle reconnaît households et refuse les lectures anonymes avec le code PostgreSQL 42501. Aucune inscription ni réception de courriel réelle vérifiée. Les paramètres Auth et les modèles de codes restent à appliquer, et aucun SMTP n’est disponible.

GitHub Pages et variables publiques du dépôt configurés ; publication en cours. Moteur de rappels et SQL de planification préparés, mais fonction serveur, secrets VAPID et cron non déployés. Réception sur iPhone non vérifiée.

Les sections suivantes sont historiques et leurs restrictions de phase sont remplacées par l’autorisation actuelle.

# État du projet

## 25 septembre 2026 : phase 4, comptes et profils préparés

L’utilisateur valide la suite et précise : « Pas encore : préparer le raccordement » pour Supabase. Aucun projet externe créé.

### Implémenté et vérifié

- Écrans d’inscription, connexion, confirmation par code e-mail, récupération par code puis nouveau mot de passe, déconnexion de cet appareil.
- SDK Supabase réel ; vérification serveur de la session avant affichage du profil, restauration, invalidation des réponses retardées après changement de compte/déconnexion.
- Profil : prénom, avatar illustré local et fuseau IANA. Validation des champs, conservation des saisies sur erreur et reprise explicite.
- Migration SQL : création automatique du profil, lecture/modification de son propre profil seulement, contraintes et colonnes protégées. Test exécuté dans PostgreSQL via PGlite avec un contrat Auth minimal simulé.
- Sans configuration, message explicite et formulaires désactivés. Validation des deux variables publiques au build, seules les clés publishable sont acceptées.
- Modèles e-mail et [guide de raccordement Supabase](SUPABASE_SETUP.md) prêts.

**npm run check réussi : lint, TypeScript, builds, 17 tests unitaires/serveur/base et 51 tests navigateur.** Les parcours de comptes utilisent le SDK et une API HTTP simulée sur un build de recette distinct ; Chromium ordinateur/mobile et WebKit mobile passent. Inscription, code expiré, connexion invalide, sauvegarde échouée sans perte de saisie, restauration, récupération et déconnexion sont couverts.

### Limites et prochaine étape

Pas de migration exécutée dans Supabase, pas de SMTP ni d’e-mail réel vérifié. Pas de recette iPhone physique. Suivre SUPABASE_SETUP.md lors de la création du projet ; ne pas déployer dist-auth-test. Les profils ne sont pas mis en cache hors ligne ; les jetons de session sont stockés localement par le SDK, avec repli en mémoire si nécessaire. Le diagnostic push reste indépendant des comptes.

Le build signale un bundle principal de 596 ko environ (172 ko gzip) après ajout des bibliothèques de compte ; optimisation de chargement à suivre avec les futurs modules. Avertissement de dépréciation Workbox/Vite-PWA conservé.

Phase 5 (foyers, invitations, rôles) non commencée : attendre la validation de cette livraison. Aucun changement RedM, aucun déploiement.

## Historique

## 25 septembre 2026 : phase 3, recette locale PWA/push

L’utilisateur a autorisé la suite après le socle, puis confirmé : « Pas encore : préparer la recette locale » concernant l’adresse HTTPS.

### Implémenté

- Socle de la phase 2 conservé : navigation, thèmes, accessibilité et pages d’aperçu.
- Manifest stable, mode standalone, icônes PNG 192/512, maskable et icône Apple, dérivés du SVG original.
- Service Worker Workbox : cache de la coquille statique, navigation hors connexion, aucune réponse API ou donnée privée en cache.
- Préparation du hors-ligne, indicateur réseau, guide d’installation et nouvelle version proposée sans rechargement automatique d’une saisie.
- Diagnostic dans /profil/notifications : code d’essai gardé uniquement en mémoire, permission sur geste explicite, abonnement, envoi de test, désactivation et reconnexion.
- Serveur Node de recette lié à 127.0.0.1:4318, accessible par le proxy du build sur 4173. VAPID, contrôle du code et de l’origine, destinations push vérifiées, plafonds et expiration des abonnements.
- Premier package métier : essai temporel indépendant de React, semaines civiles et fuseaux nommés avec Temporal. Ce n’est pas le moteur complet de récurrence.

### Vérifié

Lint, TypeScript frontend/Service Worker/outils et build réussis. **13 tests unitaires/serveur et 36 tests navigateur réussis**.

- Navigation hors connexion et rechargement des liens directs, serveur effectivement arrêté, sur Chromium et WebKit.
- Mise à jour en attente : saisie préservée jusqu’au consentement explicite au rechargement.
- Permission jamais demandée à l’ouverture ; refus correctement présenté.
- Vrai parcours HTTP interface → proxy → serveur de recette ; API du téléphone et fournisseur push simulés.
- Gestionnaire push exécuté dans le Service Worker, avec API système showNotification simulée.
- Garde à 18 h conservée malgré une durée réelle de 167/169 heures ; alternance, changement d’année, fuseaux et rejet des heures ambiguës/inexistantes.

### Limites exactes

Aucun envoi Web Push externe ni réception sur iPhone réel validé. Le navigateur Windows automatisé refuse l’affichage système malgré une permission Playwright accordée ; ne pas confondre tests simulés et livraison APNs/FCM. WebKit en émulation hors ligne a produit une erreur interne de navigation ; le rechargement après arrêt réel du serveur est testé avec succès séparément.

Pas d’adresse HTTPS, tunnel ou déploiement public. Serveur de recette distinct du futur backend Supabase, sans comptes, stockage durable ou planification. La PWA fonctionne sur le build (4173), pas sur le serveur de développement 5173.

### Suite

Voir [la recette locale](PWA_LOCAL_TEST.md) pour configurer le contact VAPID et effectuer un envoi réel. La recette iPhone reste à effectuer lorsque l’adresse HTTPS sera disponible. Attendre le retour utilisateur avant la phase 4 (comptes/profils).

Aucune modification du serveur RedM voisin, aucun compte cloud créé et aucun déploiement effectué.

La configuration privée .local/push-proof.json a été initialisée sans affichage des clés, et son exclusion Git vérifiée. Le contact VAPID reste à renseigner avant un envoi réel. L’aperçu du build est ouvert sur http://127.0.0.1:4173/profil.

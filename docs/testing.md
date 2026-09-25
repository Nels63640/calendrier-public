# Validation

## Phase 4 : comptes et profils

**17 tests unitaires/serveur/base et 51 tests navigateur réussis**, lint, TypeScript et build réussis via npm run check.

Les 15 nouveaux parcours navigateur couvrent les comptes sur Chromium ordinateur/mobile et WebKit mobile : inscription, code expiré puis valide, connexion invalide puis valide, modification et restauration du profil, déconnexion, récupération du mot de passe, reprise de sauvegarde et absence de faux compte sans configuration. Le SDK est réel ; les réponses HTTP de Supabase sont simulées sur un build distinct, port 4175. Les erreurs simulées exposent l’en-tête de version API comme le service réel.

La migration est exécutée dans PostgreSQL via PGlite : deux utilisateurs isolés, anonyme refusé, contraintes de valeurs, colonnes protégées et suppression en cascade. Autres nouveaux tests : validation de configuration/champs et réponse de profil tardive après déconnexion.

Aucun projet Supabase, SMTP, envoi de code ou iPhone réel vérifié. Voir [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Le bundle principal vaut environ 596 ko, 172 ko gzip ; avertissement Vite conservé. Arrêter les aperçus sur **4173 et 4175** avant les tests.

## Phase 3 : PWA et preuve locale de notifications

**13 tests unitaires/serveur + 36 tests navigateur réussis**, lint sans erreur, typage frontend/Service Worker/outils et build réussis. Audit npm à l’installation : aucune vulnérabilité signalée.

Les tests de navigateur conservent les 18 parcours du socle. Ils ajoutent manifest/icônes, instructions, navigation interne hors ligne, aucun appel de permission à l’ouverture, rechargement après arrêt du serveur et attente d’une nouvelle version sans perte de saisie. Ces parcours tournent sur Chromium ordinateur/mobile et WebKit mobile.

Trois parcours Chromium spécifiques vérifient le gestionnaire de réception avec une API système simulée, le refus de permission, puis le véritable aller-retour HTTP via le proxy et le serveur d’essai avec abonnement/fournisseur simulés.

Le serveur est testé pour le code privé, origine/Host, destinations non autorisées, clés invalides, taille des requêtes, retrait, expiration, réponse 410, absence de fuite des erreurs et limitation des répétitions. Les tests temporels couvrent semaines de 167/169 heures, alternance, année suivante, Paris/New York et heures locales invalides.

## Limites observées et conservées

- WebKit Windows : une navigation document avec context.setOffline(true) produit une erreur interne. Le scénario réseau vérifie donc la navigation interne et l’état hors ligne ; un autre test arrête réellement le serveur et vérifie les liens directs/rechargements sur les trois configurations, avec succès.
- Chromium automatisé Windows : navigator.permissions indique granted mais Notification.permission reste denied et showNotification est refusé. L’injection DevTools n’a pas démontré une réception. Le test final simule explicitement l’API de notification et vérifie le vrai gestionnaire enregistré par le Service Worker. Aucune promesse de notification système testée.
- Aucun iPhone physique, livraison APNs/FCM ou toucher d’une alerte système n’a été validé.
- Les avertissements NO_COLOR/FORCE_COLOR sont liés à l’environnement de test. Vite-PWA émet aussi un avertissement de dépréciation inlineDynamicImports lors de la compilation de son worker ; le build aboutit, sans masquage du diagnostic ni patch du fournisseur.

## Reproduire

npm run check puis npm run format:check. Node 24 minimum. Installer Chromium/WebKit via Playwright si nécessaire. Ports 4173 et 4318 libres avant les tests.

La recette physique et le fonctionnement du serveur privé sont détaillés dans [PWA_LOCAL_TEST.md](PWA_LOCAL_TEST.md).

## Historique : phase 2

18 parcours initiaux réussis. Le retour du focus après fermeture du menu a été corrigé sur WebKit. Captures du socle inspectées en clair/sombre. Aucun test navigateur ne remplace une recette d’accessibilité sur appareil et lecteur d’écran réels.

Les nouveaux écrans Profil/installation et diagnostic de notifications ont été inspectés visuellement sur 390 px et 320 px. Aucun débordement horizontal constaté sur le diagnostic à 320 px. Les captures temporaires sont sous test-results/, ignorées par Git.

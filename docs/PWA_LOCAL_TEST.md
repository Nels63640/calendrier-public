# Recette locale PWA et Web Push

Phase 3 : préparée à la demande de l’utilisateur, qui ne dispose pas encore d’une adresse HTTPS. Aucun site public ni tunnel n’a été créé.

## Ouvrir la PWA sur cet ordinateur

Depuis `family-calendar`, avec Node 24 ou supérieur :

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run preview
```

Ouvrir **http://127.0.0.1:4173/profil**. Le port 5173 est le développement Vite : son Service Worker est volontairement désactivé. Utiliser 4173 pour la recette PWA. Ne pas exposer Vite Preview comme serveur de production.

Le contexte local 127.0.0.1 permet les API sécurisées sur cet ordinateur. Cette exception ne s’applique pas à une adresse HTTP du réseau local ouverte sur un iPhone.

1. Attendre « L’interface est prête à être consultée hors connexion » dans Profil.
2. Suivre les instructions d’installation ou le bouton fourni lorsque le navigateur le permet.
3. Couper la connexion, naviguer, puis recharger une rubrique déjà préparée. L’interface doit rester lisible.
4. Rétablir la connexion : le bandeau hors connexion disparaît.
5. Pour une nouvelle version, reconstruire l’application, puis revenir au premier plan. Une proposition de mise à jour doit apparaître. La page ne se recharge qu’après le clic « Mettre à jour ».

Le cache contient uniquement le HTML, JavaScript, CSS et les icônes. Aucun compte, abonnement push, réponse API ou donnée familiale n’est mis en cache. Il ne s’agit pas encore de la synchronisation hors ligne des futures données.

## Préparer un envoi Web Push réel depuis cet ordinateur

Ce serveur est un **outil privé de recette pour un développeur**, pas le backend multiutilisateur de production. Le transport réel demande un navigateur qui autorise les notifications, une connexion internet et un contact VAPID.

```powershell
npm.cmd run push:setup
```

Cette commande génère les clés VAPID et un code aléatoire dans `.local/push-proof.json`, ignoré par Git. Elle conserve un fichier existant et n’affiche aucun secret.

Ouvrir ce fichier localement :

- Renseigner `subject` avec `mailto:` suivi d’une adresse e-mail de contact valide.
- Conserver `origin` à `http://127.0.0.1:4173` pour cette recette.
- Copier uniquement la valeur `accessToken` dans le champ « Code d’essai privé » de l’interface. Ne pas la publier ou la coller dans une conversation.
- Ne jamais copier la clé privée dans une variable VITE_* ou dans le navigateur.

Dans un second terminal :

```powershell
npm.cmd run push:proof
```

Le serveur écoute seulement sur `127.0.0.1:4318`. L’aperçu sur 4173 lui transmet les requêtes `/api/push-proof/`. Il n’accepte pas les requêtes d’autres origines.

Dans **http://127.0.0.1:4173/profil/notifications** :

1. Saisir le code privé puis connecter l’outil d’essai.
2. Cliquer « Activer les notifications de test », puis accepter la permission.
3. Cliquer « Envoyer une notification de test ».
4. Vérifier l’alerte sur l’appareil ; son texte est volontairement neutre.
5. Toucher l’alerte : la page de diagnostic doit s’ouvrir, sans remplacer une autre page en cours de saisie.
6. Cliquer « Désactiver cet abonnement » à la fin de la recette.

Un envoi accepté par le fournisseur ne prouve pas l’affichage ou la lecture. Le code privé n’est conservé ni dans localStorage ni dans sessionStorage. Il disparaît en quittant cette page. Les abonnements du serveur sont temporaires, expirent après une heure et sont purgés au prochain nettoyage (chaque minute), ainsi qu’au redémarrage. Le navigateur peut garder son propre abonnement jusqu’à sa désactivation.

Après redémarrage du serveur, utiliser « Reconnecter l’outil d’essai », puis réactiver cet appareil. Une réponse 404/410 du fournisseur retire l’abonnement côté serveur. Pour une clé VAPID remplacée, désactiver l’ancien abonnement avant le nouvel essai.

Le serveur accepte au plus dix abonnements simultanés, soixante requêtes par minute et un envoi toutes les dix secondes par abonnement. Aucun endpoint ni contenu sensible n’est journalisé. Les services push reconnus sont Apple, Google et Mozilla ; tout autre fournisseur exige une revue de sa destination avant ajout.

## Validation ultérieure sur iPhone réel

À faire lorsque l’adresse HTTPS sera disponible :

- Certificat valide et reconnu par l’iPhone, même origine pour la PWA et les routes d’essai, proxy sécurisé vers les services locaux. Configurer cette origine exacte dans le fichier privé. Cette infrastructure n’a pas été mise en place.
- iOS/iPadOS compatible, à partir de 16.4 ; installation depuis Safari via le partage et ajout à l’écran d’accueil, puis lancement par l’icône.
- Permission demandée uniquement après un geste volontaire, jamais à l’ouverture.
- Tester permission acceptée/refusée, abonnement, réception application au premier plan et en arrière-plan, écran verrouillé, toucher de la notification et désactivation.
- Tester également connexion coupée, relance depuis l’icône, nouvelle version et mode clair/sombre.
- Noter appareil, version du système, état du mode de concentration et résultat observé. Ne pas consigner les clés ou l’endpoint.

Les textes d’installation tiennent compte du fait que le libellé du menu varie selon la version iOS. Le parcours se fonde sur les API disponibles et non sur une promesse universelle de support.

## Tests automatisés et limites

`npm run check` couvre lint, typage, build, tests métier/serveur et parcours navigateur. Les tests démarrent eux-mêmes les serveurs nécessaires ; arrêter les aperçus utilisant 4173 et l’outil d’essai utilisant 4318 avant leur lancement.

Les tests d’expiration et d’envoi serveur utilisent un fournisseur simulé. Le navigateur automatisé Windows refuse l’API de notification système même lorsqu’une permission est demandée par Playwright : le test du gestionnaire push simule explicitement `showNotification`. Aucun de ces tests ne prouve la livraison par APNs/FCM ni la réception sur un iPhone.

Références officielles : [Web Push sur iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Workbox](https://developer.chrome.com/docs/workbox/modules/workbox-precaching), [bibliothèque Web Push serveur](https://github.com/web-push-libs/web-push).

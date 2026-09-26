# Modification des anniversaires : 26 septembre 2026

Les anniversaires existants ouvrent un formulaire dédié depuis la recherche ou une carte du calendrier. Nom, jour, mois et couleur sont préremplis et modifiables ; la sauvegarde conserve le même identifiant et la version attendue, les rappels, le fuseau, la visibilité et les autres métadonnées. La date est lue depuis la série, donc un 29 février ne devient pas définitivement un 28 lors de son édition une année non bissextile.

Droits alignés sur les événements : auteur, propriétaire ou administrateur pour un anniversaire lisible ; lecture seule sinon. Suppression annuelle avec confirmation conservée dans le formulaire dédié. Aucune migration ni modification directe de données familiales en production.

Validation locale : lint, types, compilation et format réussis. Premier npm run check : 44 tests unitaires et 96/97 tests navigateur réussis ; le nouveau test mobile ouvrait la recherche avant la restauration du foyer. Attente corrigée ; parcours final incluant modification, rechargement, couleur, 29 février et suppression avec annulation : 3/3 réussis sur Chromium bureau/mobile et WebKit mobile. Publication en cours. Aucun test sur iPhone physique.

## Historique

# Connexion persistante et reprise réseau : 26 septembre 2026

Demande : éviter les déconnexions de l’application. La persistance et le renouvellement automatique du SDK étaient déjà activés. Correction de AuthStore : ne plus effacer le compte vérifié sur erreur réseau/503/429 ; reprise à la visibilité, au retour réseau et à la réouverture de page, avec nouvelles tentatives espacées de 5 à 60 s. getUser utilise le jeton courant du SDK. La session vide initiale passe par une vérification qui distingue erreur temporaire et absence réelle de session.

Le compte précédemment vérifié peut rester affiché pendant une panne, dans la limite du cache existant de 7 jours ; aucun droit serveur supplémentaire. Une déconnexion volontaire, une session refusée/révoquée ou la suppression des données du navigateur reste effective. Aucun mot de passe stocké. Le profil modifié est aussi actualisé dans le cache de reprise.

Notifications : diagnostic serveur sans erreur de livraison enregistrée, puis l’utilisateur confirme la réception rétablie et demande de conserver l’activation. Le frontend ne supprime plus un nouvel abonnement après une erreur de register_push : la réponse peut avoir été perdue après succès serveur. Une activation explicitement demandée et interrompue est conservée par compte/endpoint pendant 24 h et reprise au premier plan, au retour réseau ou toutes les 15 s tant que la page est visible. Aucun nouveau consentement demandé automatiquement, aucun renouvellement d’abonnement navigateur en arrière-plan. Les abonnements déjà enregistrés restent inchangés ; désactivation volontaire et déconnexion explicite annulent la reprise en attente avant désinscription. Un échec de vérification s’affiche comme indisponible, pas comme désactivé. Aucune modification Supabase.

Validation locale finale : npm run check et format réussis, 44 tests unitaires et 94 tests navigateur. Tests réseau/session expirée et activation push interrompue sur Chromium bureau/mobile et WebKit mobile ; API Auth, PushManager et serveur simulés, aucune nouvelle notification envoyée aux téléphones. Le premier passage avait deux échecs : rechargement du test avant fin de déconnexion (attente corrigée), puis défilement WebKit intermittent déjà observé avant cette intervention. La suite finale complète passe sans relance. Publication réussie : commit cedf524, workflow 36253239531, 94 tests navigateur et vérifications au vert. Contrôle public : corrections présentes dans le JavaScript publié, page/manifest/Service Worker HTTP 200, clé publique VAPID conforme, profil accessible et aucune erreur JavaScript. Aucune réception iPhone physique testée par l’agent.

## Historique

# Balayage horizontal des journées : 26 septembre 2026

Dans la vue journée, glisser vers la gauche ouvre le lendemain et vers la droite la veille, depuis les heures ou le bandeau des jours. Le changement conserve l’heure visible, traverse les semaines/mois et applique une transition courte respectant la réduction des animations. Le geste vertical reste natif ; un déplacement annule l’appui long et le clic issu du balayage est neutralisé.

Validation locale : lint, compilation, format et 42 tests unitaires réussis. Suite complète : 87/88 tests navigateur au premier passage (échec du défilement WebKit déjà observé avant modification). Relance ciblée sans modification du code : 15/15 réussis, dont balayage sur Chromium bureau/mobile et WebKit mobile ; entrées tactiles Chromium, annulation du geste et défilement vertical vérifiés. Première publication bloquée : workflow 36233309089, parcours WebKit calendriers/anniversaire arrivé à sa limite globale de 30 s, 87 autres scénarios réussis dont les trois de balayage. Délai de ce seul parcours porté à 60 s sans retirer de contrôle ; les deux scénarios calendriers complémentaires passent en relance WebKit. Publication finale réussie : commit 004cb52, workflow 36233711851, 42 tests unitaires et 88 tests navigateur, format et déploiement au vert. Contrôle public Chromium mobile avec entrées tactiles : passage au lendemain puis retour, titre correct et aucune erreur JavaScript. Aucune recette sur iPhone physique prétendue.

## Historique

# Réveils iPhone abandonnés : 26 septembre 2026

À la demande de l’utilisateur, la partie native iPhone est abandonnée et retirée : projet apps/ios, tests Swift, guide Mac, workflow de compilation iOS et exclusions associées. Aucun réveil installé sur téléphone, aucune distribution App Store/TestFlight et aucune donnée Supabase spécifique aux alarmes à supprimer.

Le calendrier web, ses notifications et ses rappels restent inchangés. Ne pas reprendre le chantier natif sans nouvelle demande. Le code historique reste récupérable dans Git (dernière version documentée : 2df4fe6).

Validation du nettoyage : lint, compilation, format et 42 tests unitaires réussis. Suite navigateur : 84/85 au premier passage (échec de défilement WebKit), puis les 4 scénarios de défilement WebKit réussis en relance ciblée. Aucun code web ni Supabase modifié.

## Historique

# Edition partagee et diagnostic notifications : 26 septembre 2026

Demande : permettre les modifications entre proprietaire et administrateur, et expliquer les notifications absentes. Migrations 012 et 013 appliquees : save_record et change_occurrence autorisent owner/admin sur les evenements lisibles uniquement ; confidentialite, version et auteur original conserves. Interface EventEditor alignee. Nouveau RPC push_registered limite au compte courant ; le statut du navigateur seul ne suffit plus. Reactivation reutilise un abonnement existant au lieu de le remplacer.

Diagnostic production (sans contenu familial ni identifiants) : trois evenements admin partages, tous anterieurs a l abonnement proprietaire actuellement enregistre ; aucun job activite. Un appareil proprietaire actif, aucun appareil admin actif. Aucun renvoi retroactif ni notification de test envoyee. Les creations futures eligibles generent bien un job dans le test SQL.

Test cible reussi : edition reciproque owner/admin, occurrence, refus des evenements prives et des modifications par membre ordinaire, statut push isole par compte, notification apres inscription. Validation complete reussie : npm run check, 42 tests unitaires et 85 tests navigateur ; format conforme. Publication reussie : commit a561c19, workflow 36226796543 termine avec succes. Build public controle : droits partages et appel push_registered presents ; profil visible, ressources PWA HTTP 200, cle publique VAPID conforme, aucune erreur JavaScript. Reception sur telephone physique non verifiee.

## Historique

# Calendriers officiels, anniversaires et rappels enrichis : 26 septembre 2026

Demandes intégrées : notifications avec date, heure et titre ; rappels en minutes/heures/jours/semaines/mois ; jours fériés de France métropolitaine et vacances des zones A/B/C sélectionnables ; anniversaires annuels. Sources officielles embarquées, préférences de zones propres à cet appareil. Détails et limites : [CALENDAR_EXTRAS.md](CALENDAR_EXTRAS.md).

Production : migrations 009, 010 et 011 appliquées et fonction reminders version 2 ACTIVE. Les cinq dernières réponses du cron contrôlées sont HTTP 200, sans dépassement de délai. Le frontend public et son Service Worker enrichi sont publiés ; les appareils déjà installés doivent accepter la mise à jour proposée.

Autorisation explicite reçue : « autorisé », pour les migrations 010 et 011 remplaçant la validation partagée. Les deux migrations sont appliquées avec succès, sans suppression de données. Publication GitHub Pages réussie : commit 28c8d4a, workflow 36225762340 (tests, format, construction et déploiement réussis). Contrôle public Chromium : zones A/B/C visibles, préférence conservée après rechargement, aucune erreur JavaScript ; clé publique VAPID conforme et page/manifest/Service Worker HTTP 200.

Validation : 41 tests unitaires réussis ; les six scénarios ciblés des nouvelles fonctions passent sous Chromium bureau/mobile et WebKit mobile. Contrôle visuel du sélecteur à 320 pixels effectué. Format conforme. Validation complète finale npm run check réussie : lint, compilation, 41 tests unitaires et 85 tests navigateur. Journal local : .local/extras-complete.log. Aucune réception sur téléphone physique prétendue.

## Historique

# Notifications et rappels publiés : 26 septembre 2026

L’utilisateur a explicitement autorisé le transfert de .local/production-push.json vers Vault du projet xyfjpeojctmncpfymiyr. Les quatre valeurs ont été transférées sans affichage et sans régénération des clés. Migrations 007 et 008 appliquées, fonction reminders version 1 ACTIVE, cron family-reminders chaque minute et déclencheur wake_activity_worker installés. Appel authentifié réel : HTTP 200, processed=0 et activities=0 ; appels non autorisés : HTTP 401. Permissions SQL vérifiées : configuration refusée à anon/authenticated, réservée à service_role.

Cron réel vérifié : réponses HTTP 200 sans délai dépassé. Clé publique VAPID configurée et relue sur GitHub. L’utilisateur a explicitement autorisé le push vers main et le déploiement GitHub Pages associé. Publication Pages réussie : commit 5beb948, workflow 36222436380 terminé avec succès (tests, format et déploiement). Contrôle public Chromium : clé VAPID identique à la variable GitHub, page/manifest/Service Worker HTTP 200, profil visible et aucune erreur JavaScript. Aucun appareil abonné lors de l’activation ; aucune réception réelle sur téléphone prétendue. Parcours utilisateur : Profil > Notifications > Activer sur cet appareil. Sur iPhone, ouvrir d’abord l’application installée depuis l’écran d’accueil.

Validation du code : npm run check réussi, 36 tests unitaires et 78 tests navigateur Chromium/WebKit ; format:check réussi. Voir [PUSH_ACTIVATION.md](PUSH_ACTIVATION.md). Aucun changement du serveur RedM voisin.

## Historique

# Activation serveur des notifications : 26 septembre 2026

Reprise via MCP supabase-calendar réussie. Sur le projet xyfjpeojctmncpfymiyr, migrations 007 et 008 appliquées et fonction reminders version 1 déployée (ACTIVE). Configuration adaptée à Vault, puisque la CLI n’est pas authentifiée : RPC réservée au rôle serveur, avec contrôle du secret de déclenchement. HTTP 401 vérifié sans secret et avec un faux secret ; permissions SQL réelles vérifiées (anon/authenticated refusés, service_role autorisé).

**Activation bloquée par le contrôle automatique d’approbation :** lecture de .local/production-push.json pour transfert vers Vault refusée, faute d’autorisation explicite portant sur ce fichier et cette destination. L’utilisateur a autorisé l’activation générale ; ne pas lui demander une clé publique ou une installation de plugin. La prochaine autorisation doit porter précisément sur ce transfert. Aucun secret transféré, aucun cron ni déclencheur HTTP installé, aucune variable VAPID publique activée, aucune réception réelle vérifiée. Aucun appareil abonné lors du contrôle.

La fonction déployée refuse les appels tant que la configuration manque. Voir [PUSH_ACTIVATION.md](PUSH_ACTIVATION.md) pour la reprise exacte. Le serveur RedM voisin n’a pas été modifié.

Validation finale : npm run check réussi (36 tests unitaires et 78 tests navigateur Chromium/WebKit), format:check réussi. Premier chevauchement de validations corrigé par une exécution unique ; la validation finale est verte. Aucun test iPhone physique.

## Historique

# Appui long et notifications d’activité : 26 septembre 2026

Un appui de 500 ms sur la grille horaire ouvre un événement à cet emplacement, arrondi au quart d’heure, pour une durée initiale d’une heure. Un mouvement de plus de 10 px ou un défilement annule le geste. L’encadré enregistré se rouvre au toucher ; sa hauteur suit la durée modifiée. Aucun redimensionnement par glisser n’est implémenté.

Les notifications d’activité sont préparées dans la migration 007 et la fonction reminders : autres membres inscrits aux push, tous rôles, exclusion de l’auteur, confidentialité et file transactionnelle avec reprise. Le déclencheur HTTP après validation et le cron doivent être installés avec les secrets serveur. Connexion directe MCP supabase-calendar configurée dans Codex, limitée au projet xyfjpeojctmncpfymiyr. OAuth réussi et codex mcp list confirme enabled/OAuth. Les outils ne sont pourtant pas exposés dans cette conversation ; une nouvelle session doit vérifier leur disponibilité. Ne pas redemander une clé publique ni une installation de plugin. Configuration privée push générée dans .local/production-push.env, exclue de Git. Aucun envoi réel activé ni prétendu : voir [activation](PUSH_ACTIVATION.md).

Validation locale : npm run check réussi, 34 tests unitaires et 78 tests navigateur, dont création par appui long, geste annulé, édition et hauteur 1 h/2 h sur Chromium et WebKit. Un test supplémentaire réussi couvre les profils, invitations et modifications de rôle regroupées. Publication d6c05f7 réussie, workflow GitHub 36221052061 terminé avec succès. Contrôle public Chromium : appui long ouvre le volet de création ; authentification toujours requise. Installation Supabase encore non effectuée, réception push réelle non vérifiée.

## Historique

# Entrée unique par le calendrier : 26 septembre 2026

La route / affiche le calendrier pour tous, y compris hors connexion au compte. L’ancienne page HomePage est supprimée, l’onglet Accueil retiré, et les liens de retour/erreur renommés vers le calendrier. /calendrier reste compatible avec les anciens liens. Les fonctions familiales gardent leur demande de connexion ; aucune donnée privée n’est rendue publique.

Le retour mois → année anime désormais la grille et le titre vers la miniature du mois affiché, recentrée dans la vue annuelle. La réduction des animations désactive le zoom dans les deux sens. Le bouton du menu reçoit explicitement le focus avant ouverture pour que Safari le restitue à la fermeture.

Nouvelle icône statique représentant un calendrier noir et rouge, déclinée en SVG, PNG 192/512, Apple 180 et maskable. Elle ne prétend pas afficher la date du jour ; les installations iPhone existantes peuvent conserver leur ancienne icône. Rendu PNG contrôlé visuellement.

Publication a25166d réussie, workflow GitHub 36219752816. Contrôle public : calendrier à la racine, aucun onglet Accueil, dézoom et icône calendrier vérifiés.

## Historique

# Correctif Aujourd’hui et défilement : 26 septembre 2026

Signalement utilisateur : Aujourd’hui revient sur 2027 et le défilement s’interrompt régulièrement sur iPhone. Le bouton rafraîchit maintenant l’horloge et remet à zéro la légende de période avant de recréer la vue. La vue annuelle centre le jour courant, avec un positionnement absolu. L’ancien recalage relatif conservait une dépendance à la position antérieure ; le signalement matériel n’a pas été reproduit sur un iPhone physique.

Le chargement anticipé ajoute quatre périodes en fin sans écrire la position de défilement. Préchargement de cinq périodes précédentes ; compensation et recyclage uniquement après 220 ms sans mouvement et sans contact tactile. Fenêtre au repos limitée à 10 années ou 16 mois/jours, temporairement extensible pendant le geste. Le test instrumenté vérifie l’absence de scrollTo/scrollBy pendant un geste simulé ; la fluidité tactile physique reste à confirmer.

Validation : npm run check et format réussis, 27 tests unitaires et 72 tests navigateur. Déploiement 53f5a97 réussi, workflow GitHub 36197060509. Contrôle public Chromium à 402 × 720, horloge fixée au 26 septembre 2026 : après navigation vers 2027, Aujourd’hui affiche 2026 et le 26 visible avec fond rouge rgb(255, 65, 75).

## Historique

# Interface et défilement continu : 26 septembre 2026

Palette noire et rouge commune à toutes les pages, au manifest et aux icônes. Les préférences de thème historiques ne modifient plus cette identité, conformément à la demande explicite de l’utilisateur. Profil, foyer et formulaire de tâche épurés avec sections repliables. Zoom du mois depuis la grille annuelle, fermeture douce des volets et réduction des animations respectée.

Défilement vertical continu dans les deux sens pour les années, mois et journées. Fenêtre recyclée limitée à 4 années, 8 mois ou 5 jours ; position conservée lors du recyclage, titre et semaine mis à jour avec la période visible. Retour Aujourd’hui et accès direct à une année dans le sélecteur de vue. Navigation de l’an 0 à 275759 (dernière année complète prise en charge par Temporal), pas d’infini littéral. Année 0 affichée explicitement selon la numérotation astronomique. Les années extrêmes concernent la navigation ; la persistance des événements conserve les contraintes existantes de la base.

Création de périodes : bouton Sélect. dans le mois, sélection/désélection conservée au défilement, compteur et action dès deux jours. La période couvre toutes les dates entre le premier et le dernier jour cochés, bornes incluses. Types garde/vacances/vacances scolaires/autre ; garde rattachée à un enfant existant, sans récurrence imposée. Persistance via le formulaire et les droits existants. Aucun import automatique des vacances scolaires.

Recette locale : 69 tests navigateur Chromium/WebKit réussis après correction du positionnement initial des journées ; captures année et transition entre mois contrôlées à 402 × 874. Le parcours de période couvre deux mois, la désélection, les changements journée/horaires, une garde liée à un enfant et la relecture après rechargement. npm run check et format réussis : 27 tests unitaires et 69 tests navigateur. Publication réussie : commit 75b3049, workflow GitHub 36195633705. Version publique contrôlée dans Chromium à 402 × 874 : sélection de deux jours, bouton Créer une période actif, fond noir et aucune erreur JavaScript. Aucune modification Supabase, aucun changement des limites d’invitations et de notifications décrites ci-dessous.

## Historique

# Nouvelle interface calendrier : 25 septembre 2026

L’utilisateur demande une interface reprenant ses captures iPhone, puis précise que le calendrier doit être la page principale après connexion. Accueil connecté et sorties de connexion/confirmation/récupération ouvrent désormais le calendrier. L’ancien tableau de bord ne sert plus d’accueil.

Vues année à 12 mois, mois et journée horaire, fond noir et accent rouge. Menu à grandes icônes pour tâches, courses, garde, famille et profil ; retour au calendrier depuis les rubriques. Recherche annuelle sur les événements visibles, ajout et édition en volet, options détaillées repliées. Gestes horizontaux pour changer de période, fondu et ouverture douce respectant la réduction des animations. Aucune barre système iPhone fictive.

Les données et permissions Supabase restent utilisées. Pas de modification de la base. Les invitations ne déclenchent toujours aucun e-mail et les rappels serveur restent non déployés.

Recette : captures à 402×874 examinées ; parcours existants validés et nouveau parcours année/mois/jour, création réelle en base de test, recherche et menu testé sur Chromium et WebKit. Publication réussie : commit 05dcc6a, workflow GitHub 36192713865. npm run check et format réussis : 27 tests unitaires et 60 tests navigateur. Menu de la version publique contrôlé dans Chromium à 402×874, sans erreur JavaScript. La réception sur iPhone physique reste à vérifier par l’utilisateur.

## Historique

# État actuel : 25 septembre 2026

L’utilisateur autorise la réalisation et la publication de toutes les phases. Hébergement choisi : GitHub Pages, dépôt Nels63640/calendrier-public.

Foyers, invitations, rôles, enfants et catégories, événements avec récurrence/exceptions/gardes, tâches, courses, synchronisation et cache privé sont implémentés. Lecture hors connexion pendant 7 jours ; journal de 100 mutations simples maximum, versions et identifiants idempotents. Export et suppression du compte disponibles.

Validation locale : npm run check réussi, 27 tests unitaires/PostgreSQL et 57 tests navigateur Chromium/WebKit. Auth HTTP simulé dans les tests ; moteur SQL réel via PGlite.

L’utilisateur confirme « success » après INSTALL.sql. L’API réelle reconnaît households et refuse les lectures anonymes avec le code PostgreSQL 42501. Auth réel vérifié en lecture : e-mail activé, inscriptions ouvertes, confirmation obligatoire. Aucune inscription ni réception de courriel réelle vérifiée. Les paramètres Auth et les modèles de codes restent à appliquer, et aucun SMTP n’est disponible.

GitHub Pages publié : https://nels63640.github.io/calendrier-public/ . Workflow 36189537272 réussi, commit applicatif 0dfdf6b. HTTP 200 pour page, manifest, Service Worker et icône ; formulaire public actif et rechargement du lien profond vérifiés dans Chromium. Variables publiques du dépôt configurées. Moteur de rappels et SQL de planification préparés, mais fonction serveur, secrets VAPID et cron non déployés. Réception sur iPhone non vérifiée.

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

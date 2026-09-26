# Activation des notifications du foyer

## État au 26 septembre 2026

Connexion MCP `supabase-calendar` opérationnelle, limitée au projet `xyfjpeojctmncpfymiyr`. Migrations 007 (activité) et 008 (configuration Vault) appliquées ; fonction `reminders` version 1 déployée et ACTIVE. Les appels sans secret ou avec un secret incorrect répondent HTTP 401. La lecture de configuration est interdite à `anon` et `authenticated`, réservée à `service_role` et conditionnée au secret de déclenchement.

**Serveur activé :** secrets transférés dans Vault après le « oui » explicite de l’utilisateur. Cron chaque minute et déclencheur HTTP installés. Appel authentifié réel HTTP 200 (aucun travail en attente), clé publique VAPID configurée et vérifiée sur GitHub. L’utilisateur a explicitement autorisé le push vers main et le déploiement GitHub Pages associé. Publication Pages réussie : commit 5beb948, workflow 36222436380 terminé avec succès (tests, format et déploiement). Contrôle public Chromium : clé VAPID identique à la variable GitHub, page/manifest/Service Worker HTTP 200, profil visible et aucune erreur JavaScript. Aucun appareil abonné lors du contrôle ; aucune réception réelle vérifiée.

Le refus automatique initial est levé par l’autorisation explicite portant sur le fichier et le projet. Aucune clé régénérée ; aucune valeur privée affichée ou versionnée.

## Configuration retenue

La CLI Supabase n’est pas authentifiée, alors que le MCP l’est. Le moteur lit donc les trois valeurs VAPID via `public.worker_push_config(p_token)`, avec son identité serveur fournie par Supabase. La fonction SQL vérifie le secret de déclenchement conservé dans Vault et ne retourne jamais ce secret. Les navigateurs ne peuvent pas exécuter cette fonction.

Les secrets ne sont pas intégrés au code de la fonction, aux migrations ou au site public. Vault stocke les valeurs chiffrées ; voir [documentation Supabase Vault](https://supabase.com/docs/guides/database/vault). Les clés locales déjà préparées doivent être conservées pour éviter d’invalider de futurs abonnements.

## Mise en service effectuée

1. Quatre valeurs transférées depuis .local/production-push.json vers Vault sous leurs noms existants : REMINDER_CRON_SECRET, VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
2. Moteur reminders appelé avec le secret : HTTP 200, processed=0 et activities=0.
3. Scripts setup-reminder-cron.sql et setup-activity-push.sql appliqués via MCP ; cron actif et déclencheur installé.
4. Variable GitHub VITE_VAPID_PUBLIC_KEY configurée et relue ; publication Pages réussie, commit 5beb948 et workflow 36222436380. Clé VAPID et chargement PWA vérifiés sur le site public.
5. Réception sur appareils à vérifier après activation volontaire dans Profil > Notifications > Activer sur cet appareil.

Les migrations 001 à 006 existaient déjà. Ne pas rejouer `INSTALL.sql` ni les migrations 007/008 sur cette base. La migration 008 nécessite Vault, fourni sur le projet Supabase ; le test local en simule uniquement la vue pour vérifier les permissions.

## Utiliser les rappels avant événement

Dans le formulaire de création ou de modification, ouvrir « Répétition, partage et autres options », puis « Rappels, en minutes avant le début ». Exemple : 15, 60 pour être averti 15 minutes et une heure avant. Jusqu’à cinq délais, de 0 à 43 200 minutes (30 jours) ; aucun rappel par défaut. Les délais sont partagés avec l’événement : les membres autorisés à le voir et inscrits aux notifications peuvent recevoir les rappels, auteur compris. Le cron serveur fonctionne aussi application fermée ; la réception exacte dépend du réseau et du système.

## Recette réelle à effectuer

Deux membres autorisent les notifications sur leurs appareils. Sur iPhone, ouvrir l’application installée depuis l’écran d’accueil. Créer et modifier un événement partagé, une tâche et un article de courses : l’autre membre doit recevoir une alerte, l’auteur aucune. Vérifier aussi un administrateur et le propriétaire. Fermer l’application destinataire et refaire l’essai. Un événement privé ne doit pas produire d’alerte pour un autre membre. Vérifier l’ouverture de la bonne rubrique, la désactivation et une reprise après erreur temporaire.

## Fonctionnement et limites

Les événements, périodes, tâches, courses, enfants, catégories, invitations, profils, rôles et changements du foyer passent par une file transactionnelle privée. Les changements d’une transaction sont regroupés par appareil et foyer. Les droits sont revérifiés à la prise en charge, les endpoints expirés supprimés et les tentatives limitées. Aucun titre ni contenu familial n’est envoyé sur l’écran verrouillé. Les mutations rejouées avec le même identifiant ne créent pas d’alerte supplémentaire.

La file conserve au maximum une journée d’alertes ; cinq tentatives sont possibles. Une erreur entre acceptation par le fournisseur push et confirmation en base peut provoquer une nouvelle livraison ; l’identifiant stable de l’alerte limite les doublons d’affichage. La réception dépend des permissions, du réseau et du système du téléphone. Les tests PGlite et les tests du transport simulé ne prouvent pas une réception sur iPhone réel.

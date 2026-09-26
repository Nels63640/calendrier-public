# Activation des notifications du foyer

État : code et tests locaux prêts, installation serveur non effectuée. La clé publique Supabase permet l'utilisation de l'application, pas l'administration des fonctions ni des secrets. Une connexion administrateur au projet xyfjpeojctmncpfymiyr est nécessaire. Ne transmettre aucun secret dans la conversation.

## Déploiement sur le projet existant

1. Vérifier les migrations déjà installées. Appliquer uniquement supabase/migrations/202609260007_activity_notifications.sql après les migrations 001 à 006. Ne pas rejouer INSTALL.sql sur la base existante.
2. Exécuter node scripts/prepare-production-push.mjs : les clés VAPID et le secret de déclenchement sont conservés dans .local/production-push.env, exclu de Git. Réutiliser ces clés aux déploiements suivants.
3. Avec la CLI Supabase authentifiée, exécuter npx supabase secrets set --env-file .local/production-push.env --project-ref xyfjpeojctmncpfymiyr puis npx supabase functions deploy reminders --project-ref xyfjpeojctmncpfymiyr. La fonction utilise verify_jwt=false et vérifie elle-même le secret du déclencheur.
4. Enregistrer dans Vault un secret nommé REMINDER_CRON_SECRET avec la même valeur que dans la configuration privée de la fonction. Ne jamais placer sa valeur dans les fichiers versionnés ou les journaux.
5. Appliquer supabase/setup-reminder-cron.sql puis supabase/setup-activity-push.sql. Le déclencheur réveille le serveur après validation de la transaction ; le cron reprend chaque minute les échecs temporaires et traite les rappels.
6. Configurer la variable publique GitHub VITE_VAPID_PUBLIC_KEY avec VAPID_PUBLIC_KEY uniquement, puis relancer le déploiement Pages. Ne pas activer cette variable tant que le serveur n'est pas opérationnel.

## Recette réelle à effectuer

Deux membres autorisent les notifications sur leurs appareils. Sur iPhone, ouvrir l'application installée depuis l'écran d'accueil. Créer et modifier un événement partagé, une tâche et un article de courses : l'autre membre doit recevoir une alerte, l'auteur aucune. Vérifier aussi un administrateur et le propriétaire. Fermer l'application destinataire et refaire l'essai. Un événement privé ne doit pas produire d'alerte pour un autre membre. Vérifier l'ouverture de la bonne rubrique, la désactivation et une reprise après erreur temporaire.

## Fonctionnement et limites

Les événements, périodes, tâches, courses, enfants, catégories, invitations, profils, rôles et changements du foyer passent par une file transactionnelle privée. Les changements d'une transaction sont regroupés par appareil et foyer. Les droits sont revérifiés à la prise en charge, les endpoints expirés supprimés et les tentatives limitées. Aucun titre ni contenu familial n'est envoyé sur l'écran verrouillé. Les mutations rejouées avec le même identifiant ne créent pas d'alerte supplémentaire.

La file conserve au maximum une journée d'alertes ; cinq tentatives sont possibles. Une erreur entre acceptation par le fournisseur push et confirmation en base peut provoquer une nouvelle livraison ; l'identifiant stable de l'alerte limite les doublons d'affichage. La réception dépend des permissions, du réseau et du système du téléphone. Les tests PGlite et les tests du transport simulé ne prouvent pas une réception sur iPhone réel.

Références : [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Vault](https://supabase.com/docs/guides/database/vault).

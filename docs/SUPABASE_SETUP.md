# Mise en service Supabase

## Base

INSTALL.sql a été exécuté avec succès selon l’utilisateur le 25 septembre 2026. Ne pas le relancer : il s’agit de l’installation initiale. Utiliser des migrations additionnelles pour les futures évolutions. Les tables privées refusent volontairement les requêtes anonymes.

## Authentification

Dans Authentication, conserver Email et la confirmation des adresses activés. Régler la longueur minimale à 12 caractères et l’expiration des codes à 900 secondes. Site URL : https://nels63640.github.io/calendrier-public/

Remplacer les modèles Confirm signup et Reset password par [confirmation.html](../supabase/templates/confirmation.html) et [recovery.html](../supabase/templates/recovery.html). L’application attend un code {{ .Token }}, pas le lien par défaut.

Un fournisseur SMTP doit être configuré dans Supabase pour envoyer aux destinataires extérieurs à l’équipe du projet. L’utilisateur n’en possède pas encore. Les secrets SMTP se saisissent uniquement dans les paramètres Supabase.

## Rappels

Déployer supabase/functions/reminders avec son import map. Configurer les secrets VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT et REMINDER_CRON_SECRET attendus par le code ; vérifier leurs noms exacts dans la fonction. Ajouter uniquement la clé publique dans la variable GitHub VITE_VAPID_PUBLIC_KEY. Puis configurer Vault et supabase/setup-reminder-cron.sql. La fonction utilise son contrôle de secret propre, verify_jwt=false ne suffit pas à autoriser les appels.

Cette partie n’est pas déployée. Ne pas annoncer de rappels automatiques avant un essai réel, y compris un test de désabonnement et de modification d’échéance.

## Sauvegarde et recette

L’export utilisateur conserve ses données accessibles ; il ne constitue pas une sauvegarde complète réimportable. Avant usage durable, prévoir une sauvegarde PostgreSQL privée et tester la restauration dans un autre projet. Aucun exercice de restauration cloud n’a été effectué.

Tester deux comptes réels : réception du code, connexion, foyer et invitation, événement privé invisible à l’autre compte, modifications depuis deux appareils et retour hors ligne. Tester aussi récupération du mot de passe et PWA sur iPhone.

Références : [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [modèles de courriel](https://supabase.com/docs/guides/auth/auth-email-templates), [planification](https://supabase.com/docs/guides/functions/schedule-functions).

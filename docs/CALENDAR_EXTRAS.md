# Calendriers et rappels enrichis : 26 septembre 2026

## Demandes utilisateur

Les notifications doivent préciser la date, l’heure et la nature de l’événement. La saisie des rappels doit proposer minutes, heures, jours, semaines et mois. Ajouter les jours fériés, anniversaires et vacances scolaires ; territoire confirmé : France métropolitaine, zones A/B/C.

## Notifications

Exemple : « Rappel : 27/09/2026 à 14:30 · Dentiste ». Ajout, modification et suppression reprennent le même format. Journées entières indiquées explicitement. Jusqu’à trois éléments nommés dans une notification groupée, avec un compteur pour les suivants. Les heures sont celles du fuseau de l’événement.

Les détails minimaux sont sélectionnés côté serveur après contrôle des droits : titre, début, journée entière et fuseau. Ni description ni liste de personnes dans le push. Les rappels conservent les détails de l’occurrence réellement planifiée, y compris son déplacement. Les changements d’occurrence sont identifiés dans la transaction SQL. Un appareil conservant l’ancien Service Worker reste compatible mais affiche encore le message générique jusqu’à la mise à jour.

Cette demande remplace la décision antérieure de masquer tous les titres sur l’écran verrouillé. Les réglages du système du téléphone gouvernent l’affichage final.

## Rappels

Sélecteur commun aux événements, tâches et anniversaires : raccourcis, quantité, unité, suppression, cinq lignes maximum. Aperçu de la date de notification dans l’éditeur d’événement. Aucun rappel par défaut. Limites : 525 600 minutes, 8 760 heures, 365 jours, 52 semaines ou 12 mois ; zéro minute signifie à l’heure.

Les jours, semaines et mois sont civils dans le fuseau de l’événement ; les minutes/heures sont des durées. Le 31 mars moins un mois donne le dernier jour de février, en conservant l’heure locale. Les rappels historiques numériques sont conservés tels quels ; les modifier via le sélecteur applique les nouvelles unités. Le moteur déduplique les échéances identiques et recherche les occurrences jusqu’à 367 jours pour couvrir un rappel douze mois avant.

Les délais appartiennent à l’événement et concernent les membres autorisés à le voir, abonnés aux notifications. Les réglages ne sont pas des préférences personnelles indépendantes par membre.

## Jours fériés et vacances scolaires

Dans le menu du calendrier, « Mes calendriers » permet de masquer les jours fériés et de sélectionner une ou plusieurs zones scolaires. Les académies sont listées. Aucune zone imposée par défaut. Ces préférences d’affichage restent sur cet appareil, sans donnée familiale dans ce stockage.

Les données officielles sont un instantané embarqué, donc consultable hors connexion : jours fériés 2025 à 2028, périodes scolaires disponibles de 2025 à l’été 2028. Pas d’extrapolation des années scolaires futures. Les cartes officielles sont en lecture seule et ouvrent leur source. Les dates de reprise sont exclusives ; départ après la classe le premier jour indiqué. Quand seul le début des vacances d’été est publié, afficher uniquement ce début sans inventer de rentrée.

Sources : [API jours fériés](https://calendrier.api.gouv.fr/jours-feries/), [données du ministère de l’Éducation nationale](https://data.education.gouv.fr/explore/dataset/fr-en-calendrier-scolaire/). Métropole seulement ; Corse et calendriers ultramarins ne sont pas assimilés aux zones A/B/C.

Actualisation explicite : `node scripts/update-public-calendars.mjs`, puis vérifier le diff et publier. Le site n’effectue pas de mise à jour automatique de cet instantané.

## Anniversaires

« Ajouter un anniversaire » demande un nom, un jour et un mois, sans année de naissance. Enregistrement dans le foyer comme événement annuel, public au foyer ou privé selon le choix. Apparition chaque année et édition par le calendrier ordinaire. Le 29 février revient le 28 les années non bissextiles. Les rappels se calculent avant minuit, début de la journée entière ; le formulaire le précise.

## Installation et validation

Migrations additives 009 (détails), 010 (unités) et 011 (anniversaires), puis redéploiement de reminders et publication du frontend. Les files et abonnements existants sont conservés. Ne pas rejouer INSTALL.sql sur la base existante.

Validation et publication : voir PROJECT_STATE.md pour le résultat réel. Aucun test automatisé ne prouve la réception native d’une notification sur un téléphone.

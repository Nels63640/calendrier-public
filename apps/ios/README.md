# Réveils iPhone — iOS 26+

Application SwiftUI native complémentaire au calendrier web, avec AlarmKit. Les réveils sont personnels à cet iPhone, sans envoi à Supabase. Le bouton Calendrier ouvre le site existant dans le navigateur ; il ne remplace pas la PWA installée ni ses notifications.

## Sur le Mac

1. Installer **Xcode 26 ou plus récent** et l’ouvrir une première fois.
2. Récupérer ce dépôt (Git clone ou téléchargement ZIP depuis GitHub).
3. Installer XcodeGen : `brew install xcodegen` si Homebrew est déjà disponible.
4. Dans Terminal, depuis le dépôt : `bash apps/ios/prepare-mac.sh`.
5. Dans Xcode, sélectionner la cible **FamilyCalendar**, puis **Signing & Capabilities**. Choisir son équipe Apple personnelle et remplacer le Bundle Identifier par un identifiant unique.
6. Brancher l’iPhone, accepter la confiance, activer le mode développeur si Xcode le demande, choisir cet iPhone comme destination, puis **Run ▶**.
7. Dans l’application, autoriser les alarmes. Créer d’abord une alarme dans deux minutes, verrouiller l’écran et confirmer la sonnerie et son arrêt.

Aucun identifiant Apple, certificat ou secret n’est inclus. La signature et l’installation nécessitent une action sur le Mac. La signature personnelle gratuite doit être renouvelée régulièrement ; elle ne constitue pas une distribution durable. TestFlight/App Store nécessitent la préparation et la signature avec un compte développeur adapté. Cette livraison n’est pas une publication App Store.

## Fonctionnement

- Heure, nom, activation, modification et suppression.
- Date ponctuelle, jours sélectionnés chaque semaine ou une semaine sur deux.
- Semaine A définie par une date de référence ; semaine B opposée. La semaine commence lundi. L’alternance ne repose pas sur les numéros pairs/impairs ISO.
- Exemple : « Avec ma fille », 7 h 15, lundi–vendredi, semaine A ; second réveil à l’heure souhaitée, semaine B, **avec la même date de référence A**.
- Les horaires suivent le fuseau de l’iPhone. Ouvrir l’application après un changement de fuseau pour recalculer les dates ponctuelles préparées.
- Passage à l’heure d’été : une heure inexistante conserve ses minutes et est reportée après le saut. En automne, seule la première occurrence de l’heure doublée sonne.
- Sonnerie système et bouton Arrêter. Pas de son personnalisé ni de report « snooze » dans cette première version.
- Aucun lien automatique avec les événements de garde du foyer ; les semaines A/B se règlent explicitement.

## Limite des semaines alternées

AlarmKit fournit une récurrence hebdomadaire native, sans intervalle de deux semaines. Les réveils alternés sont donc préparés comme des dates ponctuelles jusqu’à **56 jours** à l’avance, dans une enveloppe applicative de **48 alarmes système** (ce n’est pas une garantie de quota Apple).

La liste indique la dernière date réellement programmée pour chaque réveil. **Rouvrir l’application avant cette date** prolonge la programmation. L’app renouvelle à son retour au premier plan, sans prétendre qu’un traitement en arrière-plan est garanti. Les réveils hebdomadaires ne dépendent pas de ce renouvellement.

Un refus de permission, un échec de stockage, un quota iOS ou une programmation partielle est visible. Une erreur ne doit jamais être interprétée comme une programmation réussie.

## Validation

`swift test --package-path apps/ios/AlarmCore` teste les dates, les changements d’heure, les semaines alternées, les bornes et les limites de capacité.

Le workflow GitHub `ios.yml` génère le projet Xcode et exécute les tests de persistance, permissions, reprise et annulation dans un simulateur. Il compile sans certificat. Un simulateur ne prouve pas la sonnerie sur l’iPhone : effectuer la recette physique ci-dessus avant de compter sur un réveil.

Sources : [AlarmKit](https://developer.apple.com/documentation/alarmkit), [exemple officiel de programmation](https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit).

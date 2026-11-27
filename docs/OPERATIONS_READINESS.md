# Exploitation et continuité — DealHunter

Dernière mise à jour : 25 novembre 2026.

## État actuel

- Projet Firebase : Spark ; aucune facturation Blaze activée.
- Firestore : région `eur3`.
- Aucun export Firestore complet, snapshot restaurable ou test de restauration n'a été confirmé.
- Les artefacts SAM/GSA existants sont des fichiers de collecte, pas des sauvegardes de la base.
- Les journaux GitHub Actions sont utiles au diagnostic mais ne garantissent pas qu'une automatisation se déclenche à l'heure prévue.
- Le dépôt ne contient pas de service de supervision indépendant ni de canal SMS.

## Sauvegarde : blocage du forfait Spark

L'export/import Firestore géré requiert le forfait Blaze, la facturation Google Cloud et un bucket Cloud Storage. Les lectures des documents exportés et le stockage peuvent entraîner des frais.

Documentation officielle :
- https://firebase.google.com/docs/firestore/manage-data/export-import
- https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024

Décision : ne pas activer Blaze et ne pas créer de bucket payant. Une sauvegarde complète restaurable reste un bloqueur de mise en production.

Alternative à étudier en restant sur Spark : export administratif ponctuel chiffré, clé conservée hors dépôt, contrôle d'accès, inventaire de toutes les collections et sous-collections, vérification de l'intégrité, procédure de restauration testée dans un projet isolé. Un simple export JSON du navigateur n'est pas une sauvegarde complète et ne doit pas être présenté comme telle. Aucun export n'est déclenché par cette PR.

## Surveillance proposée

PR #24 ajoute `.github/workflows/automation-watchdog.yml` :
- écoute les fins d'exécution matching, notifications et collecteurs BOAMP/BODACC/TED/SAM/GSA ;
- crée ou actualise une issue GitHub lorsqu'un workflow échoue ;
- ferme l'incident après une nouvelle exécution réussie ;
- effectue un contrôle quotidien de fraîcheur pour repérer les automatisations qui ne se déclenchent plus ;
- utilise les permissions minimales du jeton GitHub : `actions: read`, `contents: read`, `issues: write`.

Les collecteurs sont sérialisés par le groupe `dealhunter-feed-publication` et disposent de délais maximaux d'exécution pour limiter les courses à la publication et les jobs bloqués.

Limites :
- GitHub Actions peut retarder les tâches planifiées ;
- l'alerte est une issue GitHub et dépend des notifications GitHub configurées par le propriétaire ;
- ce n'est pas une alerte SMS ni une supervision indépendante ;
- un workflow réussi ne garantit pas la qualité, la fraîcheur ou l'exhaustivité des données collectées ;
- le watchdog ne devient actif qu'après fusion sur la branche par défaut et test des événements réels.

## Critères d'acceptation avant ouverture publique

1. Sauvegarde complète couvrant toutes les collections et sous-collections.
2. Chiffrement, droits d'accès, rétention et suppression des copies définis.
3. Procédure de restauration documentée et testée dans un environnement isolé.
4. Temps de reprise et perte maximale de données estimés.
5. Surveillance des échecs et de la fraîcheur vérifiée sur des événements réels.
6. Procédure d'intervention humaine documentée.

Statut : **continuité de service non certifiée — ouverture publique bloquée** jusqu'à mise en place et test d'une sauvegarde restaurable.


## 7. Décision de continuité sans dépense — 27 novembre 2026

### Ce qui est disponible et ce qui ne l'est pas

- Le projet reste sur Firebase Spark. Aucun export/import Firestore géré n'est configuré ; l'option documentée par Firebase nécessite Blaze et un bucket Cloud Storage.
- Les workflows GitHub Actions existants utilisent un secret de compte de service pour exécuter les workers matching et notifications. Ce secret donne un accès serveur à Firestore ; il ne doit jamais être réutilisé à la légère pour produire une archive contenant toutes les données personnelles et commerciales.
- Un artefact GitHub Actions, un fichier JSON téléchargé depuis le navigateur ou les fichiers des collecteurs publics ne constituent pas une sauvegarde complète restaurable.
- Aucun export de la base, dépôt d'archive, clé de chiffrement, copie hors site ou restauration n'a été effectué ni vérifié dans cette étape.

### Option gratuite envisageable, mais non autorisée/validée à ce stade

Une sauvegarde administrative ponctuelle pourrait être étudiée sans Blaze en utilisant un poste local contrôlé par le propriétaire et un compte de service dédié, temporaire et strictement limité à la lecture des collections nécessaires. Avant toute exécution, il faudrait :

1. Cartographier toutes les collections racines, sous-collections, documents de configuration et données dérivées ; vérifier les limites de pagination et les documents volumineux.
2. Créer un compte de service distinct avec permissions minimales de lecture, sans réutiliser le compte des workers ; définir sa révocation après opération.
3. Chiffrer localement l'archive avant toute copie, avec une clé créée et conservée hors du dépôt, des Actions, du fichier d'archive et du poste de travail partagé.
4. Vérifier l'intégrité par inventaire, comptages et empreintes ; contrôler que les secrets et clés ne figurent pas dans l'archive.
5. Stocker la copie chiffrée dans un emplacement privé contrôlé par le propriétaire, avec rétention et procédure de suppression définies.
6. Restaurer dans un projet Firebase isolé, jamais dans la production, puis comparer les comptages et tester les parcours critiques.
7. Révoquer le compte temporaire et documenter les limites, l'heure de sauvegarde et la fenêtre de perte de données.

Cette option n'est pas encore un mécanisme disponible : elle dépend de la configuration IAM, de la capacité à protéger la clé et d'un test de restauration réel. Aucun outil de sauvegarde gratuit et restaurable n'est certifié à ce jour.

### Décision de sécurité

Ne pas lancer de dump Firestore via GitHub Actions, ne pas publier d'archive en artefact de workflow, ne pas placer de clé de chiffrement dans le dépôt ou les secrets Actions et ne pas activer Blaze. Tant qu'une méthode de sauvegarde complète et de restauration isolée n'a pas été exécutée et vérifiée, la continuité reste non certifiée et l'ouverture publique demeure bloquée.

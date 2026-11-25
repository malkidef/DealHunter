# Continuité de service — sauvegardes et surveillance

Dernière revue : 25 novembre 2026.

## 1. État de sauvegarde Firestore

Le projet DealHunter utilise actuellement le forfait Firebase Spark. Aucun export Firestore, snapshot restaurable ou test de restauration n'a été confirmé dans le dépôt.

Le mécanisme officiel d'export/import géré Firestore nécessite :
- un projet Firebase au forfait Blaze et une facturation Google Cloud activée ;
- un bucket Cloud Storage ;
- des permissions IAM adaptées ;
- des coûts possibles de lecture Firestore et de stockage Cloud Storage.

Références officielles :
- https://firebase.google.com/docs/firestore/manage-data/export-import
- https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024

Décision : ne pas activer Blaze et ne pas créer de bucket payant dans cette phase.

## 2. Pourquoi GitHub Actions n'est pas une sauvegarde Firestore

Les fichiers JSON versionnés dans le dépôt sont des flux publics ou des données de référence. Ils ne contiennent pas l'ensemble des documents Firestore et ne constituent pas une copie restaurable de la base.

Les artefacts GitHub existants pour SAM/GSA sont des sorties de collecte, avec une rétention de 14 jours. Ils ne sauvegardent pas les comptes, profils, demandes, messages, transactions, notifications ou documents de matching Firestore.

Il ne faut pas copier automatiquement les documents Firestore contenant des données personnelles dans :
- le dépôt Git ;
- les journaux Actions ;
- des artefacts Actions accessibles aux collaborateurs ;
- un stockage public ou une URL non protégée.

## 3. Options avant mise en production

### Option A — rester sur Spark
Concevoir un export administratif ponctuel et chiffré, dont la clé est détenue hors du dépôt, après analyse de la couverture réelle des collections, des données de tiers et de la restauration. Un export client partiel ou un JSON téléchargé sans chiffrement ne doit pas être présenté comme une sauvegarde complète.

### Option B — sauvegarde gérée Google
Envisager Blaze uniquement après présentation du coût estimé, de la configuration du bucket, des règles de rétention, des droits d'accès et d'un test de restauration. Cette option nécessite une décision explicite et un moyen de paiement.

Aucune des deux options n'est actuellement mise en œuvre.

## 4. Surveillance proposée dans PR #24

Le workflow `.github/workflows/automation-watchdog.yml` :
- écoute les fins d'exécution des workers matching et notifications et des collecteurs BOAMP, BODACC, TED, SAM et GSA ;
- crée ou actualise une issue GitHub lorsqu'un workflow échoue ;
- clôt l'incident après une exécution réussie ;
- effectue un contrôle quotidien de fraîcheur pour détecter les tâches qui ne se déclenchent plus ;
- utilise uniquement le jeton GitHub du workflow avec les permissions minimales `actions: read`, `contents: read`, `issues: write`.

Les collecteurs sont également sérialisés par un groupe de concurrence partagé afin d'éviter les publications simultanées dans le dépôt, et des délais maximaux d'exécution sont ajoutés.

Limites :
- GitHub Actions peut retarder les exécutions planifiées ;
- l'alerte est une issue GitHub, pas un SMS ou un appel téléphonique ;
- le propriétaire doit avoir activé les notifications GitHub adaptées ;
- le watchdog ne prouve pas qu'une collecte contient des données exactes, fraîches ou complètes ;
- le workflow doit être fusionné sur la branche par défaut et testé sur de vrais événements avant d'être considéré actif.

## 5. Critères d'acceptation d'une sauvegarde

Avant d'ouvrir DealHunter au public :
1. inventaire des collections et sous-collections couvertes ;
2. export chiffré et contrôle d'intégrité ;
3. accès réservé aux personnes autorisées ;
4. rétention et suppression des anciennes copies définies ;
5. procédure de restauration écrite ;
6. restauration testée dans un projet isolé ;
7. mesure du temps de reprise et de la perte maximale de données ;
8. contrôle des données personnelles et des références à des tiers.

Statut : **bloqueur de mise en production** tant qu'une copie restaurable et un test de restauration ne sont pas établis.

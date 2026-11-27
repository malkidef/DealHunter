# Procédure de conception — sauvegarde Firestore locale chiffrée

Date de conception : 27 novembre 2026  
Statut : **spécification uniquement — aucun accès aux données de production, aucun export ni changement IAM effectué**.

## 1. Objectif et limites

Préparer une copie privée, locale et chiffrée des données DealHunter, sans Cloud Functions, sans GitHub Actions, sans bucket Cloud Storage et sans activation de Firebase Blaze.

Cette méthode n'est pas l'export managé Firestore. Elle repose sur des lectures Admin SDK effectuées depuis un poste contrôlé, avec un accès temporaire en lecture seule. Elle peut produire une sauvegarde logique utile, mais **ne garantit pas un instantané transactionnel cohérent à un instant T** : des écritures intervenant pendant le parcours peuvent être reflétées à des moments différents. La fenêtre de collecte doit être inscrite dans le manifeste. Si une cohérence stricte de snapshot est indispensable, cette méthode locale ne suffit pas et l'export managé doit faire l'objet d'une décision distincte avec estimation de coûts.

## 2. Conditions préalables bloquantes

Aucune commande de lecture de production ne doit être lancée avant validation explicite du propriétaire.

- Confirmer le projet Firebase exact et le compte Google utilisé.
- Créer ou faire autoriser une identité de sauvegarde dédiée, temporaire, sans rôle Owner, Editor, Firebase Admin ni accès aux secrets.
- Accorder uniquement les permissions Firestore en lecture nécessaires (rôle prédéfini Datastore Viewer ou rôle personnalisé minimal vérifié). Vérifier que les permissions permettent effectivement de lister les collections et lire les documents sans aucune écriture.
- Utiliser une authentification locale courte durée (ADC / impersonation si disponible) ; ne pas créer ni télécharger de clé JSON de compte de service.
- Utiliser un outil local auditable, versionné et exécuté depuis une copie propre du dépôt. Ne jamais utiliser le compte de service des workers GitHub Actions.
- Chiffrer avant toute écriture persistante avec un outil de chiffrement éprouvé tel que age, en mode destinataire public. La clé privée de déchiffrement reste hors du poste de sauvegarde et hors du dépôt.
- Vérifier l'espace disque, les droits d'accès au répertoire privé et l'absence de synchronisation automatique vers un cloud personnel.

Si l'accès minimal nécessite un rôle plus large, une clé persistante, un changement payant ou une permission d'écriture, **arrêter et demander une nouvelle décision**.

## 3. Périmètre à inventorier

Ne pas se fier uniquement aux règles Firestore : une règle ne constitue pas un inventaire exhaustif des collections réellement présentes. L'outil doit découvrir récursivement les collections racines et sous-collections avec les API Admin SDK, puis comparer le résultat à une liste d'attente documentée.

Collections et familles déjà identifiées dans les règles et la documentation :

- comptes : `users/{uid}`, sous-collections `sellerOffers` et `buyerNeeds` ;
- annonces et besoins : `publicOffers`, `publicNeeds` ;
- mises en relation et échanges : `matchRequests`, `matchMessages`, `matchContacts`, `matches` ;
- ventes et avis : `deals`, `dealReviews` ;
- services : `publicServiceOffers`, `publicServiceRequests`, `serviceMatchRequests`, `serviceMatchMessages` ;
- emploi : `publicWorkerProfiles`, `publicWorkOpenings`, `workMatchRequests`, `workMatchMessages` ;
- entreprise et modération : `companyProfiles`, `companyVerifications`, `verificationRequests`, `trustReports` ;
- notifications : `notifications`.

Les collections techniques, documents système, éventuelles nouvelles collections et sous-collections doivent être signalés séparément. Ne jamais conclure « sauvegarde complète » si un chemin n'a pas pu être énuméré ou lu.

## 4. Format et collecte

- Export logique JSONL ou format équivalent avec un enregistrement par document : chemin complet, données typées et métadonnées de collecte.
- Préserver exactement les types Firestore : Timestamp, GeoPoint, DocumentReference, bytes, valeurs nulles et tableaux/objets imbriqués. Ne pas convertir silencieusement les références ou dates en chaînes ambiguës.
- Parcourir chaque collection par pages bornées, ordre stable sur document ID et curseur ; gérer explicitement les sous-collections des documents.
- Détecter les doublons, les erreurs, les pages incomplètes, les documents ignorés et les limites API ; toute anomalie rend la sauvegarde « partielle ».
- Écrire le flux directement dans le chiffreur ; ne pas créer de dump JSON en clair sur disque, dans /tmp, dans les logs, dans Git ou dans les artefacts CI.
- Le manifeste chiffré doit contenir projet, identifiant de sauvegarde, versions outil/SDK, début et fin UTC, liste des chemins, nombre de documents, erreurs, troncatures, empreintes SHA-256 du flux chiffré et statut global.
- Ne pas journaliser le contenu des documents, emails, téléphones, tokens ou données personnelles.
- Une lecture paginée n'est pas un snapshot cohérent : signaler explicitement la fenêtre temporelle et cette limite.

## 5. Contrôles de réussite

Une sauvegarde ne peut être marquée « candidate à restauration » que si :

1. toutes les collections et sous-collections découvertes sont inventoriées ;
2. chaque parcours est terminé sans erreur ni troncature ;
3. le nombre de documents et les compteurs par chemin sont enregistrés ;
4. le fichier chiffré est fermé proprement et son empreinte est calculée ;
5. le déchiffrement de contrôle est réalisé vers un flux en mémoire ou un environnement temporaire protégé ;
6. les types Firestore et les chemins sont validés ;
7. une restauration est testée dans un projet Firebase isolé ou un émulateur, jamais dans la production ;
8. les comptages, échantillons synthétiques et relations critiques sont comparés ;
9. les limites de cohérence temporelle et la fenêtre de perte potentielle sont consignées.

Le simple fait qu'un fichier chiffré existe ou que son empreinte soit calculée ne prouve pas qu'il est restaurable.

## 6. Restauration isolée et sécurité

- Utiliser un projet de test distinct, sans lien avec les utilisateurs ou paiements réels.
- Refuser par défaut toute cible dont l'identifiant ne correspond pas explicitement au projet isolé autorisé.
- Ne jamais proposer de restauration en production dans l'outil.
- Contrôler les collisions, les références, les types, les sous-collections et les règles ; appliquer les règles et index séparément selon une procédure dédiée.
- Supprimer les fichiers temporaires en clair, révoquer l'accès temporaire après contrôle et conserver la clé privée séparément.
- Définir la durée de conservation et la suppression sécurisée des sauvegardes, qui contiennent des données personnelles et commerciales.

## 7. Arrêts obligatoires

Arrêter immédiatement en cas de permission supérieure à la lecture, de demande d'activation Blaze, de frais, d'absence de clé de chiffrement indépendante, de collection non inventoriée, d'erreur ou de troncature, de cible de restauration ambiguë, ou de tentative d'écriture dans le projet de production.

## 8. État de réalisation

- [x] Architecture gratuite locale décrite.
- [x] Séparation du compte de sauvegarde et des secrets des workers documentée.
- [x] Limite de cohérence d'un export par lectures paginées explicitée.
- [x] Inventaire initial des familles Firestore documenté.
- [ ] Outil de sauvegarde écrit et revu.
- [ ] Autorisation explicite de lecture des données de production.
- [ ] Identité temporaire strictement en lecture seule configurée.
- [ ] Première sauvegarde chiffrée complète exécutée.
- [ ] Restauration isolée réussie.
- [ ] Révocation de l'accès temporaire et vérification de suppression des temporaires.

**Conclusion :** la conception est prête à être transformée en outil local après revue technique. Elle ne constitue pas une sauvegarde opérationnelle et ne débloque pas encore l'ouverture publique. Aucun coût n'a été engagé et aucun service payant n'a été activé.

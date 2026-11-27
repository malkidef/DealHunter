# État de préparation au lancement — DealHunter

Dernière revue : 25 novembre 2026. Branche principale auditée : `main` (`dd5c234e` avant les branches de finalisation). Les corrections complémentaires restent dans des PR brouillon non fusionnées.

## Vérifications GitHub du 24 novembre 2026

- Commit principal audité : `7d1366ded3867752b6a2c3d2417c2aa11b4267d8` — « Make moderation and private messaging actions retryable ».
- Workflow « Tests DealHunter » : réussi sur ce commit (exécution [45471018287](https://github.com/malkidef/DealHunter/actions/runs/45471018287)).
- Workflow « Tests des règles Firestore » : réussi sur ce commit (exécution [45471018133](https://github.com/malkidef/DealHunter/actions/runs/45471018133)).
- Workflow « pages build and deployment » : réussi sur ce commit (exécution [45471016943](https://github.com/malkidef/DealHunter/actions/runs/45471016943)).
- Les étapes du workflow applicatif ont réussi : tests Python, tests du moteur de matching, vérification des fonctions Firebase et vérification JavaScript de l'application.
- Ces réussites valident les tests automatisés et la publication GitHub Pages. Elles ne prouvent pas que Firebase est configuré en production, que le secret de service account existe, ni que les parcours réels fonctionnent avec deux comptes.

## État du dépôt et publication

- Les dernières corrections intégrées à `main` couvrent la publication et l'édition des offres/besoins, le chargement des demandes de mise en relation, le retour d'état des actions Firebase, la confirmation des transactions, ainsi que la reprise après échec des actions de modération et de messagerie privée.
- GitHub Pages a été construit et publié avec succès sur le commit audité.
- Le projet Firebase `dealhunter-3747b` a été confirmé par son propriétaire.
- Le déploiement Firestore (règles et index uniquement) a été confirmé par le workflow dédié, exécution [45650187934](https://github.com/malkidef/DealHunter/actions/runs/45650187934), avec `Deploy complete!`.
- Ce déploiement ne déploie pas de Cloud Functions et ne prouve pas à lui seul tous les parcours réels côté client.

## Fonctionnalités présentes dans le code

- Catalogue produit et matching planifié via GitHub Actions.
- Matching de services B2B et du marché des compétences.
- Consentement bilatéral et messagerie privée pour les mises en relation.
- Proposition commerciale et confirmations bilatérales.
- Vérification humaine, avis, signalements et détection indicative de doublons.
- Configuration Web Firebase publique pour le projet confirmé.
- Actions applicatives conçues pour afficher un résultat et permettre une nouvelle tentative après échec ; la réussite réelle reste à vérifier dans Firebase.

## Première mise en service recommandée

1. Vérifier/activer Firebase Authentication et Firestore dans le projet confirmé.
2. Exécuter les tests des règles Firestore dans l'émulateur.
3. Déployer uniquement `firestore:rules` et `firestore:indexes`.
4. Créer un compte de service dédié avec privilèges minimaux et enregistrer `FIREBASE_SERVICE_ACCOUNT` dans les secrets GitHub.
5. Lancer manuellement le workflow de matching produits et vérifier les suggestions.
6. Effectuer un test avec deux comptes de test avant d'utiliser de vraies données.

**Ne pas déployer les Cloud Functions à ce stade.** Le dossier `firebase/functions` comprend des déclencheurs historiques sur `seller_listings` et `buyer_requests`, tandis que le catalogue actuel utilise `publicOffers` et `publicNeeds`. Il charge aussi des fonctions Stripe. Une migration et une revue distinctes sont nécessaires avant tout déploiement, qui pourrait nécessiter le plan Blaze et entraîner des coûts.

## Bloqueurs avant ouverture publique

- **Firebase** : le matching serveur a réussi une exécution réelle (2 offres, 2 besoins, 1 correspondance) et le déploiement Firestore règles/index a été confirmé. Les essais de bout en bout restent à compléter sur plusieurs comptes et appareils.
- **Matching planifié** : au moins une exécution réelle a réussi. Il reste à vérifier les volumes de suggestions produits, leur affichage côté comptes utilisateurs et la régularité du déclenchement planifié.
- **Modération** : attribuer le custom claim `dealhunterAdmin: true` à un réviseur de confiance via Firebase Admin SDK.
- **Préproduction** : l'inscription e-mail/mot de passe, vérification e-mail, connexion Google/Apple, réinitialisation du mot de passe et déconnexion sont présentes dans le code ; elles ne sont pas toutes validées en conditions réelles. Tester inscription, publication, matching, consentement, messagerie, transaction, avis, signalements, retrait, export et effacement. Aucun parcours complet de suppression de compte n'est implémenté à ce jour.
- **Protection des données** : finaliser bases légales, durées, accès/export/rectification/effacement, incidents et contrats sous-traitants. Voir `docs/PRIVACY_OPERATIONS.md`.
- **Cadre légal** : examiner pays par pays le courtage, l'emploi, la sous-traitance, les qualifications, la consommation, les sanctions et les transferts internationaux.
- **Sources** : vérifier licences et conditions de chaque source ; une annonce collectée n'est jamais un stock confirmé.
- **Paiement/commission** : aucun paiement ne doit être activé avant validation du rôle contractuel de DealHunter et des conditions de facturation. La commission de 5 % est indicative.
- **Capacité** : interface bornée à 500 documents par collection ; batch borné à 5 000 documents actifs par collection et 250 000 comparaisons. Pas de garantie de couverture mondiale exhaustive.
- **Sécurité** : audit indépendant des règles, rôles, accès multi-tenant, abus et flux de contact.

## Contraintes de coût

Le budget initial visé est de 0 €. Ne pas activer de Cloud Functions, Stripe, services payants ou extensions facturées sans décision explicite. Les quotas gratuits ne garantissent ni disponibilité 24/7 ni capacité illimitée.

## Décision de lancement

**DealHunter n'est pas prêt pour une ouverture publique ni pour le traitement de vraies données personnelles.** GitHub Pages est publié, le matching serveur a réussi au moins une exécution réelle et le déploiement Firestore règles/index est confirmé. Les corrections de sécurité et d'interface en cours sont encore dans des PR non fusionnées ; les essais réels complets, la sauvegarde restaurable, les droits RGPD opérationnels, les documents juridiques et la validation du cadre commercial restent des bloqueurs. Ne pas prendre de paiements ni annoncer une couverture mondiale complète avant leur levée.

## Mise à jour de l'audit — 25 novembre 2026

- Le commit `0e048310d6028238e6fcbf2ff0d1cc2813ccbe34` a ajouté l'envoi d'un e-mail de vérification à la création d'un compte e-mail/mot de passe. Les tests applicatifs, le workflow des règles et GitHub Pages ont réussi sur ce commit. L'envoi réel dépend encore de la configuration Firebase Authentication et doit être testé avec une adresse de test.
- Le workflow de déploiement Firestore a été exécuté avec succès le 25 novembre (36 secondes), d'après la confirmation visuelle du propriétaire du projet. Le déploiement vise les règles et index définis dans `firebase.json`.
- L'audit a détecté que `firestore.rules`, lu directement par les tests unitaires, différait de `firebase/firestore.rules`, le fichier réellement référencé par `firebase.json`. Les deux fichiers ont été synchronisés et le workflow CI vérifie désormais leur égalité avant les tests.
- Le commit de synchronisation des règles est `1fe4281815c65eb4e731e4ec8f0b8855e01d0a88`; le contrôle de parité et les tests applicatifs ont été lancés. Ne considérer les tests de règles comme validés qu'après la fin du workflow correspondant.
- L'interface actuelle ne contient pas de centre de notifications ni de collection Firestore `notifications` identifiée dans les règles. Les notifications push/e-mail ne sont donc pas une fonctionnalité livrée.
- L'inscription envoie un e-mail de vérification, mais l'accès aux actions commerciales n'est pas encore bloqué côté règles pour les comptes dont l'e-mail n'est pas vérifié. L'envoi et l'obligation de vérification sont deux contrôles distincts.
- Le test bout en bout avec deux comptes indépendants, les messages en conditions réelles, les acceptations/refus, les confirmations bilatérales de vente et le parcours d'avis restent à effectuer.
- Le code de paiement Stripe existe dans `firebase/functions/src/payments.js`, mais les Cloud Functions ne sont pas déployées et le paiement reste hors service. Ne pas présenter la commission indicative de 5 % comme encaissée automatiquement.

**Décision inchangée :** ces avancées améliorent la préparation technique, mais ne lèvent pas les blocages de préproduction, de protection des données et de validation juridique. Ne pas ouvrir au public ni accepter de paiements à ce stade.

## Revue complémentaire — état constaté après CI (25 novembre 2026)

### Vérifications automatisées désormais confirmées

- Workflow « Tests DealHunter » : succès sur le commit `3e3fd869` (exécution 45621425250).
- Workflow « Tests des règles Firestore » : succès sur le commit `3e3fd869` (exécution 45621424629), incluant la vérification `cmp firestore.rules firebase/firestore.rules`.
- Publication GitHub Pages : succès sur le commit `3e3fd869` (exécution 45621424719).
- Les workflows sur le commit `91eff02c` ont également terminé avec succès.
- Le propriétaire a fourni une capture confirmant le déploiement réussi des règles et index Firestore (workflow terminé en 36 secondes).

### Incompatibilités fonctionnelles identifiées à corriger avant paiement

- Le parcours d'accord commercial actuel dans `auth.js` crée des documents `deals` avec `sellerUid`, `buyerUid`, `totalAmount`, `commissionAmount` et des statuts `proposed/agreed/completed`.
- Le module Stripe `firebase/functions/src/payments.js` attend un autre modèle : documents `companies`, `sellerCompanyId`, `buyerCompanyId`, `amountTotalCents`, devise et statuts de paiement. Le module n'est pas relié à un parcours de paiement opérationnel dans l'interface.
- Le module Stripe ne doit donc pas être déployé ni activé avant une migration de schéma, des tests d'intégration, une revue de sécurité des transferts et la validation juridique/contractuelle du rôle de la plateforme.
- Les déclencheurs historiques de `firebase/functions/src/index.js` écoutent `seller_listings` et `buyer_requests`, alors que le matching actuel en production utilise `publicOffers` et `publicNeeds` via GitHub Actions. Ne pas déployer ces déclencheurs historiques tels quels.
- Aucun système de notifications applicatives/push/e-mail complet n'a été trouvé dans les règles et l'interface actuelles.
- L'envoi de vérification d'e-mail est présent pour l'inscription e-mail/mot de passe, mais les règles Firestore ne conditionnent pas encore les écritures commerciales au claim `email_verified`. Il faut concevoir et tester cette transition sans bloquer les comptes OAuth valides ni les parcours existants.
- Les règles permettent actuellement à chaque utilisateur de créer/modifier son document `users/{uid}` en propre ; les sous-documents privés sont également gérés par leur propriétaire. Une politique de schéma de profil plus stricte reste à définir avant d'y stocker des rôles ou des champs d'entreprise de confiance.

### Critères non certifiables par CI seule

- Livraison et réception réelles de l'e-mail de vérification.
- Deux comptes Firebase distincts avec deux entreprises différentes.
- Demande, acceptation, refus, accès à la messagerie et partage de coordonnées en conditions réelles.
- Création d'un accord, refus/acceptation, confirmations indépendantes et avis après vente.
- Tests d'accès non autorisé sur le projet Firebase de production.
- Procédures RGPD, documents légaux, traitement des litiges et conformité du paiement.

**Décision :** CI et hébergement sont verts ; le socle Firestore est déployé selon la confirmation visuelle du propriétaire. DealHunter reste en préproduction. Les fonctions de paiement et les déclencheurs Firebase historiques sont explicitement exclus de tout déploiement tant que les incompatibilités ci-dessus ne sont pas résolues.


## Revue complémentaire — vérification e-mail et CI (25 novembre 2026, commit d21c7393)

### Changements et contrôles confirmés
- Les écritures commerciales des catalogues produits et services, demandes de mise en relation, messageries, accords, contacts partagés, avis, profils professionnels et offres d'emploi exigent désormais le claim Firebase `email_verified == true`.
- Les règles ne distinguent pas le fournisseur de connexion : les jetons Google/Apple sont acceptés lorsque Firebase les marque comme vérifiés. Des tests émulateur dédiés couvrent Google et Apple.
- Les contrôles côté interface `requireVerifiedEmail` donnent un retour utilisateur avant les écritures commerciales. Les règles Firestore restent la protection faisant autorité.
- Les fichiers `firestore.rules` et `firebase/firestore.rules` sont identiques (SHA de contenu identique au contrôle du 25 novembre).
- Sur le commit `d21c7393`, les trois workflows sont terminés avec succès : Tests DealHunter (45626112146), Tests des règles Firestore (45626110245) et GitHub Pages (45626108453). Les tests émulateur incluent le nouveau test du marché des compétences.

### Déploiement restant
- Le déploiement Firestore réussi visible précédemment concernait le commit `b5bea58`, antérieur aux règles de vérification e-mail et aux corrections professionnelles. Il ne confirme donc pas le déploiement de la version actuelle.
- Le commit `d21c7393` et les règles actuelles ne doivent être considérés comme déployés en production qu'après une nouvelle exécution réussie du workflow « DealHunter — déployer uniquement Firestore » sur ce commit, avec confirmation `dealhunter-3747b`.
- Aucun déploiement de Cloud Functions ni de Stripe n'est autorisé par cette revue.

### Limites et critères encore ouverts
- Les tests OAuth sont des tests de jetons simulés dans l'émulateur. Les connexions réelles Google et Apple, ainsi que l'envoi/réception d'un e-mail de vérification, restent à tester sur Firebase Authentication.
- Les tests avec deux comptes réels distincts, les parcours commerciaux de bout en bout, les notifications, la conformité RGPD et la validation juridique restent non certifiés.
- DealHunter reste en préproduction. Ne pas accepter de paiements ni ouvrir publiquement avant la levée des bloqueurs.


## Mise à jour de suivi — commit c7d8f842 (25 novembre 2026)

- Les workflows `Tests des règles Firestore`, `Tests DealHunter` et `GitHub Pages` ont tous terminé avec succès sur le commit `c7d8f842`.
- Les tests du marché des compétences couvrent maintenant aussi la modification d'un profil par un compte non vérifié et la décision d'un employeur non vérifié sur une demande.
- Le centre de notifications n'est toujours pas implémenté : aucune collection `notifications`, règle dédiée, interface ou production d'événements n'a été trouvée lors de l'audit du code actuel.
- L'écart entre le schéma `deals` utilisé par `auth.js` et le schéma `companies` / `amountTotalCents` attendu par `firebase/functions/src/payments.js` reste bloquant. Ne pas connecter le module de paiement à l'interface actuelle.
- Le workflow de déploiement Firestore est manuel (`workflow_dispatch`) et exige le champ `confirm_project` égal à `dealhunter-3747b`. Les dernières règles validées sur `c7d8f842` ne sont pas réputées déployées tant qu'une exécution de ce workflow sur le commit actuel n'est pas terminée avec succès.
- Les tests OAuth Google/Apple utilisent des jetons simulés dans l'émulateur ; ils ne remplacent pas une validation des connexions réelles et des e-mails de vérification sur Firebase Authentication.
- Les tests à deux comptes réels, la livraison effective des e-mails, la validation RGPD/juridique et les essais de bout en bout restent à faire.


## Centre de notifications — première couche de sécurité (25 novembre 2026)

- Ajout des règles Firestore `notifications/{notificationId}` : lecture réservée au champ `recipientUid` correspondant à l'utilisateur connecté ; création cliente interdite ; mise à jour limitée au seul champ `readAt` de type timestamp ; suppression autorisée uniquement au destinataire.
- Ajout d'un test émulateur couvrant la lecture croisée, la création cliente forgée, le marquage comme lu, la modification de contenu et la suppression par un tiers.
- Cette modification ne constitue pas encore un centre de notifications fonctionnel : aucun producteur serveur d'événements, compteur non-lu, préférences, interface ni canal e-mail/push n'est déployé. Les notifications ne doivent pas être considérées comme émises tant que ces composants ne sont pas développés et testés.
- Les règles sont modifiées dans les deux fichiers source. Déploiement Firebase requis après validation CI.


## Centre de notifications — interface et consultation (25 novembre 2026)

- Ajout d'un onglet Notifications dans l'interface DealHunter.
- Chargement des 50 notifications les plus récentes du compte connecté, compteur non lues, affichage du titre, du contenu et de la date, action « Marquer comme lue ».
- La lecture reste filtrée par `recipientUid`; les règles Firestore imposent que l'utilisateur ne lise que ses propres documents et ne modifie que `readAt`.
- Tests des règles de confidentialité exécutés avec succès sur le commit `a5a2fa56` (tests DealHunter, règles Firestore et Pages : succès).
- Les commits d'interface `a69ce7b6` et `23c7dd38` sont en cours de validation CI au moment de cette mise à jour.
- Limite restante : aucun déclencheur serveur ne crée encore les notifications lors des événements métier. L'interface peut afficher les notifications créées par un producteur autorisé, mais ne génère pas elle-même les alertes. Pas de push, d'e-mail ni de centre de préférences.


## Notifications métier côté serveur (25 novembre 2026)
- Ajout de déclencheurs Firebase Functions v2 pour les nouvelles demandes de mise en relation, les décisions accepter/refuser, les nouveaux messages après acceptation, les propositions commerciales et les changements de statut de transaction.
- Les notifications sont créées avec l'Admin SDK uniquement ; les identifiants sont déterministes pour éviter les doublons lors des nouvelles tentatives Firebase.
- Le destinataire est calculé à partir des participants enregistrés côté serveur. Les messages ne déclenchent une notification que si la demande associée est acceptée et que l'expéditeur est bien participant.
- Les contenus sont bornés en longueur ; aucune donnée de paiement ou coordonnée privée n'est copiée dans la notification.
- Commit d'implémentation : `0e762d26914516a071475b29ae70a4b5a43620da`.
- Les workflows GitHub Actions de tests applicatifs, de règles Firestore et Pages ont été relancés sur ce commit ; leur résultat doit être contrôlé avant toute mise en production.
- IMPORTANT : ces déclencheurs ne sont pas déclarés déployés. Le dépôt ne possède pas encore de workflow de déploiement ciblé de ces seules fonctions. Ne pas déployer toutes les fonctions existantes sans audit préalable : l'index contient aussi des anciens déclencheurs sur `seller_listings`/`buyer_requests` et le module de paiements. Stripe reste désactivé.


## Déploiement isolé des notifications (25 novembre 2026)
- Ajout du workflow manuel `.github/workflows/deploy-notification-functions.yml`.
- Le workflow exige la saisie exacte de `dealhunter-3747b`, vérifie que le secret de compte de service cible ce même projet et déploie uniquement les cinq fonctions de notification.
- Il ne déploie ni les anciens déclencheurs de matching, ni les fonctions de paiement/Stripe, ni les règles Firestore.
- Workflow enregistré au commit `977e53fc8652890b1029e5cfd8af9426e96dc083`.
- État : workflow disponible, mais aucun déploiement de production n'a été lancé depuis cette modification. Le lancement manuel et son résultat restent nécessaires ; les permissions IAM, APIs Firebase/Cloud Functions et éventuelle facturation doivent être confirmées par le résultat de ce déploiement.


## Blocage de déploiement des notifications — 25 novembre 2026

- Le workflow isolé `deploy-notification-functions.yml` a été lancé pour le projet `dealhunter-3747b`, mais Firebase a interrompu le déploiement avant la publication des fonctions.
- Erreur exacte : `Permissions denied enabling cloudfunctions.googleapis.com`. Le compte de service du workflow possède `Service Usage Consumer`, mais ne dispose pas du droit d'activer les API du projet. Firebase a également signalé les API Cloud Build et Artifact Registry comme non activées.
- Action requise par un propriétaire ou administrateur autorisé du projet : activer les API Cloud Functions, Cloud Build et Artifact Registry dans la console Google Cloud. Alternative IAM à examiner par l'administrateur : accorder temporairement au compte de service le rôle `Service Usage Admin` (`roles/serviceusage.serviceUsageAdmin`) pour l'activation, puis retirer ce rôle si non nécessaire. Ne pas accorder Owner ou Editor.
- L'échec est un refus IAM pendant la vérification/activation des API ; il ne prouve ni un défaut du code ni une publication partielle. Aucune des cinq fonctions de notification n'est considérée comme déployée.
- Revue du schéma applicatif : les demandes `matchRequests` contiennent bien `requesterUid`, `recipientUid`, `requesterCompany`, `product`, `participantUids` et `status`. Les messages `matchMessages` contiennent `requestId`, `senderUid`, `text`. Les transactions `deals` contiennent `participantUids`, `proposerUid`, `product` et les statuts `proposed`, `agreed`, `completed`. Les cinq déclencheurs ajoutés correspondent donc aux champs actuellement écrits par `auth.js` pour ces trois parcours.
- Après activation des API par l'administrateur, relancer le workflow manuel de déploiement. Vérifier ensuite dans Firebase/Google Cloud que les cinq fonctions sont effectivement déployées, puis tester avec deux comptes distincts la création de demande, acceptation/refus, message et proposition/évolution de transaction.
- Les avertissements npm concernant des dépendances dépréciées n'ont pas provoqué cet échec. Ils méritent un suivi de maintenance distinct, sans mise à niveau précipitée du CLI de déploiement.
- Stripe reste désactivé ; ce workflow ne cible que les cinq fonctions de notification.


## Deuxième tentative de déploiement des notifications — 25 novembre 2026

- Nouvelle tentative du workflow : l'API `cloudfunctions.googleapis.com` est désormais activée et reconnue comme disponible.
- Le déploiement reste bloqué lors de l'activation de `artifactregistry.googleapis.com`, avec `Permissions denied enabling artifactregistry.googleapis.com`.
- Le journal indique également que `cloudbuild.googleapis.com` est manquante et que Firebase prévoit de l'activer ; son activation n'est pas confirmée dans cette tentative.
- Action administrateur restante : activer manuellement Artifact Registry et Cloud Build dans le projet `dealhunter-3747b`, avec un compte ayant les droits d'administration des API. Liens directs :
  - `https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com?project=dealhunter-3747b`
  - `https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=dealhunter-3747b`
- Après activation, relancer le workflow `deploy-notification-functions.yml`. Ne pas élargir les droits du compte de service au rôle Owner/Editor ; si l'activation doit être déléguée, l'administrateur peut examiner un droit temporaire limité à Service Usage Admin.
- Les fonctions ne sont pas déclarées déployées tant que le workflow n'a pas terminé avec succès et que leur présence n'a pas été vérifiée dans le projet.


## Notifications sans Cloud Build ni Cloud Functions — 25 novembre 2026

- Pour éviter l'activation d'Artifact Registry et de Cloud Build ainsi que le déploiement Cloud Functions, un worker Node.js Admin SDK est ajouté dans `firebase/functions/src/notification-batch.js`.
- Le workflow `.github/workflows/notification-batch.yml` l'exécute manuellement ou toutes les cinq minutes via GitHub Actions. Il utilise le secret existant `FIREBASE_SERVICE_ACCOUNT`, vérifie que le compte cible exactement `dealhunter-3747b` et n'exécute aucun déploiement Firebase.
- Le worker traite les demandes de mise en relation, leurs décisions, les messages liés à une demande acceptée, les propositions commerciales et les changements de statut des transactions. Les notifications sont créées exclusivement par Admin SDK dans `notifications`; les IDs déterministes évitent les doublons lors des reprises.
- Un checkpoint Admin SDK dans `systemJobs/notificationWorker` permet de reprendre les scans. Une fenêtre de recouvrement de dix minutes protège contre les retards de planification ; le premier passage ne remonte que quinze minutes afin d'éviter l'envoi massif de notifications historiques.
- Cette solution ne nécessite pas les API Cloud Functions, Cloud Build ou Artifact Registry. Elle nécessite toujours l'accès Firestore du compte de service et consomme le quota GitHub Actions. La planification GitHub est indicative : l'exécution peut être retardée et n'est pas un service temps réel garanti.
- La première exécution réelle doit être vérifiée dans Actions. Contrôler le résumé JSON `ok: true`, les compteurs scannés, la création de documents dans `notifications` et la lecture par deux comptes distincts. Le worker n'est pas déclaré opérationnel en production avant ces vérifications.
- Le workflow de déploiement Cloud Functions des notifications n'est plus nécessaire pour ce parcours et a été retiré afin d'éviter un lancement accidentel qui réclamerait les API payantes. Le code historique des fonctions n'est pas supprimé, mais il n'est pas utilisé par le nouveau worker.
- Stripe reste désactivé. Aucun paiement, aucune commission et aucun déploiement de fonction Cloud ne sont activés par cette modification.


### Extension des notifications aux services et à l'emploi

Le worker périodique couvre désormais aussi `serviceMatchRequests` et `workMatchRequests` : création d'une demande, acceptation ou refus. Il traite également les messages de `serviceMatchMessages` et `workMatchMessages`, en vérifiant que la demande associée est acceptée et que l'expéditeur appartient aux participants. Les notifications restent privées, dédupliquées par identifiant déterministe et créées côté serveur via Admin SDK. La validation CI de syntaxe et les tests existants doivent être vérifiés sur le commit qui porte cette extension ; un essai fonctionnel avec deux comptes reste requis.


## Mise à jour de finalisation — 27 novembre 2026

### CI de la branche de finalisation

Sur le commit `e29de7a9365574ee680c653a3e6f7d5c01a70d20`, les deux workflows GitHub Actions ont terminé avec succès :
- `Tests DealHunter` — run `45904007315` (#726) : tests Python, matching, fonctions Firebase et syntaxe JavaScript.
- `Tests des règles Firestore` — run `45904007436` (#576) : parité des règles et tests de l'émulateur Firestore.
Ces résultats valident le commit testé, pas les commits ultérieurs.

### Blocage concret du parcours de droits RGPD

- L'interface fournit un export personnel initial, explicitement partiel.
- L'effacement de compte n'est pas implémenté ; aucune suppression globale côté navigateur ne doit être ajoutée.
- Les documents consultés ne définissent pas encore de canal de contact officiel DealHunter ni d'adresse dédiée aux demandes d'accès, rectification, opposition ou effacement. Le texte « contacte l'équipe DealHunter » ne suffit pas à fournir un canal opérationnel.
- Ne pas inventer d'adresse e-mail, de formulaire ni de promesse de délai. Avant de publier un parcours de demande, le propriétaire doit choisir et confirmer un canal de contact qu'il contrôle et définir qui traite les demandes.
- En attendant, les droits RGPD ne sont pas considérés comme opérationnels et l'ouverture publique reste bloquée.
- Toute future procédure d'effacement doit traiter les données partagées, les obligations de conservation, les sous-collections et les workers qui pourraient recréer des suggestions ou notifications. Aucun effacement destructif ne doit être lancé sans validation distincte.

### Décision

La réussite CI est une validation technique utile, mais ne lève pas les blocages de déploiement, de droits RGPD, de contact officiel, de tests réels multi-comptes et de cadre légal. Aucun merge, déploiement ou paiement n'est effectué dans cette étape.


## Contrôle CI complémentaire — 27 novembre 2026

Sur le commit `662ec48da02c91a9d8040bf0bd9dcdde20dfe86b`, les workflows `Tests DealHunter` (run `45920762974`, #728) et `Tests des règles Firestore` (run `45920762959`, #578) sont tous deux terminés avec succès. Le second a exécuté avec succès le contrôle de parité et les tests de l'émulateur Firestore. Cette validation CI ne lève pas les bloqueurs de préproduction : parcours réels multi-comptes, export/effacement RGPD complets, sauvegarde restaurable, canal de contact officiel et validation juridique/commerciale restent à traiter. La PR #28 demeure en brouillon, non fusionnée et non déployée.


## Mise à jour de finalisation — 27 novembre 2026

La branche de finalisation `finalization/company-verification-current` contient des corrections et tests supplémentaires, mais la PR #28 reste ouverte en brouillon et n'est pas fusionnée. L'écart constaté avec `main` est de 160 commits en avance et 5 en retard ; les cinq commits en retard concernent des instantanés de données plus récents sur `main`. Ces fichiers de données ne figurent pas dans les 26 fichiers de la comparaison PR : ne pas les écraser ni effectuer de rebase automatique.

### Avancées techniques dans la branche non fusionnée

- TED : pagination API avec déduplication, plafond de sécurité et tests ; CI applicative réussie sur le commit de code.
- BOAMP : pagination bornée (100 par page, plafond 5 000), déduplication et signalement de troncature ; tests applicatifs réussis.
- BODACC : pagination bornée, filtre strict ventes/cessions, protection des données personnelles et tests ; correctif du point d'entrée de pagination validé par CI applicative.
- GSA : la spécification publique ne documente pas de pagination ; la complétude est marquée inconnue, les doublons identifiables sont éliminés et une réponse vide ne remplace plus le flux existant. Tests applicatifs réussis sur le code corrigé.
- Export personnel : pagination Firestore par curseur, plafond explicite de 1 000 documents par collection et conservation des résultats partiels en cas d'erreur ; tests applicatifs réussis sur le commit `24b47160e988392f152a37e3ef703a91fe14bb33`.

### Bloqueurs inchangés

- Le test de téléchargement réel Android et le test multi-comptes de l'export restent à faire.
- L'export personnel n'est pas un export RGPD exhaustif ; les données partagées et certaines catégories restent exclues.
- L'effacement complet d'un compte n'est pas implémenté ; les règles interdisent les suppressions client de nombreuses collections.
- Aucune sauvegarde Firestore complète, chiffrée, restaurable et testée n'a été exécutée.
- Stripe reste désactivé/non déployé ; le modèle de données et les parcours d'administration/réconciliation ne sont pas validés de bout en bout.
- Les coordonnées officielles de contact, les documents juridiques, bases légales et durées de conservation doivent être fournis/validés par le responsable du traitement.
- Les tests Firestore de la dernière tête restent à confirmer après fin de l'émulateur ; aucun déploiement, fusion ou paiement n'a été réalisé.

**Décision :** pas d'ouverture publique ni de paiement réel. Les tests applicatifs réussis ne remplacent pas la validation Firebase multi-comptes, la sauvegarde restaurable, la conformité juridique et l'approbation finale du propriétaire.

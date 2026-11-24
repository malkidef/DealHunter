# DealHunter

DealHunter vise à rapprocher des entreprises qui disposent de stocks excédentaires et des acheteurs qui recherchent des produits, avec une commission envisagée uniquement après une vente réellement conclue.

## État réel du dépôt — 24 novembre 2026

- `index.html` : interface responsive avec catalogues, formulaires de publication/édition, matching, demandes de mise en relation, conversations, propositions commerciales et actions de confiance.
- **Firebase Authentication et Firestore** : le code client, les règles et les index sont présents. Les tests automatisés des règles réussissent dans CI, mais cela ne prouve pas que les règles/index sont déployés dans le projet Firebase réel.
- **Flux de données** : des instantanés BOAMP, BODACC, TED, SAM.gov et GSA Auctions sont présents dans `data/`. Leur présence dans Git ne garantit ni leur fraîcheur, ni leur disponibilité continue, ni les droits de republication commerciale. Les annonces restent des pistes à vérifier, pas des stocks confirmés.
- **GitHub Actions** : les tests applicatifs et les tests des règles Firestore ont réussi sur le commit `f032494055e923e060b5985ad7e66df2918f24ed` le 24 novembre 2026 ; GitHub Pages a également été publié sur ce commit. La revue de lancement est suivie dans [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md).
- **Matching produits planifié** : une exécution réelle du workflow `.github/workflows/matching-batch.yml` a réussi le 24 novembre 2026 à 14:35 UTC. Le secret `FIREBASE_SERVICE_ACCOUNT` était présent et l'accès Firebase Admin a fonctionné. Les volumes de suggestions et leur affichage côté utilisateurs restent à contrôler.
- Certaines données de démonstration, le registre local des sources, les imports en attente et certains caches restent stockés dans le navigateur via `localStorage`.

**Statut de lancement :** GitHub Pages et les tests CI sont opérationnels ; la mise en service Firebase, les tests de bout en bout avec deux comptes, les droits des sources, la revue légale et la procédure RGPD restent à valider. DealHunter ne doit pas encore être présenté comme prêt pour une ouverture publique.

## Backend actuel : Firebase

Le backend en cours est **Firebase Authentication + Cloud Firestore** :
- configuration web : `firebase-web-config.js` ;
- authentification et synchronisation : `auth.js` ;
- règles de sécurité : `firebase/firestore.rules` ;
- index Firestore : `firebase/firestore.indexes.json`.

Les offres et besoins privés sont associés au compte connecté. Le code publie également des fiches minimales dans les catalogues partagés, sans coordonnées personnelles. Les demandes de mise en relation sont gérées dans Firestore ; le partage de coordonnées est conditionné à l'acceptation et à une action explicite. Vérifier dans Firebase Console que les règles et index du dépôt sont bien déployés.

`docs/APPWRITE_SCHEMA.md` est un ancien schéma de conception : Appwrite n'est pas le backend actuellement utilisé par le code.

## Moteur de matching des services — première brique

Le module pur `functions/matching/src/service-matching.js` prépare le rapprochement entre :
- une entreprise qui propose une prestation ;
- un client professionnel qui recherche cette prestation.

Le moteur applique d'abord des critères d'éligibilité : fiches actives, propriétaires différents, catégorie suffisamment proche, zone compatible (ou distanciel accepté par les deux parties) et qualifications obligatoires présentes. Il classe ensuite les candidats par score indicatif.

Les tests associés sont dans `tests/test_service_matching.js` et sont ajoutés au workflow CI.

Le moteur de services est relié aux collections Firestore `publicServiceOffers` et `publicServiceRequests`. Les demandes de mise en relation, le consentement bilatéral et la messagerie privée sont implémentés dans `serviceMatchRequests` et `serviceMatchMessages`. Le marché du travail suit un parcours séparé.

## Mise en relation de services — consentement bilatéral

Depuis l'onglet **Services B2B**, une entreprise propriétaire de l'une des deux fiches compatibles peut demander une mise en relation. DealHunter relit les deux fiches dans Firestore avant de créer la demande ; le client ne peut pas inventer les identifiants ni les propriétaires.

La demande est enregistrée dans `serviceMatchRequests`, visible uniquement par les deux participants. Seul le destinataire peut l'accepter ou la refuser, et une demande en attente ne peut pas être modifiée par son auteur. Après acceptation, les deux entreprises disposent d'une messagerie dédiée (`serviceMatchMessages`) ; les messages sont réservés aux participants et aucun partage automatique de coordonnées n'est effectué.

## Marketplace de services B2B — première interface

L'onglet **Services B2B** permet aux entreprises connectées de publier :
- une prestation proposée (`publicServiceOffers`) ;
- une prestation recherchée (`publicServiceRequests`) ;
- la catégorie, la zone, le code pays ISO, les qualifications et l'acceptation du distanciel.

Les fiches ne contiennent pas d'e-mail, de téléphone ni de coordonnées privées. Les règles Firestore autorisent la lecture aux utilisateurs connectés et réservent la création, la modification et la suppression au propriétaire de la fiche. Les tests de règles couvrent les accès, l'usurpation, les champs privés et les données invalides.

Le premier affichage des correspondances est volontairement conservateur : catégorie identique, même zone, ou distanciel accepté par les deux parties ; les qualifications demandées doivent être présentes chez le prestataire. Le rayon kilométrique est enregistré mais **n'est pas utilisé pour élargir la zone tant qu'un calcul géographique fiable n'est pas installé**. Les scores sont indicatifs et ne vérifient ni les certificats ni la capacité réelle des prestataires.

Les suggestions de recrutement ne déclenchent aucune décision d'embauche. Le consentement bilatéral et la messagerie sont gérés séparément pour le marché du travail.

## Marché des compétences et du recrutement

DealHunter dispose désormais d'un parcours de publication de profils professionnels et d'offres de travail, avec deux types distincts : `employment` (emploi salarié) et `independent` (mission indépendante).

Les collections Firestore `publicWorkerProfiles` et `publicWorkOpenings` sont protégées par des règles de propriété et une liste blanche de champs. La publication d'un profil exige un consentement explicite ; le propriétaire peut retirer sa fiche depuis le catalogue.

Le moteur `functions/matching/src/work-matching.js` calcule des suggestions indicatives selon métier, compétences, qualifications déclarées, zone, disponibilité et distanciel. Il ne certifie pas les qualifications et ne prend aucune décision d'embauche. Les coordonnées privées ne sont pas publiées.

Les formulaires sont intégrés à l'onglet Services. Le détail du schéma et des garde-fous est décrit dans `docs/WORK_MARKET_SCHEMA.md`.

**Limites avant ouverture publique :** vérification des demandes par un réviseur humain, attribution sécurisée du claim modérateur, définition d'une politique de conservation/effacement, modération et recours, validation juridique pays par pays, configuration Firebase réelle et test complet en environnement de préproduction.
## Premier connecteur de collecte : GSA Auctions

Le connecteur utilise l'API GET officielle de la General Services Administration (GSA), qui fournit des annonces en JSON ou XML :
- documentation : https://gsa.github.io/auctions_api/ ;
- limites publiées : 5 000 appels/jour et 5 appels par 5 secondes ;
- clé personnelle : https://api.data.gov/signup/ ;
- contact API GSA : api.ciss@gsa.gov.

Le workflow `.github/workflows/gsa-auctions-manual.yml` permet un lancement manuel et une collecte programmée tous les deux jours. Il utilise le secret GitHub `GSA_API_KEY`, publie le fichier `data/gsa-auctions.json` et conserve un artefact de revue pendant 14 jours. L'application lit ce fichier et met les annonces en cache dans le navigateur.

**Dernier instantané vérifié dans le dépôt :** 591 annonces, 591 identifiants uniques et 591 liens vers le domaine officiel, collectés le 17 novembre 2026 à 22:01 UTC. Les 591 fiches ont `review_status=pending` et `availability_status=unverified`. Leur statut d'enchère était « scheduled » dans cet instantané.

GSA Auctions présente des biens mobiliers publics vendus aux enchères : ce ne sont pas automatiquement des stocks commerciaux disponibles à prix fixe. La quantité n'est pas fournie de façon générale ; la réserve peut être un simple indicateur et l'enchère actuelle n'est pas un prix final. Le score affiché dans l'interface mesure la qualité des informations, pas la rentabilité.

**Droits de réutilisation :** la fiche Data.gov de l'API confirme l'accès public mais ne comporte pas de champ de licence explicite. Une fiche distincte « GSA Auctions » indique CC0 1.0 pour sa distribution HTML ; cela ne suffit pas à affirmer sans réserve que cette licence couvre chaque réponse de l'API live. Avant une exploitation commerciale ou une republication au-delà du flux actuel, demander confirmation à l'équipe API GSA. Les liens et preuves sont détaillés dans [le guide du connecteur](docs/connectors/GSA_AUCTIONS.md).

Le connecteur ne contacte aucun vendeur ou acheteur, ne place aucune enchère, ne crée aucune commande et ne déclenche aucun paiement. Les annonces restent des pistes à vérifier manuellement.

## Répertoire des sources

Le répertoire multi-secteurs se trouve dans [docs/SOURCES.md](docs/SOURCES.md). Une source privée ou commerciale n'est connectée qu'après vérification de son API, de ses conditions, de ses droits d'accès et de réutilisation.

Le pipeline et les règles de validation sont décrits dans [docs/PIPELINE_SOURCES.md](docs/PIPELINE_SOURCES.md).

## Architecture cible

1. **Sources autorisées** : API officielles, flux partenaires, exports autorisés et imports manuels.
2. **Référentiel** : normalisation des produits, unités, quantités, prix, localisation et dates de validité.
3. **Matching** : compatibilité produit, catégorie, quantité, budget, zone et délais.
4. **Mise en relation** : consentement, acceptation/refus et journal d'audit.
5. **Commande et paiement** : intégration future d'un prestataire adapté ; commission envisagée de 5 % uniquement après confirmation contractuelle de la vente.
6. **Confiance et conformité** : vérification des entreprises, sécurité, RGPD, prévention de la fraude et gestion des désinscriptions.

## Prochaines étapes

1. Confirmer auprès de GSA la portée de la licence applicable aux données de l'API avant tout usage commercial.
2. Vérifier le déploiement réel des règles et index Firestore dans le projet Firebase.
3. Corriger et tester les flux TED et SAM.gov avant de les présenter comme actifs.
4. Améliorer la classification et la revue humaine des annonces GSA, sans transformer automatiquement une enchère en stock vendeur.
5. Étudier les autres places de marché uniquement via des accès officiellement autorisés.

Aucun scraping non autorisé, message automatique, enchère, commande ou paiement ne doit être déclenché par les connecteurs.


## Mise en relation du marché du travail — consentement bilatéral

Les correspondances entre profils professionnels et offres peuvent désormais déclencher une demande de mise en relation dans `workMatchRequests`. Le parcours conserve la séparation entre emploi salarié (`employment`) et mission indépendante (`independent`) et relit les deux fiches actives avant de créer la demande. Le profil candidat doit avoir été publié avec consentement explicite. Seul le destinataire peut accepter ou refuser ; après acceptation, les participants échangent dans `workMatchMessages`. Les messages sont limités à 2 000 caractères, réservés aux participants et ne peuvent contenir de champs supplémentaires de coordonnées. Aucun contact n'est partagé automatiquement.

Les règles Firestore et les tests couvrent l'identité des propriétaires, la correspondance du type d'engagement, les décisions du destinataire, les accès des tiers et la messagerie après acceptation. Cette fonction ne vérifie pas les diplômes, habilitations ou employeurs, et ne prend aucune décision de recrutement.


## Vérification humaine des entreprises et qualifications

Le formulaire de vérification est disponible dans le marché des compétences. Les utilisateurs soumettent uniquement un lien HTTPS vers une preuve publique ; aucun document privé ni pièce d'identité n'est collecté. Les demandes sont privées, en attente par défaut et visibles globalement uniquement aux comptes portant le claim Firebase `dealhunterAdmin: true`. Seul un réviseur autorisé peut les valider ou les refuser ; le propriétaire peut retirer sa demande en attente. Voir [docs/VERIFICATION_REVIEW.md](docs/VERIFICATION_REVIEW.md) pour le modèle de revue et l'attribution sécurisée du rôle.

Cette revue est manuelle et n'est pas une certification automatisée. L'identité, la validité temporelle des qualifications et la conformité locale doivent être vérifiées humainement. Les tests applicatifs et les tests des règles Firestore associés à cette brique ont réussi sur la branche de travail ; le déploiement réel reste à effectuer et à vérifier.


## Avis et signalements de confiance

- Un participant peut déposer un seul avis par transaction, uniquement après que les deux parties ont confirmé la réalisation. Les avis sont immuables et visibles aux utilisateurs connectés.
- Les signalements de fraude, contrefaçon, annonce trompeuse, doublon, risque de sécurité ou spam sont privés : le déclarant et les comptes de modération autorisés peuvent les consulter.
- Seul un compte portant le claim Firebase `dealhunterAdmin: true` peut traiter un signalement. Les actions de modération sont journalisées dans le statut et l'horodatage ; aucune sanction automatique n'est appliquée.
- Les avis et signalements ne prouvent pas à eux seuls une fraude ou une bonne qualité. Une revue humaine est nécessaire et les décisions doivent pouvoir être contestées.


## Détection de doublons — signal indicatif

Le module `functions/matching/src/listing-dedupe.js` compare les titres de produits normalisés, la catégorie et la zone déclarée. Il signale les paires très proches sans supprimer, bloquer ni fusionner automatiquement les annonces. Le calcul est limité à un échantillon de 500 annonces par chargement pour préserver les quotas du projet gratuit ; il ne garantit donc pas une détection mondiale exhaustive.


## Préparation au lancement

Le statut des fonctionnalités, les tests CI et les conditions bloquantes avant production sont suivis dans [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md). À ce stade, DealHunter n'est pas prêt pour une ouverture publique : aucun déploiement Firebase ni paiement n'a été activé.

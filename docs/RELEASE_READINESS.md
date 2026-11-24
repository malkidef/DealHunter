# État de préparation au lancement — DealHunter

Dernière revue : 24 novembre 2026. Branche principale : `main`.

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
- Le projet Firebase `dealhunter-3747b` a été confirmé par son propriétaire comme étant le bon projet.
- Cette confirmation ne prouve pas que Authentication, Firestore, les règles ou les index sont activés/déployés. Aucun déploiement Firebase n'est confirmé.

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

- **Firebase** : activation et déploiement des règles/index non vérifiés ; présence et validité du secret `FIREBASE_SERVICE_ACCOUNT` non vérifiées ; tests de bout en bout non réalisés.
- **Matching planifié** : le workflow est présent et les tests CI passent, mais une exécution manuelle avec le vrai secret et une vérification de ses résultats Firestore restent nécessaires.
- **Modération** : attribuer le custom claim `dealhunterAdmin: true` à un réviseur de confiance via Firebase Admin SDK.
- **Préproduction** : tester inscription, publication, matching, consentement, messagerie, transaction, avis, signalements, retrait et effacement.
- **Protection des données** : finaliser bases légales, durées, accès/export/rectification/effacement, incidents et contrats sous-traitants. Voir `docs/PRIVACY_OPERATIONS.md`.
- **Cadre légal** : examiner pays par pays le courtage, l'emploi, la sous-traitance, les qualifications, la consommation, les sanctions et les transferts internationaux.
- **Sources** : vérifier licences et conditions de chaque source ; une annonce collectée n'est jamais un stock confirmé.
- **Paiement/commission** : aucun paiement ne doit être activé avant validation du rôle contractuel de DealHunter et des conditions de facturation. La commission de 5 % est indicative.
- **Capacité** : interface bornée à 500 documents par collection ; batch borné à 5 000 documents actifs par collection et 250 000 comparaisons. Pas de garantie de couverture mondiale exhaustive.
- **Sécurité** : audit indépendant des règles, rôles, accès multi-tenant, abus et flux de contact.

## Contraintes de coût

Le budget initial visé est de 0 €. Ne pas activer de Cloud Functions, Stripe, services payants ou extensions facturées sans décision explicite. Les quotas gratuits ne garantissent ni disponibilité 24/7 ni capacité illimitée.

## Décision de lancement

**DealHunter n'est pas prêt pour une ouverture publique ni pour le traitement de vraies données personnelles.** GitHub Pages est publié et les workflows CI sont verts sur le commit audité ; Firebase reste à configurer et tester. Ne pas prendre de paiements ni annoncer une couverture mondiale complète avant levée des bloqueurs.

# État de préparation au lancement — DealHunter

Dernière revue : 23 novembre 2026. Branche principale : `main`.

## État du dépôt et publication

- PR #4 fusionnée : pont Firestore, matching produits, sécurité, services, travail et vérification.
- PR #6 fusionnée : documentation des opérations de protection des données.
- PR #7 fusionnée : documentation Firebase.
- GitHub Pages a été construit et publié avec succès sur le dernier commit principal vérifié.
- Le propriétaire a confirmé que le projet Firebase `dealhunter-3747b` est bien le sien.
- Cette confirmation ne prouve pas que Authentication, Firestore, règles ou index sont activés/déployés. Aucun déploiement Firebase n'est confirmé.

## Fonctionnalités présentes dans le code

- Catalogue produit et matching planifié via GitHub Actions.
- Matching de services B2B et du marché des compétences.
- Consentement bilatéral et messagerie privée pour les mises en relation.
- Proposition commerciale et confirmations bilatérales.
- Vérification humaine, avis, signalements et détection indicative de doublons.
- Configuration Web Firebase publique pour le projet confirmé.

## Première mise en service recommandée

1. Vérifier/activer Firebase Authentication et Firestore dans le projet confirmé.
2. Exécuter les tests des règles Firestore dans l'émulateur.
3. Déployer uniquement `firestore:rules` et `firestore:indexes`.
4. Créer un compte de service dédié avec privilèges minimaux et enregistrer `FIREBASE_SERVICE_ACCOUNT` dans les secrets GitHub.
5. Lancer manuellement le workflow de matching produits et vérifier les suggestions.
6. Effectuer un test avec deux comptes de test avant d'utiliser de vraies données.

**Ne pas déployer les Cloud Functions à ce stade.** Le dossier `firebase/functions` comprend des déclencheurs historiques sur `seller_listings` et `buyer_requests`, tandis que le catalogue actuel utilise `publicOffers` et `publicNeeds`. Il charge aussi des fonctions Stripe. Une migration et une revue distinctes sont nécessaires avant tout déploiement, qui pourrait nécessiter le plan Blaze et entraîner des coûts.

## Bloqueurs avant ouverture publique

- **Firebase** : activation et déploiement des règles/index non vérifiés ; secret de service account absent ou non confirmé ; tests de bout en bout non réalisés.
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

**DealHunter n'est pas prêt pour une ouverture publique ni pour le traitement de vraies données personnelles.** GitHub Pages est publié ; Firebase reste à configurer et tester. Ne pas prendre de paiements ni annoncer une couverture mondiale complète avant levée des bloqueurs.

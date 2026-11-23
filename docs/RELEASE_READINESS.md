# État de préparation au lancement — DealHunter

Dernière revue : 23 novembre 2026. Branche principale : `main`. Dernière fusion : `fd7522d62049ce7b7ac9438166062075ad6e6b3d`.

## État du dépôt et publication

- La PR #4 (`fix/firestore-matching-bridge`) a été fusionnée dans `main` par squash.
- La construction et la publication GitHub Pages du commit de fusion ont réussi.
- Cela publie le site statique uniquement. Aucun déploiement Firebase, aucune connexion à un projet Firebase et aucun traitement de données en production ne sont confirmés.
- Les vérifications CI du commit de fusion : tests applicatifs réussis ; construction et publication Pages réussies ; tests des règles Firestore à contrôler séparément jusqu'à leur conclusion finale.

## Fonctionnalités implémentées dans le code

- Catalogue produits/offres et besoins avec adaptateur vers le moteur de matching existant ; les nouveaux formulaires collectent unité, devise ISO 4217 et pays ISO alpha-2. Les anciens documents conservent les valeurs historiques par défaut `unit` / `EUR` / `FR` jusqu'à migration.
- Matching planifié des produits via GitHub Actions, avec création idempotente des suggestions ; garde-fou de 250 000 comparaisons par exécution.
- Matching B2B de services, avec qualifications requises, localisation et compatibilité distanciel.
- Marché des compétences avec parcours distincts salarié (`employment`) et indépendant (`independent`).
- Demandes de mise en relation avec consentement bilatéral et messagerie privée pour les services et le marché du travail.
- Proposition commerciale sur une mise en relation produit acceptée, acceptation du destinataire et confirmation de réalisation par les deux parties.
- Avis immuables, signalements privés et demandes de vérification manuelle d'entreprises/qualifications.
- Détection indicative de doublons produits sur un échantillon limité à 500 annonces par chargement ; aucune suppression automatique.

## Bloqueurs avant une ouverture publique

1. **Firebase** : renseigner la configuration publique du projet, vérifier les règles et index, créer un compte de service aux droits minimaux, configurer le secret GitHub Actions `FIREBASE_SERVICE_ACCOUNT`, puis tester avant toute activation du matching planifié.
2. **Modération** : attribuer le custom claim `dealhunterAdmin: true` à un réviseur de confiance via Firebase Admin SDK, en conservant les autres claims.
3. **Préproduction** : tester avec deux comptes distincts l'inscription, la publication, le matching, le double consentement, la messagerie, la transaction, les avis, les signalements, le retrait d'une fiche et l'effacement des données.
4. **Protection des données** : finaliser la cartographie des données, les bases légales, les durées de conservation, les procédures d'accès/export/rectification/effacement, la gestion des violations et les contrats avec les sous-traitants. Voir `docs/PRIVACY_OPERATIONS.md`.
5. **Cadre légal** : examiner pays par pays le courtage, l'emploi, l'intérim, la sous-traitance, les qualifications réglementées, la consommation, les sanctions et les transferts internationaux.
6. **Sources** : vérifier les licences et conditions d'utilisation de chaque source et obtenir les clés/API nécessaires. Une annonce collectée n'est jamais un stock confirmé.
7. **Paiement/commission** : aucun paiement ni prélèvement n'est activé. La commission affichée de 5 % est indicative. Définir le rôle contractuel de DealHunter et les conditions de facturation avant toute collecte d'argent.
8. **Capacité** : les lectures de catalogue dans l'interface sont bornées à 500 documents par collection ; le matching planifié est borné à 5 000 documents actifs par collection et à 250 000 paires par exécution. La couverture mondiale exhaustive et la pagination complète ne sont pas garanties.
9. **Sécurité** : faire auditer les règles, les droits des réviseurs, les flux de contact, les abus, les injections de contenu et les accès multi-tenant par un tiers avant ouverture publique.

## Contraintes de coût

Le code est développé en privilégiant les offres gratuites. Un budget initial de 0 € ne garantit ni disponibilité 24/7, ni collecte mondiale exhaustive, ni capacité illimitée. Ne pas activer de service nécessitant une facturation sans décision explicite.

## Décision de lancement

**Pas prêt pour une ouverture publique ni pour le traitement de vraies données personnelles.** La publication GitHub Pages ne vaut pas validation de conformité ni mise en production Firebase. Ne pas prendre de paiements et ne pas annoncer une couverture mondiale complète avant levée des bloqueurs ci-dessus.

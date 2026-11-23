# État de préparation au lancement — DealHunter

Dernière revue : 23 novembre 2026. Branche : `fix/firestore-matching-bridge`.

## Fonctionnalités implémentées dans le code

- Catalogue produits/offres et besoins avec adaptateur vers le moteur de matching existant.
- Matching B2B de services, avec qualifications requises, localisation et compatibilité distanciel.
- Marché des compétences avec parcours distincts salarié (`employment`) et indépendant (`independent`).
- Demandes de mise en relation avec consentement bilatéral et messagerie privée pour les services et le marché du travail.
- Proposition commerciale sur une mise en relation produit acceptée, acceptation du destinataire et confirmation de réalisation par les deux parties.
- Confirmation transactionnelle atomique côté client pour éviter les doubles validations concurrentes.
- Avis immuables, un par participant et par transaction terminée, visibles uniquement aux deux participants.
- Signalements privés d'annonces ou de comportements suspects et file de modération réservée au rôle administrateur.
- Demandes de vérification manuelle d'entreprises/qualifications à partir de preuves publiques HTTPS.
- Détection indicative de doublons produits sur un échantillon limité à 500 annonces par chargement ; aucune suppression automatique.

## Vérifications CI

- Tests Python, tests des moteurs Node.js, vérifications syntaxiques des fonctions Firebase et du JavaScript : réussis sur le commit `d9366fc03e6f8020b152050b7414ad411b6e3ac6`.
- Tests des règles Firestore couvrant les transactions, avis privés, signalements et vérification : réussis sur les commits `f71346c54738093b44d74c7d149bdf7207febf55` et `0d12215e67068db738f50b77cca7347eb2c67100`. Les règles Firestore n'ont pas été modifiées depuis ces tests.
- Un contrôle Firestore supplémentaire sur un commit ultérieur était encore en cours lors de la revue.
- Les tests CI ne remplacent pas les tests de bout en bout sur un vrai projet Firebase de préproduction.

## Bloqueurs avant mise en production

1. **Déploiement Firebase** : vérifier le projet, les règles, les index et les quotas ; déployer seulement avec des identifiants Firebase Admin/CLI autorisés. Aucun déploiement n'a été effectué.
2. **Rôle de modération** : attribuer le custom claim `dealhunterAdmin: true` à un réviseur de confiance via Firebase Admin SDK, en conservant les autres claims.
3. **Préproduction** : tester inscription, publication, matching, double consentement, messagerie, transaction, avis, signalements, retrait de fiche et suppression des données avec deux comptes de test.
4. **Protection des données** : définir durées de conservation, effacement complet, export, procédure de violation, gestion des demandes RGPD et politique de confidentialité.
5. **Cadre légal mondial** : vérifier pays par pays les règles sur le courtage, l'emploi, l'intérim, la sous-traitance, les qualifications réglementées, la consommation, les sanctions et les transferts internationaux.
6. **Sources** : vérifier les licences et conditions d'utilisation de chaque source et obtenir les clés/API nécessaires. Une annonce collectée n'est jamais un stock confirmé.
7. **Paiement/commission** : aucun paiement ni prélèvement n'est activé. La commission affichée de 5 % est indicative. Définir le rôle contractuel de DealHunter et les conditions de facturation avant toute collecte d'argent.
8. **Capacité** : les lectures de catalogue sont bornées à 500 documents par collection pour protéger les quotas gratuits. La couverture mondiale exhaustive, la pagination et les alertes de fraîcheur ne sont pas encore garanties.
9. **Sécurité** : faire auditer les règles, les droits des réviseurs, les flux de contact, les abus, les injections de contenu et les accès multi-tenant par un tiers avant ouverture publique.

## Contraintes de coût

Le code est développé en privilégiant les offres gratuites. Un budget initial de 0 € ne garantit ni disponibilité 24/7, ni collecte mondiale exhaustive, ni capacité illimitée. Ne pas activer de service nécessitant une facturation sans décision explicite.

## Décision de lancement

**Pas prêt pour une ouverture publique.** La branche de travail reste une PR brouillon ouverte et non fusionnée. Ne pas présenter les collecteurs comme tous opérationnels, ne pas prendre de paiements et ne pas ouvrir le service au public avant levée des bloqueurs ci-dessus.

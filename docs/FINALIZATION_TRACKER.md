# Registre de finalisation — DealHunter

Dernière mise à jour : 25 novembre 2026 — suivi des PR #21 et #22

Ce document suit les vérifications techniques. Il ne constitue ni une certification de sécurité, ni un avis juridique, ni une autorisation de mise en production.

## État de la branche de correction

- Branche : `finalization/security-hardening`
- Pull request : [#21 — Renforcer les règles Firestore et clarifier les imports CSV](https://github.com/malkidef/DealHunter/pull/21)
- Base : `main` au commit `dd5c234e52d5733bc37218317686703db9bd337a`
- La PR est en brouillon et n'est pas fusionnée.
- Les règles `firestore.rules` et `firebase/firestore.rules` sont identiques dans la branche.
- CI sur le commit `02445c00596024f0d8739b9183eb967e57fd10e9` : `Tests DealHunter` réussi et `Tests des règles Firestore` réussi (émulateur Firestore compris).
- Ces tests valident les suites automatisées, pas encore les essais réels d'authentification, d'e-mail ou le parcours complet sur le site.
- Aucun déploiement Firebase, publication Pages, activation de facturation, déploiement Cloud Functions ou activation Stripe n'a été effectué par cette branche.
- La PR #22 est une branche de travail empilée sur la PR #21 et cible `main` pour permettre l'exécution CI ; elle contient donc temporairement les changements de la PR #21 en plus de la vérification entreprise.

## Corrections préparées dans la PR #21

- Quantités et prix/budgets des offres et besoins produits strictement positifs et plafonnés.
- Limites de longueur sur les champs textuels des catalogues produits.
- Limites de longueur et de taille de listes sur les catalogues de services, profils professionnels et offres d'emploi.
- Cohérence des rôles vendeur/acheteur d'un deal avec les rôles de la demande de mise en relation acceptée d'origine.
- Tests négatifs ajoutés pour les valeurs nulles/négatives, les champs trop longs, les listes trop grandes et l'inversion des rôles.
- Import CSV : une ligne examinée localement ne devient pas un vendeur vérifié ; les sources importées doivent utiliser HTTPS.
- Collecte TED : schéma du collecteur manuel harmonisé avec l'interface ; suppression de sa planification périodique concurrente ; sérialisation des deux publications et limite de durée.

## Bloqueurs avant ouverture publique

### P0 — Protection des personnes et confiance

- Mettre en place et tester un parcours complet d'accès/export, rectification et suppression de compte/données. La procédure de conception existe, mais l'automatisation n'est pas livrée.
- PR #22 : relier l'approbation humaine à une fiche publique minimale `companyProfiles/{uid}` et à une preuve `companyVerifications/{uid}` réservée à l'administration. L'approbation de l'entreprise et l'écriture de la preuve sont atomiques ; le nom et le pays doivent correspondre. L'interface affiche le statut dans les catalogues uniquement si UID et nom concordent. La CI de cette PR est encore en cours ; aucun déploiement ni essai réel n'a eu lieu.
- Prévoir une procédure opérationnelle de révocation et vérifier les annonces existantes, les changements de nom et les profils historiques avant mise en production.
- Finaliser la politique de confidentialité, les conditions d'utilisation, les mentions légales, les durées de conservation, les bases légales et le contact responsable. Le document `docs/PRIVACY_OPERATIONS.md` est une procédure interne de conception, pas une politique publique définitive.
- Tester les inscriptions et connexions réelles, les e-mails de vérification et les parcours commerciaux avec deux comptes distincts. Les tests émulateur ne remplacent pas ces essais réels.

### P0 — Exploitation et continuité

- Mettre en place une sauvegarde Firestore adaptée, une procédure de restauration et un test de restauration. Aucun dispositif complet de sauvegarde/restauration n'a été confirmé lors de l'audit.
- Ajouter une surveillance des collecteurs et workers avec alertes exploitables. Les workflows GitHub Actions et leurs journaux ne constituent pas à eux seuls une supervision complète.
- Vérifier le déploiement Pages après les corrections : le site a été signalé accessible, mais le dernier workflow Pages audité sur `main` avait échoué ; une publication récente réussie doit être confirmée.

### P1 — Fonctionnalités et données

- Garder les signaux TED, BOAMP, BODACC, GSA et SAM séparés des stocks confirmés. Ils ne sont pas automatiquement transformés en offres ou besoins Firestore consommés par le matching.
- Qualifier manuellement l'identité du vendeur, la disponibilité, la quantité, le prix, les conditions et les droits de réutilisation avant toute publication comme stock réel.
- Vérifier les flux SAM et les collectes réelles, la pagination, la fraîcheur, les doublons et les formats.
- Tester les notifications avec deux comptes et confirmer la création, la lecture et le marquage comme lu. La planification GitHub Actions n'est pas du temps réel garanti.
- Compléter les tests multi-appareils, accessibilité et parcours mobile.

### Paiements — désactivés

- Le module Stripe n'est pas relié au modèle transactionnel actuel et n'a pas passé de test de bout en bout.
- Ne pas déployer le module Stripe ou les déclencheurs Firebase historiques.
- Ne pas encaisser de commission ni présenter le taux indicatif de 5 % comme une commission effectivement perçue.
- Toute activation de Stripe, de Cloud Functions ou d'un plan payant nécessite une décision distincte après migration, tests, revue de sécurité et validation du cadre contractuel.

## Règle de passage en production

Une correction n'est considérée comme terminée qu'après :
1. tests automatisés réussis ;
2. revue du diff et des règles ;
3. essais réels contrôlés sur un environnement de test ;
4. vérification de l'absence de régression ;
5. décision explicite de déploiement.

La présence d'un code ou d'un workflow dans GitHub ne prouve pas qu'une fonctionnalité est déployée ou opérationnelle.

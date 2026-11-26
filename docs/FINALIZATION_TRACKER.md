# Registre de finalisation — DealHunter

Dernière mise à jour : 25 novembre 2026

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
- Relier une décision de vérification humaine au profil entreprise et à ses annonces, avec un statut de confiance explicite et vérifiable. À ce jour, une demande marquée « vérifiée » ne suffit pas à certifier automatiquement le profil et les stocks.
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


## Mise à jour — 25 novembre 2026 (contrôles transactions et profils)

- La branche `finalization/security-hardening` contient les règles Firestore renforcées pour les profils privés, les catalogues offres/besoins et les transactions.
- Les règles `firestore.rules` et `firebase/firestore.rules` sont synchronisées.
- Les contrôles de création des transactions relient les rôles vendeur/acheteur aux rôles de la demande acceptée d'origine. Les confirmations bilatérales restent limitées à une confirmation par participant ; une transaction ne peut être supprimée par le client.
- Les avis sont réservés aux participants d'une transaction terminée, avec un identifiant déterministe empêchant un second avis du même auteur.
- Les dates de création des offres et besoins ne peuvent pas être modifiées lors d'une mise à jour.
- Validation CI du commit `b067623da3142ba381024808539e79caed1cc971` : workflow `Tests DealHunter` réussi (run 45695125241) et workflow `Tests des règles Firestore` réussi (run 45695125054).
- La PR21 reste en brouillon, non fusionnée et non déployée. Ces validations ne remplacent pas les essais réels avec deux comptes.


### Mise à jour — 25 novembre 2026 : intégrité des demandes de mise en relation

- Les règles Firestore imposent désormais que le produit d'une demande de mise en relation corresponde au produit de l'offre active référencée.
- Les noms d'entreprises affichés pour le demandeur et le destinataire doivent correspondre aux fiches publiques vendeur/acheteur liées à la demande ; un client ne peut plus forger ces libellés dans la demande.
- Trois tests négatifs supplémentaires couvrent le faux produit, le faux nom de l'entreprise demandeuse et le faux nom de l'entreprise destinataire.
- Les deux fichiers de règles Firestore sont synchronisés sur la branche.
- CI en cours sur le commit `b9b530d690a20e6313e1028b446d3659ea498bf6` : tests applicatifs et tests des règles Firestore lancés ; ne pas considérer la correction validée avant leur succès.
- Cette correction reste dans la PR21 brouillon, non fusionnée et non déployée.


### Complément — intégrité des demandes produit et service (25 novembre 2026)

- Les demandes `matchRequests` reprennent désormais le produit et les noms d'entreprises directement depuis les fiches publiques liées, avec contrôle du bon rôle demandeur/destinataire.
- Les demandes `serviceMatchRequests` vérifient le titre de l'offre, le titre du besoin, les entreprises et l'identité du destinataire à partir des fiches référencées.
- Tests négatifs ajoutés pour les valeurs falsifiées dans les deux parcours.
- Les règles `firestore.rules` et `firebase/firestore.rules` ont été comparées et sont identiques.
- CI sur le commit de code `99421980535afb0236a5b53ce0317708298ea075` : tests applicatifs et tests des règles Firestore terminés avec succès (run `45697112388` et run `45697111917`). Le dernier commit documentaire ne modifie pas le code testé.
- La PR #21 demeure ouverte, en brouillon, non fusionnée et non déployée.


## Mise à jour — 25 novembre 2026 : branche de vérification entreprise réalignée

- La PR #28 est reconstruite depuis le head actuel de la PR #21 afin de conserver les derniers contrôles de cohérence des demandes produit et service.
- Les règles `companyProfiles`, `companyVerifications` et `verificationRequests` ont été réintégrées sur cette base ; les deux copies de règles Firestore sont identiques.
- Le test de vérification humaine atomique a été ajouté à la suite la plus récente, sans écraser les tests plus récents de la PR #21.
- La PR #28 reste un brouillon non fusionné. Sa CI et sa révocation de statut doivent encore être validées.


### Complément — révocation contrôlée de la vérification entreprise (25 novembre 2026)

- L'interface de révision permet désormais à un administrateur autorisé de révoquer une vérification d'entreprise précédemment validée.
- L'opération supprime la preuve `companyVerifications/{uid}` et passe la demande liée à `revoked` dans un même batch Firestore.
- Les règles refusent une suppression isolée de la preuve et une révocation isolée de la demande ; les deux changements doivent être atomiques et porter sur le même propriétaire.
- Le nom et le pays du profil public ne peuvent plus être modifiés tant qu'une preuve de vérification active existe. Après révocation, une nouvelle modification/revue peut être effectuée.
- Tests ajoutés : révocation atomique autorisée, suppression seule refusée, changement du statut seul refusé, changement du nom/pays pendant vérification refusé, mise à jour non identitaire autorisée.
- Validation CI du nouveau commit en cours au moment de la mise à jour ; ne pas considérer la PR #28 comme validée avant les résultats finaux des deux workflows.
- Aucun déploiement Firestore, aucune fusion ni aucune modification des données réelles effectués.


### Complément — notifications en temps réel (25 novembre 2026)

- Le chargement ponctuel des notifications à la connexion est remplacé sur cette branche par un listener Firestore `onSnapshot`, limité aux 50 notifications du compte connecté.
- Le listener est désabonné à chaque changement d'état d'authentification ; l'interface est vidée avant le chargement du compte suivant pour éviter l'affichage des notifications d'un autre utilisateur.
- Le marquage comme lu est répercuté par le listener, sans relecture manuelle supplémentaire.
- La CI applicative valide la syntaxe JavaScript de cette version. Le test du parcours réel sur deux comptes et la latence du worker périodique restent à vérifier.


### Complément — bornes transactionnelles (25 novembre 2026)

- Les règles des transactions limitent désormais quantité et prix unitaire à 1 milliard d'unités, le montant total à 1 000 milliards et la commission à 50 milliards (bornes de sécurité techniques, pas des plafonds commerciaux recommandés).
- Les tests couvrent les dépassements de quantité/prix/total et interdisent de rouvrir une transaction après son statut `completed`.
- Les règles source et copie Firebase restent synchronisées ; validation CI à confirmer sur le dernier commit.


### Complément — prévention des doubles vérifications entreprise (25 novembre 2026)

- Le formulaire refuse une nouvelle demande du même type lorsqu'une demande est déjà en attente ou qu'une vérification est active.
- Les règles Firestore refusent la création d'une demande entreprise si une preuve active existe.
- Une preuve de vérification ne peut plus être remplacée par une décision provenant d'une autre demande ; une deuxième approbation concurrente ou obsolète est refusée.
- La révocation doit intervenir avant de pouvoir soumettre une nouvelle demande entreprise.
- Tests de règles ajoutés pour les demandes en doublon et la tentative d'approbation d'une deuxième demande ; CI à confirmer sur le dernier commit.


### Complément — dossier documentaire RGPD et continuité (25 novembre 2026)

Les spécifications suivantes sont maintenant réunies sur la branche de finalisation :
- `docs/PRIVACY_OPERATIONS.md` : inventaire des collections, visibilité, droits et risques liés aux sous-collections et aux données partagées.
- `docs/ACCOUNT_DATA_EXPORT_DESIGN.md` : export local filtré par UID, pagination, pseudonymisation des tiers et limites.
- `docs/ACCOUNT_ERASURE_DESIGN.md` : rectification, retrait, effacement, anonymisation et ordre de traitement Auth/Firestore.
- `docs/OPERATIONS_READINESS.md` : limites Spark, sauvegardes/restauration et surveillance des automatisations.

Ces documents sont des spécifications préparatoires, pas des fonctions opérationnelles. Aucun export, effacement ou backup réel n'a été exécuté. La sauvegarde restaurable reste un bloqueur de mise en production.


### Mise à jour — export personnel initial (25 novembre 2026)

- Ajout d'un bouton « Exporter mes données personnelles (JSON) » au panneau Compte.
- Export local filtré par UID connecté : profil privé, sous-collections vendeur/acheteur, annonces et besoins produits/services/emploi, demandes de vérification, signalements déposés, notifications reçues et profil/preuve entreprise.
- Exige une adresse e-mail vérifiée et une connexion datant de moins de 15 minutes.
- Chaque collection est plafonnée à 500 documents ; erreurs et plafonds sont consignés dans le manifeste JSON.
- Conversations, demandes de mise en relation, transactions, avis et données de tiers restent exclus de cette première version.
- Tests statiques ajoutés pour le filtrage UID, la fraîcheur de connexion, les plafonds et l'annonce des exclusions.
- Code en branche de développement uniquement. Validation CI, test réel sur deux comptes et vérification du téléchargement sur Android/ordinateur encore requis.
- Cette première version n'est pas encore un export exhaustif de tous les droits d'accès ; aucun effacement ou changement des données source n'est réalisé.


### Mise à jour — rectification du profil entreprise (25 novembre 2026)

- Le profil existant est relu depuis Firestore et prérempli dans le formulaire Compte.
- Le formulaire permet de corriger le nom, le pays et le téléphone du profil non vérifié.
- Une vérification active verrouille le nom et le pays dans l'interface ; les règles Firestore imposent également leur invariance.
- Les champs sont vidés lors d'une déconnexion ou d'un changement de compte.
- Tests statiques ajoutés pour le rechargement, les verrous et le nettoyage du formulaire.
- Code en branche de développement uniquement ; validation CI postérieure aux derniers commits et essais réels multi-comptes encore requis.


### Mise à jour — 26 novembre 2026 : transparence de l'export et CI finale

- L'interface d'export annonce désormais clairement qu'il s'agit d'un export initial et partiel, et énumère les conversations, demandes partagées, transactions et avis qui ne sont pas inclus.
- Un test statique vérifie la présence de cet avertissement.
- Commit contrôlé : `bce0f98f0aa25ba64f6e7ea7088c4eaa8720d936`.
- Workflow `Tests DealHunter` : run `45901984594`, succès ; étapes Python, matching, vérification des fonctions Firebase et validation JavaScript réussies.
- Workflow `Tests des règles Firestore` : run `45901984723`, succès ; synchronisation des règles et tests de l'émulateur Firestore réussis.
- La PR #28 a été mise à jour pour refléter ces résultats ; elle reste en brouillon, non fusionnée et non déployée.
- La comparaison avec `main` indique 97 commits en avance et 5 en retard. Aucun réalignement ni merge n'a été effectué ; les cinq commits présents uniquement sur `main` doivent être préservés.
- Restent bloquants : export complet des données personnelles détenues dans les espaces partagés, procédure d'effacement, sauvegarde/restauration testée, essais multi-comptes et validation opérationnelle avant toute ouverture publique.
- Aucun service payant, aucun paiement réel, aucune suppression de données et aucun déploiement ne sont activés.


### Complément — tests de requêtes participant pour l'export (26 novembre 2026)

- Ajout de tests Firestore sur les requêtes filtrées par `participantUids array-contains uid` pour `serviceMatchRequests` et `workMatchRequests`.
- Les tests vérifient qu'un participant peut interroger les demandes qui le concernent, qu'une lecture de collection non filtrée est refusée et qu'un tiers sans participation ne peut pas interroger ces demandes.
- Commit de tests : `9bd57c4a08ed90dfbc2e6193107c57cf81707215`.
- Les règles n'ont pas été élargies : il s'agit de vérifier les requêtes compatibles avec les règles existantes.
- Résultat CI pour ce commit : non encore confirmé par les informations Actions accessibles dans ce contrôle ; ne pas considérer ces nouveaux tests comme exécutés avant une exécution verte.


- Correction du test tiers : la requête d'un tiers est maintenant filtrée sur l'UID d'un autre participant (`bob`), ce qui doit être refusé. Une requête filtrée sur son propre UID serait légitimement autorisée même si elle ne retourne aucun document.
- Commit de correction : `1a09c6e90bcc7e3232d94cd54a324af3558f0b56`.
- CI toujours non confirmée sur ce commit.

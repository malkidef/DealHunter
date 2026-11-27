# Registre de finalisation — DealHunter

Dernière mise à jour : 27 novembre 2026

Ce document suit les vérifications techniques. Il ne constitue ni une certification de sécurité, ni un avis juridique, ni une autorisation de mise en production.

## État de la branche de correction

- Branche active de finalisation : `finalization/company-verification-current`
- Pull request active : [#28 — Finaliser les protections de sécurité et les parcours entreprise](https://github.com/malkidef/DealHunter/pull/28)
- Les références à la PR #21 et à `finalization/security-hardening` dans l'historique ci-dessous décrivent des étapes antérieures, pas la branche active.
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


### Revue complémentaire — cohérence des tests tiers (26 novembre 2026)

- Contrôle du test des requêtes Firestore de demandes d'emploi : le scénario tiers filtrait initialement sur l'UID du tiers lui-même. Cette requête peut être autorisée tout en retournant zéro résultat ; elle ne démontrait donc pas le refus d'accès à des documents d'un autre participant.
- Correction : le tiers tente désormais une requête filtrée sur l'UID `bob`, qui est participant à la demande mais n'est pas le tiers connecté.
- Commit correctif : `c172c72dc0a5304acd984d521c7d36a8b73591b8`.
- La requête négative équivalente des demandes de services filtre déjà sur l'UID d'un autre participant.
- Le workflow `Tests DealHunter` est configuré sur les push de `main` et les pull requests vers `main`. L'exécution verte sur les derniers commits de la PR reste à confirmer ; ne pas extrapoler les résultats précédents.
- Aucun élargissement des règles Firestore, aucun déploiement et aucune donnée utilisateur modifiée.


### Mise à jour — matrice des données partagées pour l'export (26 novembre 2026)

- Revue statique des règles Firestore pour `matchRequests`, `serviceMatchRequests`, `workMatchRequests`, les trois collections de messages, `deals`, `dealReviews`, `matchContacts` et `matches`.
- Ajout d'une matrice dans `docs/ACCOUNT_DATA_EXPORT_DESIGN.md` : requêtes filtrées, données du titulaire, champs de tiers, pseudonymisation et décisions de minimisation.
- Les messages et commentaires libres restent soumis à une politique dédiée avant inclusion ; leur contenu peut contenir des données personnelles de tiers.
- Pour `matchContacts`, la conception impose de ne récupérer que les documents dont `ownerUid` est le titulaire, même si les règles permettent à l'autre participant de lire les coordonnées partagées.
- Les demandes, transactions et suggestions doivent être projetées champ par champ ; aucun document partagé ne doit être sérialisé brut.
- Tests existants confirmés à la lecture du fichier de test : accès aux demandes produit et messages après acceptation, requêtes filtrées service/emploi, messages de service/emploi, transactions réservées aux participants, avis réservés aux reviewer/subject, coordonnées accessibles seulement dans une demande acceptée.
- Les tests de requête filtrée sur les avis et les contacts, ainsi que la projection de l'export, restent à ajouter avant toute implémentation.
- Commit documentaire : `23b9eaaa72d3fc1a1a2064f2082206783b19ec43`.
- L'interrogation du wrapper Actions sur ce commit n'a retourné aucun run exploitable. Ce résultat ne prouve ni l'absence de workflow ni un succès : la CI du commit documentaire reste non confirmée.
- Aucun code d'export partagé ni règle Firestore n'a été modifié ; aucun déploiement, merge ou changement de données réelles.


### Mise à jour — tests des requêtes d'export partagé (26 novembre 2026)

- Ajout d'un test de règles multi-comptes pour les requêtes participant des demandes produit, messages produit, transactions et avis.
- Le test vérifie également que les coordonnées de l'autre participant sont lisibles dans le contexte d'une demande acceptée, mais qu'elles ne doivent pas être incluses dans l'export du titulaire (contrôle de `ownerUid`).
- Les avis sont interrogés séparément via `reviewerUid` et `subjectUid`, sans lecture globale.
- Commit : `17501d9a9fbf4c3bd030d6ec8f0601abe707e655`.
- Le résultat CI de ce commit reste non confirmé ; le wrapper Actions et le statut de commit n'ont retourné aucun résultat exploitable.
- Aucun code d'export, aucune règle Firestore, aucun paiement et aucune configuration de déploiement modifiés.


- Complément de couverture : test de la requête `matches` filtrée par `participantUids array-contains uid` et refus de la lecture globale ; schéma du producteur vérifié dans `firebase/functions/src/matching-batch.js` et chargement UI confirmé dans `auth.js`.
- Commit de test : `4f6adc09db1fb4d2efd0dbb13e50552122d270df`.
- Commit documentaire : `0e1d957b06f25cf2184871df4b648a023d6b4743`.
- Les suggestions automatiques restent distinctes des demandes envoyées et des transactions.
- CI non confirmée pour ces commits ; aucune réussite n'est revendiquée.


### Revue complémentaire — lecture sécurisée des coordonnées partagées (26 novembre 2026)

- Le test de requêtes d'export partagé a été affiné : aucune requête de collection `matchContacts where ownerUid == uid` n'est revendiquée.
- Motif : la règle `matchContacts` vérifie aussi que `resource.data.requestId` pointe vers une demande acceptée dont le compte est participant. Un simple filtre `ownerUid` ne démontre pas cette condition à l'analyse des règles Firestore.
- Stratégie retenue : depuis chaque demande produit acceptée et autorisée, lire le document déterministe `requestId + "_" + uid`, puis contrôler `ownerUid == uid`. Le document de l'autre participant est exclu.
- Le test qui aurait pu supposer une requête de collection autorisée a été retiré avant validation ; les lectures par identifiant sont conservées.
- Commit test corrigé : `264d465b7d4c6ebefa26886f790c5a00056705e5`.
- Commit documentaire : `8fb1da47198a608fafeff1307a21a0f76ed68469`.
- CI non confirmée pour ces commits ; aucune réussite de tests n'est revendiquée.
- Aucun code d'export ni aucune règle Firestore modifiés.


### Contrôle de cohérence de branche et CI — 26 novembre 2026

- Tête actuelle de la branche : `b05cd7b6d6ae03dbe8c4a15981edb46d9ef8a23e`.
- Comparaison GitHub avec `main` : branche divergente, 116 commits en avance et 5 en retard.
- Les cinq changements présents uniquement sur `main` concernent les instantanés JSON de sources BOAMP, BODACC, GSA, SAM et TED (`data/*.json`). Aucun fichier applicatif ou de règles n'apparaît dans cette comparaison inverse.
- Ces instantanés de données sont conservés ; aucun réalignement, rebase ou fusion n'a été tenté.
- Le workflow `Tests des règles Firestore` existe bien et s'exécute sur les événements `pull_request` vers `main`. Le workflow vérifie d'abord l'identité des fichiers `firestore.rules` et `firebase/firestore.rules`, puis lance l'émulateur Firestore et Mocha.
- Les copies des règles sont actuellement identiques (même blob SHA `6b354a5f2746a2f67f8296e26bd1bb37feca2490`).
- Le contrôle CI sur la tête actuelle ne retourne aucun run ni statut exploitable via les outils disponibles. Le succès des nouveaux tests reste donc non confirmé ; ne pas considérer ce commit comme validé.
- Aucun rebase, merge, déploiement, changement de données ou service payant.


### Résultat CI confirmé sur le commit de tête — 27 novembre 2026

Commit contrôlé : `e29de7a9365574ee680c653a3e6f7d5c01a70d20`.

- Workflow `Tests DealHunter`, run `45904007315` (#726) : **completed / success**.
  - Tests Python : succès.
  - Tests du moteur de matching : succès.
  - Vérification des fonctions Firebase : succès.
  - Vérification du JavaScript de l'application : succès.
- Workflow `Tests des règles Firestore`, run `45904007436` (#576) : **completed / success**.
  - Synchronisation des règles : succès.
  - Installation des dépendances : succès.
  - Tests dans l'émulateur Firestore : succès.
- Les deux workflows ont terminé sans étape en échec selon les résultats GitHub Actions consultés.
- Cette validation concerne précisément le commit ci-dessus. Tout nouveau commit nécessitera une nouvelle vérification CI.
- La PR #28 reste en brouillon et non fusionnée. Aucun déploiement ni service payant.


### Vérification CI finale — 27 novembre 2026, commit 662ec48da02c91a9d8040bf0bd9dcdde20dfe86b

- Workflow `Tests DealHunter`, run `45920762974` (#728) : **completed / success**.
- Workflow `Tests des règles Firestore`, run `45920762959` (#578) : **completed / success**.
- Le job `firestore-rules` a terminé avec succès : contrôle de parité des règles, installation des dépendances et tests dans l'émulateur Firestore sont tous réussis.
- Cette validation porte sur le commit exact `662ec48da02c91a9d8040bf0bd9dcdde20dfe86b`. Elle ne valide ni les parcours réels Firebase multi-comptes, ni les droits RGPD complets, ni une restauration de sauvegarde.
- La PR #28 reste en brouillon, non fusionnée et non déployée. Aucun paiement, service payant ou changement de données réelles.


### CI du contrôle statique de l'export — commit `da9134e8d391e1ed5a4253e314b8c57876bc8d87` (27 novembre 2026)

- `Tests DealHunter`, run `45921099192` (#730) : **completed / success**. Toutes les étapes Python, matching, vérification des fonctions Firebase et JavaScript sont réussies.
- `Tests des règles Firestore`, run `45921099159` (#580) : **in_progress** au dernier contrôle. La parité des règles est réussie ; installation des dépendances en cours, émulateur pas encore lancé.
- La réussite du workflow général ne remplace pas les tests Firestore. Ne pas déclarer la CI complète verte tant que le run #580 n'est pas terminé.
- La revue de l'export est statique et documentaire ; aucun code d'export, aucune règle et aucune donnée utilisateur n'ont été modifiés.


### Revue complémentaire du téléchargement d'export — 27 novembre 2026

- Inspection statique de `exportAccountData` : erreurs isolées par collection et consignées dans `limits`, requêtes filtrées par UID pour les collections publiques, sous-collections privées lues sous `users/{uid}`, plafond dur de 500 documents détecté par lecture de 501.
- Le JSON est généré localement par Blob/ObjectURL ; l'ObjectURL est révoquée une seconde après le clic. La fiabilité de ce délai sur Android et ordinateur reste à tester en conditions réelles.
- Un échec partiel n'empêche pas le téléchargement ; le manifeste et le message d'interface signalent les limites. Une liste vide doit être interprétée avec les erreurs du manifeste.
- Ajout documentaire dans `docs/ACCOUNT_DATA_EXPORT_DESIGN.md`, commit `ccd1f621fe585f7f0d100d2892d1a93c666b3d9e`.
- Sur le commit parent `967c7b3abfafd0e98960726ef303f76a1876ab20`, `Tests DealHunter` (#731, run `45921173654`) est **success**. `Tests des règles Firestore` (#581, run `45921173659`) est toujours **in_progress** au dernier contrôle ; les tests de l'émulateur sont en cours.
- Aucune modification du code applicatif, des règles, des données réelles ou des services activés. La CI du nouveau commit documentaire reste à vérifier.


### Protocole de triage de demande d'effacement — 27 novembre 2026

- Ajout d'une checklist manuelle et non destructive à `docs/ACCOUNT_ERASURE_DESIGN.md` : vérification proportionnée, inventaire des données, décisions de conservation, simulation, double approbation, exécution idempotente, contrôle des workers et réponse.
- Séparation explicite des étapes : réception, identité, inventaire, décision, simulation, approbation distincte, exécution, vérification, réponse, clôture.
- Aucun formulaire utilisateur, aucune purge automatisée, aucun accès ou changement de données réelles ; cette documentation ne remplace pas la validation juridique ni un canal de contact publié.
- Commit documentaire : `4d00becf5b2bc01bf9e564f37486faad08165ebc`.
- CI confirmée sur commit documentaire précédent `dfa5b0303b455bb2fba39d995434ae87914e4f86` : `Tests DealHunter` #733 et `Tests des règles Firestore` #583 sont **success**. Ces runs ne couvrent pas le nouveau commit de checklist.


### Revue sauvegarde gratuite / Spark — 27 novembre 2026

- Inspection des workflows matching et notifications : ils utilisent le secret serveur `FIREBASE_SERVICE_ACCOUNT` pour accéder à Firestore. Il n'est pas réutilisé pour créer une archive de données.
- Conclusion sécurité : ne pas produire de dump complet via GitHub Actions ni publier une archive sensible en artefact ; aucun chiffrement hors dépôt ni restauration isolée n'est actuellement vérifié.
- Ajout dans `docs/OPERATIONS_READINESS.md` d'une option locale gratuite à étudier : compte de service distinct en lecture seule et temporaire, chiffrement local avec clé hors dépôt, inventaire/intégrité, stockage privé contrôlé, restauration dans un projet isolé et révocation du compte temporaire.
- Cette option est une piste, pas une sauvegarde opérationnelle. Pas de dump lancé, pas de clé créée, pas de compte de service créé/modifié, pas de donnée Firestore lue, pas de coût engagé et pas d'activation Blaze.
- Commit documentaire : `79836c462f4df8a01b71fa15ac8eae252dcf5e8c`.
- Dernière validation CI confirmée avant cet ajout : commit `dfa5b0303b455bb2fba39d995434ae87914e4f86`, workflows `Tests DealHunter` #733 et `Tests des règles Firestore` #583 : **success**. Aucun run exploitable n'est encore retourné pour le nouveau commit documentaire.


### Contrôle CI sur la tête documentaire `d2c51ed881d80abaa6b6463a26741bd025008ced` — 27 novembre 2026

- `Tests DealHunter`, run `45921506074` (#737) : **completed / success**.
- `Tests des règles Firestore`, run `45921505522` (#587) : **in_progress** au dernier relevé. Parité des règles réussie ; installation des dépendances en cours ; l'émulateur Firestore n'a pas encore démarré.
- Le commit documentaire `d2c51ed...` n'est donc que partiellement validé à cet instant. Ne pas annoncer une CI complète verte.
- Aucun test réel de sauvegarde ou restauration n'a été exécuté ; aucun dump, compte de service supplémentaire, clé ou stockage d'archive créé.


### Résultats CI actualisés — 27 novembre 2026

- Le workflow Firestore #587 (run `45921505522`) a terminé **success** ; les tests de l'émulateur Firestore ont réussi.
- Sur le commit documentaire suivant `48c2b8e6cf2fc771516fafd2f1a85c90c61868cf`, `Tests DealHunter` #738 (run `45921588193`) est **success** ; `Tests des règles Firestore` #588 (run `45921588205`) était **in_progress** au moment de cette mise à jour. Ce commit ne doit pas être présenté comme entièrement validé tant que #588 n'est pas terminé.
- Les tests verts #737/#587 valident le commit précédent `d2c51ed...`, pas automatiquement tous les commits ultérieurs.
- PR #28 reste en brouillon. La branche est divergente de `main` (130 commits en avance, 5 en retard au dernier compare) ; aucun rebase, merge ou déploiement effectué.
- Budget inchangé : aucune dépense ni activation d'un service payant. Stripe et Firebase Blaze restent désactivés.


### CI verte et audit des cinq instantanés de données — 27 novembre 2026

- Sur le commit `04154ed9e478acff0f269ca3c99e1977b0695cff`, `Tests DealHunter` #739 (run `45921690357`) : **completed / success** ; `Tests des règles Firestore` #589 (run `45921690312) : **completed / success**, émulateur compris.
- Comparaison actualisée avec `main` : branche divergente, 131 commits en avance et 5 en retard. Aucun rebase, merge ni écrasement de fichiers n'a été effectué.
- Les cinq chemins concernés ont été identifiés précisément : `data/boamp-buyer-opportunities.json`, `data/bodacc-business-sales.json`, `data/gsa-auctions.json`, `data/sam-buyer-opportunities.json`, `data/ted-buyer-opportunities.json`.
- Les SHA de blobs sur `main` diffèrent de ceux de la branche pour les cinq fichiers. Les tailles/versions ne sont donc pas interchangeables ; ils ne doivent pas être copiés ou remplacés sans comparaison de contenu et validation de fraîcheur/source. Les instantanés de données sont préservés des deux côtés.
- Cette vérification ne prouve pas la fraîcheur ni la qualité des cinq flux ; elle identifie seulement un conflit de versions de fichiers. Les cinq commits en retard ne sont pas intégrés.
- La tête documentaire suivante doit recevoir ses propres contrôles CI. Aucune action sur les données Firestore, aucune dépense, aucun service payant, aucun déploiement.


### CI et audit de fraîcheur des cinq flux — 27 novembre 2026

- Commit documentaire contrôlé : `d31268ed01b6e8dd0691c48af27ac4e4c7b001a4`.
- `Tests DealHunter`, run `45990544578` (#740) : **completed / success**.
- `Tests des règles Firestore`, run `45990544500` (#590) : **completed / success** ; job `firestore-rules` terminé avec succès.
- L'historique GitHub confirme que les cinq commits en retard sur `main` sont des publications automatiques de flux, et non cinq modifications applicatives à fusionner sans examen :
  - BOAMP : `main` publié le 26 novembre à 15:26 UTC ; branche de finalisation le 25 novembre à 15:46 UTC.
  - BODACC : `main` publié le 26 novembre à 15:47 UTC ; branche de finalisation le 25 novembre à 16:04 UTC.
  - GSA Auctions : `main` publié le 25 novembre à 20:26 UTC ; branche de finalisation le 23 novembre à 22:30 UTC.
  - SAM.gov : `main` publié le 25 novembre à 20:50 UTC ; branche de finalisation le 23 novembre à 23:04 UTC.
  - TED : `main` publié le 26 novembre à 15:38 UTC ; branche de finalisation le 25 novembre à 15:56 UTC.
- Les métadonnées BOAMP, BODACC et TED indiquent également des dates de collecte plus récentes sur `main`. Les historiques de commits confirment le même ordre pour GSA et SAM. Les instantanés de `main` sont donc les publications les plus récentes à cette date ; les blobs divergents ne sont pas des versions équivalentes.
- Décision prudente : conserver les cinq instantanés des deux côtés jusqu'à validation de compatibilité des schémas avec le code de la branche. Ne pas écraser `main`, ne pas copier les fichiers à l'aveugle, ne pas rebaser ni fusionner automatiquement.
- Les collecteurs BOAMP/BODACC/TED publient quotidiennement ; GSA et SAM publient selon leurs calendriers configurés. Les workflows ont des permissions `contents: write` pour publier leurs fichiers de flux. Les collectes produisent des signaux d'opportunités, pas des stocks confirmés ni des commandes fermes.
- Cette revue est basée sur le code, les métadonnées et l'historique GitHub ; aucune nouvelle collecte API n'a été déclenchée et aucune donnée Firestore n'a été lue ou modifiée.
- PR #28 reste non fusionnée et non déployée. Aucun paiement, service payant ou coût engagé.


### Limites de couverture des collecteurs — 27 novembre 2026

- Revue statique des scripts de collecte sur la branche de finalisation :
  - BOAMP : requête limitée à 100 avis, sans pagination dans le collecteur.
  - BODACC : requête limitée à 100 avis, sans pagination.
  - TED (collecteur quotidien) : première page uniquement, limite 100 ; le total disponible est conservé comme métadonnée mais les pages suivantes ne sont pas chargées.
  - SAM.gov : pagination présente, taille de page plafonnée à 1 000 et plafond configurable de 5 000 avis par exécution.
  - GSA Auctions : le collecteur normalise la liste reçue par l'API ; l'instantané examiné sur la branche contenait 938 annonces au 23 novembre.
- Conséquence : BOAMP, BODACC et TED sont des échantillons récents, pas des inventaires exhaustifs. Les interfaces et les rapprochements ne doivent pas présenter ces flux comme couvrant tous les avis disponibles.
- Les tests existants valident des cas de normalisation et de classification ; ils ne démontrent pas une pagination complète BOAMP/BODACC/TED ni une couverture exhaustive des API.
- Décision : conserver ces limites visibles dans l'évaluation de préparation. Une amélioration de pagination devra inclure gestion des limites API, déduplication par identifiant, arrêt sur page vide, protection contre les réponses partielles et tests sur fixtures ; aucune modification des collecteurs ou collecte réseau n'a été réalisée pendant cette revue.


## Mise à jour — 27 novembre 2026 : CI, divergence et revue des collecteurs

- Commit documentaire contrôlé : `d31268ed01b6e8dd0691c48af27ac4e4c7b001a4`.
- Workflow `Tests DealHunter` run `45990544578` (#740) : terminé avec succès. Étapes réussies : tests Python, moteur de matching, vérification des fonctions Firebase et validation JavaScript de l'application.
- Workflow `Tests des règles Firestore` run `45990544500` (#590) : terminé avec succès. Vérification de la synchronisation des règles et tests dans l'émulateur Firestore réussis.
- La PR #28 est toujours ouverte, en brouillon et non fusionnée. La comparaison `main...finalization/company-verification-current` indique 134 commits en avance et 5 en retard au contrôle du 27 novembre. Les cinq différences de snapshots de données identifiées précédemment restent à analyser ; aucun réalignement, écrasement ou merge n'est effectué.
- Revue statique des workflows BOAMP, BODACC, TED, GSA et SAM : les flux sont publiés dans le dépôt avec `contents: write`. Les annonces sont des signaux de consultation/revue et ne sont pas des stocks confirmés ni des commandes fermes. Les collecteurs ne sont pas tous équivalents : TED est programmé quotidiennement et sa requête actuelle récupère une seule page de 100 avis sur 45 jours ; SAM et GSA sont programmés tous les deux jours ; BOAMP, BODACC et TED sont quotidiens.
- Le connecteur TED ne pagine pas actuellement : les résultats au-delà de la première page ne sont pas récupérés. La documentation du connecteur a été corrigée pour refléter cette limite et le calendrier réel.
- Les workflows de publication ont le droit d'écrire sur la branche qui les déclenche. À préserver lors de la future revue des permissions et de la stratégie de publication ; ne pas transférer ces secrets ou droits aux scripts de lecture.
- Les tests CI ne valident pas la fraîcheur des sources, la pagination complète, les conditions de réutilisation commerciale, ni la disponibilité réelle des lots. Qualification humaine obligatoire avant publication comme stock.
- Aucun accès aux données Firestore réelles, aucune sauvegarde, aucun effacement, aucune activation de facturation, aucun paiement et aucun déploiement n'ont été effectués. Dépense : 0 €.


## Mise à jour — 27 novembre 2026 : pagination TED

- Documentation officielle TED consultée : mode `PAGE_NUMBER`, maximum 250 avis par page et 15 000 avis par requête ; le mode `ITERATION` est prévu pour les extractions plus larges. La recherche publique ne nécessite pas de clé.
- `scripts/collect_ted.py` modifié sur la branche de finalisation : pagination jusqu'à 250 avis/page, déduplication par numéro de publication, contrôles de réponse/timeouts, écriture atomique, plafond de sécurité de 5 000 et indicateur `truncated`.
- Tests de pagination, déduplication, plafond et erreur ajoutés à `tests/test_ted_procurement.py`.
- Commit script : `229a67172ff793f366eb168e33dcd9c731c0f9ed`; tests : `5982dd5214a6f8df357bb582711fc610d1dbb6a4`.
- Documentation connecteur mise à jour. La CI de ces changements est en attente de confirmation ; aucun lancement manuel du collecteur ni appel à l'API de production n'a été effectué.
- Les annonces restent des signaux d'appels d'offres publics, pas des commandes fermes ni des stocks disponibles. La qualification commerciale demeure manuelle.


## Audit pagination des autres collecteurs — 27 novembre 2026

- BOAMP (`scripts/collect_boamp.py`) : la requête API demande actuellement `limit=100` sans pagination ni compteur de complétude conservé. Le flux peut donc être incomplet lorsque plus de 100 avis correspondent à la collecte.
- BODACC (`scripts/collect_bodacc.py`) : même limite actuelle de 100 avis, sans pagination ; seuls les avis de vente/cession sont conservés, sans données personnelles ni données de stock.
- GSA Auctions (`scripts/gsa_auctions.py`) : l'appel observé ne met pas en œuvre de pagination ; l'instantané historique de 591 annonces ne prouve pas l'exhaustivité du catalogue.
- SAM.gov (`scripts/sam_opportunities.py`) : pagination par offset, 1 000 avis maximum par page et plafond de 5 000 par exécution ; le total API est conservé pour diagnostic.
- Aucun de ces constats ne prouve une perte de données à chaque exécution, mais BOAMP/BODACC/GSA ne doivent pas être présentés comme exhaustifs. À traiter ensuite avec pagination bornée, déduplication, métadonnées de complétude et tests, sans écraser les snapshots existants.
- Les tests Python de la tête `b3f20b332e4495abede38f9d7d7b4fa0eb193d9f` (run DealHunter #747) sont **success** : la pagination TED et ses tests ont passé. Les tests Firestore #597 ont depuis terminé avec succès.


## Pagination BOAMP — 27 novembre 2026

- `scripts/collect_boamp.py` utilise désormais les paramètres `limit=100` et `offset` pour lire les pages successives de l'API Opendatasoft, jusqu'à un plafond de sécurité de 5 000 lignes.
- Le script conserve le total API lorsqu'il est fourni, expose `total_available` et `truncated`, déduplique les avis et rejette les réponses sans tableau `results`. L'écriture du fichier reste atomique et le flux historique n'est pas touché tant que le collecteur n'est pas exécuté.
- Tests ajoutés à `tests/test_collect_boamp.py` : multi-pages, plafond/troncature et réponse invalide.
- Commits : collecteur `c3859caa73b45b21ee2497d7835f4ac914fc1b94`, tests `50f516707185c2f351b3179b1fa568d3cc357257`.
- CI applicative #750 (commit tests BOAMP `50f5167`) : succès ; les trois tests BOAMP de pagination ont passé. Aucun appel réel à l'API BOAMP et aucune publication de snapshot n'ont été lancés.


## Pagination BODACC — 27 novembre 2026

- `scripts/collect_bodacc.py` utilise désormais les paramètres Opendatasoft `limit`/`offset`, pages de 100, plafond local de 5 000 avis, total API et indicateur `truncated`.
- Le filtre demeure strictement limité aux avis `familleavis = 'vente'`. Les données personnelles ne sont toujours pas importées et les annonces restent des signaux de cession d'entreprise/fonds, jamais des stocks.
- Tests ajoutés : URL d'offset, récupération multi-pages, plafond et réponse invalide.
- Commits : collecteur `0886d0bde161d260b8a852769d160b49ddfa8010`, tests `98ded80633999773b4878ea233139b083483250b`.
- CI applicative #755 (correctif `c0dc6f3`) : succès, y compris les tests BODACC multi-pages, plafond et réponse invalide. Aucun appel réel à l'API BODACC ni écrasement du snapshot n'a été effectué.


## GSA Auctions — complétude et protection — 27 novembre 2026

- La spécification OpenAPI officielle consultée ne décrit qu'une opération GET `/auctions`, sans paramètres de pagination ni total de résultats. Aucune pagination artificielle n'est ajoutée.
- `scripts/gsa_auctions.py` déduplique les lots dotés d'un identifiant vente/lot et marque explicitement la complétude comme inconnue. Une réponse vide ne peut plus remplacer le dernier flux valide.
- Tests ajoutés : déduplication et non-écrasement du flux en cas de réponse vide.
- Commits : collecteur `52421d69051ba0f6c876afcc2b5b94b49d98eed4`, tests `ad88776edff4a3f2b71927c88bcd65771860917e`.
- CI applicative #756 (commit `52421d6`) : succès pour le code GSA initial. Un test complémentaire a ensuite révélé un appel de déduplication non branché ; le correctif est `08d87a2`, CI applicative #759 : succès. La suite de tests a également été adaptée à l'export paginé (CI #762 : succès).
- Aucune collecte GSA réelle, publication de snapshot ou utilisation de clé API n'a été effectuée.


## Export personnel — pagination — 27 novembre 2026

- `auth.js` utilise désormais une pagination Firestore par curseur (`orderBy(documentId())`, `startAfter`) et des pages de 250 documents.
- Plafond de 1 000 documents par collection avec détection du document excédentaire ; les erreurs en cours de lecture conservent les documents déjà récupérés et sont signalées dans le manifeste.
- Version du format d'export portée à 2. Les données partagées/tiers restent exclues : il ne s'agit toujours pas d'un export RGPD exhaustif.
- Commit : `61bf667ff9719dc7e43dabca4a17b51840167868`. Validation CI et test réel de téléchargement Android encore requis.


## État CI — 27 novembre 2026, 13:00 UTC

- BOAMP : tests applicatifs de pagination réussis (#750).
- BODACC : correctif de fonction de pagination validé par les tests applicatifs (#755).
- GSA : déduplication et protection contre le flux vide validées sur le code corrigé (#759).
- Export personnel paginé : tests applicatifs complets réussis sur le commit `24b47160e988392f152a37e3ef703a91fe14bb33` (#762), y compris le contrôle de syntaxe JavaScript et les tests du moteur de matching.
- Firestore rules #612 : succès sur le commit `24b47160e988392f152a37e3ef703a91fe14bb33` ; l'émulateur Firestore a terminé sans échec.
- Les commits suivants de documentation ont déclenché des exécutions supplémentaires ; ne considérer que les résultats liés au SHA concerné.


## État de finalisation général — 27 novembre 2026

- PR #28 toujours ouverte, brouillon et non fusionnée ; comparaison `main...branch` : 160 commits en avance, 5 en retard. Les 5 commits en retard concernent des snapshots de données plus récents sur `main` ; les cinq JSON ne figurent pas dans les 26 fichiers de la comparaison PR, donc aucune synchronisation destructive n'est nécessaire.
- CI applicative #762 : succès sur le code d'export Firestore paginé et les tests applicatifs associés.
- CI Firestore #612 : émulateur encore en cours au dernier contrôle.
- Les collecteurs BOAMP/BODACC/GSA ont leurs tests applicatifs validés sur des commits respectifs ; TED était déjà validé.
- Bloqueurs : test réel Android/multi-comptes de l'export, effacement complet, sauvegarde chiffrée restaurable testée, paiements Stripe E2E et interface d'arbitrage, coordonnées de contact et cadre juridique.
- Aucune dépense, activation Blaze, collecte live GSA, écriture de données Firebase, fusion PR, déploiement production ou opération de paiement.


### Sources API officielles utilisées

- Opendatasoft Explore API v2.1 : paramètres `limit`/`offset`, `total_count`, limite de 100 lignes par page pour l'endpoint records et recommandation d'utiliser l'endpoint exports pour les volumes supérieurs : https://help.opendatasoft.com/apis/ods-explore-v2/explore_v2.1.html
- GSA Auctions API : documentation des formats et limites de requêtes : https://gsa.github.io/auctions_api/basics ; référence des champs : https://gsa.github.io/auctions_api/fields ; spécification OpenAPI officielle : https://github.com/GSA/auctions_api/blob/gh-pages/openapi.yaml. La spécification ne définit pas de paramètres de pagination.


## Audit Stripe — 27 novembre 2026

- Le flux actuel utilise des charges séparées et transferts différés, avec commission calculée par retenue de 5 % sur le brut et versement vendeur de 95 % après confirmations. Les frais Stripe restent à la charge de la plateforme dans ce calcul de marge.
- Correction du claim d'administration dans `firebase/functions/src/payments.js` : `dealhunterAdmin` remplace `admin`, aligné sur les règles Firestore et l'interface de vérification. Commit `c1125ca69de2290565eb3679d994cd9a8019c39c`.
- Suppression du paramètre Checkout `payment_method_types` pour laisser Stripe gérer les moyens dynamiques. Tests statiques ajoutés dans `tests/test_ui_navigation.js`, commit `c3b76049682d24320e6dc40e32e0717948e0d81c`.
- Bloqueurs Stripe : API Connect v1 encore utilisée, SDK `^18.0.0`, capacités v1, reversal de transfert non automatisé à l'ouverture d'un litige après paiement du vendeur, interface d'arbitrage absente, modèle Firestore deals/companies incompatible avec le parcours de vente actuel, tests E2E non exécutés.
- Ne pas déployer ni activer Stripe avant migration Connect v2, alignement du modèle de données, tests sandbox complets, revue juridique et validation explicite du propriétaire.

## 27 novembre 2026 — contrôle de session avant téléchargement de l’export

- `auth.js` vérifie de nouveau `auth.currentUser.uid` immédiatement avant la création du Blob et le téléchargement.
- Si le compte a changé pendant les lectures, l’export est interrompu avec un message explicite.
- Test de non-régression ajouté dans `tests/test_ui_navigation.js`.
- Commit de code : `a3b3b01`; commit du test : `cc2887b`.
- CI sur `cc2887b37b6b7d3bd289261e55132b7354b9f11f` : Tests DealHunter #771 **success** ; règles Firestore #621 **success**.
- Aucune donnée utilisateur lue ou modifiée, aucun export réel exécuté.
- Limite restante : essais Android et multi-comptes réels indispensables avant de considérer l’export validé en conditions d’usage.


## Contrôle CI complémentaire — commit 31f4b0bd (27 novembre 2026)

- Correction de maintenance dans `tests/test_ted_procurement.py` : le bloc `unittest.main()` est désormais placé après toutes les classes de tests, de sorte que l'exécution directe du fichier découvre également les tests de pagination.
- Commit : `31f4b0bdc428f9b1efdf5d3307e337adbea597f0`.
- Workflow `Tests DealHunter` #773 : **success**. Les journaux confirment 38 tests Python réussis et 81 tests Node réussis (0 échec), ainsi que les contrôles de syntaxe JavaScript.
- Workflow `Tests des règles Firestore` #623 : **success**, contrôle de parité des règles et tests de l'émulateur réussis.
- Ces résultats valident la tête testée de la PR #28, pas les essais réels multi-comptes, l'export Android, une sauvegarde/restauration ou les paiements.
- PR #28 reste en brouillon, non fusionnée et non déployée. Aucun accès aux données Firestore réelles, aucune dépense, aucune activation Blaze/Stripe et aucun paiement.


## Confirmation CI — commit bde43045 (27 novembre 2026, 14:52 UTC)

- Tête de PR contrôlée : `bde43045ccd230517ca85a26b12d3c45c15b93f5`.
- Workflow `Tests DealHunter` #774 (run `46019701625`) : **completed / success**.
- Workflow `Tests des règles Firestore` #624 (run `46019701572`) : **completed / success** ; le job `firestore-rules`, la vérification de parité et les tests de l'émulateur sont réussis.
- Cette confirmation remplace l'état « en cours » indiqué dans la description précédente de la PR. Elle ne vaut pas test réel multi-comptes, export Android, restauration de sauvegarde ou validation de paiements.
- PR #28 reste ouverte, en brouillon, non fusionnée et non déployée. Aucun accès aux données Firestore réelles, aucune dépense et aucun service payant activé.


## Revue des données partagées — 27 novembre 2026

- Relecture des règles Firestore pour `matchRequests`, `matchContacts`, `matchMessages`, `deals` et `dealReviews`.
- `matchContacts` utilise un ID déterministe `{requestId}_{uid}` et un `ownerUid` ; son export doit retrouver uniquement les demandes acceptées du titulaire et revalider la propriété du document.
- Les messages, deals et avis sont partagés ; ils ne doivent pas être exportés par copie brute. Ils restent exclus en attendant une projection par titulaire et des tests de règles dédiés.
- Aucune requête de production, lecture de données utilisateur ou modification de règles n'a été effectuée pendant cette revue statique.
- Modifications de minimisation de l'export sur la tête courante : commit code `953de57`, test `a143e36`, documentation `f617413`. CI de cette tête : **non confirmé à ce contrôle** ; ne pas déclarer ces changements validés avant résultats.

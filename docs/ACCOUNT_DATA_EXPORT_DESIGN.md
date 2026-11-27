# Conception du droit d'accès et d'export — DealHunter

État : première version d’export personnel implémentée en branche de développement ; validation réelle multi-comptes et revue de couverture encore nécessaires. Conception initiale revue le 25 novembre 2026.

## 1. Décision de sécurité

Ne pas fournir un export qui télécharge toutes les collections visibles par un utilisateur connecté. Plusieurs collections sont partagées entre participants et peuvent contenir des coordonnées, messages, signalements ou informations relatives à des tiers.

L'export doit être déclenché par le titulaire depuis son compte authentifié, après une nouvelle vérification d'identité adaptée au mode de connexion. Il doit produire un fichier privé téléchargé localement, jamais un artefact GitHub, une URL publique ou un document Firestore public.

Aucun export n'est exécuté par cette proposition.

## 2. Périmètre des données à inventorier

### Données principalement rattachées au titulaire
- Firebase Authentication : UID, adresse e-mail et métadonnées de compte communicables via les API Auth disponibles au titulaire ; ne jamais exporter les secrets d'authentification, jetons ou hash de mot de passe.
- `users/{uid}` : profil privé, en excluant les champs techniques non nécessaires.
- `users/{uid}/sellerOffers` et `users/{uid}/buyerNeeds` : parcourir explicitement les sous-collections.
- Annonces et besoins publics : requêtes filtrées sur `ownerUid == uid` dans `publicOffers`, `publicNeeds`, `publicServiceOffers`, `publicServiceRequests`, `publicWorkerProfiles`, `publicWorkOpenings`.
- `companyProfiles/{uid}`, `companyVerifications/{uid}` et `verificationRequests` : ne récupérer que les demandes appartenant au titulaire et les preuves communicables, en distinguant données de vérification et notes d'administration.
- `notifications` : filtrer par `recipientUid == uid`.
- `trustReports` : récupérer les signalements déposés par le titulaire, sans divulguer les éléments internes de modération ni les données privées de la cible.

### Données partagées à traiter avec une politique dédiée
- `matchRequests`, `serviceMatchRequests`, `workMatchRequests` et `matches` : documents auxquels le titulaire participe. Exporter les données le concernant et masquer les coordonnées/identifiants privés du tiers qui ne sont pas nécessaires.
- `matchMessages`, `serviceMatchMessages`, `workMatchMessages` : les conversations concernent plusieurs personnes. Définir un format de restitution qui donne accès aux messages du titulaire et au contexte nécessaire, tout en minimisant les données personnelles de l'autre participant. Ne pas supprimer ni modifier les messages dans le cadre d'un export.
- `matchContacts` : les coordonnées peuvent appartenir à l'autre participant. Ne pas les exporter automatiquement dans le fichier du titulaire sans déterminer qui est concerné et quelle information lui est communicable.
- `deals` et `dealReviews` : les informations peuvent être nécessaires aux deux parties ou à la preuve d'une transaction. Inclure les données personnelles du titulaire, pseudonymiser les identifiants tiers et faire valider les éléments à conserver.
- `companyVerifications`, `verificationRequests`, `trustReports` : distinguer les éléments soumis par le titulaire des évaluations, notes et données de tiers.

Les règles Firestore autorisent certaines lectures aux participants, mais l'autorisation technique de lecture n'établit pas à elle seule que chaque champ doit être copié dans un export personnel.

## 3. Requêtes et contraintes techniques

- Utiliser des requêtes Firestore explicitement filtrées par UID : `ownerUid == uid`, `recipientUid == uid`, `reporterUid == uid`, ou `participantUids array-contains uid` selon les règles de chaque collection.
- Pour les messages, récupérer les identifiants des demandes auxquelles le titulaire participe, puis charger les messages par `requestId` avec une requête séparée pour chaque demande acceptée. Ne jamais lancer une lecture globale de la collection.
- Pour les sous-collections privées, parcourir `users/{uid}/sellerOffers` et `users/{uid}/buyerNeeds` explicitement.
- Paginer les résultats, imposer des plafonds de taille, gérer les erreurs par collection et indiquer clairement toute donnée non exportée ou inaccessible.
- Sérialiser les timestamps dans un format ISO 8601 et les références Firestore dans une représentation lisible.
- Produire un manifeste indiquant la date de génération, les catégories couvertes, les limites et les collections en erreur.
- Ne pas exporter de jetons, secrets, données de paiement, secrets Firebase, claims administratifs ni journaux internes.
- Ne pas considérer les caches `localStorage` `dh_sellers`, `dh_buyers`, `dh_pending_imports`, `dh_sources`, `dh_gsa_listings` comme un export du compte : ils sont locaux au navigateur, ne sont pas tous rattachés à un UID et peuvent mélanger des données de démonstration/import et des données publiées.

## 4. Architecture recommandée sur Firebase Spark

Un export ponctuel côté navigateur peut être possible pour les documents que le titulaire est autorisé à lire, sans Cloud Functions ni élévation de privilèges. Mais il ne doit être développé qu'après :
1. validation des champs et règles de chaque collection ;
2. définition des champs tiers à exclure ou pseudonymiser ;
3. vérification de la pagination et des limites de taille ;
4. tests avec deux comptes et un tiers non participant ;
5. revue des obligations de conservation et du format de restitution.

Le navigateur ne doit jamais pouvoir choisir un UID arbitraire : l'UID est exclusivement `auth.currentUser.uid`. L'export est local, sans téléversement. L'utilisateur doit être informé qu'il lui appartient de protéger le fichier téléchargé.

Un export côté client ne remplace pas un export administratif complet, un backup de base ou une procédure d'effacement de bout en bout.

## 5. Tests d'acceptation obligatoires

- Un compte A ne peut exporter aucune donnée privée appartenant exclusivement au compte B.
- Un compte A ne peut pas forcer l'UID B dans une requête ou dans le nom du fichier.
- Les annonces et profils exportés sont exclusivement ceux dont le propriétaire est A.
- Les messages récupérés appartiennent uniquement à des demandes dont A est participant et autorisé à lire.
- Les coordonnées privées de B ne sont pas copiées dans l'export de A par défaut.
- Les identifiants et champs sensibles de tiers sont pseudonymisés ou exclus selon la politique approuvée.
- Les sous-collections de A sont incluses et les erreurs sont signalées.
- Les grands volumes sont paginés sans blocage de l'interface.
- L'export est reproductible, daté, lisible et ne modifie aucune donnée source.
- Les tentatives d'accès non autorisées sont refusées par les règles Firestore, pas seulement masquées par le code UI.

## 6. Limites non résolues

- Les durées de conservation, bases légales, exceptions, données transactionnelles et droits des autres participants nécessitent une décision de responsable de traitement et, si nécessaire, un conseil juridique.
- Les journaux d'hébergement, données Firebase côté fournisseur, sauvegardes et données éventuelles de fournisseurs tiers ne sont pas couverts par un export navigateur.
- La suppression de compte reste distincte : le SDK client actuel n'offre pas de suppression complète Auth + Firestore + sous-collections + données dérivées.
- La réauthentification peut varier selon le fournisseur de connexion et doit être testée pour e-mail/mot de passe, Google et Apple.

Statut : **spécification préparatoire**. Pas de fonctionnalité d'export active, pas de modification des règles, pas de suppression de données.


## Mise à jour — 25 novembre 2026 : portée des caches navigateur

Une correction d'interface en cours dans la PR #27 isole désormais les caches locaux d'offres, de besoins, d'imports et de sources par UID Firebase (espace user_<uid>), avec un espace distinct pour les visiteurs non connectés. Les flux publics GSA restent un cache commun de données de source, et non des données de compte.

Conséquences pour un futur export :
- les caches locaux restent propres à un navigateur/appareil et ne sont pas automatiquement synchronisés entre appareils ;
- ils ne sont pas inclus dans un export Firestore/Auth et ne doivent pas être présentés comme un export exhaustif du compte ;
- les anciennes clés non cloisonnées (dh_sellers, dh_buyers, dh_pending_imports, dh_sources) ne sont pas importées automatiquement dans un compte, afin d'éviter de rattacher les données au mauvais utilisateur ; elles restent dans le stockage du navigateur tant qu'une procédure distincte ne les traite pas ;
- l'espace invité et les caches partagés de flux ne doivent pas être inclus dans un export personnel sans qualification de leur provenance.

Cette évolution est en branche de développement, non fusionnée. L'inventaire d'export devra être revérifié après intégration et testé sur deux comptes successifs dans le même navigateur.


## 7. Première implémentation — 25 novembre 2026

Une première fonction d’export local a été ajoutée dans `auth.js` et reliée au panneau Compte de `index.html`. Elle génère un fichier JSON téléchargé directement dans le navigateur, sans téléversement vers un serveur.

Périmètre inclus :
- profil privé `users/{uid}` et sous-collections `sellerOffers` / `buyerNeeds` ;
- annonces et besoins produits, services et emploi dont `ownerUid` correspond au compte ;
- demandes de vérification appartenant au compte ;
- signalements déposés par le compte (`reporterUid`) ;
- notifications reçues (`recipientUid`) ;
- profil public d’entreprise et preuve de vérification du titulaire.

Garde-fous de cette version :
- l’UID provient exclusivement de `auth.currentUser.uid` ;
- l’adresse e-mail doit être vérifiée et la dernière connexion doit dater de moins de 15 minutes ;
- chaque collection est plafonnée à 500 documents ; un dépassement ou une erreur est inscrit dans le manifeste ;
- les dates Firestore sont converties en ISO 8601 ;
- conversations, demandes partagées, transactions, avis, coordonnées de tiers, caches locaux, journaux internes et données fournisseurs sont explicitement exclus ;
- aucun document source n’est modifié.

Limites importantes :
- ce premier export n’est pas encore exhaustif au sens du droit d’accès ; il ne remplace pas un examen manuel des demandes complexes ou des données partagées ;
- les limites de pagination doivent être revues si le volume dépasse 500 documents par collection ;
- les règles Firestore et l’interface doivent être testées avec deux comptes réels, dont un compte tiers ;
- le téléchargement et la protection du fichier sur l’appareil doivent être vérifiés sur Android et ordinateur ;
- le code est en branche de développement, pas encore sur le site public.

Statut : **implémentation initiale réalisée, validation en attente**. Aucune suppression, anonymisation ou modification de données réelles n’est exécutée par cette fonction.


## 8. Matrice de traitement des données partagées — revue du 26 novembre 2026

Cette matrice décrit les schémas actuellement présents dans `firebase/firestore.rules`. Elle constitue une règle de conception, pas une autorisation juridique définitive ni une implémentation de l'export. Aucun document partagé n'est ajouté à l'export dans cette étape.

| Collection | Requête techniquement cohérente avec les règles | Données concernant le titulaire | Données de tiers / précautions | Décision de conception |
|---|---|---|---|---|
| `matchRequests` | `participantUids array-contains uid` | rôle vendeur/acheteur, rôle demandeur/destinataire, décision, dates, produit et contexte de sa demande | UID et nom d'entreprise de l'autre partie ; IDs des annonces liées | Inclure une projection en liste blanche ; remplacer l'UID du tiers par un identifiant local stable du type `other_participant`. Ne pas recopier le document brut. |
| `serviceMatchRequests` | `participantUids array-contains uid` | rôle prestataire/client, demandeur/destinataire, statut, titres du service et du besoin, date | UID et nom d'entreprise de l'autre partie, IDs des annonces | Même traitement que `matchRequests` ; projection en liste blanche et pseudonymisation du tiers. |
| `workMatchRequests` | `participantUids array-contains uid` | rôle candidat/employeur, engagement, titres du profil et du poste, statut, date | UID et intitulé professionnel de l'autre partie, IDs du profil et du poste | Projection en liste blanche ; pseudonymiser l'UID tiers et évaluer les intitulés s'ils identifient une personne physique. |
| `matchMessages` | Une requête `requestId == id` par demande produit acceptée appartenant au titulaire | messages envoyés et reçus, dates, contexte de la conversation | texte rédigé par l'autre personne, identifiant de l'expéditeur, éventuelles coordonnées ou informations de tiers dans le texte | Ne pas exclure automatiquement une conversation ni exporter le document brut. Prévoir une restitution par message avec expéditeur pseudonymisé et revue des contenus susceptibles de révéler des données de tiers ; cette politique doit être validée avant codage. |
| `serviceMatchMessages` | Une requête `requestId == id` par demande de service acceptée | même nature de données de conversation | mêmes risques que les messages produit | Même règle que `matchMessages`. |
| `workMatchMessages` | Une requête `requestId == id` par demande emploi acceptée | messages du candidat ou de l'employeur et contexte de recrutement | données personnelles éventuellement sensibles communiquées dans un échange libre | Même règle, avec vigilance renforcée sur les données de candidature et informations personnelles. |
| `deals` | `participantUids array-contains uid` | rôle dans la transaction, produit, quantité, prix, total, statut, confirmations et dates | UID de l'autre participant ; montants et éléments commerciaux communs | Inclure les éléments nécessaires à l'historique du titulaire ; pseudonymiser l'UID du tiers et signaler que les données transactionnelles sont partagées. Ne jamais présenter la commission indicative comme encaissée. |
| `dealReviews` | Deux requêtes distinctes : `reviewerUid == uid` et `subjectUid == uid` | avis rédigés par le titulaire ; avis reçus qui le concernent | identité UID de l'auteur ou du destinataire tiers, commentaire pouvant contenir des données de tiers | Inclure séparément les avis rédigés et reçus ; pseudonymiser l'identifiant tiers. Les commentaires reçus nécessitent une politique de minimisation/revue avant restitution. |
| `matchContacts` | Lecture directe du document déterministe `requestId + "_" + uid` pour chaque demande acceptée du titulaire ; pas de requête globale par `ownerUid` | coordonnées que le titulaire a lui-même enregistrées et partagées | le participant peut également lire le document de contact appartenant à l'autre partie | Inclure uniquement le document déterministe du titulaire, puis vérifier `ownerUid == uid`. La règle de lecture dépend d'une demande acceptée liée au document ; une requête de collection filtrée seulement par `ownerUid` ne démontre pas cette condition à Firestore. |
| `matches` | `participantUids array-contains uid` | suggestion et statut de rapprochement concernant le titulaire | schéma complet à confirmer dans le code producteur ; identifiants du partenaire potentiels | Ne pas exporter avant inspection du schéma producteur ; appliquer une liste blanche et pseudonymiser le partenaire. |

### 8.1 Contrôles de requête et d'autorisation

- Les demandes produit, service et emploi sont lisibles par leurs participants. Les tests existants vérifient les requêtes filtrées par `participantUids array-contains uid` pour les collections de service et d'emploi, y compris le refus d'une requête non filtrée et d'une requête d'un tiers filtrée sur l'UID d'un participant.
- Les messages ne sont lisibles que si la demande référencée est acceptée et que le compte connecté figure parmi ses participants. Le chargement doit donc partir des demandes autorisées du titulaire, puis interroger les messages séparément par `requestId`.
- Les transactions sont lisibles par leurs participants ; la requête doit rester filtrée sur `participantUids`.
- Les avis ont deux sujets d'accès distincts (`reviewerUid` et `subjectUid`) : lancer deux requêtes filtrées, puis dédupliquer par identifiant. Ne pas lire toute la collection.
- Pour `matchContacts`, les règles permettent à un participant de lire les coordonnées partagées dans le cadre de la demande acceptée. Cette permission de lecture ne signifie pas que les coordonnées du tiers doivent figurer dans son export personnel : le filtre doit rester `ownerUid == uid`.
- Toute requête doit utiliser exclusivement `auth.currentUser.uid`. Un refus de permission doit être signalé dans le manifeste ; ne pas contourner les règles ni basculer vers une lecture globale.

### 8.2 Politique de projection et de minimisation

- Ne jamais sérialiser directement un document partagé complet. Construire une projection explicite champ par champ à partir du schéma vérifié.
- Conserver les champs qui décrivent directement la participation du titulaire et le contexte nécessaire à la compréhension de ses propres données.
- Remplacer les UID des autres participants par un pseudonyme local non réversible dans le fichier exporté ; ne pas inclure d'adresse e-mail, téléphone ou identifiant de compte d'un tiers par défaut.
- Les textes libres de conversation et les commentaires d'avis ne peuvent pas être considérés comme sûrs par une simple suppression de champs : ils peuvent eux-mêmes contenir des données personnelles de tiers. Une règle de revue, de masquage ou d'accès au cas par cas doit être arrêtée avant leur inclusion.
- Ne pas confondre pseudonymisation et anonymisation : les données pseudonymisées restent des données personnelles lorsqu'une ré-identification reste possible.
- Le manifeste doit distinguer les catégories exportées, exclues, pseudonymisées, nécessitant une revue et non accessibles. Il doit afficher les erreurs et limites de volume sans prétendre que le fichier est exhaustif.

### 8.3 État de validation

- Revue statique des règles effectuée pour les neuf collections ci-dessus ; les champs listés sont ceux autorisés par les règles observées, pas une validation de chaque chemin d'écriture dans l'application.
- Tests de requêtes participant déjà présents pour `serviceMatchRequests` et `workMatchRequests`. Les tests de lecture des messages de service/emploi couvrent les demandes acceptées et le refus des tiers.
- Les tests de lecture des demandes produit, messages produit, transactions, avis et contacts doivent être vérifiés séparément avant d'implémenter les requêtes d'export correspondantes.
- Aucun code d'export partagé n'est ajouté dans cette étape. Aucun test réel multi-comptes, examen de texte libre, ni validation juridique n'est revendiqué.
- Prochaine étape avant codage : vérifier les schémas producteurs et les tests de lecture restants, puis définir la projection JSON attendue et ses cas de test avec deux participants et un tiers.


### 8.4 Tests ciblés ajoutés — requêtes de l'export partagé

Le test `autorise les requêtes d'export partagées uniquement avec les filtres du titulaire` a été ajouté à `firebase/rules-tests/firestore.rules.test.js`.

Il prépare des documents de test pour deux participants et un tiers, puis vérifie :
- demandes produit : requête filtrée par `participantUids array-contains uid`, refus de la requête globale et d'une requête filtrée sur l'UID d'un autre participant ;
- messages produit : requête par `requestId` sur une demande acceptée ;
- transactions : requête filtrée par `participantUids array-contains uid` et refus de la lecture globale ;
- avis : deux requêtes distinctes filtrées par `reviewerUid` et `subjectUid`, et refus de la lecture globale ;
- coordonnées : lecture autorisée par les deux participants mais assertion explicite que le document du tiers porte un `ownerUid` différent ; l'export devra donc sélectionner seulement le document déterministe `requestId + "_" + uid`.

Le test ne prouve pas encore la projection JSON finale, ne vérifie pas les contenus de messages et commentaires libres et n'ajoute aucune donnée partagée à l'export utilisateur.

Commit de test : `17501d9a9fbf4c3bd030d6ec8f0601abe707e655`.

La CI de ce commit n'est pas confirmée : le contrôle disponible n'a retourné aucun run ni statut exploitable. Ne pas interpréter cette absence de résultat comme une réussite ou comme la preuve qu'aucun workflow n'a tourné.


### Complément — suggestions automatiques `matches`

Le producteur réel `firebase/functions/src/matching-batch.js` crée les suggestions avec les champs `listingId`, `requestId`, `sellerId`, `buyerId`, `sellerUid`, `buyerUid`, `participantUids`, `sellerCompany`, `buyerCompany`, `product`, `compatibilityScore`, `status`, `source` et `createdAt`. L'interface charge cette collection via `participantUids array-contains uid`.

La suggestion est un objet distinct d'une demande envoyée et d'une transaction. Si elle est incluse dans l'export, elle doit être nommée comme suggestion automatique, conserver uniquement le contexte nécessaire au titulaire et pseudonymiser les identifiants du partenaire. Les noms d'entreprise et les identifiants d'annonces doivent être considérés comme informations commerciales partagées, pas comme des données privées du titulaire.

Le test multi-comptes couvre désormais également la requête filtrée sur `matches` et refuse la lecture globale. Commit : `4f6adc09db1fb4d2efd0dbb13e50552122d270df`. La CI de ce commit reste à confirmer.


### Précision de sécurité — accès à `matchContacts`

La règle de lecture des contacts appelle `acceptedRequest(resource.data.requestId)`. Une requête de collection filtrée uniquement par `ownerUid == uid` ne garantit pas à elle seule que chaque document renvoyé référence une demande acceptée à laquelle le compte participe. Ne pas implémenter cette requête large en supposant qu'elle passera les règles.

La stratégie documentée et testée est donc : partir de la liste des demandes produit acceptées déjà autorisées pour le titulaire ; lire le document de contact déterministe `requestId + "_" + uid` ; vérifier que son `ownerUid` correspond au titulaire ; ne jamais lire ou exporter le document `requestId + "_" + otherUid` dans son export. Le test multi-comptes vérifie l'accès par identifiant, et la distinction entre le contact propre et celui de l'autre participant. Le test ne prétend pas qu'une requête de collection par propriétaire est autorisée.


## 9. Revue du code d'export existant — 27 novembre 2026

Contrôle statique de `auth.js` sur la branche de finalisation :
- L'export est bien relié au bouton du compte et utilise exclusivement `auth.currentUser` / l'UID du compte courant ; il exige une adresse e-mail vérifiée et une connexion récente (15 minutes).
- Les collections principales sont filtrées par `ownerUid`, `reporterUid` ou `recipientUid`. Les sous-collections privées sont lues sous le chemin `users/{uid}` du compte courant.
- Chaque collection est plafonnée à 500 documents avec une lecture de contrôle à 501 ; il n'y a pas encore de pagination. Un dépassement ou une erreur est indiqué dans le manifeste, mais le résultat reste partiel.
- Le fichier JSON indique explicitement les familles partagées exclues : conversations/messages, demandes impliquant d'autres personnes, transactions/avis et coordonnées de tiers. Aucun document partagé brut n'est ajouté.
- Les timestamps Firestore sont convertis en ISO 8601 ; le fichier est téléchargé localement et n'est pas téléversé.
- La fonction ne lit pas encore les demandes/messages/transactions/avis/coordonnées partagés et ne couvre pas les données détenues par les fournisseurs, journaux internes ou caches locaux. Elle ne doit donc pas être présentée comme un export exhaustif au titre du droit d'accès.

### Vérifications encore requises avant extension
1. Tests réels sur deux comptes successifs dans le même navigateur, puis un tiers, pour vérifier l'isolation UID et le contenu du fichier.
2. Vérifier le comportement du téléchargement sur Android et ordinateur.
3. Tester explicitement le cas de plus de 500 documents et rendre la limite visible avant téléchargement, ou mettre en place une pagination bornée.
4. Définir et valider une politique pour les messages/commentaires libres et les données transactionnelles partagées avant d'ajouter ces catégories.
5. Ne pas modifier les règles Firestore pour contourner une requête refusée ; chaque ajout doit conserver les filtres démontrés par les tests de règles.

Cette revue est statique : elle ne constitue pas un test multi-comptes réel ni une validation juridique. Aucun document utilisateur n'a été lu ou modifié et aucune donnée de production n'a été exportée.


### 9.1 Contrôle complémentaire du comportement de lecture et de téléchargement — 27 novembre 2026

- Chaque lecture de collection est isolée dans un `try/catch` : une erreur sur une famille ne bloque pas les autres ; le manifeste conserve le code/message d'erreur et la catégorie reçoit une liste vide. L'interface doit donc être lue avec le manifeste, car une liste vide seule ne distingue pas absence de données et échec de lecture.
- Les lectures des collections publiques sont filtrées par l'UID courant sur le champ propriétaire/déclarant/destinataire prévu ; les deux sous-collections privées sont sous `users/{uid}`. Aucun parcours de lecture globale de collection n'a été observé dans la fonction d'export auditée.
- État historique avant la correction de pagination ci-dessous : seuil de 501, export des 500 premiers documents et absence de curseur. Ce comportement a été remplacé par la pagination Firestore décrite dans la section suivante.
- La création du JSON et du lien de téléchargement se fait côté navigateur via Blob/ObjectURL ; aucune transmission du fichier à un serveur n'est faite par cette fonction.
- Le lien est déclenché puis l'ObjectURL est révoquée après une seconde. Ce comportement doit être vérifié sur Android et sur ordinateur avant de considérer le téléchargement fiable sur toutes les plateformes ; aucune validation réelle de navigateur n'est revendiquée.
- Une erreur de lecture partielle n'empêche pas le téléchargement du reste : le message d'interface signale le nombre d'erreurs et le manifeste les détaille. Il faut conserver cet avertissement visible dans toute évolution de l'export.

Cette section documente l'état initial observé avant la correction. La pagination a depuis été implémentée, mais le téléchargement sur appareils réels et le test multi-comptes restent à réaliser.


## Mise à jour — pagination de l'export navigateur (27 novembre 2026)

La fonction `exportAccountData` de `auth.js` parcourt désormais les collections personnelles par pages de 250 documents, triées par identifiant Firestore et reprises avec curseur `startAfter`. Le plafond est de 1 000 documents par collection : un document supplémentaire permet de détecter et signaler une troncature. En cas d'erreur au milieu d'une collection, les documents déjà lus sont conservés dans le fichier et l'interruption est signalée dans `limits`. Le format de manifeste passe en version 2.

Cette amélioration ne transforme pas l'export en restitution RGPD complète : les conversations et transactions partagées, les données de tiers et les catégories non encore incluses restent exclues. La limite de 1 000 documents par collection demeure explicite. Le téléchargement Android, les droits sur les champs et la couverture réelle doivent encore être testés avec plusieurs comptes.

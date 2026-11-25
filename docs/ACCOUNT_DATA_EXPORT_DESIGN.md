# Conception du droit d'accès et d'export — DealHunter

État : conception technique, non implémentée. Revue du code et des règles effectuée le 25 novembre 2026.

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

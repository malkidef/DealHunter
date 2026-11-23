# Schéma du marché des compétences et du recrutement

Parcours individuel distinct des prestations B2B (publicServiceOffers / publicServiceRequests).

## Collections actives
- `publicWorkerProfiles` : profil professionnel minimal, publié volontairement par son propriétaire.
- `publicWorkOpenings` : poste salarié ou mission indépendante proposée par une entreprise.

## Profil professionnel
- `ownerUid`, `title`, `category`, `description`, `location`, `countryCode`
- `skills[]`, `qualifications[]`, `engagementTypes[]` (`employment` et/ou `independent`)
- `availableFrom`, `remote`, `publicProfileConsent`, `status`, `createdAt`, `updatedAt


## Offre
- `ownerUid`, `company`, `title`, `category`, `description`, `location`, `countryCode`
- `requiredSkills[]`, `requiredQualifications[]`, `engagementType` (`employment` ou `independent`)
- `startDate`, `remoteAccepted`, `status`, `createdAt`, `updatedAt


## Fonctionnement actuel
- Formulaires disponibles dans l'onglet Services de l'interface.
- Publication dans Firestore avec contrôle propriétaire et liste blanche de champs.
- Lecture du catalogue réservée aux membres connectés.
- Retrait d'une fiche par son propriétaire depuis le catalogue.
- Moteur de matching exécuté dans le navigateur pour les fiches chargées, résultats indicatifs uniquement.
- Le profil candidat n'est visible qu'après consentement explicite.

## Garde-fous
- Aucun e-mail, téléphone, adresse personnelle, date de naissance, photo ou donnée sensible dans les catalogues publics.
- Aucun critère fondé sur l'âge, le sexe, l'origine, la religion, la santé, le handicap ou autre caractéristique protégée.
- Les qualifications déclarées restent à vérifier ; le score ne certifie aucun diplôme ni habilitation.
- Le score suggère une compatibilité ; il ne prend aucune décision d'embauche.
- L'utilisateur peut retirer sa fiche du catalogue ; une politique de conservation et d'effacement des données associées reste à définir.
- L'emploi salarié et la mission indépendante gardent des parcours, contrats et obligations distincts.
- Aucune prise de contact automatique ni messagerie de travail activée dans cette étape.
- Zone stricte : même ville et pays, ou distanciel accepté des deux côtés. Aucun rayon fictif sans géocodage.

## À faire avant ouverture publique
- Vérifier manuellement l'identité des entreprises et les qualifications annoncées.
- Consentement bilatéral et messagerie dédiés : implémentés dans `workMatchRequests` et `workMatchMessages`.
- Définir durée de conservation, retrait et suppression des données liées.
- Vérifier les obligations de droit du travail, non-discrimination, RGPD et recrutement dans chaque pays.

## Consentement et conversation des correspondances professionnelles

Une suggestion entre un profil candidat et une offre ne partage aucune coordonnée. Un candidat ou l'employeur propriétaire de la fiche peut créer une demande dans `workMatchRequests`. Firestore vérifie que les deux fiches existent et sont actives, que le profil a un consentement public explicite, que les propriétaires sont distincts et que le type d'engagement est identique des deux côtés. Seul le destinataire peut accepter ou refuser la demande. Après acceptation, la conversation dédiée est enregistrée dans `workMatchMessages` ; seuls les deux participants peuvent lire ou envoyer des messages (1 à 2 000 caractères). Les messages ne permettent pas d'ajouter de champs e-mail ou téléphone. Le salariat et les missions indépendantes restent deux parcours distincts.

La mise en relation n'est pas une validation de candidature, de diplôme, d'habilitation, d'autorisation de travail ou de capacité employeur. Les contrôles humains et les obligations locales restent nécessaires.


## Demandes de vérification

La collection privée `verificationRequests` reçoit les demandes de contrôle d'entreprise ou de qualification avec un lien HTTPS public. Les demandes sont créées par le propriétaire, visibles par lui et les réviseurs autorisés uniquement, et ne peuvent être validées ou refusées que par un compte Firebase portant le custom claim `dealhunterAdmin: true`. Le propriétaire peut retirer une demande en attente. Aucun justificatif privé n'est téléversé. Détails : [VERIFICATION_REVIEW.md](VERIFICATION_REVIEW.md).

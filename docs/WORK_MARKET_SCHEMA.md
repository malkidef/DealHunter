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
- Ajouter consentement bilatéral et messagerie dédiés aux rapprochements professionnels.
- Définir durée de conservation, retrait et suppression des données liées.
- Vérifier les obligations de droit du travail, non-discrimination, RGPD et recrutement dans chaque pays.
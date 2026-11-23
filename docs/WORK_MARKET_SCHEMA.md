# Schéma du marché des compétences et du recrutement

Parcours individuel distinct des prestations B2B (publicServiceOffers / publicServiceRequests).

## Collections prévues
- publicWorkerProfiles : profil professionnel minimal, publié volontairement par son propriétaire.
- publicWorkOpenings : poste salarié ou mission indépendante proposée par une entreprise.

## Profil professionnel
- ownerUid, title, category, description, location, countryCode
- skills[], qualifications[]
- engagementTypes[] : employment et/ou independent
- availableFrom (facultatif), remote, status, createdAt, updatedAt

## Offre
- ownerUid, company, title, category, description, location, countryCode
- requiredSkills[], requiredQualifications[]
- engagementType : employment ou independent
- startDate (facultatif), remoteAccepted, status, createdAt, updatedAt

## Garde-fous
- Aucun e-mail, téléphone, adresse personnelle, date de naissance, photo ou donnée sensible dans les catalogues publics.
- Aucun critère fondé sur l’âge, le sexe, l’origine, la religion, la santé, le handicap ou autre caractéristique protégée.
- Les qualifications déclarées restent à vérifier ; le score ne certifie aucun diplôme ni habilitation.
- Le score suggère une compatibilité ; il ne prend aucune décision d’embauche.
- Le candidat contrôle la publication et doit pouvoir fermer ou supprimer son profil.
- L’emploi salarié et la mission indépendante gardent des parcours, contrats et obligations distincts.
- Aucune prise de contact automatique : consentement explicite requis.
- Zone stricte : même ville et pays, ou distanciel accepté des deux côtés. Aucun rayon fictif sans géocodage.

## État
Le moteur pur et ses tests sont ajoutés. Les collections, formulaires, règles Firestore, consentement, vérification des qualifications et conformité locale ne sont pas activés.
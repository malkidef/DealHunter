# Fonction Appwrite — matching serveur

Cette fonction calcule les correspondances entre stocks actifs et besoins ouverts, puis crée uniquement des suggestions dans la collection `matches`. Elle ne contacte aucune entreprise, ne réserve aucun stock et ne déclenche aucun paiement.

## Variables d'environnement de la fonction

Définir dans Appwrite (jamais dans le site web) :

- `APPWRITE_ENDPOINT` : endpoint de l'instance Appwrite
- `APPWRITE_PROJECT_ID` : identifiant du projet
- `APPWRITE_API_KEY` : clé serveur limitée aux permissions nécessaires de lecture/écriture des collections concernées
- `APPWRITE_DATABASE_ID`
- `APPWRITE_LISTINGS_COLLECTION_ID`
- `APPWRITE_REQUESTS_COLLECTION_ID`
- `APPWRITE_MATCHES_COLLECTION_ID`

## Déploiement

1. Créer une fonction Appwrite avec runtime Node.js 18 ou supérieur.
2. Définir le point d'entrée sur `src/main.js` et copier ce dossier comme source de la fonction.
3. Ajouter les variables d'environnement ci-dessus dans les paramètres de la fonction.
4. Donner à la clé serveur uniquement les droits nécessaires sur les trois collections.
5. Exécuter manuellement pour un premier essai, puis planifier l'exécution après validation.

## Schéma requis

Les champs doivent correspondre à `docs/APPWRITE_SCHEMA.md`. Créer un index unique composé de `listingId` et `requestId` dans `matches` pour empêcher les doublons concurrents. Les permissions de création de `matches` doivent être réservées au serveur ; ne jamais donner la clé API au navigateur.

## Règles de matching de cette première version

- catégories sectorielles et unités normalisées (anciens libellés conservés, accents et variantes usuelles reconnus), puis devise identique ;
- stock actif et besoin ouvert ;
- quantité disponible suffisante ;
- prix vendeur inférieur ou égal au budget maximum lorsqu'il est renseigné ;
- au moins un mot produit commun ;
- dates invalides ou expirées rejetées, quantités et prix non finis refusés ;
- score indicatif basé sur la proximité produit, la quantité, le budget et la localisation.

La fonction lit les stocks actifs et besoins ouverts par pages de 100 documents, avec un plafond de sécurité de 10 000 documents par type et par exécution. Elle exclut les offres et besoins expirés ainsi que les rapprochements entre deux annonces de la même entreprise. Pour éviter les doublons en cas d'exécutions simultanées, créer l'index unique décrit ci-dessus ; les conflits 409 sont traités comme des correspondances déjà existantes.

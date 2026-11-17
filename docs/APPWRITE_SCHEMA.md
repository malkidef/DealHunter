# DealHunter — modèle de données Appwrite

Ce document décrit les tables à créer dans la base Appwrite du projet. Il ne contient aucun secret et ne crée pas encore les tables à distance.

## Base et tables

Créer une base nommée `dealhunter`, puis les tables suivantes.

### 1. `companies`
- `ownerId` : string, identifiant Appwrite de l'utilisateur propriétaire, indexé
- `name` : string (160), obligatoire
- `registrationNumber` : string (80), facultatif
- `countryCode` : string (2), obligatoire, valeur initiale `FR`
- `city` : string (120), facultatif
- `verificationStatus` : enum `pending | verified | rejected`, initial `pending`
- `createdAt`, `updatedAt` : datetime

### 2. `seller_listings`
- `companyId` : string, obligatoire, indexé
- `productName` : string (200), obligatoire
- `category` : string (80), obligatoire, indexé
- `description` : string (3000), facultatif
- `quantity` : float, obligatoire, strictement positif
- `unit` : string (30), obligatoire
- `unitPrice` : float, obligatoire, positif ou nul
- `currency` : string (3), initial `EUR`
- `city` : string (120), facultatif
- `countryCode` : string (2), initial `FR`, indexé
- `status` : enum `draft | active | paused | closed`, initial `draft`, indexé
- `availableUntil` : datetime, facultatif
- `createdAt`, `updatedAt` : datetime

### 3. `buyer_requests`
- `companyId` : string, obligatoire, indexé
- `productName` : string (200), obligatoire
- `category` : string (80), obligatoire, indexé
- `description` : string (3000), facultatif
- `quantity` : float, obligatoire, strictement positif
- `unit` : string (30), obligatoire
- `maxUnitPrice` : float, facultatif, positif ou nul
- `currency` : string (3), initial `EUR`
- `city` : string (120), facultatif
- `countryCode` : string (2), initial `FR`, indexé
- `status` : enum `draft | open | paused | fulfilled | cancelled`, initial `draft`, indexé
- `neededBy` : datetime, facultatif
- `createdAt`, `updatedAt` : datetime

### 4. `matches`
- `listingId` : string, obligatoire, indexé
- `requestId` : string, obligatoire, indexé
- `compatibilityScore` : float entre 0 et 100
- `status` : enum `suggested | seller_notified | buyer_notified | accepted | declined | expired | converted`
- `createdAt` : datetime

Créer une contrainte unique sur la paire `listingId + requestId` si l'interface Appwrite utilisée le permet.

### 5. `deals`
- `matchId` : string, obligatoire, indexé et unique
- `status` : enum `awaiting_confirmation | accepted | completed | cancelled | disputed | refunded`
- `agreedQuantity` : float strictement positif
- `agreedUnitPrice` : float positif ou nul
- `currency` : string (3), initial `EUR`
- `commissionRate` : float, initial `0.05`
- `completedAt` : datetime, facultatif
- `createdAt`, `updatedAt` : datetime

## Sécurité obligatoire

- Activer les permissions au niveau des lignes/documents.
- Les utilisateurs authentifiés ne peuvent lire ou modifier que leur propre entreprise et ses offres/demandes.
- Ne jamais autoriser un utilisateur à modifier `ownerId`, `verificationStatus`, un score de matching ou le statut d'une vente terminée depuis le navigateur.
- Les tables `matches` et `deals` sont écrites uniquement par des fonctions serveur de confiance. Les utilisateurs impliqués peuvent lire les seules correspondances/ventes qui les concernent.
- Vérifier côté serveur que l'utilisateur est bien propriétaire de `companyId` lors de chaque création ou modification.
- Ne jamais intégrer une clé API secrète ou une clé serveur dans le code du site.
- Une commission de 5 % n'est calculée qu'après une vente effectivement confirmée selon les conditions contractuelles. Aucun paiement réel n'est intégré à ce stade.

## Ordre de construction

1. Créer le projet Appwrite Cloud en Free.
2. Créer la base et les cinq tables selon les champs ci-dessus.
3. Configurer Auth et les permissions ligne par ligne.
4. Créer et tester les fonctions serveur avant de connecter le site.
5. Ajouter les notifications et le flux de validation des ventes.

Le prototype actuel `index.html` continue de fonctionner localement tant que l'intégration Appwrite n'est pas terminée.

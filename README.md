# DealHunter

DealHunter est un projet de plateforme B2B visant à détecter des stocks excédentaires, rapprocher automatiquement vendeurs et acheteurs, puis percevoir une commission uniquement sur les ventes effectivement réalisées.

## État actuel

Le fichier `index.html` contient un prototype responsive utilisable sur mobile et ordinateur :
- saisie locale d'offres de stocks vendeurs ;
- saisie locale de besoins acheteurs ;
- calcul automatique de correspondances selon catégorie, produit, quantité, budget et zone ;
- données de démonstration conservées dans le navigateur via `localStorage`.

**Limite importante :** ce prototype ne découvre pas encore des entreprises sur Internet, ne collecte pas de données externes, n'envoie aucun message, ne crée aucune commande et n'encaisse aucun paiement. Les correspondances affichées sont des suggestions locales de démonstration.

## Backend choisi : Appwrite

DealHunter utilisera **Appwrite Cloud**, en commençant par le plan Free à 0 € et en respectant ses quotas. Les projets gratuits peuvent être mis en pause après 7 jours sans activité ; ce plan convient donc au développement et aux premiers essais, pas à une garantie de disponibilité permanente.

- Site officiel : https://appwrite.io/
- Tarifs et limites : https://appwrite.io/pricing
- Modèle de données et règles de sécurité à configurer : [docs/APPWRITE_SCHEMA.md](docs/APPWRITE_SCHEMA.md)

Le modèle Appwrite prévoit les tables entreprises, offres vendeurs, demandes acheteurs, correspondances et ventes. Les tables de correspondances et de ventes doivent être modifiées uniquement par des fonctions serveur de confiance.

## Répertoire mondial des sources

Un premier répertoire multi-secteurs de plateformes de surplus, enchères industrielles, liquidations, ventes publiques et annuaires B2B est disponible dans [docs/SOURCES.md](docs/SOURCES.md). Il s'agit de pistes de sourcing à vérifier : aucune source n'est réputée connectée tant qu'une intégration autorisée n'a pas été développée et testée.

## Architecture cible

1. **Sources de stocks autorisées** : API partenaires, flux fournisseurs, imports CSV et portails dont les conditions autorisent explicitement la collecte.
2. **Référentiel entreprises et produits** : normalisation des unités, catégories, quantités, prix, localisation, disponibilité et dates de validité.
3. **Moteur de matching** : compatibilité produit/catégorie, quantité, prix, distance, délais, qualité et contraintes commerciales.
4. **Workflow de mise en relation** : consentement et vérification des entreprises, notification des deux parties, acceptation/refus, suivi des échanges et journal d'audit.
5. **Commande et paiement** : prestataire de paiement adapté au modèle marketplace, encaissement sécurisé et calcul de la commission de 5 % uniquement après confirmation de la transaction selon des conditions contractuelles claires.
6. **Confiance et conformité** : authentification, rôles, protection des données, gestion des désinscriptions, traçabilité, lutte contre la fraude et respect du RGPD.

## Prochaines étapes

- Créer le projet Appwrite Cloud gratuit.
- Créer la base et les tables selon [le guide Appwrite](docs/APPWRITE_SCHEMA.md).
- Configurer l'authentification et les permissions par entreprise.
- Connecter le site à Appwrite sans exposer de clé secrète.
- Construire le matching côté serveur, puis les notifications et la validation des ventes.

Aucun accès à des comptes tiers, aucune collecte non autorisée, aucun contact externe et aucun paiement ne doivent être activés sans les autorisations, les contrôles et les intégrations appropriés.

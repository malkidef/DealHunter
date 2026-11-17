# DealHunter

DealHunter est un projet de plateforme B2B visant à détecter des stocks excédentaires, rapprocher automatiquement vendeurs et acheteurs, puis percevoir une commission uniquement sur les ventes effectivement réalisées.

## État actuel

Le fichier `index.html` contient un prototype responsive utilisable sur mobile et ordinateur :
- saisie locale d'offres de stocks vendeurs ;
- saisie locale de besoins acheteurs ;
- calcul automatique de correspondances selon catégorie, produit, quantité, budget et zone ;
- données de démonstration conservées dans le navigateur via `localStorage`.

**Limite importante :** ce prototype ne découvre pas encore des entreprises sur Internet, ne collecte pas de données externes, n'envoie aucun message, ne crée aucune commande et n'encaisse aucun paiement. Les correspondances affichées sont des suggestions locales de démonstration.

## Architecture cible

1. **Sources de stocks autorisées** : API partenaires, flux fournisseurs, imports CSV et portails dont les conditions autorisent explicitement la collecte.
2. **Référentiel entreprises et produits** : normalisation des unités, catégories, quantités, prix, localisation, disponibilité et dates de validité.
3. **Moteur de matching** : compatibilité produit/catégorie, quantité, prix, distance, délais, qualité et contraintes commerciales.
4. **Workflow de mise en relation** : consentement et vérification des entreprises, notification des deux parties, acceptation/refus, suivi des échanges et journal d'audit.
5. **Commande et paiement** : prestataire de paiement adapté au modèle marketplace, encaissement sécurisé et calcul de la commission de 5 % uniquement après confirmation de la transaction selon des conditions contractuelles claires.
6. **Confiance et conformité** : authentification, rôles, protection des données, gestion des désinscriptions, traçabilité, lutte contre la fraude et respect du RGPD.

## Prochaines étapes techniques

- Choisir et déployer un backend/API et une base de données partagée (le stockage navigateur actuel n'est pas multi-utilisateur).
- Définir les sources de données et obtenir les autorisations ou contrats nécessaires.
- Ajouter les comptes entreprises et la vérification des vendeurs/acheteurs.
- Brancher les notifications et le processus d'acceptation des mises en relation.
- Intégrer un prestataire de paiement marketplace après validation juridique et opérationnelle.

Aucun accès à des comptes tiers, aucune collecte non autorisée, aucun contact externe et aucun paiement ne doivent être activés sans les autorisations, les contrôles et les intégrations appropriés.

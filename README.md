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

## Socle backend préparé

Le fichier `supabase/schema.sql` prépare une base PostgreSQL/Supabase partagée avec :
- entreprises et statut de vérification ;
- offres de stocks et demandes d'achat ;
- correspondances et dossiers de vente ;
- index pour les recherches par catégorie et pays ;
- règles Row Level Security (RLS) pour isoler les données de chaque entreprise.

Les correspondances et dossiers de vente sont volontairement en lecture seule côté navigateur : leur création et leur mise à jour devront passer par des fonctions serveur de confiance. Le schéma n'est pas encore connecté au site et aucune donnée n'est encore hébergée.

### Activer la base de données

1. Créer un projet Supabase.
2. Ouvrir **SQL Editor** dans le tableau de bord Supabase.
3. Copier le contenu de `supabase/schema.sql`, l'exécuter, puis vérifier que les cinq tables sont créées.
4. Conserver la clé `service_role` exclusivement côté serveur ; ne jamais la mettre dans `index.html` ou dans une application mobile.

## Prochaines étapes techniques

- Déployer le projet Supabase et connecter le site avec une clé publique `anon` et une configuration d'environnement adaptée (le stockage navigateur actuel n'est pas encore multi-utilisateur).
- Définir les sources de données et obtenir les autorisations ou contrats nécessaires.
- Ajouter les comptes entreprises et la vérification des vendeurs/acheteurs.
- Brancher les notifications et le processus d'acceptation des mises en relation.
- Intégrer un prestataire de paiement marketplace après validation juridique et opérationnelle.

Aucun accès à des comptes tiers, aucune collecte non autorisée, aucun contact externe et aucun paiement ne doivent être activés sans les autorisations, les contrôles et les intégrations appropriés.

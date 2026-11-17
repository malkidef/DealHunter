# DealHunter — pipeline de collecte des sources

## Objectif du premier incrément

Passer du répertoire de pistes (`docs/SOURCES.md`) à un flux de données vérifiable, sans scraping non autorisé ni contact automatique.

Le prototype actuel reste utilisable. Ce document définit le prochain incrément technique ; il ne prétend pas qu'une source est déjà connectée.

## Règle de fonctionnement

1. Découvrir une source dans `docs/SOURCES.md` ou lors de la veille.
2. Vérifier sur le site officiel : existence de l'offre, pays, catégories, conditions d'utilisation, API/flux/export disponible et droits de réutilisation.
3. Enregistrer la source dans le registre ci-dessous.
4. N'activer une collecte que par API officielle, flux autorisé, export fourni par le partenaire ou import manuel.
5. Normaliser les annonces et conserver leur provenance.
6. Détecter les doublons ; envoyer les cas incertains en revue humaine.
7. Ne publier une opportunité qu'après contrôle de validité. Ne contacter personne automatiquement sans base légale, autorisation et mécanisme de désinscription.

## Registre initial des connecteurs

### GSA Auctions — premier connecteur candidat

- **Accès technique :** API GET publique documentée par la GSA, réponses JSON/XML, clé personnelle via api.data.gov ; limites publiées : 5 000 appels/jour et 5 appels/5 secondes.
- **Champs disponibles :** identifiants vente/lot, description, dates, statut, localisation, réserve, enchère actuelle et URL de description. La quantité n'est pas systématiquement fournie.
- **Droits :** l'accès API est documenté, mais la permission de republication commerciale des annonces dans DealHunter reste à confirmer auprès de GSA. Ne pas confondre la licence CC0 du dépôt documentaire avec les droits sur les données de production.
- **Statut :** connecteur préparé, non exécuté ; nécessite le secret GitHub `GSA_API_KEY` et un test réel. Les résultats sont produits en JSON `pending`, pas publiés dans le matching.
- **Implémentation :** [guide du connecteur](connectors/GSA_AUCTIONS.md), [script](../scripts/gsa_auctions.py), [workflow manuel](../.github/workflows/gsa-auctions-manual.yml).


Aucune des sources ci-dessous n'est déclarée connectée. Les candidats sont à examiner individuellement.

| Source candidate | Famille | Première vérification | Statut |
|---|---|---|---|
| B-Stock | Surplus / retours B2B | API, exports ou partenariat ; règles propres à chaque marketplace | À vérifier |
| AllSurplus | Surplus commerciaux et publics | Accès aux données et conditions de réutilisation | À vérifier |
| Troostwijk Auctions | Enchères industrielles | Flux/API partenaire et conditions par vente | À vérifier |
| Surplex | Machines industrielles | Données exportables et droits de réutilisation | À vérifier |
| GSA Auctions | Surplus public américain | Conditions officielles d'accès et de réutilisation | À vérifier |
| GovDeals | Surplus public | Accès aux annonces et conditions par organisme | À vérifier |

## Fiche obligatoire par source

- `source_id` : identifiant stable, par exemple `bstock`.
- `name` et `official_url`.
- `country_scope` et `category_scope`.
- `source_type` : API, RSS/Atom, export CSV, partenariat ou saisie manuelle.
- `terms_url` : page officielle des conditions.
- `access_status` : `unverified`, `approved`, `restricted` ou `rejected`.
- `permission_evidence` : note datée et lien vers la preuve d'autorisation.
- `last_checked_at` et `checked_by`.
- `deduplication_key` : identifiant fournisseur si stable, sinon URL canonique + empreinte normalisée.
- `notes` : limites, quotas, authentification et restrictions.

## Schéma minimal d'une opportunité collectée

- `source_id`, `source_listing_id` (si fourni), `source_url`.
- `title`, `description`, `category`, `condition`.
- `quantity`, `unit`, `unit_price`, `currency`.
- `country_code`, `city`, `shipping_terms`.
- `published_at`, `collected_at`, `last_verified_at`, `expires_at`.
- `availability_status` : `unverified`, `available`, `sold`, `expired` ou `withdrawn`.
- `review_status` : `pending`, `approved`, `rejected`.

Les champs inconnus restent vides ; aucune quantité, disponibilité ou condition ne doit être inventée.

## Déduplication

1. Priorité à l'identifiant d'annonce fourni par la source.
2. Sinon, comparer l'URL canonique, le vendeur lorsque légalement disponible, le produit normalisé, la quantité, le prix et la devise.
3. Conserver les différentes URL sources lorsqu'un même lot est repris par plusieurs sites.
4. Ne fusionner automatiquement que les correspondances certaines ; placer les autres en revue.

## Ordre de réalisation

### Étape A — registre et validation
Créer le registre des sources, documenter les conditions officielles et n'approuver que les méthodes d'accès autorisées.

### Étape B — import sans intégration complexe
Permettre un import CSV conforme à un modèle DealHunter et une saisie manuelle. Vérifier les champs, les devises, les unités et les doublons avant enregistrement.

### Étape C — premier connecteur autorisé
Choisir une seule source dont l'API, le flux ou le partenariat est explicitement autorisé. Développer et tester le connecteur côté serveur ; ne jamais exposer de secret dans `index.html`.

### Étape D — matching et validation
Rapprocher les annonces approuvées avec les demandes acheteurs. Les scores sont des suggestions, pas des garanties. Exiger une confirmation du vendeur et de l'acheteur avant toute transaction.

### Étape E — notifications et commission
Ajouter les notifications avec consentement et désinscription. N'intégrer le paiement marketplace et la commission cible de 5 % qu'après validation juridique, contractuelle et technique du flux de vente.

## Critères d'acceptation du premier incrément

- Chaque opportunité affiche sa source originale et ses dates de collecte/vérification.
- Une annonce non vérifiée n'est pas présentée comme un stock disponible confirmé.
- Un import invalide est rejeté avec une explication.
- Les doublons certains ne créent pas plusieurs opportunités.
- Aucune collecte ne contourne connexion, CAPTCHA, paywall ou contrôle d'accès.
- Aucune prise de contact ni aucun paiement n'est déclenché par ce pipeline.

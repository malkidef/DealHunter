# DealHunter — pipeline de collecte des sources

## État du pipeline

Le premier connecteur technique, **GSA Auctions**, est maintenant exécuté par GitHub Actions et alimente `data/gsa-auctions.json`. Le dernier instantané vérifié contient 591 annonces, toutes en attente de revue humaine. Le flux n'est pas intégré aux stocks vendeurs et ne confirme ni quantité ni prix final.

Les autres places de marché du répertoire restent des pistes. Aucun scraping non autorisé ni contact automatique n'est permis.

## Règle de fonctionnement

1. Découvrir une source dans `docs/SOURCES.md` ou lors de la veille.
2. Vérifier sur le site officiel : existence de l'offre, pays, catégories, conditions d'utilisation, API/flux/export disponible et droits de réutilisation.
3. Enregistrer la source dans le registre ci-dessous.
4. N'activer une collecte que par API officielle, flux autorisé, export fourni par le partenaire ou import manuel.
5. Normaliser les annonces et conserver leur provenance.
6. Détecter les doublons ; envoyer les cas incertains en revue humaine.
7. Ne publier une opportunité qu'après contrôle de validité. Ne contacter personne automatiquement sans base légale, autorisation et mécanisme de désinscription.

## Registre des connecteurs

### GSA Auctions — collecte technique active

- **Accès :** API GET officielle, réponses JSON/XML, clé personnelle via api.data.gov.
- **Preuve :** documentation GSA et fiche Data.gov ; voir [le guide détaillé](connectors/GSA_AUCTIONS.md).
- **Limites :** 5 000 appels/jour et 5 appels/5 secondes selon la documentation GSA. La quantité n'est pas systématiquement fournie ; réserve et enchère actuelle ne sont pas des prix finaux.
- **Licence :** la fiche Data.gov de l'API indique un accès public sans champ de licence explicite. Une fiche distincte « GSA Auctions » déclare CC0 1.0 pour sa distribution HTML. Confirmer auprès de GSA que CC0 couvre bien les réponses de l'API avant toute exploitation commerciale.
- **Statut opérationnel :** workflow GitHub Actions manuel et programmé tous les deux jours ; flux public `data/gsa-auctions.json`. Dernier instantané vérifié : 591 annonces, 591 identifiants uniques, 591 URL officielles, toutes `pending` et `unverified`, collectées le 17 novembre 2026 à 22:01 UTC.
- **Utilisation dans l'application :** affichage séparé dans « Annonces GSA », recherche, filtres et classement indicatif. Les annonces ne sont pas ajoutées aux stocks vendeurs et les suggestions acheteurs ne déclenchent aucun contact.
- **Implémentation :** [guide](connectors/GSA_AUCTIONS.md), [script](../scripts/gsa_auctions.py), [tests](../tests/test_gsa_auctions.py), [workflow](../.github/workflows/gsa-auctions-manual.yml).

#### BODACC — signaux publics de ventes et cessions

- **Accès :** API officielle DILA / BODACC, sans compte, via OpenDataSoft Explore API v2.1 ; jeu de données `annonces-commerciales`.
- **Preuve :** [fiche API data.gouv.fr](https://www.data.gouv.fr/dataservices/api-bulletin-officiel-des-annonces-civiles-et-commerciales-bodacc), [jeu de données officiel](https://bodacc-datadila.opendatasoft.com/explore/dataset/annonces-commerciales/api/), [page officielle BODACC sur les données ouvertes](https://www.bodacc.fr/pages/donnees-ouvertes-et-api/).
- **Licence :** Licence Ouverte / Open Licence 2.0 ; attribution DILA / BODACC requise. Respecter l'avertissement relatif aux données personnelles et les demandes de mise à jour/correction.
- **Périmètre collecté :** uniquement les avis dont `familleavis = 'vente'` ; 100 résultats les plus récents par exécution.
- **Données conservées :** identifiant d'avis, libellé générique, ville, département, date de parution, URL officielle et date de collecte. Les champs `commercant`, `listepersonnes` et `listeetablissements` sont exclus pour éviter d'importer des données personnelles non nécessaires.
- **Limite métier essentielle :** une vente ou cession de fonds/entreprise n'est pas une annonce de surplus. Le flux est affiché dans un onglet distinct « Signaux BODACC », avec `is_inventory=false` et revue `pending`. Il n'alimente ni le catalogue de stocks vendeurs, ni le matching produits/quantités/prix.
- **Statut :** connecteur et tests ajoutés ; première exécution GitHub Actions à vérifier avant de déclarer la collecte opérationnelle.
- **Implémentation :** [script](../scripts/collect_bodacc.py), [tests](../tests/test_collect_bodacc.py), [workflow quotidien](../.github/workflows/collect-bodacc.yml), flux `data/bodacc-business-sales.json`.

### AGRASC — lien officiel uniquement (pas de collecteur)

- **Page officielle :** [calendrier des ventes AGRASC](https://agrasc.gouv.fr/ventes-aux-encheres).
- **Type de signal :** ventes publiques de biens saisis/confisqués, distinctes des surplus B2B.
- **Décision :** aucun scraping ni collecte planifiée. Les mentions légales AGRASC affichent une licence ouverte mais interdisent aussi toute diffusion ou utilisation commerciale/publicitaire des informations. Tant que cette contradiction apparente n'est pas clarifiée par écrit par l'AGRASC, DealHunter se limite à un lien direct vers la page officielle.
- **Dans l'application :** onglet « Ventes AGRASC » avec lien sortant et avertissement ; aucune donnée AGRASC n'est copiée, stockée, proposée aux acheteurs ou intégrée au matching.
- **Pour réévaluer :** obtenir une clarification écrite sur les usages commerciaux autorisés ou identifier un jeu de données officiel distinct dont la licence permet explicitement la réutilisation commerciale.

## Autres sources — à vérifier avant toute connexion

| Source candidate | Famille | Première vérification | Statut |
|---|---|---|---|
| B-Stock | Surplus / retours B2B | API, exports ou partenariat ; règles propres à chaque marketplace | À vérifier |
| AllSurplus | Surplus commerciaux et publics | Accès aux données et conditions de réutilisation | À vérifier |
| Troostwijk Auctions | Enchères industrielles | Flux/API partenaire et conditions par vente | À vérifier |
| Surplex | Machines industrielles | Données exportables et droits de réutilisation | À vérifier |
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

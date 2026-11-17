# Réseau mondial de sources DealHunter

## Objectif

Référencer et connecter progressivement des sources officielles de stocks vendeurs et de besoins acheteurs, tous secteurs et pays confondus. Le catalogue technique est maintenu dans `data/sources-global.json` et validé par `scripts/source_catalog.py`.

**Important :** « référencée » ne signifie pas « déjà connectée ». Seule une source avec `integrationStatus: active` alimente réellement DealHunter. Les autres doivent encore être intégrées, testées et validées.

## Sources actuellement référencées

| Source | Couverture | Sens | Accès | État |
|---|---|---|---|---|
| GSA Auctions | États-Unis | Stocks vendeurs / ventes aux enchères publiques | API publique avec clé | Active (connecteur existant) |
| TED | Union européenne / EEE | Besoins acheteurs publics | API de recherche publique | Référencée |
| SAM.gov | États-Unis | Besoins acheteurs publics | API avec clé | Référencée |
| Open Contracting Data Registry | Monde, selon les éditeurs | Besoins acheteurs publics | Jeux de données ouverts, conditions variables | Référencée |
| World Bank Procurement Notices | Monde | Besoins acheteurs publics | Données publiques | Référencée |
| EU Public Procurement Data Space | Union européenne | Besoins acheteurs publics | Portail et jeux de données | Référencée |

## Ce que ces sources permettent — et ne permettent pas

- Les avis d'appels d'offres indiquent un besoin potentiel d'un acheteur public. Ils ne prouvent ni commande ferme, ni budget disponible, ni achat encore ouvert.
- Les ventes aux enchères publiques peuvent fournir des actifs vendeurs, mais le prix affiché peut être une enchère en cours, pas un prix final.
- Les bases d'entreprises, annuaires et registres légaux ne prouvent pas qu'une société souhaite vendre ou acheter un produit.
- Les inventaires privés, ERP, places de marché fermées et bases clients nécessitent un contrat, une API autorisée ou le consentement du propriétaire.
- Chaque enregistrement doit conserver la source d'origine, la date de collecte, la licence, le pays, le statut et un lien vers l'annonce officielle.

## Ordre d'intégration recommandé

1. Fiabiliser le connecteur GSA existant et normaliser ses annonces.
2. Ajouter TED pour les besoins publics européens.
3. Ajouter les données mondiales OCDS en choisissant les éditeurs qui fournissent des flux réutilisables.
4. Ajouter les avis World Bank.
5. Ajouter SAM.gov après configuration d'une clé API.
6. Élargir le côté vendeurs avec des portails d'enchères et de déstockage disposant d'une API ou d'une autorisation explicite.

## Règles de conformité et qualité

- Respecter les conditions d'utilisation, licences, limites de débit et règles de conservation de chaque source.
- Ne pas contourner les connexions, paywalls, protections techniques ou restrictions d'accès.
- Ne jamais présenter une société comme acheteur ou vendeur confirmé sur la seule base d'un registre d'entreprises.
- Dédupliquer les annonces, conserver les liens officiels et signaler les données anciennes.
- Ne pas envoyer de message commercial, passer de commande ou déclencher de paiement automatiquement.

## Références officielles

- GSA Auctions API : https://gsa.github.io/auctions_api/
- TED Search API : https://docs.ted.europa.eu/api/latest/search.html
- SAM.gov Opportunities API : https://open.gsa.gov/api/get-opportunities-public-api/
- Open Contracting Data Registry : https://data.open-contracting.org/en/
- World Bank Procurement Notices : https://datacatalog.worldbank.org/search/dataset/0037795/world-bank-procurement-notices
- EU Public Procurement Data Space : https://data.europa.eu/en/PPDS

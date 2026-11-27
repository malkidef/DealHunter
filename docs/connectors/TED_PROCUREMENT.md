# Connecteur TED — besoins acheteurs publics européens

## Fonctionnement

Le connecteur appelle l'API officielle TED v3 `POST /v3/notices/search`, sans clé API pour la recherche d'avis déjà publiés. Il extrait les avis de marché et conserve le titre, le numéro de publication, l'acheteur, le pays, les dates et le type d'avis lorsqu'ils sont présents.

La collecte utilise désormais la pagination `PAGE_NUMBER` de l'API officielle : jusqu'à 250 avis par page, avec déduplication par numéro de publication. Le script s'arrête à 5 000 avis maximum par exécution (borne de sécurité) et indique explicitement si le résultat est tronqué. Il recherche les avis publiés sur les 45 derniers jours ; le workflow est programmé quotidiennement (05:35 UTC) et peut aussi être lancé manuellement depuis GitHub Actions.

## Prudence sur les données

Un avis TED est un **signal de besoin potentiel**, pas une commande confirmée. Les avis restent `pending` et `unverified`. Ils ne sont pas automatiquement transformés en demandes acheteurs, ni envoyés à des vendeurs. Vérifier l'avis d'origine, son statut et sa date limite avant toute utilisation commerciale.

Le connecteur ne collecte pas les coordonnées personnelles des agents acheteurs et ne contacte personne.

## Requête

Le script calcule une date de départ glissante à 45 jours, demande les pages successives avec `limit: 250`, et déduplique les résultats par numéro de publication. Le plafond local de 5 000 avis évite une collecte sans borne ; si l'API indique davantage de résultats, le champ `truncated` vaut `true`. La pagination PAGE_NUMBER de TED est documentée jusqu'à 15 000 avis par requête ; le plafond DealHunter est volontairement plus bas. Au-delà de 5 000, une stratégie d'itération/scroll devra être évaluée avant d'augmenter le plafond.

## Documentation officielle

- Recherche TED v3 : https://docs.ted.europa.eu/api/latest/search.html
- Endpoint : https://api.ted.europa.eu/v3/notices/search
- Téléchargement et pagination : https://docs.ted.europa.eu/ODS/latest/reuse/search-api.html

La recherche publique TED ne nécessite pas de clé API. Respecter les limites d'utilisation et conserver la provenance des données.


## Mise à jour technique du 27 novembre 2026

- Le script `scripts/collect_ted.py` utilise maintenant des pages de 250 avis, déduplique sur `publication-number`, contrôle les réponses invalides et les timeouts, et écrit le flux de façon atomique.
- Plafond local : 5 000 avis par exécution. Le champ `truncated` signale une collecte ayant atteint le plafond alors que le total API est supérieur.
- Tests ajoutés à `tests/test_ted_procurement.py` : pagination multi-pages, déduplication, arrêt au plafond et réponse TED invalide. Ces tests doivent encore être confirmés par CI.
- La pagination PAGE_NUMBER est documentée par TED avec un maximum de 15 000 avis par requête et 250 avis par page. Source : https://docs.ted.europa.eu/ODS/latest/reuse/search-api.html.

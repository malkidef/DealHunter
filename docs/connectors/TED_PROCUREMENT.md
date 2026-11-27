# Connecteur TED — besoins acheteurs publics européens

## Fonctionnement

Le connecteur appelle l'API officielle TED v3 `POST /v3/notices/search`, sans clé API pour la recherche d'avis déjà publiés. Il extrait les avis de marché et conserve le titre, le numéro de publication, l'acheteur, le pays, les dates et le type d'avis lorsqu'ils sont présents.

La collecte actuelle est limitée à la première page de 100 avis par exécution et le flux est publié dans `data/ted-buyer-opportunities.json`. Le script recherche les avis publiés sur les 45 derniers jours ; le workflow est programmé quotidiennement (05:35 UTC) et peut aussi être lancé manuellement depuis GitHub Actions. **Aucune pagination n'est actuellement effectuée** : les résultats au-delà de cette première page ne sont pas récupérés.

## Prudence sur les données

Un avis TED est un **signal de besoin potentiel**, pas une commande confirmée. Les avis restent `pending` et `unverified`. Ils ne sont pas automatiquement transformés en demandes acheteurs, ni envoyés à des vendeurs. Vérifier l'avis d'origine, son statut et sa date limite avant toute utilisation commerciale.

Le connecteur ne collecte pas les coordonnées personnelles des agents acheteurs et ne contacte personne.

## Requête

Le script actuel calcule une date de départ glissante à 45 jours avant l'exécution, demande `page: 1` et `limit: 100`, avec tri décroissant par date de publication. Le workflow manuel ne définit pas d'entrées pour modifier la requête ou la limite. Cette implémentation doit être améliorée avec une pagination bornée et des tests de déduplication avant de prétendre couvrir tous les avis disponibles.

## Documentation officielle

- Recherche TED v3 : https://docs.ted.europa.eu/api/latest/search.html
- Endpoint : https://api.ted.europa.eu/v3/notices/search
- Téléchargement et pagination : https://docs.ted.europa.eu/ODS/latest/reuse/search-api.html

La recherche publique TED ne nécessite pas de clé API. Respecter les limites d'utilisation et conserver la provenance des données.

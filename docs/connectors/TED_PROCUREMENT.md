# Connecteur TED — besoins acheteurs publics européens

## Fonctionnement

Le connecteur appelle l'API officielle TED v3 `POST /v3/notices/search`, sans clé API pour la recherche d'avis déjà publiés. Il extrait les avis de marché et conserve le titre, le numéro de publication, l'acheteur, le pays, les dates et le type d'avis lorsqu'ils sont présents.

La collecte est limitée à 250 avis par exécution et le flux est publié dans `data/ted-buyer-opportunities.json`. L'exécution automatique est programmée tous les deux jours ; elle peut aussi être lancée manuellement depuis GitHub Actions.

## Prudence sur les données

Un avis TED est un **signal de besoin potentiel**, pas une commande confirmée. Les avis restent `pending` et `unverified`. Ils ne sont pas automatiquement transformés en demandes acheteurs, ni envoyés à des vendeurs. Vérifier l'avis d'origine, son statut et sa date limite avant toute utilisation commerciale.

Le connecteur ne collecte pas les coordonnées personnelles des agents acheteurs et ne contacte personne.

## Requête

Par défaut, le connecteur recherche les avis publiés depuis le 1er janvier 2026 avec la requête experte TED `PD>=20260101`. Le workflow manuel permet de fournir une requête TED différente et un nombre d'avis entre 1 et 250.

## Documentation officielle

- Recherche TED v3 : https://docs.ted.europa.eu/api/latest/search.html
- Endpoint : https://api.ted.europa.eu/v3/notices/search
- Téléchargement et pagination : https://docs.ted.europa.eu/ODS/latest/reuse/search-api.html

La recherche publique TED ne nécessite pas de clé API. Respecter les limites d'utilisation et conserver la provenance des données.

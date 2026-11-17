# Connecteur GSA Auctions — premier connecteur préparé

## Décision

GSA Auctions est retenu comme premier connecteur candidat parce que la General Services Administration (GSA) documente une API GET publique, qui renvoie les annonces en JSON ou XML. La documentation officielle décrit l'endpoint `https://api.gsa.gov/assets/gsaauctions/v2/auctions`, un accès par clé API et les champs de chaque annonce.

- Documentation API : https://gsa.github.io/auctions_api/
- Bases, exemple d'appel et limites : https://gsa.github.io/auctions_api/basics
- Référence des champs : https://gsa.github.io/auctions_api/fields
- Demande de clé : https://api.data.gov/signup/
- Catalogue fédéral : https://catalog.data.gov/dataset/gsa-auctions-api

## Accès, droits et limites vérifiés

- L'API est présentée par la GSA comme une API GET publique ; elle fournit des annonces des agences participantes.
- La documentation annonce des limites indicatives de 5 000 appels par jour et 5 appels par 5 secondes.
- La documentation officielle propose une clé API personnelle. L'exemple `DEMO_KEY` est limité et ne convient pas à une automatisation durable.
- L'OpenAPI de GSA décrit la clé dans l'en-tête `X-API-KEY`, alors que l'exemple de la page « API basics » place `api_key` dans l'URL. Le connecteur utilise l'en-tête documenté par l'OpenAPI ; ce point devra être confirmé par le premier appel réel.
- Le catalogue Data.gov confirme le caractère public du jeu de données. Toutefois, les pages consultées ne donnent pas une licence claire et actuelle pour republier commercialement chaque annonce dans DealHunter. La licence CC0 du dépôt documentaire GSA ne doit pas être assimilée automatiquement à une licence de redistribution de toutes les données de l'API. **Avant toute republication publique ou exploitation commerciale, confirmer les droits applicables auprès de GSA.**
- Les champs publiés comprennent notamment le numéro de vente, numéro de lot, description, dates, localisation, statut, réserve et lien descriptif. La quantité n'est pas fournie de façon générale ; elle reste donc inconnue.
- Le prix de réserve n'est pas un prix final de vente. Il est enregistré comme indication en USD, jamais comme prix de vente confirmé.
- Les coordonnées de l'agent contractuel ne sont volontairement pas importées.

## Ce qui est ajouté au dépôt

- `scripts/gsa_auctions.py` : récupère les résultats via l'API officielle et les convertit en opportunités JSON en attente de vérification.
- `tests/test_gsa_auctions.py` : tests locaux du mapping et de la gestion d'une réponse API.
- `.github/workflows/gsa-auctions-manual.yml` : exécution manuelle depuis l'onglet Actions GitHub ; le résultat est fourni comme artefact, sans publier les annonces dans le dépôt.
- Le connecteur n'envoie aucun message, ne place aucune enchère, ne crée aucune commande et n'effectue aucun paiement.

## Activation depuis Android

1. Demander une clé personnelle sur https://api.data.gov/signup/.
2. Dans GitHub, ouvrir le dépôt DealHunter, puis **Settings → Secrets and variables → Actions → New repository secret**.
3. Nom du secret : `GSA_API_KEY`. Valeur : la clé reçue. Ne jamais la coller dans un fichier, une issue ou une conversation.
4. Ouvrir **Actions → GSA Auctions (exécution manuelle) → Run workflow**.
5. Après exécution, télécharger l'artefact `gsa-auctions-pending`. Les lignes restent à vérifier et à compléter avant tout import dans le matching.

## Statut réel

**Connecteur préparé, non encore exécuté** : il nécessite une clé API configurée dans les secrets GitHub et un premier test réel. Le résultat est un fichier JSON de revue, pas une synchronisation automatique avec l'application. Les annonces ne deviennent pas des stocks vendeurs confirmés sans contrôle humain.

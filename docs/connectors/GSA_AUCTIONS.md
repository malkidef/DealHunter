# Connecteur GSA Auctions — état opérationnel

## Source officielle et accès technique

GSA Auctions est le portail de la General Services Administration (GSA) pour les ventes aux enchères de biens mobiliers fédéraux. La GSA publie une API GET permettant de consulter les annonces des agences participantes en JSON ou XML.

- Documentation officielle : https://gsa.github.io/auctions_api/
- Fonctionnement, exemples et limites : https://gsa.github.io/auctions_api/basics
- Référence des champs : https://gsa.github.io/auctions_api/fields
- Spécification OpenAPI : https://github.com/GSA/auctions_api
- Demande de clé personnelle : https://api.data.gov/signup/
- Fiche Data.gov de l'API : https://catalog.data.gov/dataset/gsa-auctions-api
- Contact officiel de l'équipe API : api.ciss@gsa.gov

La documentation GSA décrit l'endpoint `https://api.gsa.gov/assets/gsaauctions/v2/auctions`, les formats JSON/XML et des limites publiées de **5 000 appels par jour** et **5 appels par période de 5 secondes**. Les exemples de la page « API basics » transmettent la clé dans le paramètre `api_key`. La spécification OpenAPI indique également un schéma d'authentification par en-tête `X-API-KEY` : il existe donc une divergence documentaire. Le script actuel utilise le paramètre de requête illustré dans les exemples officiels ; un instantané réel de 591 annonces a été généré avec ce mode.

## Droits et réutilisation

La fiche Data.gov « GSA Auctions API » indique `accessLevel: public`, mais ne renseigne pas de licence explicite dans sa fiche actuelle : https://catalog.data.gov/dataset/gsa-auctions-api.

Une fiche distincte Data.gov intitulée « GSA Auctions » indique une licence **CC0 1.0** pour sa distribution HTML : https://catalog.data.gov/dataset/gsa-auctions. Cette fiche est liée au portail GSA Auctions, mais il ne faut pas supposer automatiquement qu'elle tranche tous les droits attachés à chaque réponse de l'API live.

**Conclusion prudente :** l'accès technique à l'API publique est documenté et le connecteur l'utilise. Pour une exploitation commerciale ou une republication élargie du contenu API, demander à l'équipe GSA (api.ciss@gsa.gov) de confirmer explicitement que la licence CC0 couvre bien les données retournées par l'API. Conserver la provenance et les liens vers les annonces.

## Fonctionnement dans DealHunter

- Script : `scripts/gsa_auctions.py`.
- Tests : `tests/test_gsa_auctions.py`.
- Workflow : `.github/workflows/gsa-auctions-manual.yml`.
- Fichier publié : `data/gsa-auctions.json`.
- Secret GitHub : `GSA_API_KEY`.
- Le workflow se lance manuellement depuis Actions et automatiquement tous les deux jours (cron UTC). Il teste le mapping, récupère l'API, met à jour le flux du dépôt puis conserve l'artefact `gsa-auctions-pending` pendant 14 jours.
- L'application charge `data/gsa-auctions.json` dans l'onglet « Annonces GSA » et le met en cache dans le navigateur.

### Contrôle du dernier instantané

Le fichier actuellement présent dans la branche principale contient **591 annonces** collectées le **17 novembre 2026 à 22:01 UTC** :

- 591 identifiants vente/lot uniques ;
- 591 liens présents, tous sur le domaine officiel `www.gsaauctions.gov` ;
- 591 fiches en `review_status=pending` ;
- 591 fiches en `availability_status=unverified` ;
- statut d'enchère `scheduled` pour les 591 lignes de cet instantané.

Le workflow publie le JSON dans le dépôt public. Le flux est donc techniquement consultable par l'application, mais les annonces ne sont pas validées commercialement.

## Données conservées et limites

Le script conserve les identifiants, titre, description de lot, dates, statut, localisation, réserve, enchère actuelle et URL officielle lorsqu'ils sont fournis.

- La quantité reste vide lorsqu'elle n'est pas fournie par l'API.
- Le champ `reserve` peut être un booléen indiquant qu'une réserve existe ; il n'est pas transformé en montant.
- `high_bid_usd` correspond à l'enchère actuelle, pas à un prix final.
- Les coordonnées de l'agent contractuel (e-mail/téléphone) ne sont pas importées.
- Les annonces sont des ventes aux enchères de biens publics, pas des offres commerciales fermes de vendeurs B2B.
- Le classement sectoriel et le score de qualité sont indicatifs ; ils ne démontrent ni la rentabilité ni la disponibilité.
- Les correspondances avec des besoins acheteurs sont des pistes par mots-clés. Elles ne confirment aucune commande et ne déclenchent aucun contact.

Le connecteur n'envoie aucun message, ne place aucune enchère, ne crée aucune commande et n'effectue aucun paiement.

## Configuration depuis Android

1. Si nécessaire, demander une clé personnelle sur https://api.data.gov/signup/.
2. Dans GitHub, ouvrir **Settings → Secrets and variables → Actions**.
3. Vérifier la présence du secret nommé exactement `GSA_API_KEY`. Ne jamais coller sa valeur dans le code, une issue ou une conversation.
4. Ouvrir **Actions → GSA Auctions (automatique + manuel) → Run workflow** pour un lancement manuel.
5. Consulter le journal d'exécution. En cas de succès, le fichier `data/gsa-auctions.json` est actualisé et l'artefact `gsa-auctions-pending` est disponible pendant 14 jours.

Les annonces restent à vérifier manuellement avant toute décision commerciale. Ne pas les convertir automatiquement en stocks vendeurs.

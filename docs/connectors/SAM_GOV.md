# Connecteur SAM.gov — acheteurs publics américains

Le connecteur utilise l'API officielle Get Opportunities v2 : https://open.gsa.gov/api/get-opportunities-public-api/

## Clé API nécessaire
SAM.gov exige une clé API publique. La créer dans Account Details sur SAM.gov, puis l'ajouter dans GitHub : Settings → Secrets and variables → Actions → New repository secret, nom exact `SAM_API_KEY`. Ne jamais la mettre dans le code ni dans le site.

## Collecte
- Endpoint : `https://api.sam.gov/opportunities/v2/search`
- Dates obligatoires au format MM/DD/YYYY, période maximale d'un an.
- 1 000 avis maximum par page ; DealHunter limite une exécution à 5 000 avis.
- Types inclus : sollicitations, avis combinés, pré-solicitations, sources sought et avis spéciaux.
- Automatique tous les deux jours, ou lancement manuel.
- Flux de revue : `data/sam-buyer-opportunities.json`.

## Qualification et confidentialité
Les avis sont des signaux de demande, pas des commandes fermes. Ils restent `pending` et `unverified`. Les coordonnées personnelles des agents ne sont pas copiées. Vérifier le statut, la date limite et l'avis original avant toute action commerciale.

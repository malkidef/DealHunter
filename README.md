# DealHunter

DealHunter vise à rapprocher des entreprises qui disposent de stocks excédentaires et des acheteurs qui recherchent des produits, avec une commission envisagée uniquement après une vente réellement conclue.

## État réel du dépôt — 18 novembre 2026

- `index.html` : interface responsive pour mobile et ordinateur, offres vendeurs, besoins acheteurs, matching indicatif, import CSV et registre local des sources.
- **Firebase Authentication et Firestore** : le code d'authentification et de synchronisation des profils, offres, besoins et demandes de mise en relation est présent dans `auth.js`, `firebase-web-config.js` et `firebase/firestore.rules`. Le déploiement effectif des règles et le parcours complet doivent encore être vérifiés dans le projet Firebase.
- **GSA Auctions** : première collecte API opérationnelle. Le flux public `data/gsa-auctions.json` est chargé par l'onglet « Annonces GSA » ; les annonces restent séparées des stocks vendeurs.
- Certaines données de démonstration, le registre local des sources, les imports en attente et le cache des annonces GSA restent stockés dans le navigateur via `localStorage`.

Le dépôt contient aussi du code de lecture des flux TED et SAM.gov, mais au moment de cette vérification le fichier SAM attendu est vide et le fichier TED attendu n'est pas présent sur la branche principale. Ces deux flux ne sont donc **pas comptés comme opérationnels** ici.

## Backend actuel : Firebase

Le backend en cours est **Firebase Authentication + Cloud Firestore** :
- configuration web : `firebase-web-config.js` ;
- authentification et synchronisation : `auth.js` ;
- règles de sécurité : `firebase/firestore.rules` ;
- index Firestore : `firebase/firestore.indexes.json`.

Les offres et besoins privés sont associés au compte connecté. Le code publie également des fiches minimales dans les catalogues partagés, sans coordonnées personnelles. Les demandes de mise en relation sont gérées dans Firestore ; le partage de coordonnées est conditionné à l'acceptation et à une action explicite. Vérifier dans Firebase Console que les règles et index du dépôt sont bien déployés.

`docs/APPWRITE_SCHEMA.md` est un ancien schéma de conception : Appwrite n'est pas le backend actuellement utilisé par le code.

## Premier connecteur de collecte : GSA Auctions

Le connecteur utilise l'API GET officielle de la General Services Administration (GSA), qui fournit des annonces en JSON ou XML :
- documentation : https://gsa.github.io/auctions_api/ ;
- limites publiées : 5 000 appels/jour et 5 appels par 5 secondes ;
- clé personnelle : https://api.data.gov/signup/ ;
- contact API GSA : api.ciss@gsa.gov.

Le workflow `.github/workflows/gsa-auctions-manual.yml` permet un lancement manuel et une collecte programmée tous les deux jours. Il utilise le secret GitHub `GSA_API_KEY`, publie le fichier `data/gsa-auctions.json` et conserve un artefact de revue pendant 14 jours. L'application lit ce fichier et met les annonces en cache dans le navigateur.

**Dernier instantané vérifié dans le dépôt :** 591 annonces, 591 identifiants uniques et 591 liens vers le domaine officiel, collectés le 17 novembre 2026 à 22:01 UTC. Les 591 fiches ont `review_status=pending` et `availability_status=unverified`. Leur statut d'enchère était « scheduled » dans cet instantané.

GSA Auctions présente des biens mobiliers publics vendus aux enchères : ce ne sont pas automatiquement des stocks commerciaux disponibles à prix fixe. La quantité n'est pas fournie de façon générale ; la réserve peut être un simple indicateur et l'enchère actuelle n'est pas un prix final. Le score affiché dans l'interface mesure la qualité des informations, pas la rentabilité.

**Droits de réutilisation :** la fiche Data.gov de l'API confirme l'accès public mais ne comporte pas de champ de licence explicite. Une fiche distincte « GSA Auctions » indique CC0 1.0 pour sa distribution HTML ; cela ne suffit pas à affirmer sans réserve que cette licence couvre chaque réponse de l'API live. Avant une exploitation commerciale ou une republication au-delà du flux actuel, demander confirmation à l'équipe API GSA. Les liens et preuves sont détaillés dans [le guide du connecteur](docs/connectors/GSA_AUCTIONS.md).

Le connecteur ne contacte aucun vendeur ou acheteur, ne place aucune enchère, ne crée aucune commande et ne déclenche aucun paiement. Les annonces restent des pistes à vérifier manuellement.

## Répertoire des sources

Le répertoire multi-secteurs se trouve dans [docs/SOURCES.md](docs/SOURCES.md). Une source privée ou commerciale n'est connectée qu'après vérification de son API, de ses conditions, de ses droits d'accès et de réutilisation.

Le pipeline et les règles de validation sont décrits dans [docs/PIPELINE_SOURCES.md](docs/PIPELINE_SOURCES.md).

## Architecture cible

1. **Sources autorisées** : API officielles, flux partenaires, exports autorisés et imports manuels.
2. **Référentiel** : normalisation des produits, unités, quantités, prix, localisation et dates de validité.
3. **Matching** : compatibilité produit, catégorie, quantité, budget, zone et délais.
4. **Mise en relation** : consentement, acceptation/refus et journal d'audit.
5. **Commande et paiement** : intégration future d'un prestataire adapté ; commission envisagée de 5 % uniquement après confirmation contractuelle de la vente.
6. **Confiance et conformité** : vérification des entreprises, sécurité, RGPD, prévention de la fraude et gestion des désinscriptions.

## Prochaines étapes

1. Confirmer auprès de GSA la portée de la licence applicable aux données de l'API avant tout usage commercial.
2. Vérifier le déploiement réel des règles et index Firestore dans le projet Firebase.
3. Corriger et tester les flux TED et SAM.gov avant de les présenter comme actifs.
4. Améliorer la classification et la revue humaine des annonces GSA, sans transformer automatiquement une enchère en stock vendeur.
5. Étudier les autres places de marché uniquement via des accès officiellement autorisés.

Aucun scraping non autorisé, message automatique, enchère, commande ou paiement ne doit être déclenché par les connecteurs.

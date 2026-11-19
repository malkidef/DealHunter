# DealHunter

DealHunter vise à rapprocher des entreprises qui disposent de stocks excédentaires et des acheteurs qui recherchent des produits, avec une commission envisagée uniquement après une vente réellement conclue.

## État réel du dépôt — 18 novembre 2026

- `index.html` : interface responsive pour mobile et ordinateur, offres vendeurs, besoins acheteurs, matching indicatif, import CSV et registre local des sources.
- **Firebase Authentication et Firestore** : le code d'authentification et de synchronisation des profils, offres, besoins et demandes de mise en relation est présent dans `auth.js`, `firebase-web-config.js` et `firebase/firestore.rules`. Le déploiement effectif des règles et le parcours complet doivent encore être vérifiés dans le projet Firebase.
- **BODACC** : connecteur officiel ajouté pour les avis de ventes et cessions, publié séparément dans `data/bodacc-business-sales.json` et l’onglet « Signaux BODACC ». Ces avis ne sont pas des offres de stocks ; ils restent des signaux à vérifier et les données personnelles non nécessaires sont exclues.
- **GSA Auctions** : première collecte API opérationnelle. Le flux public `data/gsa-auctions.json` est chargé par l'onglet « Annonces GSA » ; les annonces restent séparées des stocks vendeurs.
- Certaines données de démonstration, le registre local des sources, les imports en attente et le cache des annonces GSA restent stockés dans le navigateur via `localStorage`.

Le connecteur TED (`scripts/collect_ted.py`) et son workflow (`.github/workflows/collect-ted.yml`) assurent une collecte quotidienne des avis publics. Le flux (`data/ted-buyer-opportunities.json`) reste non qualifié (`verified=false`) : il signale des besoins potentiels d'acheteurs publics, pas des stocks ni des commandes confirmées. Le workflow TED ne s'exécutera selon son calendrier qu'après intégration dans la branche par défaut ; un lancement manuel est disponible sur la branche de travail.

Le matching des sources publiques respecte désormais leur sens commercial :
- **TED → stocks vendeurs** : les avis de marchés publics expriment des besoins d'acheteurs publics et peuvent signaler une demande potentielle à laquelle un vendeur pourrait répondre.
- **SAM.gov → besoins acheteurs** : les annonces `ptype=g` concernent des ventes de biens excédentaires ; elles peuvent signaler des lots qu'un acheteur DealHunter pourrait rechercher.
- Les rapprochements utilisent les termes du produit, la catégorie, la zone et l'échéance lorsqu'elle est disponible. Le score est indicatif ; il ne confirme ni disponibilité, ni quantité, ni prix, ni éligibilité à un marché.
- Les pistes publiques restent distinctes des offres et besoins privés validés. Une vérification humaine de la source originale et des conditions est indispensable avant toute mise en relation.

## Backend actuel : Firebase

Le backend en cours est **Firebase Authentication + Cloud Firestore** :
- configuration web : `firebase-web-config.js` ;
- authentification et synchronisation : `auth.js` ;
- règles de sécurité : `firebase/firestore.rules` ;
- index Firestore : `firebase/firestore.indexes.json`.

Les offres et besoins privés sont associés au compte connecté. Le code publie également des fiches minimales dans les catalogues partagés, sans coordonnées personnelles. Les demandes de mise en relation sont gérées dans Firestore ; le partage de coordonnées est conditionné à l'acceptation et à une action explicite. Vérifier dans Firebase Console que les règles et index du dépôt sont bien déployés.

`docs/APPWRITE_SCHEMA.md` est un ancien schéma de conception : Appwrite n'est pas le backend actuellement utilisé par le code.

## Connecteur SAM.gov — ventes de biens excédentaires

Le connecteur `scripts/collect_sam.py` utilise l'API publique officielle « Get Opportunities » v2 et filtre le type `ptype=g` (« Sale of Surplus Property »). Il alimente le fichier `data/sam-buyer-opportunities.json`, déjà consommé par la section SAM.gov de l'interface. Les avis sont des signaux publics à vérifier, jamais des stocks ni des commandes confirmées.

- Documentation officielle : https://open.gsa.gov/api/get-opportunities-public-api/
- Endpoint : `https://api.sam.gov/opportunities/v2/search`
- La clé API personnelle est obligatoire. Créer une clé depuis la page Account Details de SAM.gov, puis l'enregistrer dans GitHub Actions sous le nom `SAM_GOV_API_KEY` (nom recommandé). Le workflow accepte aussi l'ancien nom `SAM_API_KEY` pour compatibilité. Ne jamais la placer dans le dépôt, l'interface web ou une conversation.
- Le workflow `.github/workflows/collect-sam.yml` prévoit une collecte quotidienne et un lancement manuel. En l'absence du secret, il saute la collecte sans écraser le flux existant.
- La collecte est limitée par défaut aux 45 derniers jours, au type de vente de surplus, et à cinq pages maximum. Les avis sont dédupliqués et marqués `verified=false`.
- L'interface n'ajoute pas automatiquement ces avis aux besoins privés ni au matching commercial validé.

La clé API et un premier appel réussi sont encore nécessaires avant de considérer SAM.gov comme une source synchronisée en production.

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

## Qualité des pistes publiques et matching

Les rapprochements TED et SAM.gov sont des pistes de prospection, pas des commandes ni des offres certifiées. Le moteur :
- écarte les échéances reconnues comme expirées ;
- conserve les dates absentes ou illisibles en les signalant « à confirmer », sans les interpréter comme une échéance future ;
- déduplique les résultats par source, rôle, fiche vendeur/acheteur et identifiant d'avis ;
- n'affiche un lien cliquable que si son hôte HTTPS appartient au domaine officiel TED ou SAM.gov ;
- maintient une revue humaine avant tout contact ou engagement commercial.

Les scores restent indicatifs : ils ne certifient ni l'existence d'un stock, ni la disponibilité, l'état, le prix final ou l'éligibilité d'un acheteur.

## Architecture cible

1. **Sources autorisées** : API officielles, flux partenaires, exports autorisés et imports manuels.
2. **Référentiel** : normalisation des produits, unités, quantités, prix, localisation et dates de validité.
3. **Matching** : compatibilité produit, catégorie, quantité, budget, zone et délais.
4. **Mise en relation** : consentement, acceptation/refus et journal d'audit.
5. **Commande et paiement** : parcours DealHunter structuré avec proposition, accord, Checkout Stripe et commission de 5 % calculée côté serveur, puis transfert vendeur uniquement après paiement et double confirmation.
6. **Confiance et conformité** : vérification des entreprises, sécurité, RGPD, prévention de la fraude et gestion des désinscriptions.


## Accords commerciaux — mutations serveur

La création, l'acceptation et le refus d'une proposition passent par les Cloud Functions callable `createDealProposal`, `acceptDealProposal` et `declineDealProposal`. Le serveur relit la mise en relation acceptée, l'offre et le besoin actifs, puis vérifie les propriétaires, le produit, l'unité, les quantités disponibles et le budget acheteur avant d'enregistrer l'accord. Une seule proposition est autorisée par demande de mise en relation.

Les clients peuvent lire un accord uniquement s'ils figurent parmi ses participants. Les règles Firestore interdisent désormais aux clients de créer, modifier ou supprimer directement un document `deals`. Les confirmations passent par `confirmDealCompletion` et exigent un paiement confirmé, un statut admissible et l'absence de litige ou de remboursement bloquant. L'annulation d'une vente acceptée mais non payée passe par `cancelDeal` : seuls les participants peuvent la demander, les paiements confirmés ou à vérifier sont exclus, et une session Stripe Checkout existante doit être expirée avant le passage à `cancelled`. Si Stripe indique que le paiement a abouti ou si son expiration ne peut pas être vérifiée, la vente reste en `cancellation_pending` pour éviter tout versement vendeur et permettre une revue.

Dans l'interface, l'acheteur voit une action de paiement sur un accord accepté ; elle appelle `createDealCheckoutSession` et ouvre la page Stripe Checkout sécurisée. Le vendeur dispose d'un bouton d'onboarding Stripe Connect dans son espace entreprise. Les participants peuvent ouvrir un litige sur une vente payée ; le backend suspend alors tout versement vendeur et conserve le dossier de litige. Un litige ne peut pas être rouvert après clôture, ni être ouvert lorsqu'un remboursement est en cours ou déjà effectué. Les états de paiement, transfert, litige et remboursement sont visibles dans les détails de transaction. Ces actions de paiement et d'onboarding restent indisponibles tant que le mode paiements n'est pas explicitement activé dans un environnement de test configuré. Aucun déploiement ou test Stripe réel n'est impliqué par ces changements de code.

## Paiements Stripe — préparation du mode test

Le code Stripe Connect / Checkout est présent dans `firebase/functions/src/payments.js`, mais les paiements sont **désactivés par défaut**. Ne pas activer ce parcours en production avant les tests de bout en bout et la revue juridique/sécurité.

### Réconciliation administrative en lecture seule

La callable `inspectDealPaymentReconciliation` compare une vente Firestore à une session Checkout Stripe fournie par son identifiant. Elle retourne les états de paiement et de transfert, le PaymentIntent, ainsi que les contrôles d'identité, de montant, de devise, de session courante et de tentative Checkout. Elle ne modifie aucune donnée et ne déclenche ni remboursement, ni transfert, ni confirmation de vente.

- L'appel exige une authentification Firebase et le custom claim `admin: true`. Aucun rôle administrateur n'est attribué automatiquement par cette fonction ; l'attribution doit être réalisée par un processus serveur de confiance, jamais depuis le navigateur.
- L'accès Stripe est en lecture seule dans cette callable. Les identifiants fournis doivent être ceux d'une vente et d'une session connue ; les secrets restent côté Cloud Functions.
- Une session obsolète peut être examinée même si son numéro de tentative ne correspond plus, mais un résultat positif ne signifie pas qu'elle peut être automatiquement créditée.
- `recordDealPaymentReconciliationReview` permet à un administrateur de consigner une décision (`payment_confirmed`, `refund_review`, `duplicate_payment`, `not_paid` ou `manual_review`) avec une note obligatoire et une nouvelle lecture de la session Stripe. Les décisions positives sont contraintes par les preuves Stripe et l'état de la vente relu dans une transaction Firestore.
- Chaque revue est enregistrée dans `deals/{dealId}/payment_reconciliation_audit` avec l'identifiant de l'administrateur, les preuves observées et `actionTaken=false`. Le journal est non modifiable depuis les clients ; la callable ne change jamais `paymentStatus`, ne rembourse pas et ne transfère pas de fonds.
- `payment_confirmed` n'est autorisé que pour la session courante, la tentative courante, un paiement Stripe confirmé et un PaymentIntent. Une session payée obsolète reste en revue manuelle ; elle ne peut pas être créditée par cette fonction.
- Les écarts doivent être examinés manuellement. Cette version n'autorise aucune régularisation ou action financière.

### Préparer un environnement de test isolé

1. Utiliser un compte Stripe de test et ses clés commençant par `sk_test_` et `whsec_`. Ne jamais copier ces valeurs dans Git, dans le fichier web, dans un ticket ou dans une conversation.
2. Depuis le terminal du projet Firebase, enregistrer les secrets côté Firebase :
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```
   Saisir les valeurs de test uniquement dans l'invite sécurisée de la CLI.
3. Dans le fichier d'environnement local non versionné correspondant au projet Firebase de test (par exemple `.env.dealhunter-3747b` si cet ID est bien celui du projet sandbox), définir :
   ```dotenv
   DEALHUNTER_PAYMENTS_ENABLED=true
   ```
   Vérifier le nom exact du fichier d'environnement attendu par Firebase CLI et s'assurer qu'il est ignoré par Git. Ne jamais ajouter cette variable à l'environnement de production à ce stade.
4. Déployer les fonctions uniquement sur le projet Firebase de test après vérification explicite de l'ID du projet et de la liste des fonctions. Configurer dans Stripe un webhook de test vers l'URL `stripeWebhook` déployée, avec les événements Checkout, Connect, remboursement et litige effectivement traités par le code. Enregistrer le secret de signature du webhook dans `STRIPE_WEBHOOK_SECRET`.
5. Vérifier le retour d'onboarding Connect, le Checkout en EUR, le traitement du webhook, l'idempotence, les doublons, les échecs, les remboursements et les litiges. Utiliser exclusivement les moyens de paiement de test publiés par Stripe.

### Critères avant toute activation réelle

- Un vendeur de test termine l'onboarding Connect et son compte est correctement associé à son UID.
- Seul l'acheteur de l'accord accepté peut créer la session Checkout.
- Le montant, la devise et la commission sont recalculés et validés côté serveur.
- Un webhook signé et vérifié confirme le paiement ; une rediffusion ne crée ni double paiement ni double transfert.
- Aucun transfert vendeur n'est possible avant les deux confirmations de réalisation/réception et l'absence de blocage.
- Les scénarios d'échec, remboursement, litige et reprise après interruption sont documentés et testés.
- La configuration de production, les obligations réglementaires, les conditions Stripe Connect et les règles de remboursement sont revues avant activation.

**État vérifié dans ce dépôt :** aucun secret Stripe de test n'a été fourni ou validé ; aucun déploiement de fonctions n'a été effectué ; `DEALHUNTER_PAYMENTS_ENABLED` reste désactivé ; aucun paiement ni transfert réel n'est activé. Le présent guide ne constitue pas une validation de conformité ni une autorisation de déploiement.

## Prochaines étapes

1. Confirmer auprès de GSA la portée de la licence applicable aux données de l'API avant tout usage commercial.
2. Vérifier le déploiement réel des règles et index Firestore dans le projet Firebase.
3. Corriger et tester les flux TED et SAM.gov avant de les présenter comme actifs.
4. Améliorer la classification et la revue humaine des annonces GSA, sans transformer automatiquement une enchère en stock vendeur.
5. Étudier les autres places de marché uniquement via des accès officiellement autorisés.

Aucun scraping non autorisé, message automatique, enchère, commande ou paiement ne doit être déclenché par les connecteurs.


### Interface web d'administration — réconciliation

L'onglet **Administration** de `index.html` est masqué par défaut et n'est affiché qu'après vérification du custom claim Firebase `admin: true` sur le jeton de l'utilisateur connecté. Cette visibilité côté navigateur est uniquement ergonomique : les deux callables backend répètent le contrôle du claim et restent l'autorité d'accès.

- L'administrateur saisit l'identifiant de vente et l'identifiant de session Checkout, puis lance une inspection.
- L'écran présente chaque contrôle d'identité, de montant, de devise, de tentative Checkout et de PaymentIntent ; il affiche également les 20 dernières entrées du journal de cette vente.
- Une décision ne peut être enregistrée qu'après une inspection réussie et avec une justification de 10 à 1 000 caractères. Le serveur relit les éléments Stripe et Firestore avant d'accepter les décisions qui nécessitent des preuves positives.
- Le journal n'est pas lisible directement depuis le client Firestore : il est renvoyé par la callable d'inspection réservée aux administrateurs.
- L'interface ne propose aucune action de remboursement, de transfert ou de modification directe du statut de paiement. L'enregistrement d'une revue reste une trace d'audit avec `actionTaken=false`.

La présence de l'interface dans la branche de travail ne signifie pas qu'un compte administrateur est déjà provisionné, que les callables ont été déployées ou que Stripe est configuré. Les vérifications CI de cette version doivent être terminées avant de considérer ce jalon validé.


La file d'administration utilise la callable `getDealPaymentReconciliationAdminDashboard`, qui exige le custom claim `admin: true`. Elle regroupe jusqu'à 100 ventes uniques signalées par un statut de paiement à réconcilier, un remboursement partiel/en revue, un litige ouvert/en revue/perdu ou un transfert bloqué/en attente de renversement. Elle affiche les états de paiement, remboursement, litige et versement, les dernières décisions d'audit et permet de préremplir l'inspection Stripe lorsqu'une session Checkout existe. Le chargement est disponible à la connexion d'un administrateur et via le bouton d'actualisation. Les actions restent limitées à la consultation et à l'audit ; aucune régularisation financière n'est déclenchée.

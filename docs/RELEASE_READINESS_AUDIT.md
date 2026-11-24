# Audit de préparation à la mise en service — 19 novembre 2026

## Résultat

**NON VALIDÉ POUR LES PAIEMENTS OU LA PRODUCTION.** Cet audit est fondé sur le dépôt GitHub `main` et sur la structure Firestore communiquée par le propriétaire du projet. Il ne constitue pas une preuve de déploiement Firebase ni une exécution réelle dans Stripe.

## Constats vérifiés

1. Le projet Firestore communiqué contient `deals`, `matchContacts`, `matchMessages`, `matchRequests`, `publicNeeds`, `publicOffers` et `users`. Aucune collection `companies` n'est visible.
2. Le backend de paiement lit et met à jour `companies/{companyId}`, et attend `ownerUid`, `countryCode`, `email` et `stripeAccountId`.
3. Le backend de paiement attend dans `deals` les champs `sellerCompanyId`, `buyerCompanyId`, `amountTotalCents`, `currency`, `productName`, `paymentStatus` et le statut `accepted`.
4. Le client actuel crée des transactions avec `sellerUid`, `buyerUid`, `totalAmount`, `product` et le statut `proposed`, puis les fait passer à `agreed` et `completed`. Les deux modèles ne sont pas compatibles.
5. Le moteur de matching écoute `seller_listings` et `buyer_requests`, alors que le client publie `publicOffers` et `publicNeeds`. Le déclenchement automatique de matching n'est donc pas relié aux collections réellement utilisées.
6. Le fichier `firebase/firestore.rules` du dépôt ne contient pas de règle explicite pour `deals`, `companies` ou `matches`. Si ce fichier est celui qui est déployé, les accès clients à ces chemins sont refusés par défaut.
7. Le plan `docs/STRIPE_TEST_PLAN.md` décrit des scénarios, mais ne prouve pas qu'ils ont été exécutés.
8. Le dépôt ne fournissait pas de contrôle CI visible dans les résultats récupérés pour le commit audité. Le statut combiné du commit consulté ne renvoyait aucun contrôle.
9. Le script lint ne vérifiait que `src/index.js`, pas `src/payments.js`. La branche d'audit corrige ce contrôle statique et ajoute une CI dédiée.


10. Le contrat du moteur de matching est également incompatible au niveau des champs : `scorePair` exige notamment une unité (`unit`), un statut de demande `open`, un nom de produit `productName`, et un budget `maxUnitPrice`. Les fiches publiques actuelles utilisent `product`, `maxUnitBudget`, `location` et un statut `active` pour les besoins, et les règles de publication n'autorisent pas le champ `unit`. Il ne suffit donc pas de changer le nom des déclencheurs pour rendre le matching opérationnel.

11. Le client marque actuellement une transaction `completed` dès que les deux participants ont coché leurs confirmations, sans vérifier un événement Stripe signé ni un champ `paymentStatus=paid`. Le statut `completed` observé dans la capture prouve donc seulement l'état enregistré par l'application ; il ne prouve pas qu'un paiement a été encaissé.

## Blocages avant paiement

- Définir une source fiable d'identité d'entreprise et son cycle de vérification. Ne pas fabriquer des sociétés à partir d'un simple nom libre ni d'un profil utilisateur incomplet.
- Décider si le modèle produit est celui des comptes utilisateurs actuels ou celui des entreprises. Migrer les données seulement après définition d'un mapping, sauvegarde et tests de retour arrière.
- Unifier les états de transaction : proposition, acceptation, paiement confirmé par webhook, livraison/confirmation, litige, remboursement et transfert.
- Déplacer les transitions financières sensibles derrière des Cloud Functions ; ne jamais laisser le navigateur définir un paiement comme payé, remboursé ou transféré.
- Écrire et tester des règles Firestore de moindre privilège pour toutes les collections effectivement utilisées. Les écritures financières doivent être réservées au backend.
- Aligner les déclencheurs de matching avec les vraies collections et les vrais champs du client.
- Tester les fonctions dans Firebase Emulator Suite et les scénarios Stripe en mode test, avec des comptes de test distincts.
- Vérifier l'activation et l'éligibilité du compte Stripe Connect et l'onboarding vendeur. L'intégration de code ne prouve pas que le compte Stripe est activé.
- Vérifier la configuration réelle des secrets Firebase, de l'URL de l'application, des webhooks Stripe et des index Firestore.

## Changements de cette branche

- Le script lint vérifie désormais `src/index.js` et `src/payments.js`.
- Une GitHub Actions exécute ce contrôle avec Node.js 20 lors des push et pull requests qui touchent les fonctions Firebase.

## Ce qui n'a pas été fait

- Aucune donnée Firestore n'a été modifiée.
- Aucune règle n'a été publiée dans Firebase.
- Aucune fonction Cloud n'a été déployée.
- Aucun secret ou clé Stripe n'a été créé, lu ou modifié.
- Aucun compte Connect, paiement, remboursement ou transfert n'a été créé ou exécuté.
- Aucune fusion vers `main` n'a été effectuée.


## Vérification Stripe (lecture seule, compte de test)

Compte sélectionné dans la session Stripe : `acct_1UdcaWR8ylAXqLYd`, nommé « New business ».

Réponse de l'API Stripe consultée le 19 novembre 2026 :
- `livemode=false` : compte en mode test.
- `type=standard` : ce n'est pas un compte plateforme Connect actif.
- `charges_enabled=false` et `payouts_enabled=false`.
- `details_submitted=false`, aucune capacité activée et `requirements.disabled_reason=requirements.pending_verification`.
- Liste des comptes connectés vide (`data=[]`).
- Liste des webhooks du compte vide (`data=[]`).

**Conclusion Stripe :** aucun parcours Connect ni webhook n'est actuellement configuré sur ce compte. Aucune opération de paiement ne doit être tentée avec l'état actuel. Les vérifications de l'API ont été strictement en lecture seule.

## Vérification Firebase

Aucun connecteur Firebase/Firestore/Cloud Functions n'est disponible dans cette session et aucune session de console n'a été partagée sous une forme permettant un accès technique. Les éléments Firebase sont donc vérifiés à partir de la capture fournie et des fichiers du dépôt, pas par lecture directe de la configuration déployée. Les règles publiées, index, secrets et déploiements restent à vérifier dans le projet réel.

## Critère de validation finale

Le projet ne sera considéré validé qu'après réussite de la CI, tests des règles et fonctions sur émulateur, vérification de la configuration Firebase réelle, parcours Stripe Connect de bout en bout en mode test, tests de webhooks et remboursements, puis validation du parcours complet de l'application.

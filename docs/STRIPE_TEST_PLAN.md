# Plan de test Stripe Connect — DealHunter

## Environnement

- Utiliser exclusivement une clé Stripe de test (`sk_test_`) et un secret webhook de test (`whsec_`).
- Configurer les secrets Firebase Functions : `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET`.
- Configurer `DEALHUNTER_APP_URL` avec l'URL HTTPS de l'application.
- Configurer le webhook Stripe sur l'URL de la fonction `stripeWebhook`.
- Événements nécessaires au flux actuel : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `account.updated`, `balance.available`, `charge.dispute.created`, `charge.dispute.closed`, `charge.refunded`.

## Parcours nominal

1. Créer deux comptes de test Firebase distincts, avec une entreprise acheteuse et une entreprise vendeuse.
2. Depuis le compte vendeur, créer le compte Stripe Connect Express puis terminer l'onboarding de test.
3. Vérifier que le webhook `account.updated` place `stripeOnboardingStatus` à `complete` lorsque les capacités et paiements sont activés.
4. Créer une vente acceptée avec un montant en centimes et une devise EUR.
5. Depuis le compte acheteur, créer la session Checkout et payer avec une carte de test Stripe.
6. Vérifier que seul le webhook signé, correspondant à l'identifiant exact de session, au montant et à la devise attendus, passe la vente à `paymentStatus=paid`.
7. Confirmer la réception côté vendeur et acheteur.
8. Vérifier que le transfert vendeur est égal à 95 % du montant brut et que la commission DealHunter est égale à 5 %.
9. Vérifier que les webhooks répétés ne créent pas de deuxième transfert.

## Tests négatifs obligatoires

- Utilisateur non authentifié : toutes les fonctions callable sensibles doivent refuser.
- Entreprise non détenue par l'utilisateur : refus de créer un compte Connect ou une session de paiement.
- Vente non acceptée ou déjà payée : refus de Checkout.
- Session webhook d'un autre identifiant, montant différent ou devise différente : aucune validation de paiement.
- Une seule confirmation (acheteur ou vendeur) : aucun transfert.
- Litige ouvert : aucun transfert.
- Vendeur non onboardé ou fonds non disponibles : transfert différé, jamais présenté comme payé.
- Remboursement complet après transfert : reversal du transfert ou statut explicite de revue manuelle.
- Remboursement partiel : revue manuelle obligatoire.
- Contestation bancaire : transfert bloqué jusqu'à résolution.

## Points de contrôle avant production

- Tester les événements webhook et leurs nouvelles tentatives.
- Vérifier le solde disponible de la plateforme et sa capacité à financer remboursements et contestations.
- La callable `adminResolveDealDispute` est réservée aux comptes Firebase portant le custom claim `admin: true`. Tester le refus sans ce claim et l'autorisation avec ce claim.
- Tester les deux décisions d'administration : `release` (après note obligatoire, puis versement si les deux parties ont confirmé) et `refund` (remboursement intégral Stripe idempotent, transfert bloqué).
- Les remboursements partiels restent en revue manuelle. Si un transfert vendeur est déjà payé, l'arbitrage automatique de remboursement est refusé : une réconciliation opérateur est nécessaire.
- L'interface d'administration n'est pas encore construite ; la callable backend ne suffit pas à rendre le parcours opérable par une équipe métier.
- Ajouter une reprise opérateur et une réconciliation périodique des transferts différés.
- Faire valider le rôle de marchand officiel, les conditions de vente, la TVA, le droit de rétractation éventuel et le cadre réglementaire des flux de fonds.
- Ne jamais présenter Stripe Connect comme un compte séquestre.

Le code backend d'arbitrage est présent, mais les scénarios Stripe de bout en bout décrits ici restent à exécuter en environnement de test. Le document ne signifie pas que les paiements, remboursements ou transferts ont déjà été réalisés.

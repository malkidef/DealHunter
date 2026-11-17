# Backend Firebase de DealHunter

Cette configuration remplace Appwrite comme backend cible. Elle prépare Firestore, les règles d'accès et le matching automatique côté serveur.

## Services à activer dans le projet Firebase

1. Créer un projet Firebase.
2. Activer **Authentication** (Email/Password au minimum).
3. Créer **Cloud Firestore** en mode production.
4. Activer **Cloud Functions** (un moyen de paiement peut être exigé pour le déploiement des fonctions selon les conditions Firebase en vigueur).
5. Installer Firebase CLI, puis lancer `firebase login` et `firebase use --add`.

## Déploiement depuis le dépôt

À la racine du dépôt :
```bash
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Le projet doit être sélectionné dans la CLI. Ne jamais ajouter de clé Admin SDK dans le dépôt ou dans le navigateur.

## Collections

- `companies` : entreprise et propriétaire authentifié.
- `seller_listings` : stocks vendeurs.
- `buyer_requests` : besoins acheteurs.
- `matches` : suggestions calculées par Cloud Functions.
- `deals` : réservées au futur workflow de validation des ventes.

## Sécurité et limites

- Les règles imposent une authentification et vérifient le propriétaire de l'entreprise pour les écritures.
- Les utilisateurs authentifiés peuvent consulter les stocks actifs et besoins ouverts, sans exposer les coordonnées privées des entreprises.
- Les correspondances et ventes sont en lecture seule côté client ; seul le serveur peut les créer ou les modifier.
- Le moteur réutilise le scoring DealHunter existant et crée des suggestions idempotentes.
- Chaque déclenchement analyse au maximum 5 000 documents actifs/ouvert ; au-delà, l'exécution échoue explicitement plutôt que de produire un résultat partiel silencieux.
- Cette configuration ne crée pas encore le projet Firebase, n'active pas les services et ne connecte pas le formulaire HTML. Les identifiants de projet sont propres au compte Firebase du propriétaire.
- Le modèle de lancement prévoit une commission vendeur de 5 % ; le montant net vendeur est calculé côté serveur.
- Le transfert vendeur attend le paiement confirmé, la confirmation des deux parties, l'activation Stripe Connect du vendeur et la disponibilité des fonds.
- Un acheteur ou un vendeur authentifié peut ouvrir un litige sur une vente payée ; l'ouverture bloque le transfert vendeur.
- Les litiges Stripe reçus par webhook bloquent aussi les versements ; une décision favorable au vendeur peut relancer le contrôle de versement, tandis qu'une décision défavorable garde le transfert bloqué.
- Les détails des litiges sont lisibles uniquement par les entreprises acheteuse et vendeuse ; les écritures restent réservées au serveur.
- Les remboursements partiels sont placés en revue manuelle afin d'éviter un reversement automatique erroné ; les remboursements complets déclenchent une tentative de reversal du transfert.
- Les événements Stripe ne sont marqués comme traités qu'après exécution réussie du traitement, afin de permettre les nouvelles tentatives webhook en cas d'erreur.
- Les suggestions ne contactent aucune entreprise, ne réservent aucun stock et ne déclenchent aucun paiement.

# Backend Firebase de DealHunter

Le backend cible est Firebase Authentication + Cloud Firestore. Le projet Web configuré dans `firebase-web-config.js` est `dealhunter-3747b` ; le propriétaire a confirmé qu'il s'agit de son projet.

## Première mise en service — périmètre sans Cloud Functions

**Ne déploie pas encore les Cloud Functions.** Le dépôt contient actuellement des fonctions historiques qui écoutent les collections `seller_listings` et `buyer_requests`, alors que le catalogue actuel utilise `publicOffers` et `publicNeeds`. Le même paquet charge aussi des fonctions de paiement Stripe. Déployer toutes les fonctions maintenant serait prématuré, pourrait demander le plan Blaze et ne lancerait pas le matching actuel comme attendu.

Pour la première phase, procéder dans cet ordre :

1. Dans Firebase Console, ouvrir le projet `dealhunter-3747b` et confirmer l'application Web.
2. Activer Authentication avec Email/Password ; activer Google seulement après vérification du domaine autorisé.
3. Créer/ouvrir Firestore en mode production.
4. Vérifier les règles et index du dépôt.
5. Déployer uniquement les règles et index :
   ```bash
   firebase use dealhunter-3747b
   firebase deploy --only firestore:rules,firestore:indexes
   ```
6. Tester les parcours avec deux comptes de test avant toute ouverture publique.

La configuration Web présente dans le dépôt contient des identifiants publics destinés au navigateur. Leur présence ne prouve pas que les services sont activés ou que les règles sont déployées. Ne jamais placer de clé Admin SDK, secret de compte de service, secret Stripe, clé privée Apple ou mot de passe dans ce fichier ou dans Git.

## Matching produits via GitHub Actions

Le workflow `.github/workflows/matching-batch.yml` lit `publicOffers` et `publicNeeds`, puis écrit des suggestions dans `matches`. Il est distinct du déploiement Cloud Functions.

Il nécessite le secret GitHub Actions `FIREBASE_SERVICE_ACCOUNT` :
- créer dans Firebase un compte de service dédié ;
- lui accorder uniquement les droits Firestore nécessaires à la lecture des catalogues et à l'écriture des suggestions ;
- ajouter son JSON dans GitHub > Settings > Secrets and variables > Actions sous le nom exact `FIREBASE_SERVICE_ACCOUNT` ;
- ne jamais committer ni partager le JSON ;
- lancer le workflow manuellement et vérifier les logs avant de compter sur le calendrier de 15 minutes.

Sans ce secret, le workflow échoue volontairement. Le batch ne contacte personne, ne révèle pas de coordonnées, ne réserve aucun stock et ne déclenche aucun paiement. Il est limité à 5 000 documents actifs par collection et 250 000 comparaisons par exécution.

## Cloud Functions et Stripe — phase ultérieure, bloquée

Le dossier `firebase/functions` contient des déclencheurs historiques sur `seller_listings` et `buyer_requests`, ainsi que des fonctions de paiement Stripe (Checkout, Connect, litiges et versements). Ils ne doivent pas être déployés pendant la première mise en service sans audit et configuration.

Avant de les activer :
- migrer ou retirer les déclencheurs qui utilisent les anciennes collections ;
- vérifier les droits, règles, tests d'intégration et idempotence ;
- définir les secrets Stripe dans Firebase Secret Manager ;
- configurer les URL de retour et webhooks ;
- examiner les obligations contractuelles et de paiement ;
- vérifier le plan Firebase, les tarifs et obtenir une décision explicite sur les coûts.

Le budget initial visé est de 0 €. Ne pas activer de service nécessitant une facturation sans accord explicite.

## Authentification et modération

Dans Firebase Console > Authentication > Sign-in method :
1. Activer Email/Password.
2. Activer Google après vérification du domaine autorisé.
3. N'activer Apple qu'après configuration complète dans les consoles Apple Developer et Firebase ; la clé privée reste dans les consoles prévues.

Le rôle de modération `dealhunterAdmin: true` doit être attribué manuellement par un opérateur de confiance via Firebase Admin SDK, en conservant les autres claims. La revue des entreprises et qualifications reste humaine.

## Contrôles avant ouverture

- [ ] Projet `dealhunter-3747b` confirmé et application Web correspondante.
- [ ] Authentication activée et domaine exact autorisé.
- [ ] Firestore activé.
- [ ] Tests des règles Firestore réussis dans l'émulateur.
- [ ] Règles et index déployés.
- [ ] Secret `FIREBASE_SERVICE_ACCOUNT` configuré sans publication du JSON.
- [ ] Matching lancé manuellement et résultat vérifié.
- [ ] Parcours de bout en bout testé avec deux comptes.
- [ ] Politique RGPD, sécurité, sources et conditions commerciales validées.
- [ ] Cloud Functions et paiements laissés désactivés jusqu'à audit distinct.

La publication GitHub Pages ne vaut pas mise en production Firebase. Aucun déploiement Firebase n'est confirmé à ce stade.

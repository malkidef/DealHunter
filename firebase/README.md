# Backend Firebase de DealHunter

Cette configuration remplace Appwrite comme backend cible. Elle prépare Firestore, les règles d'accès et le matching automatique côté serveur.

## Services à activer dans le projet Firebase

1. Confirmer que le projet Firebase `dealhunter-3747b` présent dans `firebase-web-config.js` appartient bien au propriétaire de DealHunter.
2. Activer **Authentication** (Email/Password au minimum).
3. Créer ou vérifier **Cloud Firestore** en mode production.
4. Les Cloud Functions peuvent nécessiter le plan Blaze et un moyen de paiement ; ne pas les activer sans vérifier les coûts et obtenir une décision explicite.
5. Installer Firebase CLI, puis lancer `firebase login` et `firebase use --add`.

## Configuration Web déjà présente

Le fichier racine `firebase-web-config.js` contient actuellement une configuration Web avec le projet `dealhunter-3747b` (apiKey, authDomain, projectId et appId). Ce sont des identifiants Web publics, destinés au navigateur ; leur présence dans Git ne prouve ni que le projet est accessible, ni que Authentication/Firestore sont activés, ni que les règles sont déployées.

1. Dans Firebase Console, ouvrir le projet `dealhunter-3747b` et confirmer qu'il s'agit du bon projet.
2. Dans Paramètres du projet > Général > Vos applications, vérifier que l'application Web correspond aux valeurs du fichier.
3. Si ce n'est pas le bon projet, remplacer uniquement les quatre valeurs Web par celles de l'application Web correcte.
4. Ne jamais placer de clé Admin SDK, secret de compte de service, secret Stripe, clé privée Apple ou mot de passe dans ce fichier, le navigateur, GitHub public ou une conversation.
5. Dans Authentication > Settings > Authorized domains, ajouter le domaine exact où DealHunter est publié (domaine GitHub Pages ou domaine personnalisé).

La sécurité ne repose pas sur le secret de la clé API Web : elle repose sur Authentication, les règles Firestore strictes, les restrictions API adaptées et la protection des secrets serveur.

## Connexion des utilisateurs et fournisseurs

Dans Firebase Console > Authentication > Sign-in method :
1. Activer **E-mail/Mot de passe**.
2. Activer **Google** après vérification du domaine autorisé.
3. Activer **Apple** uniquement après configuration du compte Apple Developer, Services ID, Team ID, Key ID, clé privée et URL de retour dans les consoles Apple/Firebase. Ne jamais déposer la clé privée dans le dépôt.

Le frontend utilise Firebase Authentication depuis `auth.js`. Tester la création de compte et la reconnexion avant d'ouvrir le service. La création de compte ne crée pas encore automatiquement une fiche entreprise ni un rôle vendeur/acheteur.

## Déploiement depuis le dépôt

À la racine du dépôt :
```bash
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Le projet doit être sélectionné dans la CLI et les règles/index doivent être revus avant déploiement. Les fonctions peuvent entraîner des coûts ; ne déployer que les composants nécessaires après vérification du plan et des tarifs. Aucun déploiement Firebase n'est confirmé à ce stade.

## Matching planifié via GitHub Actions

Le workflow `.github/workflows/matching-batch.yml` s'exécute manuellement ou selon son calendrier après fusion dans `main`. Il nécessite le secret GitHub Actions `FIREBASE_SERVICE_ACCOUNT`, contenant le JSON d'un compte de service dédié avec les droits Firestore minimaux nécessaires.

- Créer le compte de service dans le projet Firebase confirmé.
- Accorder uniquement les rôles nécessaires à la lecture des collections d'offres/besoins et à l'écriture des suggestions `matches`.
- Ajouter le JSON dans GitHub > Settings > Secrets and variables > Actions > New repository secret, sous le nom exact `FIREBASE_SERVICE_ACCOUNT`.
- Ne jamais committer ou transmettre le JSON dans le chat.
- Exécuter le workflow manuellement et contrôler les logs avant de compter sur le calendrier.
- Sans le secret, le workflow échoue volontairement ; aucune suggestion n'est calculée.

Le batch écrit uniquement des suggestions de matching produits. Il n'envoie aucun email/SMS/message, ne partage pas les coordonnées, ne crée aucune commande et ne déclenche aucun paiement.

## Tableau de bord entreprise

La fonction callable `getCompanyDashboard` renvoie, après authentification et vérification du propriétaire de l'entreprise, les ventes et achats liés à cette entreprise ainsi que les indicateurs financiers. Elle retourne au maximum les 100 transactions les plus récentes ; les totaux affichés portent donc sur cet échantillon tant qu'une pagination complète n'est pas ajoutée. Les index Firestore vendeur/acheteur sont définis dans `firestore/firestore.indexes.json` ou le fichier d'index présent à la racine Firebase.

## Collections et architecture

Le dépôt contient des collections Firestore pour les comptes, offres et besoins de produits, services, profils et offres de travail, demandes de mise en relation, messages, transactions, vérifications et signalements. Les règles sont définies dans `firebase/firestore.rules` ; les tests d'accès sont dans `firebase/rules-tests/`.

`docs/APPWRITE_SCHEMA.md` est un ancien schéma de conception : Appwrite n'est pas le backend actuellement utilisé par le code.

## Sécurité et limites

- Les règles imposent une authentification et vérifient la propriété pour les écritures.
- Les utilisateurs ne doivent pas pouvoir lire les coordonnées privées d'autres entreprises.
- Les correspondances et ventes sont en lecture limitée côté client ; le serveur contrôle les opérations sensibles.
- Le moteur crée des suggestions idempotentes ; il ne contacte pas les entreprises et ne réserve aucun stock.
- Les lectures de matching sont bornées ; la couverture mondiale exhaustive n'est pas garantie.
- Le rôle de modération `dealhunterAdmin: true` doit être attribué manuellement par un opérateur de confiance via Firebase Admin SDK, en conservant les autres claims.
- Les tests de règles dans l'émulateur ne remplacent pas un test de bout en bout dans un projet Firebase de préproduction.
- Aucun paiement ni prélèvement n'est activé ; la commission de 5 % reste indicative.

## Contrôle avant activation

- [ ] Confirmer que `dealhunter-3747b` est le bon projet Firebase.
- [ ] Vérifier l'application Web et les quatre valeurs de `firebase-web-config.js`.
- [ ] Vérifier Authentication et les fournisseurs activés.
- [ ] Ajouter le domaine GitHub Pages exact aux domaines autorisés.
- [ ] Créer Firestore et vérifier les index.
- [ ] Revoir et déployer les règles Firestore avec le bon compte.
- [ ] Ajouter le secret GitHub Actions `FIREBASE_SERVICE_ACCOUNT` sans le publier.
- [ ] Tester avec deux comptes distincts les annonces, le matching, les consentements, la messagerie et les droits d'accès.
- [ ] Vérifier les coûts avant tout déploiement de fonctions ou activation de service payant.

Le dépôt ne peut pas confirmer à ta place les paramètres privés de la console Firebase. Les secrets et clés privées doivent rester dans les consoles prévues à cet effet.

# Backend Firebase de DealHunter

Cette configuration remplace Appwrite comme backend cible. Elle prépare Firestore, les règles d'accès et le matching automatique côté serveur.

## Services à activer dans le projet Firebase

1. Créer un projet Firebase.
2. Activer **Authentication** (Email/Password au minimum).
3. Créer **Cloud Firestore** en mode production.
4. Activer **Cloud Functions** (un moyen de paiement peut être exigé pour le déploiement des fonctions selon les conditions Firebase en vigueur).
5. Installer Firebase CLI, puis lancer `firebase login` et `firebase use --add`.

## Connexion des utilisateurs et création d'entreprise

Le frontend utilise Firebase Authentication (e-mail/mot de passe et Google) et Firestore.

1. Dans Firebase Console > Authentication > Sign-in method, active **E-mail/Mot de passe** et **Google**.
2. Dans Authentication > Settings > Authorized domains, ajoute le domaine où DealHunter est publié (par exemple le domaine GitHub Pages réel du dépôt).
3. Dans les paramètres du projet, crée une application Web et récupère sa configuration Firebase.
4. Copie `firebase-config.example.js` à la racine sous le nom `firebase-config.js`, puis remplace les valeurs d'exemple par la configuration Web de ton projet.
5. Publie le fichier `firebase-config.js` dans le dépôt seulement si tu acceptes que la configuration Web soit visible publiquement. Les clés de configuration Web Firebase ne sont pas des secrets d'administration ; la sécurité repose sur Authentication et les règles Firestore. Ne publie jamais de clé Admin SDK, de secret Stripe ou de mot de passe.
6. Ouvre l'onglet « Connexion / Compte », crée ton compte, puis crée l'espace entreprise.

Le code gère la connexion e-mail, la création de compte, la connexion Google et la création du document entreprise avec le statut initial `pending`. Le propriétaire peut lire son entreprise ; les données de paiement et les transactions restent gérées côté serveur.

## Déploiement depuis le dépôt

À la racine du dépôt :
```bash
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Le projet doit être sélectionné dans la CLI. Ne jamais ajouter de clé Admin SDK dans le dépôt ou dans le navigateur.

## Tableau de bord entreprise

La fonction callable `getCompanyDashboard` renvoie, après authentification et vérification du propriétaire de l'entreprise, les ventes et achats liés à cette entreprise ainsi que les indicateurs financiers. Elle retourne au maximum les 100 transactions les plus récentes ; les totaux affichés portent donc sur cet échantillon tant qu'une pagination complète n'est pas ajoutée. Les index Firestore vendeur/acheteur sont définis dans `firestore.indexes.json`.

## Connexion des utilisateurs (Google, Apple, e-mail)

L'interface web contient les boutons Google, Apple et e-mail (connexion et création). Le module `auth.js` utilise Firebase Authentication et la configuration publique `firebase-web-config.js`. Ce fichier contient uniquement les paramètres Web publics du projet ; aucune clé Admin SDK ni clé privée Apple ne doit être publiée.

Configuration à effectuer dans Firebase Console :

1. Créer/ouvrir le projet, ajouter une application Web et recopier `apiKey`, `authDomain`, `projectId` et `appId` dans `firebase-web-config.js`.
2. Dans Authentication > Sign-in method, activer Email/Password et Google.
3. Activer Apple dans la même page. Apple exige un compte Apple Developer, un Services ID, un Team ID, une Key ID et une clé privée générée dans Apple Developer. Saisir ces paramètres dans la console Firebase uniquement ; ne jamais les déposer dans GitHub ni les envoyer dans une conversation.
4. Dans Authentication > Settings > Authorized domains, ajouter le domaine exact où DealHunter est publié.
5. Pour Apple, configurer aussi le domaine et l'URL de retour fournis par Firebase dans le portail Apple Developer. L'URL de retour Firebase est de la forme `https://<authDomain>/__/auth/handler`.

Google, Apple et e-mail permettent ensuite de retrouver le même compte sur iPhone, Android et ordinateur. L'interface d'authentification est préparée, mais les connexions restent désactivées tant que la configuration Firebase et les fournisseurs ne sont pas activés. La création de compte ne crée pas encore automatiquement une fiche entreprise ni un rôle vendeur/acheteur.

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

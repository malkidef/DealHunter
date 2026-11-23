# Vérification manuelle — entreprises et qualifications

## Principe
DealHunter ne marque jamais une entreprise, un diplôme ou une habilitation comme vérifié sur la seule déclaration d'un utilisateur. Les demandes restent `pending` jusqu'à une revue humaine par un compte de confiance.

## Dépôt d'une demande
La collection privée `verificationRequests` accepte uniquement :
- le propriétaire connecté (`ownerUid`) ;
- le type de sujet : `company` ou `qualification` ;
- le nom du sujet et le code pays ISO ;
- un libellé de preuve et une URL publique HTTPS ;
- le statut initial `pending` et les horodatages.

Ne pas déposer de pièce d'identité, de diplôme scanné, de justificatif privé, de numéro de sécurité sociale, d'adresse personnelle, de téléphone, de mot de passe ni d'URL avec jeton secret. Utiliser uniquement un registre officiel public ou une page publique de l'organisme émetteur. Les règles Firestore refusent les champs supplémentaires et les URL non HTTPS.

## Interface
Le formulaire est disponible dans la section « Marché des compétences et du recrutement ». Chaque utilisateur consulte ses propres demandes et peut retirer une demande encore en attente. Un compte réviseur autorisé voit la file globale et dispose des actions de validation/refus.

## Revue
Seuls les comptes dont le jeton Firebase contient `dealhunterAdmin: true` peuvent lire toutes les demandes et décider `verified` ou `rejected`. Un propriétaire ne peut que consulter sa demande ou la retirer tant qu'elle est en attente. Les décisions et notes du réviseur sont protégées par les règles. Le bouton de validation actuel enregistre une note générique ; le détail des motifs de décision devra être enrichi avant ouverture publique.

## Attribution du rôle réviseur
Le claim doit être attribué par un opérateur de confiance via Firebase Admin SDK, jamais depuis le navigateur ni par une action utilisateur. Exemple à exécuter dans un environnement local sécurisé déjà authentifié avec le compte de service du projet :

```js
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const uid = "FIREBASE_UID_DU_REVISEUR";
const user = await auth.getUser(uid);
await auth.setCustomUserClaims(uid, {
  ...(user.customClaims || {}),
  dealhunterAdmin: true
});
```

Ne jamais committer le compte de service ou ses clés dans GitHub. Après attribution, le réviseur doit renouveler son jeton Firebase (déconnexion/reconnexion) pour recevoir le claim.

## Limites
- La revue est manuelle ; aucune intégration payante ou vérification automatique n'est activée.
- Un statut vérifié signifie uniquement que la preuve publique indiquée a été examinée par un réviseur DealHunter à une date donnée. Il ne garantit ni solvabilité, ni qualité, ni conformité permanente.
- Les utilisateurs doivent signaler tout changement ou expiration de leurs justificatifs.
- Avant une ouverture publique mondiale, définir les procédures de contestation, de conservation, d'effacement, de contrôle des réviseurs et les obligations locales.
- Le statut de vérification ne doit jamais être utilisé comme seul critère de recrutement ou de sélection d'un prestataire.

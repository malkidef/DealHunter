# Conception rectification, retrait et effacement — DealHunter

État : retrait et effacement non implémentés ; rectification du profil entreprise initialement disponible en branche de développement. Revue technique : 25 novembre 2026.

## 1. Principe

Une demande d'effacement ne doit pas déclencher une suppression globale immédiate. DealHunter contient des documents partagés, des transactions, des messages et des preuves de modération qui concernent plusieurs personnes. La demande doit être vérifiée, qualifiée, exécutée par étapes et contrôlée.

Cette procédure ne constitue pas un avis juridique. Le responsable du traitement doit définir les bases légales, les exceptions et les durées de conservation avant mise en service.

## 2. Catégories de demandes

- Accès/export : produire une copie des données communicables, selon le document ACCOUNT_DATA_EXPORT_DESIGN.md.
- Rectification : corriger les données inexactes dans Auth, profil privé, fiche entreprise, annonces, besoins et demandes ; identifier les copies et données dérivées.
- Retrait de publication : masquer immédiatement les annonces et profils publics concernés, sans confondre ce retrait avec un effacement intégral.
- Effacement : décider pour chaque catégorie si elle peut être supprimée, doit être anonymisée ou doit être conservée temporairement sur une base légale documentée.
- Limitation/opposition : empêcher les usages concernés pendant l'examen lorsque le cadre applicable le requiert.

## 3. Matrice de traitement par famille

| Famille | Action initiale | Traitement à décider |
|---|---|---|
| Firebase Authentication | Vérifier le demandeur et le moyen de connexion | Supprimer le compte Auth en dernier, après traitement des données liées ; vérifier les sessions et fournisseurs |
| users/{uid} | Restreindre l'accès au compte si nécessaire | Rectifier puis supprimer/anonymiser ; traiter les sous-collections |
| sellerOffers, buyerNeeds | Retirer les annonces du catalogue | Supprimer les documents privés et publics correspondants |
| publicOffers, publicNeeds | Désactiver/retirer l'affichage | Supprimer ou anonymiser après vérification |
| Offres/demandes services et travail | Retirer l'affichage public | Supprimer ou anonymiser les documents liés |
| companyProfiles | Retirer la fiche publique | Rectifier/supprimer selon la décision |
| companyVerifications | Révoquer le statut public si la preuve est invalidée | Conserver seulement la preuve minimale si justifiée ; tracer la révocation |
| verificationRequests | Bloquer l'exposition publique | Supprimer/anonymiser la demande ou conserver la décision minimale selon la politique approuvée |
| matchRequests, serviceMatchRequests, workMatchRequests | Empêcher de nouvelles interactions | Préserver le contexte nécessaire au tiers ; anonymiser les références du demandeur si applicable |
| Messages | Ne pas supprimer aveuglément une conversation entière | Évaluer les messages de l'auteur, les droits du co-participant et la conservation nécessaire |
| matchContacts | Révoquer l'accès si la mise en relation n'est plus active | Traiter séparément les coordonnées de chaque personne |
| deals, dealReviews | Identifier les obligations de preuve et litiges | Conserver ou anonymiser les éléments nécessaires ; ne pas effacer une transaction sans examen |
| trustReports | Restreindre les données de signalement | Conserver les éléments strictement nécessaires à la sécurité et à la défense des droits, avec accès limité |
| notifications | Supprimer celles du titulaire | Neutraliser les événements sources pour éviter leur recréation |
| matches | Exclure le compte des calculs | Supprimer les suggestions et empêcher le worker de les recréer |
| Journaux, exports, sauvegardes | Inscrire la demande dans les processus de purge | Définir les délais, la propagation et les règles de restauration sans réintroduire les données effacées |

## 4. Séquence de traitement recommandée

1. Recevoir la demande par un canal officiel publié.
2. Vérifier l'identité de façon proportionnée et demander une réauthentification lorsque nécessaire.
3. Enregistrer un identifiant de dossier, les droits demandés, les dates et le statut ; limiter les informations copiées dans le dossier.
4. Cartographier les collections, sous-collections, fournisseurs, journaux et copies concernés.
5. Identifier les autres personnes, les transactions, litiges et obligations de conservation.
6. Décider et documenter pour chaque famille : rectification, retrait, suppression, anonymisation ou conservation.
7. Exécuter d'abord les retraits publics réversibles ; contrôler le résultat.
8. Exécuter les suppressions/anonymisations par lots idempotents, avec comptage avant/après et journal sans contenu personnel superflu.
9. Traiter les données dérivées : matching, notifications, caches, exports et sources de collecte.
10. Vérifier que les collecteurs et workers ne recréent pas les données retirées.
11. Contrôler les sauvegardes et la procédure de restauration pour ne pas réintroduire les données supprimées.
12. Répondre au demandeur et clôturer le dossier dans le délai légal applicable.

## 5. Contraintes spécifiques de l'architecture actuelle

- Firestore ne supprime pas automatiquement les sous-collections lorsqu'un document parent est supprimé.
- Les règles actuelles interdisent la suppression client de nombreuses collections ; il ne faut pas élargir ces règles globalement.
- Le SDK Firebase côté navigateur ne permet pas à un utilisateur de supprimer toutes les données d'un compte dans l'ensemble de Firestore.
- Les workers Admin SDK ont des privilèges étendus ; toute opération de purge doit être limitée à un dossier validé, avec simulation préalable et journal de résultat.
- Les workers matching/notifications peuvent recréer des données dérivées à partir des événements sources si ceux-ci ne sont pas neutralisés.
- Les données partagées ne doivent pas être détruites au détriment des droits ou preuves légitimes d'un autre participant.
- Une suppression du compte Auth en premier peut empêcher l'utilisateur de s'authentifier pour terminer ou suivre sa demande. Elle doit donc être la dernière étape, si elle est juridiquement et techniquement appropriée.
- Le projet est actuellement sur Firebase Spark. Aucune Cloud Function payante ne doit être activée dans cette phase.

## 6. Garde-fous avant toute implémentation

- Aucune suppression en production depuis le navigateur.
- Aucune purge automatique basée uniquement sur un e-mail non vérifié.
- Pas de suppression des transactions, messages, coordonnées ou signalements sans matrice de décision validée.
- Exiger une prévisualisation des documents concernés et un décompte avant toute action destructive.
- Exiger une approbation explicite distincte avant exécution réelle.
- Ajouter un mode simulation, une reprise idempotente et des tests avec données fictives.
- Conserver une trace minimale de l'opération sans dupliquer les données personnelles supprimées.
- Prévoir un contrôle indépendant après exécution et un processus de recours/correction.

## 7. Tests d'acceptation

- Un utilisateur ne peut initier ou consulter que sa propre demande.
- Un tiers ne peut ni consulter ni approuver la demande.
- Les demandes répétées sont idempotentes.
- Un retrait public ne supprime pas par erreur les données d'un autre propriétaire.
- Les sous-collections sont recensées explicitement.
- Les messages et transactions partagés suivent une décision de conservation documentée.
- Le worker de matching et le worker de notifications ne recréent pas les données neutralisées.
- Un échec au milieu d'un traitement permet une reprise sans double suppression ni perte de traçabilité.
- Le compte Auth n'est supprimé qu'après validation de toutes les étapes et approbation explicite.
- La restauration de sauvegarde n'annule pas silencieusement les effacements déjà exécutés.

Statut : **non opérationnel**. Cette spécification n'exécute aucune demande, ne modifie aucune donnée et n'active aucun service payant.


## 8. Rectification du profil entreprise — première étape

Une première interface de rectification est maintenant présente sur la branche de développement :
- le profil existant est relu depuis `users/{uid}` et `companyProfiles/{uid}` après connexion ;
- le nom, le pays et le téléphone sont préremplis ;
- l'enregistrement existant utilise le même parcours sécurisé que la création ;
- si une preuve de vérification active existe, le nom et le pays sont verrouillés dans l'interface et restent protégés par les règles Firestore ; le téléphone professionnel reste modifiable dans le profil privé ;
- les champs entreprise sont réinitialisés lors d'une déconnexion ou d'un changement de compte pour éviter l'affichage des informations du compte précédent.

Cette étape ne traite pas encore les rectifications des annonces, messages, transactions, demandes partagées ni données conservées par les fournisseurs. Elle doit être validée par des essais réels sur plusieurs comptes avant intégration.


## 9. Préparation d'un dossier d'effacement — protocole de triage sans suppression automatique

Cette étape formalise un protocole d'accueil et de triage à appliquer manuellement tant que l'effacement automatisé n'est pas implémenté. Elle n'ajoute aucune interface, ne crée aucun dossier utilisateur et n'exécute aucune opération Firebase.

### Liste de contrôle pour le responsable

- [ ] Vérifier l'identité de manière proportionnée (sans collecter de pièce d'identité par défaut).
- [ ] Consigner un identifiant de dossier non parlant, la date de réception et les catégories demandées.
- [ ] Vérifier l'état des annonces, demandes, mises en relation, transactions, avis, signalements et vérifications entreprise.
- [ ] Distinguer les données publiques à retirer immédiatement, les données privées à rectifier/supprimer, les données partagées à examiner et les preuves à conserver si une base légale est définie.
- [ ] Inventorier les sous-collections, notifications, suggestions, données dérivées, journaux et copies éventuelles.
- [ ] Définir et documenter la décision de conservation pour chaque famille avant toute action.
- [ ] Préparer une simulation (compte fictif uniquement), avec décompte et liste de chemins/documents ciblés ; aucune écriture.
- [ ] Faire relire le plan par une seconde personne habilitée avant toute suppression réelle.
- [ ] Si la suppression réelle est approuvée, exécuter par étapes idempotentes, vérifier chaque étape et conserver un journal minimal sans contenu supprimé.
- [ ] Vérifier que matching/notifications ne recréent pas les données neutralisées ; contrôler l'effet des sauvegardes/restaurations.
- [ ] Supprimer le compte Auth en dernier, si cela est approprié et autorisé ; vérifier les sessions et le résultat final.
- [ ] Communiquer la réponse au demandeur et consigner la clôture.

### Séparation des états

reçue → identité vérifiée → inventaire → décisions de conservation → simulation → approbation distincte → exécution contrôlée → vérification → réponse → clôturée.

Un dossier ne doit jamais avancer automatiquement de la simulation à l'exécution. Une demande n'autorise pas à elle seule la destruction des documents transactionnels, des données de tiers ou des preuves de modération. Les délais de réponse, bases légales et exceptions doivent être validés par le responsable et son conseil.

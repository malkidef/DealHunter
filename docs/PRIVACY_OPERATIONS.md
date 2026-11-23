# Procédure opérationnelle de protection des données — DealHunter

> Document de conception interne, pas une politique de confidentialité définitive ni un avis juridique. Les durées et bases légales doivent être validées avec un conseil compétent avant ouverture au public.

## 1. Principes non négociables

- Ne collecter que les données nécessaires à la publication, à la recherche et à la mise en relation demandée.
- Séparer les données publiques d'une annonce des coordonnées, justificatifs, messages et données de compte.
- Ne jamais rendre public un email, téléphone, adresse privée, document d'identité ou justificatif de qualification.
- Ne révéler les coordonnées et ouvrir la conversation qu'après acceptation explicite des deux parties, selon les règles du produit.
- Conserver la provenance, la date de collecte, la source et les droits de réutilisation de chaque annonce importée.
- Ne pas réutiliser une annonce pour une finalité incompatible et ne pas contourner les protections techniques d'une source.
- Prévoir une suppression ou anonymisation effective, y compris des copies, index, exports et sauvegardes selon leur cycle documenté.

## 2. Cartographie initiale à confirmer

| Domaine | Données possibles | Visibilité attendue | Contrôle à finaliser |
|---|---|---|---|
| Compte | UID Firebase, email d'authentification, date de création | Privée | Accès au compte et suppression |
| Profil professionnel | Nom affiché, entreprise, compétences, zone, statut | Publique seulement si l'utilisateur l'a choisi | Consentement de publication, rectification, retrait |
| Annonce produit | Description, prix, devise, quantité, pays, source | Publique selon choix de publication | Expiration, retrait, provenance |
| Besoin produit/service | Description, budget, zone, critères | Public ou limité selon le parcours | Retrait et limitation d'exposition |
| Mise en relation | Identifiants des deux participants, statut, horodatages | Participants uniquement | Conservation limitée et preuve du consentement |
| Messages | Contenu, auteur, horodatage | Participants uniquement | Accès restreint, signalement, durée à définir |
| Transaction | Produit/service, montant, confirmations, commission indicative | Participants uniquement | Conservation contractuelle/comptable à définir |
| Vérification | Nom de l'entité, type, URL de preuve publique, décision | Demande privée ; statut public seulement si validé et justifié | Revue humaine, rectification, retrait |
| Modération | Catégorie de signalement, éléments nécessaires, décision | Équipe habilitée uniquement | Accès journalisé, durée à définir |
| Journaux techniques | Identifiants techniques, événements, erreurs | Administrateurs habilités | Minimisation, durée et accès à définir |

Ne pas ajouter de champs sensibles par commodité. Les justificatifs d'identité, données bancaires et documents privés ne doivent pas être acceptés dans les formulaires publics existants.

## 3. Cycle de traitement d'une demande RGPD

1. Recevoir la demande via un canal de contact officiel qui sera publié dans l'application.
2. Enregistrer la date, la catégorie de demande et un identifiant de suivi ; ne pas recopier inutilement des pièces d'identité.
3. Vérifier l'identité de manière proportionnée, sans demander systématiquement une copie de pièce d'identité.
4. Identifier les données dans Auth, Firestore, journaux, fournisseurs, sauvegardes et exports.
5. Examiner les obligations légales de conservation, les droits des tiers et les éventuelles exceptions.
6. Exporter, rectifier, limiter ou supprimer selon la demande et la décision documentée.
7. Propager la suppression aux systèmes et sous-traitants concernés ; documenter les sauvegardes et leur échéance de purge.
8. Répondre dans le délai légal applicable et conserver une trace minimale de traitement de la demande.

Aucune suppression ne doit être exécutée automatiquement sur la seule base d'un email non vérifié.

## 4. Matrice de suppression à implémenter et tester

- Authentification : supprimer/désactiver le compte après vérification et traitement des obligations applicables.
- Profils et annonces : retirer immédiatement de l'affichage public, puis supprimer ou anonymiser selon la politique approuvée.
- Demandes et suggestions de matching : retirer les références personnelles et empêcher la recréation de suggestions pour un compte supprimé.
- Conversations : traiter les messages en tenant compte des droits des autres participants et des obligations de preuve ; ne pas effacer aveuglément le contexte d'un tiers.
- Transactions : séparer les données nécessaires à une obligation légale ou à un litige des données de profil non nécessaires.
- Vérifications et signalements : accès restreint, conservation justifiée, suppression à échéance.
- Journaux, exports et sauvegardes : documenter les délais de purge et éviter toute restauration qui réintroduirait des données effacées.

Cette matrice n'est pas encore une fonctionnalité exécutée. Chaque collection Firestore et chaque fournisseur doivent être recensés avant d'implémenter une suppression globale.

## 5. Sécurité et incidents

- Appliquer le moindre privilège aux comptes de service et aux rôles administrateurs.
- Ne jamais placer de secrets dans Git, le navigateur ou les journaux.
- Journaliser les actions d'administration sans enregistrer le contenu privé inutilement.
- Préparer un processus de détection, confinement, évaluation et notification des violations de données, avec responsable désigné.
- Tester les règles Firestore avec un propriétaire, un autre utilisateur, un tiers non connecté et un administrateur.
- Faire une revue indépendante avant ouverture publique.

## 6. Décisions humaines requises avant lancement

- Responsable du traitement et coordonnées de contact.
- Finalités et bases légales par catégorie de données.
- Durées de conservation documentées par collection et par finalité.
- Politique de confidentialité, mentions légales, conditions d'utilisation et politique cookies si nécessaire.
- Contrats et rôles des sous-traitants (Firebase/Google, hébergeur, paiement, analytics, email).
- Processus de droits des personnes, réclamations et violations.
- Analyse des transferts internationaux et, si nécessaire, garanties appropriées.
- Détermination de la nécessité d'une AIPD/DPIA selon les traitements réellement retenus.

## 7. Critères d'acceptation technique

- Un utilisateur ne peut lire ni modifier les données privées d'un autre.
- Un profil retiré n'est plus exposé par les recherches publiques.
- Une suppression de compte ne laisse pas de données personnelles accessibles dans les collections publiques ou privées non justifiées.
- Les demandes de matching ne réapparaissent pas après suppression.
- Les messages et transactions sont traités selon une règle documentée qui protège aussi les autres participants.
- Les demandes d'accès/export produisent un export lisible et complet, sans divulguer les données d'autres personnes.
- Les tests couvrent les cas de succès, d'échec, de répétition et de concurrence.

**État :** procédure de conception rédigée ; aucune automatisation d'export/effacement ni conformité RGPD ne doit être considérée comme achevée à ce stade.

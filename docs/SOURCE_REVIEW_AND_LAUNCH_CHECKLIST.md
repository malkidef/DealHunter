# Qualification des sources et préparation au lancement — DealHunter

Document interne de travail. Ce document n'est ni une politique publiée, ni un avis juridique, ni une preuve de conformité.

## 1. File de revue des sources publiques

Le script `scripts/source_review_queue.py` consolide les fichiers JSON existants vers `data/source-review-queue.json`.

Exécution locale :

```bash
python scripts/source_review_queue.py
python -m unittest tests.test_source_review_queue -v
```

Le script :
- lit uniquement les fichiers JSON locaux ;
- produit une file de revue séparée ;
- n'appelle aucun service distant ;
- n'écrit pas dans Firebase, Firestore, `publicOffers` ou `publicNeeds` ;
- ne publie pas les annonces dans les catalogues visibles ;
- ne crée aucun compte, aucune demande et aucune correspondance.

### Règles de qualification

| Source | Nature du signal | Destination autorisée à ce stade |
|---|---|---|
| BOAMP | Avis de marché ; fournitures potentielles filtrées par catégorie et échéance | File de revue acheteur |
| TED | Avis de marché européen, non vérifié | File de revue acheteur |
| SAM.gov | Avis d'achat fédéral américain, si le flux est disponible | File de revue acheteur |
| GSA Auctions | Lots proposés aux enchères, disponibilité et conditions à vérifier | File de revue vendeur |
| BODACC | Cessions d'entreprises ou de fonds | Exclu du matching de stocks |

Un élément de la file reste `pending`, `not_promoted` et `verified=false`. Les quantités, prix unitaires et devises restent vides tant que la source ne les établit pas et qu'un contrôle humain n'a pas été effectué.

### Conditions minimales avant toute promotion

Un réviseur habilité doit, pour chaque annonce :
1. ouvrir la source officielle et vérifier que l'avis existe toujours ;
2. vérifier la date, le statut, l'échéance et les lots ;
3. confirmer qu'il s'agit bien d'un besoin de produits ou d'un lot de marchandises, et non de travaux, services, attribution ou cession d'entreprise ;
4. vérifier les droits et conditions de réutilisation, l'attribution et la fréquence de mise à jour ;
5. relever uniquement les champs nécessaires ;
6. documenter l'identité de la personne qui a vérifié et la date ;
7. obtenir les validations nécessaires avant de créer une annonce DealHunter.

Aucun automatisme ne doit transformer un avis public en commande ferme, en stock disponible ou en entreprise cliente.

## 2. Contrôle des collecteurs

Pour chaque exécution, conserver :
- source et URL de documentation ;
- date/heure de collecte ;
- nombre de résultats lus et nombre de résultats valides ;
- statut explicite : réussi avec résultats, réussi sans résultat, ou échec ;
- motif d'échec sans secret ni donnée personnelle ;
- licence, attribution et règles de réutilisation vérifiées.

Un fichier absent ou vide doit être signalé comme tel. Il ne doit jamais être interprété comme une collecte réussie avec zéro annonce sans diagnostic complémentaire.

## 3. Notifications — test de bout en bout requis

Le succès d'un workflow GitHub Actions prouve que le worker s'est exécuté ; il ne prouve pas qu'une notification a été créée, livrée et affichée.

Test préproduction à réaliser avec deux comptes de test :
1. compte A crée une demande de mise en relation ;
2. compte B reçoit une notification persistée dans sa collection privée ;
3. B ouvre l'application et voit le titre, le contenu et l'horodatage ;
4. B marque la notification comme lue ;
5. A reçoit une notification de décision après acceptation ou refus ;
6. vérifier qu'une relance du worker ne crée pas de doublon ;
7. vérifier qu'un tiers non participant ne peut ni lire ni modifier la notification.

Consigner les identifiants de test non sensibles, les horodatages, les résultats et les éventuelles erreurs. Ne pas utiliser les coordonnées ou données réelles de clients pour ce test.

## 4. Liste réglementaire avant ouverture en France / UE

Les points ci-dessous doivent être adaptés au rôle réel de DealHunter, aux pays ciblés et au parcours effectivement activé. Les réponses et durées sont à décider avec un conseil compétent.

### Identité et rôle contractuel
- [ ] Raison sociale, forme juridique, adresse et immatriculation de l'exploitant.
- [ ] Responsable de publication et coordonnées de contact.
- [ ] Décrire précisément le rôle de DealHunter : simple outil de mise en relation, intermédiaire, mandataire ou autre rôle selon les contrats et la pratique réelle.
- [ ] Définir qui contracte avec qui, qui facture, qui livre, qui gère retours, garanties, réclamations et litiges.
- [ ] Vérifier les règles sectorielles et géographiques des produits et des vendeurs autorisés.

### Documents utilisateurs
- [ ] Mentions légales.
- [ ] Conditions générales d'utilisation.
- [ ] Conditions commerciales / de mise en relation et, si applicable, conditions générales de vente.
- [ ] Politique de confidentialité.
- [ ] Politique cookies et mécanisme de consentement si des traceurs soumis à consentement sont utilisés.
- [ ] Règles de modération, retrait d'annonces, signalement et traitement des abus.
- [ ] Information claire sur le caractère indicatif des correspondances et sur l'absence de garantie de disponibilité d'un stock.

### RGPD et sécurité
- [ ] Cartographier les données, finalités, personnes concernées, destinataires et systèmes.
- [ ] Déterminer une base légale pour chaque finalité ; ne pas utiliser le consentement par défaut pour tout.
- [ ] Désigner le responsable du traitement et, si nécessaire, le DPO.
- [ ] Définir les durées de conservation par collection et par finalité.
- [ ] Publier les modalités d'accès, rectification, opposition, limitation, portabilité et effacement selon leur applicabilité.
- [ ] Tester export, rectification et suppression dans Auth, Firestore, logs, exports et sous-traitants.
- [ ] Signer / vérifier les accords de sous-traitance et examiner les transferts hors EEE.
- [ ] Documenter les contrôles d'accès, sauvegardes, gestion des secrets et réponse aux violations.
- [ ] Évaluer la nécessité d'une AIPD/DPIA avant les traitements à risque.

### Sources et données publiques
- [ ] Tenir un registre des sources, licences, conditions, attribution, limitations et dates de vérification.
- [ ] Respecter les conditions d'accès des API ; ne pas contourner de restriction technique.
- [ ] Éviter la collecte et l'affichage de coordonnées personnelles non nécessaires.
- [ ] Mettre en place une procédure de retrait/correction d'une annonce source.
- [ ] Ne pas présenter un avis d'appel d'offres, une enchère ou une cession comme une offre de stock confirmée.

### Paiement et commission
- [ ] Confirmer le rôle juridique et contractuel de DealHunter dans le paiement.
- [ ] Vérifier les obligations de facturation, TVA, justificatifs et traitement des remboursements.
- [ ] Définir les règles de commission, annulation, litige et preuve de réalisation.
- [ ] Effectuer les scénarios Stripe en mode test, y compris échecs, remboursements et litiges.
- [ ] Ne pas activer les paiements réels avant revue juridique, comptable, technique et accord explicite du propriétaire.

## 5. Garde-fous de mise en production

- Firebase reste sur Spark tant qu'aucune décision distincte n'autorise une évolution.
- Aucun déploiement Cloud Functions n'est requis par le script de file de revue.
- Stripe reste non opérationnel.
- Aucune source n'est promue automatiquement dans les catalogues commerciaux.
- Les annonces et comptes de test ne sont pas supprimés sans autorisation explicite.
- L'ouverture commerciale reste bloquée tant que les tests multi-comptes, la revue de sécurité, les documents juridiques et les conditions de réutilisation des sources ne sont pas validés.

## 6. Décisions à faire valider par le propriétaire

- [ ] Pays d'établissement de l'exploitant et pays de lancement.
- [ ] Statut juridique de la société exploitante.
- [ ] Modèle contractuel exact et rôle de DealHunter.
- [ ] Catégories de produits autorisées / interdites.
- [ ] Responsable des contrôles humains des annonces importées.
- [ ] Adresse de contact juridique et confidentialité à publier.
- [ ] Durées de conservation et procédure de support.
- [ ] Validation juridique et comptable avant ouverture.

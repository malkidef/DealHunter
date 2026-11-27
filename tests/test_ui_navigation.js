import fs from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const auth = fs.readFileSync(new URL("../auth.js", import.meta.url), "utf8");
const payments = fs.readFileSync(new URL("../firebase/functions/src/payments.js", import.meta.url), "utf8");

test("les fonctions Stripe utilisent le même claim administrateur que les règles Firestore", () => {
  assert.match(payments, /request\.auth\.token\.dealhunterAdmin !== true/);
  assert.doesNotMatch(payments, /request\.auth\.token\.admin !== true/);
});

test("Checkout Stripe laisse Stripe sélectionner dynamiquement les moyens de paiement", () => {
  assert.match(payments, /checkout\.sessions\.create/);
  assert.doesNotMatch(payments, /payment_method_types/);
  assert.match(payments, /stripeClient\(\)\.webhooks\.constructEvent/);
});


test("chaque onglet visible possède une destination réelle", () => {
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
  const uniqueTabs = [...new Set(tabs)];
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(match => match[1])
    .filter(value => !value.includes("'") && !value.includes('"')));
  const allowedMatch = html.match(/const allowedTabs = \[([^\]]+)\]/);
  assert.ok(allowedMatch, "La liste des onglets autorisés doit exister");
  const allowed = [...allowedMatch[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...allowed].sort(), [...uniqueTabs].sort());
  for (const tab of uniqueTabs) assert.ok(ids.has(tab), "Panneau manquant pour l’onglet " + tab);
  assert.ok(html.includes("panel.classList.toggle('hidden', id !== target)"));
});

test("les événements d’action de l’interface sont traités par Firebase", () => {
  const actions = [...new Set([...html.matchAll(/new CustomEvent\(['"](dealhunter-[a-z0-9-]+)['"]/g)]
    .map(match => match[1]))]
    .filter(name => !name.endsWith("-result") && name !== "dealhunter-business-record-updated");
  for (const action of actions) {
    assert.ok(
      auth.includes('addEventListener("' + action + '"') || auth.includes("addEventListener('" + action + "'"),
      "Aucun gestionnaire Firebase pour " + action
    );
  }
});

test("les formulaires stock et besoin déclenchent une publication cloud", () => {
  assert.match(html, /dealhunter-save-business-record/);
  assert.match(auth, /addEventListener\("dealhunter-save-business-record"/);
  assert.match(auth, /await setDoc\(privateRef, privatePayload\)/);
  assert.match(auth, /await setDoc\(publicRef, publicPayload\)/);
  assert.match(auth, /await deleteDoc\(privateRef\)/);
  assert.match(auth, /publicationStage = "publication dans le catalogue partagé"/);
  assert.match(html, /data-edit-buyer-record/);
  assert.ok(auth.includes('"buyerNeeds"'), "La modification des besoins acheteurs doit être gérée côté Firebase");
});

test("la confirmation de vente conserve le second accord hors de la transaction", () => {
  const start = auth.indexOf('window.addEventListener("dealhunter-confirm-deal"');
  const end = auth.indexOf('window.addEventListener("dealhunter-send-message"', start);
  assert.ok(start >= 0 && end > start, "Gestionnaire de confirmation introuvable");
  const handler = auth.slice(start, end);
  assert.match(handler, /let otherConfirmed = false;/);
  assert.match(handler, /otherConfirmed=isSeller\?deal\.buyerConfirmed:deal\.sellerConfirmed;/);
  assert.match(handler, /finish\(true,otherConfirmed/);
});

test("les résultats des actions Firebase sont visibles depuis tous les onglets", () => {
  assert.match(html, /id="actionFeedback"[^>]*aria-live="polite"/);
  assert.match(auth, /new MutationObserver/);
  assert.match(auth, /actionFeedback\.classList\.remove\("hidden"\)/);
});

test("les formulaires services et professionnels récupèrent leur état après résultat", () => {
  assert.match(auth, /addEventListener\("dealhunter-save-service-record"/);
  assert.match(auth, /addEventListener\("dealhunter-save-work-record"/);
  assert.match(auth, /dealhunter-service-record-result/);
  assert.match(auth, /dealhunter-work-record-result/);
  assert.match(html, /dealhunter-service-record-result/);
  assert.match(html, /dealhunter-work-record-result/);
});

test("les demandes de mise en relation services et emploi peuvent être réessayées en cas d'échec", () => {
  assert.match(auth, /dealhunter-service-match-request-result/);
  assert.match(auth, /dealhunter-work-match-request-result/);
  assert.match(html, /dealhunter-service-match-request-result/);
  assert.match(html, /dealhunter-work-match-request-result/);
});

test("le retrait d'un profil professionnel restaure le bouton si Firebase échoue", () => {
  assert.match(auth, /dealhunter-work-delete-result/);
  assert.match(html, /dealhunter-work-delete-result/);
});

test("les actions de vente acceptation et confirmation retournent un résultat à l'interface", () => {
  assert.match(auth, /dealhunter-deal-action-result/);
  assert.match(html, /dealhunter-deal-action-result/);
  assert.match(html, /data-deal-accept/);
  assert.match(html, /data-deal-confirm/);
});

test("les réponses aux demandes et le partage de coordonnées peuvent être réessayés", () => {
  assert.match(auth, /dealhunter-match-decision-result/);
  assert.match(auth, /dealhunter-contact-share-result/);
  assert.match(html, /dealhunter-match-decision-result/);
  assert.match(html, /dealhunter-contact-share-result/);
});

test("les formulaires de modération et vérification reçoivent un résultat Firebase", () => {
  for (const name of ["dealhunter-create-trust-report", "dealhunter-review-trust-report",
    "dealhunter-create-verification-request", "dealhunter-review-verification-request"]) {
    assert.ok(auth.includes(name), "Gestionnaire manquant : " + name);
  }
  for (const name of ["dealhunter-trust-report-result", "dealhunter-trust-review-result",
    "dealhunter-verification-create-result", "dealhunter-verification-review-result"]) {
    assert.ok(auth.includes(name) && html.includes(name), "Retour d'action manquant : " + name);
  }
});

test("les messages privés de services et de travail ne sont effacés qu'après envoi réussi", () => {
  for (const name of ["dealhunter-service-message-result", "dealhunter-work-message-result"]) {
    assert.ok(auth.includes(name) && html.includes(name), "Retour de messagerie manquant : " + name);
  }
  assert.match(html, /if\(d\.success\)form\.reset\(\)/);
});

test("les boutons dynamiques de modération et de vérification ne soumettent pas un formulaire parent", () => {
  assert.match(html, /<button type="button" data-report-action=/);
  assert.match(html, /<button type="button" data-verification-decision=/);
  assert.match(html, /<button type="button" data-work-decision=/);
});

test("la boîte de réception contient la destination des demandes emploi et missions", () => {
  assert.match(html, /id="workMatchRequests"/);
  assert.match(html, /\$\('workMatchRequests'\)/);
  assert.match(html, /dealhunter-work-match-requests/);
  assert.match(html, /data-work-message-form/);
  assert.match(html, /Impossible de charger les demandes professionnelles/);
  assert.match(html, /La liste des demandes professionnelles est indisponible/);
});

test("les boîtes de réception services et emploi distinguent une erreur Firestore d'une liste vide", () => {
  assert.match(html, /failedCollections/);
  assert.match(html, /Impossible de charger les demandes de services/);
  assert.match(html, /La liste des demandes de services est indisponible/);
  assert.match(html, /Impossible de charger les demandes professionnelles/);
  assert.match(html, /La liste des demandes professionnelles est indisponible/);
});

test("auth transmet les erreurs de lecture aux boîtes de réception services et emploi", () => {
  assert.ok(auth.includes('failedCollections:failedReads.filter(item=>item.startsWith("serviceMatchRequests:"))'));
  assert.ok(auth.includes('failedCollections:failedReads.filter(item=>item.startsWith("workMatchRequests:"))'));
});

test("l’export personnel est accessible uniquement depuis le compte connecté", () => {
  assert.match(html, /id="exportAccountData"/);
  assert.match(auth, /exportAccountDataButton\.classList\.toggle\("hidden", !user\)/);
  assert.match(auth, /auth\.currentUser\?\.uid !== user\.uid/);
  assert.match(auth, /user\.emailVerified/);
  assert.match(auth, /lastSignInTime/);
  assert.match(auth, /15 \* 60 \* 1000/);
});

test("l’export personnel filtre par UID et pagine chaque collection avec un plafond explicite", () => {
  assert.match(auth, /where\(field, "==", user\.uid\)/);
  assert.match(auth, /EXPORT_PAGE_SIZE = 250/);
  assert.match(auth, /MAX_EXPORT_DOCUMENTS_PER_COLLECTION = 1000/);
  assert.match(auth, /orderBy\(documentId\(\)\)/);
  assert.match(auth, /startAfter\(cursor\)/);
  assert.match(auth, /limit\(pageLimit\)/);
  assert.match(auth, /docs\.slice\(0, MAX_EXPORT_DOCUMENTS_PER_COLLECTION\)/);
  assert.match(auth, /users", user\.uid, "sellerOffers"/);
  assert.match(auth, /users", user\.uid, "buyerNeeds"/);
  assert.match(auth, /reporterUid/);
  assert.match(auth, /recipientUid/);
});

test("l’export indique explicitement les données partagées et les limites", () => {
  assert.match(auth, /Export initial téléchargé/);
  assert.match(auth, /formatVersion: 2/);
  assert.match(auth, /Il reste partiel : conversations, demandes partagées, transactions et avis ne sont pas inclus/);
  assert.match(auth, /Conversations et messages partagés/);
  assert.match(auth, /Transactions et avis partagés/);
  assert.match(auth, /export administratif exhaustif ni une sauvegarde/);
  assert.match(auth, /application\/json;charset=utf-8/);
});

test("le profil entreprise existant est rechargé pour permettre sa rectification", () => {
  assert.match(auth, /const loadCompanyProfile = async user =>/);
  assert.match(auth, /companyProfiles", user\.uid/);
  assert.match(auth, /privateCompany\.phone/);
  assert.match(auth, /nameInput\.value = publicCompany\.companyName/);
  assert.match(auth, /nameInput\.readOnly = locked/);
  assert.match(auth, /countryInput\.disabled = locked/);
  assert.match(auth, /loadCompanyProfile\(user\)/);
  assert.match(auth, /auth\.currentUser\?\.uid !== user\.uid/);
  assert.match(auth, /await loadCompanyProfile\(user\)/);
  assert.match(html, /id="companyProfileHint"/);
  assert.match(html, /id="companyName" required minlength="2" maxlength="120"/);
});

test("les champs entreprise sont réinitialisés lors d’un changement de compte", () => {
  assert.match(auth, /if \(companyForm\) companyForm\.reset\(\)/);
  assert.match(auth, /companyNameInput\.readOnly = false/);
  assert.match(auth, /companyCountryInput\.disabled = false/);
});

test("l’export personnel est annulé si le compte change pendant sa préparation", () => {
  const exportStart = auth.indexOf("const exportAccountData = async user =>");
  const exportEnd = auth.indexOf("if (exportAccountDataButton)", exportStart);
  assert.ok(exportStart >= 0 && exportEnd > exportStart, "Fonction d’export introuvable");
  const exporter = auth.slice(exportStart, exportEnd);
  assert.match(exporter, /if \(auth\.currentUser\?\.uid !== user\.uid\) \{[\s\S]*Le compte a changé pendant la préparation/);
  assert.ok(exporter.indexOf("Le compte a changé pendant la préparation") < exporter.indexOf("const blob = new Blob"),
    "Le contrôle de session doit précéder le téléchargement du fichier");
});

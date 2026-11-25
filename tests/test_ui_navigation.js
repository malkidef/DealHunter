import fs from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const auth = fs.readFileSync(new URL("../auth.js", import.meta.url), "utf8");

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

test("les identifiants HTML sont uniques et les demandes professionnelles ont un seul conteneur", () => {
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], [], "Les identifiants HTML doivent être uniques");
  assert.equal(ids.filter(id => id === "workMatchRequests").length, 1);
  assert.match(html, /data-go-work-requests/);
  assert.match(html, /dealhunterShowTab\('matchRequests'/);
});

test("les liens issus des imports et des sources sont limités à HTTPS", () => {
  assert.match(html, /function safeHttpsUrl\(value\)/);
  assert.match(html, /if\(sourceUrl&&!safeHttpsUrl\(sourceUrl\)\)/);
  assert.match(html, /const sourceInput=\$\('srcUrl'\),url=safeHttpsUrl\(sourceInput\.value\)/);
  assert.match(html, /safeHttpsUrl\(x\.sourceUrl\)/);
  assert.match(html, /safeHttpsUrl\(n\.source_url\)/);
  assert.match(html, /safeHttpsUrl\(x\.url\)/);
});

test("les onglets sont accessibles au clavier et exposent leurs rôles ARIA", () => {
  assert.match(html, /id="mainTabs" role="tablist"/);
  assert.match(html, /tab\.setAttribute\("role", "tab"\)/);
  assert.match(html, /panel\.setAttribute\("role", "tabpanel"\)/);
  assert.match(html, /event\.key === "ArrowRight"/);
  assert.match(html, /event\.key === "ArrowLeft"/);
  assert.match(html, /event\.key === "Home"/);
  assert.match(html, /event\.key === "End"/);
});

test("tous les formulaires visibles sont reliés à un gestionnaire de soumission", () => {
  const handlers = {
    emailAuthForm: /emailForm\.addEventListener\("submit"/,
    companyForm: /companyForm\.addEventListener\("submit"/,
    sellerForm: /\$\('sellerForm'\)\.addEventListener\('submit'/,
    buyerForm: /\$\('buyerForm'\)\.addEventListener\('submit'/,
    serviceOfferForm: /\$\('serviceOfferForm'\)\.addEventListener\('submit'/,
    serviceRequestForm: /\$\('serviceRequestForm'\)\.addEventListener\('submit'/,
    workerProfileForm: /\$\('workerProfileForm'\)\.addEventListener\('submit'/,
    workOpeningForm: /\$\('workOpeningForm'\)\.addEventListener\('submit'/,
    verificationRequestForm: /\$\('verificationRequestForm'\)\.addEventListener\('submit'/,
    trustReportForm: /\$\('trustReportForm'\)\.addEventListener\('submit'/,
    marginForm: /\$\('marginForm'\)\.addEventListener\('submit'/,
    sourceForm: /\$\('sourceForm'\)\.addEventListener\('submit'/
  };
  const formIds = [...html.matchAll(/<form\b[^>]*\bid="([A-Za-z][A-Za-z0-9_-]*)"/g)].map(match => match[1]);
  assert.deepEqual([...formIds].sort(), Object.keys(handlers).sort());
  for (const [id, pattern] of Object.entries(handlers)) {
    assert.match(id === "emailAuthForm" || id === "companyForm" ? auth : html, pattern, "Gestionnaire submit manquant pour " + id);
  }
});

test("tous les boutons déclarent explicitement leur type", () => {
  const buttons = [...html.matchAll(/<button\b([^>]*)>/g)].map(match => match[1]);
  assert.ok(buttons.length > 0);
  for (const attributes of buttons) assert.match(attributes, /\btype=["'](?:button|submit|reset)["']/);
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


test("le statut initial du compte ne prétend pas à tort que Firebase est désactivé", () => {
  assert.match(html, /id="authStatus"[^>]*>Vérification de la configuration Firebase…</);
  assert.doesNotMatch(html, /id="authStatus"[^>]*>Firebase n’est pas encore configuré/);
});


test("les parcours de compte exposent inscription, connexion, récupération et vérification e-mail", () => {
  assert.match(html, /id="emailAuthForm"/);
  assert.match(html, /id="emailCreate"/);
  assert.match(html, /id="emailSignIn"/);
  assert.match(html, /id="passwordReset"/);
  assert.match(html, /id="googleSignIn"/);
  assert.match(html, /id="appleSignIn"/);
  assert.match(html, /id="resendVerification"/);
  assert.match(html, /id="signOut"/);
  assert.match(auth, /createUserWithEmailAndPassword\(auth/);
  assert.match(auth, /signInWithEmailAndPassword\(auth/);
  assert.match(auth, /sendPasswordResetEmail\(auth/);
  assert.match(auth, /sendEmailVerification\(/);
  assert.match(auth, /requireVerifiedEmail/);
  assert.match(auth, /signInWithRedirect\(auth, provider\)/);
  assert.match(auth, /signInWithPopup\(auth, provider\)/);
});

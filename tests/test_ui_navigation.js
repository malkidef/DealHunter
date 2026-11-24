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
  assert.match(auth, /batch\.set\(privateRef, privatePayload\)/);
  assert.match(auth, /batch\.set\(publicRef, publicPayload\)/);
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
  assert.match(handler, /status\.textContent=otherConfirmed\?/);
});

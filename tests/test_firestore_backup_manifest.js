"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createManifest, sha256 } = require("../scripts/firestore-backup/manifest.js");
const { validateRestoreTarget, PRODUCTION_PROJECT_ID } = require("../scripts/firestore-backup/restore-guard.js");

const base = {
  projectId: "dealhunter-test",
  startedAt: "2026-11-27T10:00:00.000Z",
  finishedAt: "2026-11-27T10:01:00.000Z",
  collections: [{ path: "offers", documentCount: 2, status: "complete", errors: [] }],
  jsonl: '{"path":"offers/o1","data":{}}\n'
};

test("le manifeste calcule une empreinte SHA-256 et un statut complet", () => {
  const result = createManifest(base);
  assert.equal(result.status, "complete");
  assert.equal(result.totalDocuments, 2);
  assert.equal(result.data.sha256, sha256(base.jsonl));
  assert.equal(result.data.byteLength, Buffer.byteLength(base.jsonl));
  assert.equal(result.backupType, "logical-non-atomic");
});

test("une collection en erreur ou partielle marque toute la sauvegarde partielle", () => {
  const result = createManifest({
    ...base,
    collections: [
      ...base.collections,
      { path: "needs", documentCount: 1, status: "partial", errors: ["pagination interrompue"] }
    ]
  });
  assert.equal(result.status, "partial");
  assert.equal(result.totalDocuments, 3);
});

test("des erreurs présentes invalident le statut complet même si le collecteur l'a marqué complete", () => {
  const result = createManifest({
    ...base,
    collections: [{ path: "offers", documentCount: 2, status: "complete", errors: ["lecture interrompue"] }]
  });
  assert.equal(result.status, "partial");
  assert.equal(result.collections[0].status, "partial");
});

test("refuse les dates incohérentes, chemins dupliqués et statuts inconnus", () => {
  assert.throws(() => createManifest({ ...base, finishedAt: "2026-11-27T09:00:00Z" }), /temporelle/);
  assert.throws(() => createManifest({ ...base, collections: [base.collections[0], base.collections[0]] }), /doublon/);
  assert.throws(() => createManifest({ ...base, collections: [{ path: "offers", documentCount: 0, status: "unknown" }] }), /Statut/);
});

test("autorise uniquement une restauration confirmée vers un émulateur local", () => {
  assert.deepEqual(
    validateRestoreTarget({ projectId: "dealhunter-test", emulatorHost: "127.0.0.1:8080", explicitConfirmation: true }),
    { projectId: "dealhunter-test", emulatorHost: "127.0.0.1:8080", mode: "emulator-only" }
  );
  assert.throws(() => validateRestoreTarget({ projectId: PRODUCTION_PROJECT_ID, emulatorHost: "127.0.0.1:8080", explicitConfirmation: true }), /production/);
  assert.throws(() => validateRestoreTarget({ projectId: "dealhunter-test", emulatorHost: "firestore.googleapis.com:443", explicitConfirmation: true }), /émulateur local/);
  assert.throws(() => validateRestoreTarget({ projectId: "dealhunter-test", emulatorHost: "127.0.0.1:8080", explicitConfirmation: false }), /Confirmation explicite/);
});

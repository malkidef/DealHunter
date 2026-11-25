/**
 * DealHunter — scheduled Firestore matching batch.
 *
 * Runs with a Firebase service account in GitHub Actions. Admin SDK writes
 * suggestions only; it never sends messages or exposes contact details.
 */
const crypto = require("node:crypto");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const matching = require("../../../functions/matching/src/main.js");
const { adaptPublicOffer, adaptPublicNeed } = require("../../../functions/matching/src/firestore-adapter.js");

const MAX_DOCUMENTS = 5000;
const MAX_PAIR_COMPARISONS = 250000;
const BATCH_SIZE = 400;

function initialize() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Secret FIREBASE_SERVICE_ACCOUNT absent.");
  let credentials;
  try { credentials = JSON.parse(raw); }
  catch { throw new Error("FIREBASE_SERVICE_ACCOUNT doit contenir le JSON du compte de service."); }
  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
    throw new Error("Le compte de service Firebase est incomplet.");
  }
  if (!getApps().length) initializeApp({ credential: cert(credentials) });
  return getFirestore();
}

async function readActive(db, collectionName) {
  const snapshot = await db.collection(collectionName)
    .where("status", "==", "active")
    .limit(MAX_DOCUMENTS + 1)
    .get();
  if (snapshot.size > MAX_DOCUMENTS) {
    throw new Error(`Plus de ${MAX_DOCUMENTS} documents actifs dans ${collectionName}; traitement interrompu par sécurité.`);
  }
  return snapshot.docs;
}

async function run() {
  const db = initialize();
  const [offerDocs, needDocs] = await Promise.all([
    readActive(db, "publicOffers"),
    readActive(db, "publicNeeds")
  ]);
  const offers = offerDocs.map((doc) => adaptPublicOffer(doc.id, doc.data()));
  const needs = needDocs.map((doc) => adaptPublicNeed(doc.id, doc.data()));
  const comparisons = offers.length * needs.length;
  if (comparisons > MAX_PAIR_COMPARISONS) {
    throw new Error(`Trop de combinaisons à analyser (${comparisons}). Limite de sécurité : ${MAX_PAIR_COMPARISONS}. Réduire le lot ou mettre en place un index de matching avant d'augmenter la capacité.`);
  }
  const candidates = matching.makeCandidates(offers, needs);
  let created = 0;
  let existing = 0;
  const offersById = new Map(offers.map((item) => [item.$id, item]));
  const needsById = new Map(needs.map((item) => [item.$id, item]));

  for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
    const chunk = candidates.slice(offset, offset + BATCH_SIZE);
    const writes = chunk.map((candidate) => ({
      candidate, offer: offersById.get(candidate.listingId), need: needsById.get(candidate.requestId)
    })).filter((item) => item.offer && item.need);
    if (!writes.length) continue;
    const batch = db.batch();
    for (const { candidate, offer, need } of writes) {
      const id = crypto.createHash("sha256").update(`${candidate.listingId}:${candidate.requestId}`).digest("hex");
      batch.create(db.collection("matches").doc(id), {
        listingId: candidate.listingId, requestId: candidate.requestId,        // Compatibilité interface : IDs attendus pour créer une demande.        sellerId: candidate.listingId, buyerId: candidate.requestId,        sellerUid: offer.companyId, buyerUid: need.companyId,
        participantUids: [offer.companyId, need.companyId],
        sellerCompany: offer.company, buyerCompany: need.company,
        product: offer.productName, compatibilityScore: candidate.compatibilityScore,
        status: "suggested", source: "scheduled_matching_v1", createdAt: FieldValue.serverTimestamp()
      });
    }
    try {
      await batch.commit();
      created += writes.length;
    } catch (error) {
      for (const { candidate, offer, need } of writes) {
        const id = crypto.createHash("sha256").update(`${candidate.listingId}:${candidate.requestId}`).digest("hex");
        const ref = db.collection("matches").doc(id);
        const result = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.exists) return "existing";
          tx.create(ref, {
            listingId: candidate.listingId, requestId: candidate.requestId,            // Compatibilité interface : IDs attendus pour créer une demande.            sellerId: candidate.listingId, buyerId: candidate.requestId,            sellerUid: offer.companyId, buyerUid: need.companyId,
            participantUids: [offer.companyId, need.companyId],
            sellerCompany: offer.company, buyerCompany: need.company,
            product: offer.productName, compatibilityScore: candidate.compatibilityScore,
            status: "suggested", source: "scheduled_matching_v1", createdAt: FieldValue.serverTimestamp()
          });
          return "created";
        });
        if (result === "created") created += 1;
        else existing += 1;
      }
    }
  }

  const summary = {
    ok: true,
    activeOffers: offers.length,
    activeNeeds: needs.length,
    candidates: candidates.length,
    created,
    existing,
    generatedAt: new Date().toISOString()
  };
  console.log(JSON.stringify(summary));
  return summary;
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  });
}

module.exports = { run, readActive };

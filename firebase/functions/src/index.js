const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const matching = require("../../../functions/matching/src/main.js");

initializeApp();
const db = getFirestore();
const PAGE_SIZE = 500;
const MAX_SCAN = 5000;

function asListing(id, data) {
  return {
    $id: id,
    companyId: data.companyId,
    productName: data.productName,
    category: data.category,
    quantity: data.quantity,
    unit: data.unit,
    unitPrice: data.unitPrice,
    currency: data.currency || "EUR",
    city: data.city || "",
    countryCode: data.countryCode || "FR",
    status: data.status,
    availableUntil: data.availableUntil || null
  };
}

function asRequest(id, data) {
  return {
    $id: id,
    companyId: data.companyId,
    productName: data.productName,
    category: data.category,
    quantity: data.quantity,
    unit: data.unit,
    maxUnitPrice: data.maxUnitPrice ?? null,
    currency: data.currency || "EUR",
    city: data.city || "",
    countryCode: data.countryCode || "FR",
    status: data.status,
    neededBy: data.neededBy || null
  };
}

async function loadByStatus(collectionName, status) {
  const all = [];
  let last = null;
  while (all.length < MAX_SCAN) {
    let query = db.collection(collectionName)
      .where("status", "==", status)
      .orderBy("__name__")
      .limit(PAGE_SIZE);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    if (page.empty) return all;
    all.push(...page.docs);
    last = page.docs[page.docs.length - 1];
    if (page.size < PAGE_SIZE) return all;
  }
  throw new Error(`Matching suspendu : plus de ${MAX_SCAN} documents à analyser dans ${collectionName}.`);
}

async function createSuggestions(listingDoc, requestDocs) {
  const listing = asListing(listingDoc.id, listingDoc.data());
  let created = 0;
  for (const requestDoc of requestDocs) {
    const request = asRequest(requestDoc.id, requestDoc.data());
    const score = matching.scorePair(listing, request);
    if (score === null) continue;
    const id = crypto.createHash("sha256")
      .update(`${listing.$id}:${request.$id}`)
      .digest("hex");
    const ref = db.collection("matches").doc(id);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) return;
      tx.create(ref, {
        listingId: listing.$id,
        requestId: request.$id,
        sellerCompanyId: listing.companyId,
        buyerCompanyId: request.companyId,
        compatibilityScore: score,
        status: "suggested",
        createdAt: FieldValue.serverTimestamp()
      });
      created += 1;
    });
  }
  return created;
}

exports.matchOnSellerWrite = onDocumentWritten("seller_listings/{listingId}", async (event) => {
  if (!event.data?.after?.exists) return;
  const data = event.data.after.data();
  if (data.status !== "active") return;
  const requests = await loadByStatus("buyer_requests", "open");
  const created = await createSuggestions(event.data.after, requests);
  console.log(JSON.stringify({ event: "seller_write", listingId: event.params.listingId, scannedRequests: requests.length, created }));
});

exports.matchOnBuyerWrite = onDocumentWritten("buyer_requests/{requestId}", async (event) => {
  if (!event.data?.after?.exists) return;
  const data = event.data.after.data();
  if (data.status !== "open") return;
  const listings = await loadByStatus("seller_listings", "active");
  const created = await createSuggestionsFromRequest(listings, event.data.after);
  console.log(JSON.stringify({ event: "buyer_write", requestId: event.params.requestId, scannedListings: listings.length, created }));
});

async function createSuggestionsFromRequest(listingDocs, requestDoc) {
  const request = asRequest(requestDoc.id, requestDoc.data());
  let created = 0;
  for (const listingDoc of listingDocs) {
    const listing = asListing(listingDoc.id, listingDoc.data());
    const score = matching.scorePair(listing, request);
    if (score === null) continue;
    const id = crypto.createHash("sha256")
      .update(`${listing.$id}:${request.$id}`)
      .digest("hex");
    const ref = db.collection("matches").doc(id);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) return;
      tx.create(ref, {
        listingId: listing.$id,
        requestId: request.$id,
        sellerCompanyId: listing.companyId,
        buyerCompanyId: request.companyId,
        compatibilityScore: score,
        status: "suggested",
        createdAt: FieldValue.serverTimestamp()
      });
      created += 1;
    });
  }
  return created;
}

// Marketplace payments and seller commission workflow
Object.assign(exports, require("./payments.js"));


// Notifications métier : création exclusivement côté serveur (Admin SDK).
// Les IDs déterministes rendent les écritures idempotentes lors des retries Firebase.
async function createPrivateNotification({ eventId, recipientUid, type, title, body, relatedId }) {
  if (typeof recipientUid !== "string" || !recipientUid.trim() || recipientUid.length > 128) return false;
  const id = crypto.createHash("sha256")
    .update(`${eventId}:${recipientUid}:${type}`)
    .digest("hex");
  const ref = db.collection("notifications").doc(id);
  try {
    await ref.create({
      recipientUid,
      type,
      title: String(title || "Notification DealHunter").slice(0, 120),
      body: String(body || "").slice(0, 1000),
      relatedId: typeof relatedId === "string" ? relatedId.slice(0, 180) : null,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null
    });
    return true;
  } catch (error) {
    // Une notification déjà créée signifie que l'événement a été traité.
    if (error.code === 6 || error.code === "already-exists") return false;
    throw error;
  }
}

exports.notifyOnMatchRequestCreated = onDocumentCreated("matchRequests/{requestId}", async (event) => {
  const request = event.data?.data();
  if (!request || request.status !== "pending") return;
  await createPrivateNotification({
    eventId: event.id,
    recipientUid: request.recipientUid,
    type: "match_request",
    title: "Nouvelle demande de mise en relation",
    body: `${String(request.requesterCompany || "Une entreprise").slice(0, 120)} souhaite vous contacter au sujet de ${String(request.product || "un produit").slice(0, 160)}.`,
    relatedId: event.params.requestId
  });
});

exports.notifyOnMatchRequestDecision = onDocumentUpdated("matchRequests/{requestId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || before.status !== "pending" || !["accepted", "rejected"].includes(after.status)) return;
  await createPrivateNotification({
    eventId: event.id,
    recipientUid: after.requesterUid,
    type: after.status === "accepted" ? "match_accepted" : "match_rejected",
    title: after.status === "accepted" ? "Demande acceptée" : "Demande refusée",
    body: after.status === "accepted"
      ? "Votre mise en relation est acceptée. Vous pouvez poursuivre l'échange dans DealHunter."
      : "Votre demande de mise en relation a été refusée.",
    relatedId: event.params.requestId
  });
});

exports.notifyOnMatchMessageCreated = onDocumentCreated("matchMessages/{messageId}", async (event) => {
  const message = event.data?.data();
  if (!message || typeof message.requestId !== "string" || typeof message.senderUid !== "string") return;
  const requestSnap = await db.collection("matchRequests").doc(message.requestId).get();
  if (!requestSnap.exists) return;
  const request = requestSnap.data();
  if (request.status !== "accepted" || !Array.isArray(request.participantUids)
      || !request.participantUids.includes(message.senderUid)) return;
  const recipientUid = request.participantUids.find(uid => uid !== message.senderUid);
  if (!recipientUid) return;
  await createPrivateNotification({
    eventId: event.id,
    recipientUid,
    type: "match_message",
    title: "Nouveau message DealHunter",
    body: String(message.text || "Vous avez reçu un nouveau message.").slice(0, 180),
    relatedId: message.requestId
  });
});

exports.notifyOnDealCreated = onDocumentCreated("deals/{dealId}", async (event) => {
  const deal = event.data?.data();
  if (!deal || deal.status !== "proposed" || !Array.isArray(deal.participantUids)) return;
  const recipientUid = deal.participantUids.find(uid => uid !== deal.proposerUid);
  if (!recipientUid) return;
  await createPrivateNotification({
    eventId: event.id,
    recipientUid,
    type: "deal_proposed",
    title: "Nouvelle proposition commerciale",
    body: `Une proposition concernant ${String(deal.product || "un produit").slice(0, 160)} vous attend dans DealHunter.`,
    relatedId: event.params.dealId
  });
});

exports.notifyOnDealStatusChanged = onDocumentUpdated("deals/{dealId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || before.status === after.status || !Array.isArray(after.participantUids)) return;
  const statusLabels = {
    agreed: "La proposition commerciale a été acceptée.",
    completed: "La vente a été déclarée terminée. Vérifiez sa confirmation dans DealHunter.",
    cancelled: "La proposition commerciale a été annulée."
  };
  const body = statusLabels[after.status];
  if (!body) return;
  const recipients = after.participantUids.filter(uid => typeof uid === "string");
  await Promise.all(recipients.map(recipientUid => createPrivateNotification({
    eventId: event.id,
    recipientUid,
    type: `deal_${after.status}`,
    title: "Mise à jour de votre transaction",
    body,
    relatedId: event.params.dealId
  })));
});

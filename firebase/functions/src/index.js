const { onDocumentWritten } = require("firebase-functions/v2/firestore");
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
    companyId: data.ownerUid,
    productName: data.product,
    category: data.category,
    quantity: data.quantity,
    unit: data.unit || "unit",
    unitPrice: data.unitPrice,
    currency: data.currency || "EUR",
    city: data.location || "",
    countryCode: data.countryCode || "FR",
    status: data.status,
    availableUntil: data.availableUntil || null
  };
}

function asRequest(id, data) {
  return {
    $id: id,
    companyId: data.ownerUid,
    productName: data.product,
    category: data.category,
    quantity: data.quantity,
    unit: data.unit || "unit",
    maxUnitPrice: data.maxUnitBudget ?? null,
    currency: data.currency || "EUR",
    city: data.location || "",
    countryCode: data.countryCode || "FR",
    status: "open",
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

async function deactivateStaleMatches(field, value, validRelatedIds, relatedField) {
  const snapshot = await db.collection("matches").where(field, "==", value).get();
  const stale = snapshot.docs.filter(doc => {
    const data = doc.data();
    return data.status === "suggested" && !validRelatedIds.has(data[relatedField]);
  });
  for (let i = 0; i < stale.length; i += 400) {
    const batch = db.batch();
    stale.slice(i, i + 400).forEach(doc => batch.update(doc.ref, {
      status: "stale",
      updatedAt: FieldValue.serverTimestamp()
    }));
    await batch.commit();
  }
  return stale.length;
}

async function createSuggestions(listingDoc, requestDocs) {
  const listing = asListing(listingDoc.id, listingDoc.data());
  let created = 0;
  const validRequestIds = new Set();
  for (const requestDoc of requestDocs) {
    const request = asRequest(requestDoc.id, requestDoc.data());
    const score = matching.scorePair(listing, request);
    if (score === null) continue;
    validRequestIds.add(request.$id);
    const id = crypto.createHash("sha256")
      .update(`${listing.$id}:${request.$id}`)
      .digest("hex");
    const ref = db.collection("matches").doc(id);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      const matchData = {
        listingId: listing.$id,
        requestId: request.$id,
        sellerUid: listing.companyId,
        buyerUid: request.companyId,
        participantUids: [listing.companyId, request.companyId],
        compatibilityScore: score,
        status: "suggested",
        updatedAt: FieldValue.serverTimestamp()
      };
      if (existing.exists) {
        tx.update(ref, matchData);
        return;
      }
      tx.create(ref, { ...matchData, createdAt: FieldValue.serverTimestamp() });
      created += 1;
    });
  }
  const stale = await deactivateStaleMatches("listingId", listing.$id, validRequestIds, "requestId");
  return { created, stale };
}

exports.matchOnSellerWrite = onDocumentWritten("publicOffers/{listingId}", async (event) => {
  if (!event.data?.after?.exists || event.data.after.data().status !== "active") {
    const stale = await deactivateStaleMatches("listingId", event.params.listingId, new Set(), "requestId");
    console.log(JSON.stringify({ event: "seller_inactive", listingId: event.params.listingId, stale }));
    return;
  }
  const requests = await loadByStatus("publicNeeds", "active");
  const result = await createSuggestions(event.data.after, requests);
  console.log(JSON.stringify({ event: "seller_write", listingId: event.params.listingId, scannedRequests: requests.length, ...result }));
});

exports.matchOnBuyerWrite = onDocumentWritten("publicNeeds/{requestId}", async (event) => {
  if (!event.data?.after?.exists || event.data.after.data().status !== "active") {
    const stale = await deactivateStaleMatches("requestId", event.params.requestId, new Set(), "listingId");
    console.log(JSON.stringify({ event: "buyer_inactive", requestId: event.params.requestId, stale }));
    return;
  }
  const listings = await loadByStatus("publicOffers", "active");
  const result = await createSuggestionsFromRequest(listings, event.data.after);
  console.log(JSON.stringify({ event: "buyer_write", requestId: event.params.requestId, scannedListings: listings.length, ...result }));
});

async function createSuggestionsFromRequest(listingDocs, requestDoc) {
  const request = asRequest(requestDoc.id, requestDoc.data());
  let created = 0;
  const validListingIds = new Set();
  for (const listingDoc of listingDocs) {
    const listing = asListing(listingDoc.id, listingDoc.data());
    const score = matching.scorePair(listing, request);
    if (score === null) continue;
    validListingIds.add(listing.$id);
    const id = crypto.createHash("sha256")
      .update(`${listing.$id}:${request.$id}`)
      .digest("hex");
    const ref = db.collection("matches").doc(id);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      const matchData = {
        listingId: listing.$id,
        requestId: request.$id,
        sellerUid: listing.companyId,
        buyerUid: request.companyId,
        participantUids: [listing.companyId, request.companyId],
        compatibilityScore: score,
        status: "suggested",
        updatedAt: FieldValue.serverTimestamp()
      };
      if (existing.exists) {
        tx.update(ref, matchData);
        return;
      }
      tx.create(ref, { ...matchData, createdAt: FieldValue.serverTimestamp() });
      created += 1;
    });
  }
  const stale = await deactivateStaleMatches("requestId", request.$id, validListingIds, "listingId");
  return { created, stale };
}

// Marketplace payments and seller commission workflow
Object.assign(exports, require("./payments.js"));

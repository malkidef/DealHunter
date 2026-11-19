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

exports.matchOnSellerWrite = onDocumentWritten("publicOffers/{listingId}", async (event) => {
  if (!event.data?.after?.exists) return;
  const data = event.data.after.data();
  if (data.status !== "active") return;
  const requests = await loadByStatus("publicNeeds", "active");
  const created = await createSuggestions(event.data.after, requests);
  console.log(JSON.stringify({ event: "seller_write", listingId: event.params.listingId, scannedRequests: requests.length, created }));
});

exports.matchOnBuyerWrite = onDocumentWritten("publicNeeds/{requestId}", async (event) => {
  if (!event.data?.after?.exists) return;
  const data = event.data.after.data();
  if (data.status !== "active") return;
  const listings = await loadByStatus("publicOffers", "active");
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

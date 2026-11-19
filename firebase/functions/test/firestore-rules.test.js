"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, setDoc, addDoc, updateDoc, deleteDoc, collection, getDoc, getDocs, query, where, Timestamp } = require("firebase/firestore");

const projectId = "demo-dealhunter-test";
let env;

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8") }
  });
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "publicOffers/offer-1"), {
      ownerUid: "seller-1", company: "Vendeur SA", product: "Cartons",
      category: "Emballage", quantity: 100, unitPrice: 4,
      location: "Lille", status: "active", createdAt: Timestamp.now()
    });
    await setDoc(doc(db, "publicNeeds/need-1"), {
      ownerUid: "buyer-1", company: "Acheteur SA", product: "Cartons",
      category: "Emballage", quantity: 50, maxUnitBudget: 10,
      location: "Lille", status: "active", createdAt: Timestamp.now()
    });
  });
});

test.after(async () => {
  await env?.cleanup();
});

test("Stripe account identifiers and onboarding flags are server-managed", async () => {
  const userDb = env.authenticatedContext("seller-1").firestore();
  await assertSucceeds(setDoc(doc(userDb, "users/seller-1"), {
    company: { name: "Vendeur SA", country: "FR" }
  }));
  await assertFails(setDoc(doc(userDb, "users/seller-1"), {
    stripeAccountId: "acct_forged"
  }, { merge: true }));
  await assertFails(setDoc(doc(userDb, "users/seller-1"), {
    stripeOnboardingStatus: "complete",
    stripePayoutsEnabled: true,
    stripeChargesEnabled: true
  }, { merge: true }));
  await assertSucceeds(setDoc(doc(userDb, "users/seller-1"), {
    company: { name: "Vendeur SA", country: "BE" }
  }, { merge: true }));
});

function requestData(overrides = {}) {
  return {
    sellerId: "offer-1", buyerId: "need-1",
    sellerUid: "seller-1", buyerUid: "buyer-1",
    participantUids: ["seller-1", "buyer-1"],
    requesterUid: "seller-1", recipientUid: "buyer-1",
    requesterCompany: "Vendeur SA", recipientCompany: "Acheteur SA",
    product: "Cartons", unit: "unit", status: "pending", createdAt: Timestamp.now(),
    ...overrides
  };
}

test("only match participants can read server-generated suggestions", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "matches/match-1"), {
      listingId: "offer-1", requestId: "need-1",
      sellerUid: "seller-1", buyerUid: "buyer-1",
      participantUids: ["seller-1", "buyer-1"],
      compatibilityScore: 95, status: "suggested", createdAt: Timestamp.now()
    });
  });
  const sellerDb = env.authenticatedContext("seller-1").firestore();
  const buyerDb = env.authenticatedContext("buyer-1").firestore();
  const outsiderDb = env.authenticatedContext("outsider").firestore();
  await assertSucceeds(getDoc(doc(sellerDb, "matches/match-1")));
  await assertSucceeds(getDoc(doc(buyerDb, "matches/match-1")));
  await assertFails(getDoc(doc(outsiderDb, "matches/match-1")));
  await assertSucceeds(getDocs(query(collection(sellerDb, "matches"), where("participantUids", "array-contains", "seller-1"))));
  await assertSucceeds(getDocs(query(collection(buyerDb, "matches"), where("participantUids", "array-contains", "buyer-1"))));
  const outsiderMatches = await assertSucceeds(getDocs(query(collection(outsiderDb, "matches"), where("participantUids", "array-contains", "outsider"))));
  assert.equal(outsiderMatches.size, 0);
  await assertFails(setDoc(doc(sellerDb, "matches/forged"), {
    participantUids: ["seller-1"], status: "suggested"
  }));
});

test("allows a request tied to real active listings owned by both parties", async () => {
  const db = env.authenticatedContext("seller-1").firestore();
  await assertSucceeds(addDoc(collection(db, "matchRequests"), requestData()));
});

test("rejects a match request when its measurement unit differs from the listings", async () => {
  const db = env.authenticatedContext("seller-1").firestore();
  await assertFails(addDoc(collection(db, "matchRequests"), requestData({ unit: "kg" })));
});

test("rejects a forged seller identity", async () => {
  const db = env.authenticatedContext("seller-1").firestore();
  await assertFails(addDoc(collection(db, "matchRequests"), requestData({ sellerUid: "attacker" })));
});

test("rejects a forged buyer identity", async () => {
  const db = env.authenticatedContext("seller-1").firestore();
  await assertFails(addDoc(collection(db, "matchRequests"), requestData({ buyerUid: "attacker", participantUids: ["seller-1", "attacker"] })));
});

test("rejects requests using an inactive listing", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "publicNeeds/need-1"), {
      ownerUid: "buyer-1", company: "Acheteur SA", product: "Cartons",
      category: "Emballage", quantity: 50, maxUnitBudget: 10,
      location: "Lille", status: "paused", createdAt: Timestamp.now()
    });
  });
  const db = env.authenticatedContext("seller-1").firestore();
  await assertFails(addDoc(collection(db, "matchRequests"), requestData()));
});

test("deal documents are readable only by participants and immutable from clients", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "deals/deal-1"), {
      requestId: "request-1", sellerUid: "seller-1", buyerUid: "buyer-1",
      participantUids: ["seller-1", "buyer-1"], proposerUid: "seller-1",
      accepterUid: "buyer-1", product: "Cartons", unit: "unit", quantity: 50,
      unitPrice: 4, totalAmount: 200, commissionRate: 5,
      commissionAmount: 10, status: "proposed", paymentStatus: "pending",
      sellerConfirmed: false, buyerConfirmed: false,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    });
  });
  const sellerDb = env.authenticatedContext("seller-1").firestore();
  const buyerDb = env.authenticatedContext("buyer-1").firestore();
  const outsiderDb = env.authenticatedContext("outsider").firestore();
  await assertSucceeds(getDoc(doc(sellerDb, "deals/deal-1")));
  await assertSucceeds(getDoc(doc(buyerDb, "deals/deal-1")));
  await assertFails(getDoc(doc(outsiderDb, "deals/deal-1")));
  const proposal = {
    requestId: "request-1", sellerUid: "seller-1", buyerUid: "buyer-1",
    participantUids: ["seller-1", "buyer-1"], proposerUid: "seller-1",
    accepterUid: "buyer-1", product: "Cartons", unit: "unit", quantity: 50,
    unitPrice: 4, totalAmount: 200, commissionRate: 5,
    commissionAmount: 10, status: "proposed", sellerConfirmed: false,
    buyerConfirmed: false, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
  };
  await assertFails(setDoc(doc(sellerDb, "deals/forged"), proposal));
  await assertFails(updateDoc(doc(buyerDb, "deals/deal-1"), { status: "agreed" }));
  await assertFails(updateDoc(doc(sellerDb, "deals/deal-1"), { sellerConfirmed: true }));
  await assertFails(deleteDoc(doc(sellerDb, "deals/deal-1")));
});

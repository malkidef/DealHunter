"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, setDoc, addDoc, collection, Timestamp } = require("firebase/firestore");

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

function requestData(overrides = {}) {
  return {
    sellerId: "offer-1", buyerId: "need-1",
    sellerUid: "seller-1", buyerUid: "buyer-1",
    participantUids: ["seller-1", "buyer-1"],
    requesterUid: "seller-1", recipientUid: "buyer-1",
    requesterCompany: "Vendeur SA", recipientCompany: "Acheteur SA",
    product: "Cartons", status: "pending", createdAt: Timestamp.now(),
    ...overrides
  };
}

test("allows a request tied to real active listings owned by both parties", async () => {
  const db = env.authenticatedContext("seller-1").firestore();
  await assertSucceeds(addDoc(collection(db, "matchRequests"), requestData()));
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

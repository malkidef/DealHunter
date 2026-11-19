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
    product: "Cartons", unit: "unit", status: "pending", createdAt: Timestamp.now(),
    ...overrides
  };
}

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

test("allows a deal proposal only from a participant of an accepted match", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "matchRequests/request-1"), {
      sellerId: "offer-1", buyerId: "need-1",
      sellerUid: "seller-1", buyerUid: "buyer-1",
      participantUids: ["seller-1", "buyer-1"],
      requesterUid: "seller-1", recipientUid: "buyer-1",
      requesterCompany: "Vendeur SA", recipientCompany: "Acheteur SA",
      product: "Cartons", status: "accepted", createdAt: Timestamp.now()
    });
  });
  const db = env.authenticatedContext("seller-1").firestore();
  await assertSucceeds(setDoc(doc(db, "deals/deal-1"), {
    requestId: "request-1", sellerUid: "seller-1", buyerUid: "buyer-1",
    participantUids: ["seller-1", "buyer-1"], proposerUid: "seller-1",
    accepterUid: "buyer-1", product: "Cartons", unit: "unit", quantity: 50,
    unitPrice: 4, totalAmount: 200, commissionRate: 5,
    commissionAmount: 10, status: "proposed", sellerConfirmed: false,
    buyerConfirmed: false, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
  }));
});

test("rejects a deal proposal with a forged seller or altered commission", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "matchRequests/request-1"), {
      sellerId: "offer-1", buyerId: "need-1",
      sellerUid: "seller-1", buyerUid: "buyer-1",
      participantUids: ["seller-1", "buyer-1"],
      requesterUid: "seller-1", recipientUid: "buyer-1",
      requesterCompany: "Vendeur SA", recipientCompany: "Acheteur SA",
      product: "Cartons", status: "accepted", createdAt: Timestamp.now()
    });
  });
  const db = env.authenticatedContext("seller-1").firestore();
  const base = {
    requestId: "request-1", sellerUid: "seller-1", buyerUid: "buyer-1",
    participantUids: ["seller-1", "buyer-1"], proposerUid: "seller-1",
    accepterUid: "buyer-1", product: "Cartons", unit: "unit", quantity: 50,
    unitPrice: 4, totalAmount: 200, commissionRate: 5,
    commissionAmount: 10, status: "proposed", sellerConfirmed: false,
    buyerConfirmed: false, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
  };
  await assertFails(setDoc(doc(db, "deals/forged"), { ...base, sellerUid: "attacker" }));
  await assertFails(setDoc(doc(db, "deals/wrong-commission-rate"), { ...base, commissionRate: 1 }));
  await assertFails(setDoc(doc(db, "deals/wrong-commission-amount"), { ...base, commissionAmount: 1 }));
  await assertFails(setDoc(doc(db, "deals/inflated-total"), { ...base, totalAmount: 999 }));
  await assertFails(setDoc(doc(db, "deals/over-budget"), { ...base, unitPrice: 11 }));
  await assertFails(setDoc(doc(db, "deals/over-stock"), { ...base, quantity: 101 }));
  await assertFails(setDoc(doc(db, "deals/wrong-product"), { ...base, product: "Ordinateurs" }));
});

test("only the other participant can accept a proposed deal", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "deals/deal-accept"), {
      requestId: "request-1", sellerUid: "seller-1", buyerUid: "buyer-1",
      participantUids: ["seller-1", "buyer-1"], proposerUid: "seller-1",
      accepterUid: "buyer-1", product: "Cartons", unit: "unit", quantity: 50,
      unitPrice: 4, totalAmount: 200, commissionRate: 5,
      commissionAmount: 10, status: "proposed", sellerConfirmed: false,
      buyerConfirmed: false, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
    });
  });
  const sellerDb = env.authenticatedContext("seller-1").firestore();
  const buyerDb = env.authenticatedContext("buyer-1").firestore();
  const { updateDoc } = require("firebase/firestore");
  await assertFails(updateDoc(doc(sellerDb, "deals/deal-accept"), {
    status: "agreed", agreedAt: Timestamp.now(), updatedAt: Timestamp.now()
  }));
  await assertSucceeds(updateDoc(doc(buyerDb, "deals/deal-accept"), {
    status: "agreed", agreedAt: Timestamp.now(), updatedAt: Timestamp.now()
  }));
});

test("requires each participant to confirm their own side before completion", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "deals/deal-confirm"), {
      requestId: "request-1", sellerUid: "seller-1", buyerUid: "buyer-1",
      participantUids: ["seller-1", "buyer-1"], proposerUid: "seller-1",
      accepterUid: "buyer-1", product: "Cartons", unit: "unit", quantity: 50,
      unitPrice: 4, totalAmount: 200, commissionRate: 5,
      commissionAmount: 10, status: "agreed", sellerConfirmed: false,
      buyerConfirmed: false, createdAt: Timestamp.now(),
      agreedAt: Timestamp.now(), updatedAt: Timestamp.now()
    });
  });
  const sellerDb = env.authenticatedContext("seller-1").firestore();
  const buyerDb = env.authenticatedContext("buyer-1").firestore();
  const { updateDoc } = require("firebase/firestore");
  await assertFails(updateDoc(doc(sellerDb, "deals/deal-confirm"), {
    sellerConfirmed: true, sellerConfirmedAt: Timestamp.now(),
    buyerConfirmed: true, buyerConfirmedAt: Timestamp.now(),
    status: "completed", updatedAt: Timestamp.now()
  }));
  await assertSucceeds(updateDoc(doc(sellerDb, "deals/deal-confirm"), {
    sellerConfirmed: true, sellerConfirmedAt: Timestamp.now(),
    status: "agreed", updatedAt: Timestamp.now()
  }));
  await assertSucceeds(updateDoc(doc(buyerDb, "deals/deal-confirm"), {
    buyerConfirmed: true, buyerConfirmedAt: Timestamp.now(),
    status: "completed", updatedAt: Timestamp.now()
  }));
});

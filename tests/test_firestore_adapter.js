const test = require("node:test");
const assert = require("node:assert/strict");
const matching = require("../functions/matching/src/main.js");
const { adaptPublicOffer, adaptPublicNeed } = require("../functions/matching/src/firestore-adapter.js");

const offer = {
  ownerUid: "seller-uid", company: "Entreprise A", product: "Moteurs électriques",
  category: "Machines et équipements industriels", quantity: 500,
  unitPrice: 120, location: "Lille", status: "active"
};
const need = {
  ownerUid: "buyer-uid", company: "Entreprise B", product: "Moteurs électriques",
  category: "Industrie", quantity: 200, maxUnitBudget: 150,
  location: "Lille", status: "active"
};

test("adapte une offre publique vers le schéma canonique", () => {
  const result = adaptPublicOffer("offer-1", offer);
  assert.equal(result.$id, "offer-1");
  assert.equal(result.companyId, "seller-uid");
  assert.equal(result.productName, "Moteurs électriques");
  assert.equal(result.unit, "unit");
  assert.equal(result.currency, "EUR");
  assert.equal(result.city, "Lille");
});

test("adapte une demande publique vers le schéma canonique", () => {
  const result = adaptPublicNeed("need-1", need);
  assert.equal(result.$id, "need-1");
  assert.equal(result.companyId, "buyer-uid");
  assert.equal(result.maxUnitPrice, 150);
  assert.equal(result.status, "open");
});

test("le moteur trouve une correspondance entre les documents publics actuels", () => {
  const listing = adaptPublicOffer("offer-1", offer);
  const request = adaptPublicNeed("need-1", need);
  assert.notEqual(matching.scorePair(listing, request), null);
});

test("rejette les documents sans propriétaire ou produit", () => {
  assert.throws(() => adaptPublicOffer("offer-2", { ...offer, ownerUid: "" }), /ownerUid/);
  assert.throws(() => adaptPublicNeed("need-2", { ...need, product: "" }), /product/);
});

test("rejette une offre inactive et une demande inactive", () => {
  assert.throws(() => adaptPublicOffer("offer-3", { ...offer, status: "draft" }), /active/);
  assert.throws(() => adaptPublicNeed("need-3", { ...need, status: "closed" }), /active/);
});

test("ne rapproche pas une entreprise avec son propre besoin", () => {
  const listing = adaptPublicOffer("offer-4", { ...offer, ownerUid: "same-company" });
  const request = adaptPublicNeed("need-4", { ...need, ownerUid: "same-company" });
  assert.equal(matching.scorePair(listing, request), null);
});

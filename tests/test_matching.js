const test = require("node:test");
const assert = require("node:assert/strict");
const { scorePair, makeCandidates } = require("../functions/matching/src/main.js");

const listing = {
  $id: "stock-1", status: "active", productName: "Cartons emballage",
  category: "Emballage", quantity: 200, unit: "unité", unitPrice: 1.2,
  currency: "EUR", city: "Lille", countryCode: "FR"
};
const request = {
  $id: "need-1", status: "open", productName: "Cartons emballage",
  category: "Emballage", quantity: 100, unit: "unité", maxUnitPrice: 2,
  currency: "EUR", city: "Lille", countryCode: "FR"
};

test("retient une offre compatible et attribue un score", () => {
  assert.equal(scorePair(listing, request), 100);
});
test("rejette une quantité insuffisante", () => {
  assert.equal(scorePair({ ...listing, quantity: 20 }, request), null);
});
test("rejette un prix supérieur au budget", () => {
  assert.equal(scorePair({ ...listing, unitPrice: 3 }, request), null);
});
test("rejette une devise ou une unité différente", () => {
  assert.equal(scorePair({ ...listing, currency: "USD" }, request), null);
  assert.equal(scorePair({ ...listing, unit: "carton" }, request), null);
});
test("rejette une catégorie ou un produit sans mot commun", () => {
  assert.equal(scorePair({ ...listing, category: "Mobilier" }, request), null);
  assert.equal(scorePair({ ...listing, productName: "Chaise bureau" }, request), null);
});
test("ignore les annonces non actives et les demandes fermées", () => {
  assert.equal(scorePair({ ...listing, status: "draft" }, request), null);
  assert.equal(scorePair(listing, { ...request, status: "cancelled" }), null);
});
test("construit les correspondances triées par score", () => {
  const results = makeCandidates([listing, { ...listing, $id: "stock-2", city: "Paris" }], [request]);
  assert.equal(results.length, 2);
  assert.ok(results[0].compatibilityScore >= results[1].compatibilityScore);
});

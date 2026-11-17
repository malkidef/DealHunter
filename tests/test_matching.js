const test = require("node:test");
const assert = require("node:assert/strict");
const { scorePair, makeCandidates, canonicalCategory, canonicalUnit } = require("../functions/matching/src/main.js");

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

test("exclut une entreprise qui publie son propre besoin", () => {
  assert.equal(scorePair({ ...listing, companyId: "company-1" }, { ...request, companyId: "company-1" }), null);
});
test("rejette un stock dont la date de disponibilité est dépassée", () => {
  assert.equal(scorePair({ ...listing, availableUntil: "2000-01-01T00:00:00.000Z" }, request), null);
});
test("rejette un besoin dont la date limite est passée", () => {
  assert.equal(scorePair(listing, { ...request, neededBy: "2000-01-01T00:00:00.000Z" }), null);
});

test("normalise les anciennes catégories et les nouvelles familles sectorielles", () => {
  assert.equal(canonicalCategory("High-tech"), "it");
  assert.equal(canonicalCategory("Informatique et électronique"), "it");
  assert.equal(canonicalCategory("Véhicules et transport"), "vehicles");
  assert.equal(canonicalCategory("Textile et habillement"), "textile");
  assert.equal(canonicalCategory("Alimentation et boissons"), "food");
  assert.equal(canonicalCategory("Machines et équipements industriels"), "industrial");
});
test("accepte les unités équivalentes sans confondre des unités différentes", () => {
  assert.equal(canonicalUnit("pièces"), "unit");
  assert.equal(canonicalUnit("pcs"), "unit");
  assert.equal(canonicalUnit("tonnes"), "t");
  assert.notEqual(canonicalUnit("kg"), canonicalUnit("tonne"));
});
test("rapproche une ancienne catégorie avec son nouveau libellé canonique", () => {
  assert.notEqual(scorePair(
    { ...listing, category: "High-tech", productName: "Ordinateur portable" },
    { ...request, category: "Informatique et électronique", productName: "Ordinateur portable" }
  ), null);
});
test("ne rapproche jamais deux familles sectorielles différentes", () => {
  assert.equal(scorePair(
    { ...listing, category: "Textile et habillement" },
    { ...request, category: "Véhicules et transport" }
  ), null);
});

test("normalise les anciennes et nouvelles catégories", () => {
  assert.equal(canonicalCategory("Informatique et électronique"), "it");
  assert.equal(canonicalCategory("high-tech"), "it");
  assert.equal(canonicalCategory("Véhicules et transport"), "vehicles");
  assert.equal(canonicalCategory("Automobile"), "vehicles");
  assert.equal(canonicalCategory("Machines et équipements industriels"), "industrial");
  assert.equal(canonicalCategory("Construction et matériaux"), "construction");
  assert.equal(canonicalCategory("Mobilier et bureau"), "furniture");
  assert.equal(canonicalCategory("Textile et habillement"), "textile");
  assert.equal(canonicalCategory("Alimentation et boissons"), "food");
  assert.equal(canonicalCategory("Agriculture"), "agri");
  assert.equal(canonicalCategory("Santé et matériel médical"), "medical");
  assert.equal(canonicalCategory("Chimie et consommables"), "chemicals");
  assert.equal(canonicalCategory("Énergie et environnement"), "energy");
  assert.equal(canonicalCategory("Emballage et logistique"), "packaging");
  assert.equal(canonicalCategory("Maison et biens de consommation"), "consumer");
});
test("normalise les unités usuelles", () => {
  assert.equal(canonicalUnit("pièces"), "unit");
  assert.equal(canonicalUnit("pcs"), "unit");
  assert.equal(canonicalUnit("kilogrammes"), "kg");
  assert.equal(canonicalUnit("tonnes"), "t");
  assert.equal(canonicalUnit("litres"), "l");
  assert.equal(canonicalUnit("m²"), "m2");
  assert.equal(canonicalUnit("palettes"), "pallet");
});
test("accepte un stock et un besoin avec alias de catégorie et unité", () => {
  assert.notEqual(scorePair(
    { ...listing, category: "Emballage et logistique", unit: "pièces" },
    { ...request, category: "Emballage", unit: "pcs" }
  ), null);
});

test("rejette les dates de validité mal formées", () => {
  assert.equal(scorePair({ ...listing, availableUntil: "pas-une-date" }, request), null);
  assert.equal(scorePair(listing, { ...request, neededBy: "pas-une-date" }), null);
});
test("rejette les quantités et prix non finis", () => {
  assert.equal(scorePair({ ...listing, quantity: Infinity }, request), null);
  assert.equal(scorePair({ ...listing, unitPrice: Infinity }, request), null);
  assert.equal(scorePair({ ...listing, quantity: NaN }, request), null);
});

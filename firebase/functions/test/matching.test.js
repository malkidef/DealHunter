"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { scorePair } = require("../../../functions/matching/src/main.js");

const listing = {
  $id: "offer-1", companyId: "seller-1", productName: "Cartons industriels",
  category: "Emballage et logistique", quantity: 100, unit: "unit",
  unitPrice: 4, currency: "EUR", city: "Lille", countryCode: "FR", status: "active"
};
const request = {
  $id: "need-1", companyId: "buyer-1", productName: "Cartons industriels",
  category: "Emballage et logistique", quantity: 50, unit: "unit",
  maxUnitPrice: 10, currency: "EUR", city: "Lille", countryCode: "FR", status: "open"
};

test("matches compatible surplus and buyer request", () => {
  assert.equal(scorePair(listing, request), 100);
});

test("rejects insufficient stock", () => {
  assert.equal(scorePair({ ...listing, quantity: 49 }, request), null);
});

test("rejects price above buyer budget", () => {
  assert.equal(scorePair({ ...listing, unitPrice: 11 }, request), null);
});

test("rejects a different category", () => {
  assert.equal(scorePair({ ...listing, category: "Mobilier" }, request), null);
});

test("rejects incompatible units", () => {
  assert.equal(scorePair({ ...listing, unit: "kg" }, request), null);
});

test("rejects the same company on both sides", () => {
  assert.equal(scorePair(listing, { ...request, companyId: listing.companyId }), null);
});

test("rejects inactive offers and non-open needs", () => {
  assert.equal(scorePair({ ...listing, status: "paused" }, request), null);
  assert.equal(scorePair(listing, { ...request, status: "closed" }), null);
});

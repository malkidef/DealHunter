"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreServicePair, makeServiceCandidates } = require("../functions/matching/src/service-matching.js");

const provider = {
  id: "provider-1", ownerUid: "company-a", status: "active",
  title: "Maintenance électrique industrielle",
  description: "Intervention et dépannage sur équipements industriels",
  category: "maintenance électrique", location: "Lille", countryCode: "FR",
  qualifications: ["habilitation électrique", "caces"],
  coverageRadiusKm: 80, remote: false
};
const request = {
  id: "request-1", ownerUid: "company-b", status: "active",
  title: "Dépannage électrique atelier",
  description: "Recherche une entreprise pour maintenance industrielle",
  category: "maintenance électrique", location: "Lille", countryCode: "FR",
  requiredQualifications: ["habilitation électrique"], remoteAccepted: false
};

test("rapproche deux entreprises différentes pour un service compatible", () => {
  const result = scoreServicePair(provider, request);
  assert.ok(result);
  assert.equal(result.providerUid, "company-a");
  assert.equal(result.requesterUid, "company-b");
  assert.equal(result.locationMode, "same_area");
  assert.equal(result.status, "suggested");
  assert.ok(result.compatibilityScore > 0 && result.compatibilityScore <= 100);
});

test("exclut l'auto-matching", () => {
  assert.equal(scoreServicePair(provider, { ...request, ownerUid: provider.ownerUid }), null);
});

test("exclut une zone incompatible hors pays et sans distanciel", () => {
  assert.equal(scoreServicePair(provider, { ...request, location: "Berlin", countryCode: "DE" }), null);
});

test("ne suppose pas une distance compatible à partir du seul pays", () => {
  assert.equal(scoreServicePair(provider, { ...request, location: "Paris" }), null);
});

test("accepte le distanciel uniquement si les deux côtés le permettent", () => {
  const remoteProvider = { ...provider, location: "Lille", remote: true };
  const remoteRequest = { ...request, location: "Berlin", countryCode: "DE", remoteAccepted: true };
  assert.equal(scoreServicePair(remoteProvider, remoteRequest).locationMode, "remote");
  assert.equal(scoreServicePair(remoteProvider, { ...remoteRequest, remoteAccepted: false }), null);
});

test("rejette les qualifications obligatoires absentes", () => {
  assert.equal(scoreServicePair(provider, { ...request, requiredQualifications: ["amiante sous-section 4"] }), null);
});

test("rejette les documents incomplets ou inactifs", () => {
  assert.throws(() => scoreServicePair({ ...provider, ownerUid: "" }, request), /ownerUid/);
  assert.throws(() => scoreServicePair(provider, { ...request, status: "closed" }), /non actif/);
});

test("classe les résultats par score décroissant", () => {
  const broader = { ...provider, id: "provider-2", ownerUid: "company-c", category: "maintenance" };
  const results = makeServiceCandidates([broader, provider], [request]);
  assert.equal(results.length, 2);
  assert.ok(results[0].compatibilityScore >= results[1].compatibilityScore);
});

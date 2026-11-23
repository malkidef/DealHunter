/**
 * DealHunter — matching services B2B.
 *
 * Pure module: no network, no personal data, no contact or transaction.
 * Employment / worker recruitment is intentionally excluded; it needs a
 * separate consent and legal workflow from commercial service procurement.
 */
"use strict";

const normalize = (value) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const words = (value) => new Set(normalize(value).split(/\s+/).filter((word) => word.length > 2));
const list = (value) => Array.isArray(value) ? value.map(normalize).filter(Boolean) : [];

function validRecord(record, label) {
  if (!record || typeof record !== "object") throw new TypeError(label + " invalide.");
  for (const field of ["id", "ownerUid", "category", "location", "countryCode"]) {
    if (typeof record[field] !== "string" || !record[field].trim()) {
      throw new TypeError(label + " : champ obligatoire " + field + ".");
    }
  }
  if (record.status !== "active") throw new TypeError(label + " non actif.");
  return record;
}

function overlap(left, right) {
  const a = list(left), b = new Set(list(right));
  if (!a.length || !b.size) return 0;
  return a.filter((item) => b.has(item)).length / Math.max(a.length, b.size);
}

function textSimilarity(left, right) {
  const a = words(left), b = words(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const word of a) if (b.has(word)) common++;
  return common / new Set([...a, ...b]).size;
}

function scoreServicePair(provider, request) {
  validRecord(provider, "Offre de service");
  validRecord(request, "Demande de service");
  if (provider.ownerUid === request.ownerUid) return null;

  const remote = provider.remote === true && request.remoteAccepted === true;
  const sameCountry = normalize(provider.countryCode) === normalize(request.countryCode);
  const sameArea = normalize(provider.location) === normalize(request.location);
  const coverage = Number(provider.coverageRadiusKm);
  const locationCompatible = remote || sameArea || (sameCountry && Number.isFinite(coverage) && coverage > 0);
  if (!locationCompatible) return null;

  const categoryMatch = normalize(provider.category) === normalize(request.category);
  const categorySimilarity = textSimilarity(provider.category, request.category);
  if (!categoryMatch && categorySimilarity < 0.34) return null;

  const required = list(request.requiredQualifications);
  const offered = new Set(list(provider.qualifications));
  const missingQualifications = required.filter((item) => !offered.has(item));
  if (missingQualifications.length) return null;

  const categoryScore = categoryMatch ? 45 : Math.round(categorySimilarity * 35);
  const locationScore = remote ? 20 : sameArea ? 20 : sameCountry ? 12 : 0;
  const descriptionScore = Math.round(textSimilarity(
    [provider.title, provider.description].filter(Boolean).join(" "),
    [request.title, request.description].filter(Boolean).join(" ")
  ) * 20);
  const qualificationScore = required.length ? 10 : 5;
  const availabilityScore = !request.requiredDate || !provider.availableUntil ||
    Date.parse(provider.availableUntil) >= Date.parse(request.requiredDate) ? 5 : 0;
  const score = Math.min(100, categoryScore + locationScore + descriptionScore + qualificationScore + availabilityScore);

  return {
    providerId: provider.id,
    requestId: request.id,
    providerUid: provider.ownerUid,
    requesterUid: request.ownerUid,
    category: provider.category,
    service: provider.title || request.title || provider.category,
    compatibilityScore: score,
    locationMode: remote ? "remote" : sameArea ? "same_area" : "same_country",
    missingQualifications: [],
    status: "suggested"
  };
}

function makeServiceCandidates(providers, requests) {
  if (!Array.isArray(providers) || !Array.isArray(requests)) {
    throw new TypeError("Les offres et demandes doivent être des tableaux.");
  }
  const results = [];
  for (const provider of providers) {
    for (const request of requests) {
      const candidate = scoreServicePair(provider, request);
      if (candidate) results.push(candidate);
    }
  }
  return results.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}

module.exports = { scoreServicePair, makeServiceCandidates, normalize };

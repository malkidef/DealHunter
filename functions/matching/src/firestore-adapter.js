/**
 * DealHunter — bridge between the current public Firestore schema and the
 * canonical matching engine schema.
 *
 * Current publicOffers/publicNeeds documents are intentionally kept backward
 * compatible. Missing unit/currency/country fields use explicit legacy
 * defaults; these defaults must be removed when the public schema is migrated.
 */
function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`Document Firestore invalide : ${field} doit être une chaîne non vide.`);
  }
  return value.trim();
}

function positiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new TypeError(`Document Firestore invalide : ${field} doit être un nombre positif.`);
  }
  return number;
}

function adaptPublicOffer(id, data) {
  if (!data || data.status !== "active") {
    throw new TypeError("Une offre active est requise.");
  }
  return {
    $id: requiredString(id, "id"),
    companyId: requiredString(data.ownerUid, "ownerUid"),
    company: requiredString(data.company, "company"),
    productName: requiredString(data.product, "product"),
    category: requiredString(data.category, "category"),
    quantity: positiveNumber(data.quantity, "quantity"),
    unit: typeof data.unit === "string" && data.unit.trim() ? data.unit.trim() : "unit",
    unitPrice: Number(data.unitPrice),
    currency: typeof data.currency === "string" && data.currency.trim() ? data.currency.trim().toUpperCase() : "EUR",
    city: requiredString(data.location, "location"),
    countryCode: typeof data.countryCode === "string" && data.countryCode.trim() ? data.countryCode.trim().toUpperCase() : "FR",
    status: "active",
    availableUntil: data.availableUntil || null
  };
}

function adaptPublicNeed(id, data) {
  if (!data || data.status !== "active") {
    throw new TypeError("Une demande active est requise.");
  }
  return {
    $id: requiredString(id, "id"),
    companyId: requiredString(data.ownerUid, "ownerUid"),
    company: requiredString(data.company, "company"),
    productName: requiredString(data.product, "product"),
    category: requiredString(data.category, "category"),
    quantity: positiveNumber(data.quantity, "quantity"),
    unit: typeof data.unit === "string" && data.unit.trim() ? data.unit.trim() : "unit",
    maxUnitPrice: data.maxUnitBudget == null || data.maxUnitBudget === "" ? null : Number(data.maxUnitBudget),
    currency: typeof data.currency === "string" && data.currency.trim() ? data.currency.trim().toUpperCase() : "EUR",
    city: requiredString(data.location, "location"),
    countryCode: typeof data.countryCode === "string" && data.countryCode.trim() ? data.countryCode.trim().toUpperCase() : "FR",
    status: "open",
    neededBy: data.neededBy || null
  };
}

module.exports = { adaptPublicOffer, adaptPublicNeed };

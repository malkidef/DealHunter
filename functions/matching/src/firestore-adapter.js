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

function validateCurrency(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new TypeError("Document Firestore invalide : currency doit être un code ISO 4217 à trois lettres.");
  return code;
}
function validateCountry(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new TypeError("Document Firestore invalide : countryCode doit être un code ISO 3166-1 alpha-2.");
  return code;
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
    unitPrice: positiveNumber(data.unitPrice, "unitPrice"),
    currency: validateCurrency(data.currency || "EUR"),
    city: requiredString(data.location, "location"),
    countryCode: validateCountry(data.countryCode || "FR"),
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
    maxUnitPrice: data.maxUnitBudget == null || data.maxUnitBudget === "" ? null : positiveNumber(data.maxUnitBudget, "maxUnitBudget"),
    currency: validateCurrency(data.currency || "EUR"),
    city: requiredString(data.location, "location"),
    countryCode: validateCountry(data.countryCode || "FR"),
    status: "open",
    neededBy: data.neededBy || null
  };
}

module.exports = { adaptPublicOffer, adaptPublicNeed };

/**
 * DealHunter — Appwrite server-side matching function.
 * Only this trusted function writes match documents; never expose the API key
 * to the browser. Configure the environment variables documented in README.
 */
const REQUIRED = [
  "APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_API_KEY",
  "APPWRITE_DATABASE_ID", "APPWRITE_LISTINGS_COLLECTION_ID",
  "APPWRITE_REQUESTS_COLLECTION_ID", "APPWRITE_MATCHES_COLLECTION_ID"
];

const text = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const tokens = (v) => [...new Set(text(v).split(/[^a-z0-9]+/).filter((w) => w.length > 2))];

// Canonical sector IDs keep old records compatible while allowing broader labels.
const CATEGORY_ALIASES = new Map([
  ["high-tech", "it"], ["informatique", "it"], ["informatique et electronique", "it"],
  ["electronique", "it"], ["electronics", "it"], ["it", "it"],
  ["auto", "vehicles"], ["automobile", "vehicles"], ["vehicules", "vehicles"],
  ["vehicules et transport", "vehicles"], ["transport", "vehicles"],
  ["industrie", "industrial"], ["machines", "industrial"],
  ["machines et equipements industriels", "industrial"], ["materiel industriel", "industrial"],
  ["materiaux", "construction"], ["construction", "construction"],
  ["construction et materiaux", "construction"], ["batiment", "construction"],
  ["mobilier", "furniture"], ["maison", "consumer"], ["mobilier et bureau", "furniture"],
  ["mode", "textile"], ["textile", "textile"], ["textile et habillement", "textile"],
  ["alimentaire", "food"], ["alimentation", "food"], ["alimentation et boissons", "food"],
  ["agriculture", "agri"], ["agricole", "agri"],
  ["sante", "medical"], ["medical", "medical"], ["materiel medical", "medical"],
  ["chimie", "chemicals"], ["chimie et consommables", "chemicals"],
  ["energie", "energy"], ["energie et environnement", "energy"],
  ["emballage", "packaging"], ["logistique", "packaging"], ["emballage et logistique", "packaging"],
  ["autre", "other"], ["autres", "other"], ["autre / a classer", "other"]
]);
const canonicalCategory = (value) => {
  const key = text(value).replace(/\\s+/g, " ");
  return CATEGORY_ALIASES.get(key) || key;
};
const UNIT_ALIASES = new Map([
  ["piece", "unit"], ["pieces", "unit"], ["unite", "unit"], ["unites", "unit"],
  ["unit", "unit"], ["units", "unit"], ["pcs", "unit"], ["pc", "unit"],
  ["kg", "kg"], ["kilogramme", "kg"], ["kilogrammes", "kg"],
  ["tonne", "t"], ["tonnes", "t"], ["metric ton", "t"], ["t", "t"],
  ["litre", "l"], ["litres", "l"], ["liter", "l"], ["liters", "l"], ["l", "l"],
  ["metre", "m"], ["metres", "m"], ["meter", "m"], ["meters", "m"], ["m", "m"],
  ["m2", "m2"], ["m²", "m2"], ["m3", "m3"], ["m³", "m3"],
  ["carton", "carton"], ["cartons", "carton"], ["palette", "pallet"], ["palettes", "pallet"], ["pallet", "pallet"], ["pallets", "pallet"]
]);
const canonicalUnit = (value) => UNIT_ALIASES.get(text(value)) || text(value);

function scorePair(listing, request) {
  if (!listing || !request) return null;
  if (text(listing.status) !== "active" || text(request.status) !== "open") return null;
  if (listing.companyId && request.companyId && listing.companyId === request.companyId) return null;
  const now = Date.now();
  if (listing.availableUntil && Date.parse(listing.availableUntil) <= now) return null;
  if (request.neededBy && Date.parse(request.neededBy) < now) return null;
  if (!canonicalCategory(listing.category) || canonicalCategory(listing.category) !== canonicalCategory(request.category)) return null;
  if (!canonicalUnit(listing.unit) || canonicalUnit(listing.unit) !== canonicalUnit(request.unit)) return null;
  if (text(listing.currency || "EUR").toUpperCase() !== text(request.currency || "EUR").toUpperCase()) return null;

  const available = Number(listing.quantity);
  const wanted = Number(request.quantity);
  const price = Number(listing.unitPrice);
  const budget = request.maxUnitPrice == null || request.maxUnitPrice === "" ? null : Number(request.maxUnitPrice);
  if (!(available > 0) || !(wanted > 0) || available < wanted || !(price >= 0)) return null;
  if (budget !== null && (!Number.isFinite(budget) || price > budget)) return null;

  const listingWords = tokens(listing.productName);
  const requestWords = tokens(request.productName);
  if (!listingWords.length || !requestWords.length) return null;
  const overlap = listingWords.filter((word) => requestWords.includes(word)).length;
  const productRatio = overlap / Math.max(listingWords.length, requestWords.length);
  if (overlap === 0) return null;

  let score = 25 + Math.round(productRatio * 45) + 15; // category, product, sufficient quantity
  if (budget !== null) score += 10;
  const sameCity = text(listing.city) && text(listing.city) === text(request.city);
  const sameCountry = text(listing.countryCode || "FR") === text(request.countryCode || "FR");
  if (sameCity) score += 5;
  else if (sameCountry) score += 3;
  return Math.min(100, score);
}

function makeCandidates(listings, requests) {
  const out = [];
  for (const listing of listings) {
    for (const request of requests) {
      const compatibilityScore = scorePair(listing, request);
      if (compatibilityScore !== null) {
        out.push({ listingId: listing.$id, requestId: request.$id, compatibilityScore });
      }
    }
  }
  return out.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}

function queryParam(method, attribute, values) {
  return JSON.stringify({ method, attribute, values: Array.isArray(values) ? values : [values] });
}

async function appwriteRequest(path, { method = "GET", body, queries = [] } = {}) {
  const url = new URL(path, process.env.APPWRITE_ENDPOINT.replace(/\/$/, "") + "/v1/");
  for (const query of queries) url.searchParams.append("queries[]", query);
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": process.env.APPWRITE_PROJECT_ID,
      "X-Appwrite-Key": process.env.APPWRITE_API_KEY
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error("Réponse Appwrite non JSON."); }
  if (!response.ok) {
    const err = new Error(`Appwrite HTTP ${response.status}: ${data.message || "erreur inconnue"}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function listDocuments(collectionId, status) {
  const { APPWRITE_DATABASE_ID } = process.env;
  const path = `databases/${encodeURIComponent(APPWRITE_DATABASE_ID)}/collections/${encodeURIComponent(collectionId)}/documents`;
  const documents = [];
  const pageSize = 100;
  const safetyCap = 10000;
  for (let offset = 0; offset < safetyCap; offset += pageSize) {
    const result = await appwriteRequest(path, {
      queries: [
        queryParam("equal", "status", status),
        JSON.stringify({ method: "limit", values: [pageSize] }),
        JSON.stringify({ method: "offset", values: [offset] })
      ]
    });
    const page = Array.isArray(result.documents) ? result.documents : [];
    documents.push(...page);
    if (page.length < pageSize) return documents;
  }
  throw new Error(`Limite de sécurité atteinte : plus de ${safetyCap} documents pour le statut ${status}. Augmenter le traitement par lots avant de continuer.`);
}

async function createMatch(candidate) {
  const { APPWRITE_DATABASE_ID, APPWRITE_MATCHES_COLLECTION_ID } = process.env;
  const base = `databases/${encodeURIComponent(APPWRITE_DATABASE_ID)}/collections/${encodeURIComponent(APPWRITE_MATCHES_COLLECTION_ID)}/documents`;
  const duplicate = await appwriteRequest(base, {
    queries: [
      queryParam("equal", "listingId", candidate.listingId),
      queryParam("equal", "requestId", candidate.requestId),
      JSON.stringify({ method: "limit", values: [1] })
    ]
  });
  if (duplicate.total > 0) return "existing";
  try {
    await appwriteRequest(base, {
      method: "POST",
      body: {
        documentId: "unique()",
        data: {
          listingId: candidate.listingId,
          requestId: candidate.requestId,
          compatibilityScore: candidate.compatibilityScore,
          status: "suggested",
          createdAt: new Date().toISOString()
        },
        permissions: []
      }
    });
    return "created";
  } catch (err) {
    if (err.status === 409) return "existing"; // Unique index: concurrent run already inserted it.
    throw err;
  }
}

async function handler({ req, res, log = () => {}, error = () => {} }) {
  try {
    const missing = REQUIRED.filter((key) => !process.env[key]);
    if (missing.length) return res.json({ ok: false, error: "Configuration Appwrite incomplète.", missing }, 500);
    const [listings, requests] = await Promise.all([
      listDocuments(process.env.APPWRITE_LISTINGS_COLLECTION_ID, "active"),
      listDocuments(process.env.APPWRITE_REQUESTS_COLLECTION_ID, "open")
    ]);
    const candidates = makeCandidates(listings, requests);
    let created = 0;
    let existing = 0;
    for (const candidate of candidates) {
      const result = await createMatch(candidate);
      if (result === "created") created += 1;
      else existing += 1;
    }
    const summary = { ok: true, activeListings: listings.length, openRequests: requests.length, candidates: candidates.length, created, existing };
    log(JSON.stringify(summary));
    return res.json(summary);
  } catch (err) {
    error(err?.stack || String(err));
    return res.json({ ok: false, error: err?.message || "Erreur de matching." }, 500);
  }
}

handler.scorePair = scorePair;
handler.canonicalCategory = canonicalCategory;
handler.canonicalUnit = canonicalUnit;
handler.makeCandidates = makeCandidates;
module.exports = handler;

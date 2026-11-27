"use strict";

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function encodeValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Nombre non fini non sérialisable");
    return value;
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new TypeError("Type JavaScript non pris en charge");
  }
  if (seen.has(value)) throw new TypeError("Référence circulaire détectée");

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError("Date invalide");
    return { __firestoreType: "Date", value: value.toISOString() };
  }

  const name = value?.constructor?.name;
  if (name === "Timestamp" && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) {
    return { __firestoreType: "Timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (name === "GeoPoint" && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)) {
    return { __firestoreType: "GeoPoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (name === "DocumentReference" && typeof value.path === "string" && value.path.length > 0) {
    return { __firestoreType: "DocumentReference", path: value.path };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { __firestoreType: "Bytes", base64: Buffer.from(value).toString("base64") };
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => encodeValue(item, seen));
    if (!isPlainObject(value)) throw new TypeError("Objet Firestore ou JavaScript non pris en charge: " + (name || "inconnu"));
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = encodeValue(value[key], seen);
    return result;
  } finally {
    seen.delete(value);
  }
}

function encodeDocument(document) {
  if (!document || typeof document.path !== "string" || !document.path.trim()) {
    throw new TypeError("Chemin de document manquant");
  }
  if (!isPlainObject(document.data)) throw new TypeError("Les données du document doivent être un objet");
  return { path: document.path, data: encodeValue(document.data) };
}

function encodeJsonl(documents) {
  if (!Array.isArray(documents)) throw new TypeError("La liste des documents doit être un tableau");
  const paths = new Set();
  const lines = documents.map(document => {
    const encoded = encodeDocument(document);
    if (paths.has(encoded.path)) throw new TypeError("Chemin de document en doublon: " + encoded.path);
    paths.add(encoded.path);
    return JSON.stringify(encoded);
  });
  return lines.length ? lines.join("\n") + "\n" : "";
}

module.exports = { encodeValue, encodeDocument, encodeJsonl };

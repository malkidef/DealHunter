"use strict";

const crypto = require("node:crypto");

function sha256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function createManifest({ projectId, startedAt, finishedAt, collections, jsonl }) {
  if (typeof projectId !== "string" || !projectId.trim()) throw new TypeError("projectId obligatoire");
  if (typeof jsonl !== "string") throw new TypeError("jsonl doit être une chaîne");
  const start = Date.parse(startedAt);
  const finish = Date.parse(finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) {
    throw new TypeError("Fenêtre temporelle de sauvegarde invalide");
  }
  if (!Array.isArray(collections) || collections.length === 0) {
    throw new TypeError("Inventaire des collections obligatoire");
  }

  const seen = new Set();
  let totalDocuments = 0;
  let complete = true;
  const normalized = collections.map(item => {
    if (!item || typeof item.path !== "string" || !item.path.trim()) {
      throw new TypeError("Chemin de collection invalide");
    }
    if (seen.has(item.path)) throw new TypeError("Collection en doublon: " + item.path);
    seen.add(item.path);
    if (!Number.isInteger(item.documentCount) || item.documentCount < 0) {
      throw new TypeError("Nombre de documents invalide pour " + item.path);
    }
    if (!["complete", "partial", "error"].includes(item.status)) {
      throw new TypeError("Statut invalide pour " + item.path);
    }
    const errors = Array.isArray(item.errors) ? item.errors.map(String) : [];
    if (item.status !== "complete" || errors.length > 0) complete = false;
    totalDocuments += item.documentCount;
    return {
      path: item.path,
      documentCount: item.documentCount,
      status: item.status === "complete" && errors.length > 0 ? "partial" : item.status,
      errors
    };
  });

  return {
    formatVersion: 1,
    backupType: "logical-non-atomic",
    projectId,
    startedAt: new Date(start).toISOString(),
    finishedAt: new Date(finish).toISOString(),
    consistency: "non-transactional; documents may reflect different read times",
    status: complete ? "complete" : "partial",
    totalDocuments,
    collections: normalized,
    data: {
      encoding: "utf-8-jsonl",
      sha256: sha256(jsonl),
      byteLength: Buffer.byteLength(jsonl, "utf8")
    }
  };
}

module.exports = { sha256, createManifest };

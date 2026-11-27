"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { encodeValue, encodeDocument, encodeJsonl } = require("../scripts/firestore-backup/serializer.js");

class Timestamp { constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; } }
class GeoPoint { constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; } }
class DocumentReference { constructor(path) { this.path = path; } }

test("préserve les types Firestore et les octets avec des marqueurs explicites", () => {
  const result = encodeValue({
    timestamp: new Timestamp(123, 456),
    point: new GeoPoint(48.85, 2.35),
    ref: new DocumentReference("users/u1"),
    bytes: Buffer.from([0, 1, 255]),
    date: new Date("2026-11-27T12:00:00.000Z"),
    nested: [null, { enabled: true }]
  });
  assert.deepEqual(result.timestamp, { __firestoreType: "Timestamp", seconds: 123, nanoseconds: 456 });
  assert.deepEqual(result.point, { __firestoreType: "GeoPoint", latitude: 48.85, longitude: 2.35 });
  assert.deepEqual(result.ref, { __firestoreType: "DocumentReference", path: "users/u1" });
  assert.deepEqual(result.bytes, { __firestoreType: "Bytes", base64: "AAH/" });
  assert.deepEqual(result.date, { __firestoreType: "Date", value: "2026-11-27T12:00:00.000Z" });
  assert.deepEqual(result.nested, [null, { enabled: true }]);
});

test("produit un JSONL stable et refuse les chemins dupliqués", () => {
  const records = [
    { path: "offers/o1", data: { z: 1, a: "x" } },
    { path: "needs/n1", data: { active: true } }
  ];
  assert.equal(encodeJsonl(records), '{"path":"offers/o1","data":{"a":"x","z":1}}\n{"path":"needs/n1","data":{"active":true}}\n');
  assert.throws(() => encodeJsonl([records[0], records[0]]), /doublon/);
});

test("refuse les valeurs non finies, cycles, dates invalides et prototypes inconnus", () => {
  assert.throws(() => encodeValue(Number.NaN), /non fini/);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => encodeValue(cyclic), /circulaire/);
  assert.throws(() => encodeValue(new Date("invalid")), /Date invalide/);
  assert.throws(() => encodeValue(new Map()), /non pris en charge/);
  assert.throws(() => encodeValue(undefined), /non pris en charge/);
});

test("refuse les collisions avec les marqueurs internes et les propriétés à effet de bord", () => {
  assert.throws(() => encodeValue({ nested: { __firestoreType: "Timestamp", seconds: 1 } }), /Clé réservée/);
  const withProtoKey = JSON.parse('{"__proto__":{"polluted":true},"safe":1}');
  const encoded = encodeValue(withProtoKey);
  assert.equal(Object.prototype.hasOwnProperty.call(encoded, "__proto__"), true);
  assert.equal(encoded.__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
  const withGetter = {};
  Object.defineProperty(withGetter, "secret", { enumerable: true, get() { throw new Error("getter executed"); } });
  assert.throws(() => encodeValue(withGetter), /Accesseur/);
  const withSymbol = { value: 1, [Symbol("hidden")]: 2 };
  assert.throws(() => encodeValue(withSymbol), /Symbol/);
});

test("valide le chemin et la structure des documents", () => {
  assert.throws(() => encodeDocument({ path: "", data: {} }), /Chemin/);
  assert.throws(() => encodeDocument({ path: "offers/o1", data: [] }), /objet/);
});

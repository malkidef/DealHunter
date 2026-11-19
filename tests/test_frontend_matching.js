const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

// Test the exact matching functions used by the Firebase-backed web interface.
// This runs only in memory: it does not connect to Firebase or change any data.
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("const norm=");
const end = html.indexOf("function card(", start);
assert.notEqual(start, -1, "normalisation function must exist in index.html");
assert.notEqual(end, -1, "matching functions must be extractable from index.html");

const sandbox = { sellers: [], buyers: [] };
vm.runInNewContext(
  html.slice(start, end) + "\nglobalThis.__matching = { norm, canonicalCategory, score, matches };",
  sandbox
);
const { score, matches, canonicalCategory } = sandbox.__matching;

const seller = {
  company: "Test Vendeur", product: "Cartons industriels",
  category: "Emballage et logistique", qty: 100, price: 4,
  location: "Lille", ownerUid: "seller-1"
};
const buyer = {
  company: "Test Acheteur", product: "Cartons industriels",
  category: "Emballage et logistique", qty: 50, budget: 10,
  location: "Lille", ownerUid: "buyer-1"
};

test("retient le cas de référence vendeur/acheteur", () => {
  assert.equal(score(seller, buyer), 100);
});

test("rejette un prix vendeur supérieur au budget unitaire", () => {
  assert.equal(score({ ...seller, price: 11 }, buyer), 0);
});

test("rejette une quantité disponible insuffisante", () => {
  assert.equal(score({ ...seller, qty: 49 }, buyer), 0);
});

test("rejette une localisation différente", () => {
  assert.equal(score(seller, { ...buyer, location: "Paris" }), 0);
});

test("rejette une catégorie différente", () => {
  assert.equal(score(seller, { ...buyer, category: "Mobilier et bureau" }), 0);
});

test("rejette un produit sans mots communs", () => {
  assert.equal(score(seller, { ...buyer, product: "Chaises de bureau" }), 0);
});

test("accepte un nom de produit suffisamment proche", () => {
  assert.equal(score({ ...seller, product: "Cartons emballage industriel" }, buyer), 90);
});

test("exclut les annonces appartenant à la même entreprise", () => {
  assert.equal(score(seller, { ...buyer, ownerUid: seller.ownerUid }), 0);
});

test("classe plusieurs combinaisons par score sans toucher aux données réelles", () => {
  sandbox.sellers = [
    seller,
    { ...seller, product: "Cartons emballage industriel", ownerUid: "seller-2" },
    { ...seller, location: "Paris", ownerUid: "seller-3" }
  ];
  sandbox.buyers = [buyer];
  const results = matches();
  assert.equal(results.length, 2);
  assert.ok(results[0].score >= results[1].score);
});

test("normalise les accents dans les libellés", () => {
  assert.equal(canonicalCategory("Informatique et électronique"), "Informatique et électronique");
});

test("n'autorise la redirection de paiement que vers Stripe Checkout officiel", () => {
  const auth = fs.readFileSync(path.join(__dirname, "..", "auth.js"), "utf8");
  assert.match(auth, /checkoutUrl\.protocol !== "https:"/);
  assert.match(auth, /checkoutUrl\.hostname !== "checkout\.stripe\.com"/);
  assert.match(auth, /checkoutUrl\.username \|\| checkoutUrl\.password/);
  assert.match(auth, /window\.location\.assign\(checkoutUrl\.href\)/);
  assert.doesNotMatch(auth, /window\.location\.assign\(url\)/);
});

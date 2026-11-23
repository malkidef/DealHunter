const test=require("node:test");
const assert=require("node:assert/strict");
const {normalize,similarity,findPotentialDuplicates}=require("../functions/matching/src/listing-dedupe.js");

test("normalise accents, casse et ponctuation",()=>{
  assert.equal(normalize("Câbles Électriques — 100 m"),"cables electriques 100 m");
});
test("calcule une similarité de tokens",()=>{
  assert.ok(similarity("cable cuivre 100m","câble cuivre 100 m")>=0.8);
  assert.equal(similarity("cable cuivre","ordinateur portable"),0);
});
test("signale les titres proches dans la même catégorie et le même pays",()=>{
  const records=[
    {id:"a",ownerUid:"seller-a",product:"Câble cuivre 100 m",category:"Câbles",location:"Paris"},
    {id:"b",ownerUid:"seller-b",product:"Cable cuivre 100m",category:"Cables",location:"Paris"},
    {id:"c",ownerUid:"seller-c",product:"Ordinateur portable",category:"Informatique",location:"Paris"},
    {id:"d",ownerUid:"seller-d",product:"Câble cuivre 100m",category:"Câbles",location:"Berlin"}
  ];
  const pairs=findPotentialDuplicates(records);
  assert.equal(pairs.length,1);
  assert.equal(pairs[0].firstId,"a");
  assert.equal(pairs[0].secondId,"b");
  assert.ok(pairs[0].score>=0.8);
});
test("ne signale pas les documents identiques ou les fiches sans contexte suffisant",()=>{
  assert.deepEqual(findPotentialDuplicates([{id:"a",product:"x"},{id:"a",product:"x"}]),[]);
});

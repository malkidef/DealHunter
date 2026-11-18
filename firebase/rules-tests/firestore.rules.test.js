import fs from "node:fs";
import { before, beforeEach, after, describe, it } from "mocha";
import { strict as assert } from "node:assert";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc
} from "firebase/firestore";

const projectId = process.env.GCLOUD_PROJECT || "demo-dealhunter";
const rules = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
let testEnv;

const requestData = (requesterUid, recipientUid, status = "pending") => ({
  requesterUid,
  recipientUid,
  participantUids: [requesterUid, recipientUid],
  sellerUid: requesterUid,
  buyerUid: recipientUid,
  status
});

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: "127.0.0.1", port: 8080 }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

describe("Règles Firestore DealHunter — schéma actuellement utilisé", () => {
  it("refuse l'accès anonyme aux profils et aux catalogues", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "users", "alice")));
    await assertFails(getDocs(collection(db, "publicOffers")));
    await assertFails(getDocs(collection(db, "publicNeeds")));
  });

  it("autorise un utilisateur à gérer son profil et ses annonces privées", async () => {
    const db = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(db, "users", "alice"), { displayName: "Alice" }));
    await assertSucceeds(setDoc(doc(db, "users/alice/sellerOffers", "offer-1"), { product: "Cartons" }));
    await assertSucceeds(setDoc(doc(db, "users/alice/buyerNeeds", "need-1"), { product: "Palettes" }));
  });

  it("interdit à un utilisateur de lire ou modifier le profil privé d'un autre", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), "users", "bob"), { displayName: "Bob" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "users", "bob")));
    await assertFails(setDoc(doc(alice, "users", "bob"), { displayName: "Usurpation" }));
  });

  it("autorise la lecture connectée des catalogues et réserve l'écriture au propriétaire", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertSucceeds(setDoc(doc(alice, "publicOffers", "offer-1"), { ownerUid: "alice", product: "Cartons" }));
    await assertSucceeds(getDoc(doc(bob, "publicOffers", "offer-1")));
    await assertFails(setDoc(doc(bob, "publicOffers", "offer-1"), { ownerUid: "bob", product: "Modifié" }));
    await assertFails(setDoc(doc(bob, "publicNeeds", "need-1"), { ownerUid: "alice", product: "Besoin" }));
  });

  it("autorise une demande valide et refuse l'usurpation du demandeur", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(alice, "matchRequests", "request-1"), requestData("alice", "bob")));
    await assertFails(setDoc(doc(alice, "matchRequests", "request-2"), requestData("bob", "alice")));
  });

  it("réserve la décision au destinataire et protège les participants", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), "matchRequests", "request-1"), requestData("alice", "bob"));
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(updateDoc(doc(alice, "matchRequests", "request-1"), { status: "accepted" }));
    await assertSucceeds(updateDoc(doc(bob, "matchRequests", "request-1"), { status: "accepted" }));
    await assertFails(updateDoc(doc(bob, "matchRequests", "request-1"), {
      status: "rejected",
      participantUids: ["bob"]
    }));
  });

  it("autorise les messages uniquement aux participants après acceptation", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), "matchRequests", "accepted-1"), requestData("alice", "bob", "accepted"));
      await setDoc(doc(context.firestore(), "matchRequests", "pending-1"), requestData("alice", "bob", "pending"));
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const outsider = testEnv.authenticatedContext("charlie").firestore();
    await assertSucceeds(addDoc(collection(alice, "matchMessages"), {
      requestId: "accepted-1", senderUid: "alice", text: "Bonjour"
    }));
    await assertFails(addDoc(collection(alice, "matchMessages"), {
      requestId: "pending-1", senderUid: "alice", text: "Trop tôt"
    }));
    await assertFails(addDoc(collection(outsider, "matchMessages"), {
      requestId: "accepted-1", senderUid: "charlie", text: "Intrus"
    }));
  });

  it("autorise le partage des coordonnées seulement après acceptation", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), "matchRequests", "accepted-1"), requestData("alice", "bob", "accepted"));
      await setDoc(doc(context.firestore(), "matchRequests", "pending-1"), requestData("alice", "bob", "pending"));
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertSucceeds(setDoc(doc(alice, "matchContacts", "accepted-1_alice"), {
      requestId: "accepted-1", ownerUid: "alice", email: "alice@example.test", phone: "0102030405"
    }));
    await assertSucceeds(getDoc(doc(bob, "matchContacts", "accepted-1_alice")));
    await assertFails(setDoc(doc(alice, "matchContacts", "pending-1_alice"), {
      requestId: "pending-1", ownerUid: "alice", email: "alice@example.test", phone: "0102030405"
    }));
    await assertFails(getDoc(doc(testEnv.authenticatedContext("charlie").firestore(), "matchContacts", "accepted-1_alice")));
  });
});

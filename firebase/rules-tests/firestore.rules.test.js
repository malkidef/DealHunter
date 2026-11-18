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
  status,
  sellerId: "seller-record-1",
  buyerId: "buyer-record-1",
  requesterCompany: "Entreprise A",
  recipientCompany: "Entreprise B",
  product: "Cartons",
  createdAt: new Date()
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

  it("verrouille les champs des catalogues publics et réserve l'écriture au propriétaire", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    const offer = {
      ownerUid: "alice", company: "Entreprise A", product: "Cartons",
      category: "Emballage", quantity: 50, unitPrice: 2.5,
      location: "Lille", status: "active", createdAt: new Date()
    };
    const need = {
      ownerUid: "alice", company: "Entreprise A", product: "Palettes",
      category: "Logistique", quantity: 20, maxUnitBudget: 15,
      location: "Lille", status: "active", createdAt: new Date()
    };
    await assertSucceeds(setDoc(doc(alice, "publicOffers", "offer-1"), offer));
    await assertSucceeds(setDoc(doc(alice, "publicNeeds", "need-1"), need));
    await assertSucceeds(getDoc(doc(bob, "publicOffers", "offer-1")));
    await assertSucceeds(getDoc(doc(bob, "publicNeeds", "need-1")));

    await assertFails(setDoc(doc(bob, "publicOffers", "offer-1"), { ...offer, ownerUid: "bob" }));
    await assertFails(setDoc(doc(bob, "publicNeeds", "need-1"), { ...need, ownerUid: "bob" }));
    await assertFails(setDoc(doc(alice, "publicOffers", "offer-private"), {
      ...offer, privateEmail: "confidentiel@example.test"
    }));
    await assertFails(setDoc(doc(alice, "publicNeeds", "need-private"), {
      ...need, privatePhone: "0600000000"
    }));
    await assertFails(setDoc(doc(alice, "publicOffers", "offer-invalid"), {
      ...offer, quantity: "cinquante"
    }));
    await assertFails(setDoc(doc(alice, "publicNeeds", "need-invalid"), {
      ...need, status: "draft"
    }));
  });

  it("autorise une demande valide et refuse l'usurpation du demandeur", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(alice, "matchRequests", "request-1"), requestData("alice", "bob")));
    await assertFails(setDoc(doc(alice, "matchRequests", "request-2"), requestData("bob", "alice")));
    const extraParticipant = requestData("alice", "bob");
    extraParticipant.participantUids.push("charlie");
    await assertFails(setDoc(doc(alice, "matchRequests", "request-3"), extraParticipant));
    const wrongRecipient = requestData("alice", "bob");
    wrongRecipient.recipientUid = "charlie";
    await assertFails(setDoc(doc(alice, "matchRequests", "request-4"), wrongRecipient));
    const unexpectedField = { ...requestData("alice", "bob"), privateEmail: "intrus@example.test" };
    await assertFails(setDoc(doc(alice, "matchRequests", "request-5"), unexpectedField));
  });

  it("réserve la décision au destinataire et protège les participants", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), "matchRequests", "request-1"), requestData("alice", "bob"));
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(updateDoc(doc(alice, "matchRequests", "request-1"), { status: "accepted" }));
    await assertFails(updateDoc(doc(bob, "matchRequests", "request-1"), {
      status: "accepted",
      requesterCompany: "Entreprise usurpée"
    }));
    await assertFails(updateDoc(doc(bob, "matchRequests", "request-1"), { status: "accepted" }));
    await assertSucceeds(updateDoc(doc(bob, "matchRequests", "request-1"), {
      status: "accepted", respondedAt: new Date()
    }));
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
      requestId: "accepted-1", senderUid: "alice", senderEmail: "alice@example.test", text: "Bonjour", createdAt: new Date()
    }));
    await assertFails(addDoc(collection(alice, "matchMessages"), {
      requestId: "pending-1", senderUid: "alice", senderEmail: "alice@example.test", text: "Trop tôt", createdAt: new Date()
    }));
    await assertFails(addDoc(collection(outsider, "matchMessages"), {
      requestId: "accepted-1", senderUid: "charlie", senderEmail: "charlie@example.test", text: "Intrus", createdAt: new Date()
    }));
    await assertFails(addDoc(collection(alice, "matchMessages"), {
      requestId: "accepted-1", senderUid: "alice", senderEmail: "alice@example.test",
      text: "Champ interdit", createdAt: new Date(), privatePhone: "0600000000"
    }));
    await assertFails(addDoc(collection(alice, "matchMessages"), {
      requestId: "accepted-1", senderUid: "alice", senderEmail: "alice@example.test", text: "Sans date"
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
      requestId: "accepted-1", ownerUid: "alice", email: "alice@example.test", phone: "0102030405", company: "Entreprise A", sharedAt: new Date()
    }));
    await assertSucceeds(getDoc(doc(bob, "matchContacts", "accepted-1_alice")));
    await assertFails(setDoc(doc(alice, "matchContacts", "pending-1_alice"), {
      requestId: "pending-1", ownerUid: "alice", email: "alice@example.test", phone: "0102030405", company: "Entreprise A", sharedAt: new Date()
    }));
    await assertFails(getDoc(doc(testEnv.authenticatedContext("charlie").firestore(), "matchContacts", "accepted-1_alice")));
    await assertFails(setDoc(doc(alice, "matchContacts", "accepted-1_alice"), {
      requestId: "accepted-1", ownerUid: "alice", email: "alice@example.test",
      phone: "0102030405", company: "Entreprise A", sharedAt: new Date(), privateNote: "interdit"
    }));
    await assertFails(updateDoc(doc(alice, "matchContacts", "accepted-1_alice"), {
      ownerUid: "bob"
    }));
    await assertSucceeds(setDoc(doc(alice, "matchContacts", "accepted-1_alice"), {
      requestId: "accepted-1", ownerUid: "alice", email: "alice-new@example.test",
      phone: "0102030406", company: "Entreprise A", sharedAt: new Date()
    }));
  });
});

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
  addDoc,
  deleteDoc,
  query,
  where
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

  it("autorise le propriétaire à retirer ses annonces privées et publiques, mais pas un autre compte", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, "users/alice/sellerOffers", "offer-delete"), { product: "Cartons" });
      await setDoc(doc(db, "users/alice/buyerNeeds", "need-delete"), { product: "Palettes" });
      await setDoc(doc(db, "publicOffers", "offer-delete"), {
        ownerUid: "alice", company: "Entreprise A", product: "Cartons",
        category: "Emballage", quantity: 10, unitPrice: 2,
        location: "Lille", status: "active", createdAt: new Date()
      });
      await setDoc(doc(db, "publicNeeds", "need-delete"), {
        ownerUid: "alice", company: "Entreprise A", product: "Palettes",
        category: "Logistique", quantity: 5, maxUnitBudget: 10,
        location: "Lille", status: "active", createdAt: new Date()
      });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(deleteDoc(doc(bob, "users/alice/sellerOffers", "offer-delete")));
    await assertFails(deleteDoc(doc(bob, "users/alice/buyerNeeds", "need-delete")));
    await assertFails(deleteDoc(doc(bob, "publicOffers", "offer-delete")));
    await assertFails(deleteDoc(doc(bob, "publicNeeds", "need-delete")));
    await assertSucceeds(deleteDoc(doc(alice, "users/alice/sellerOffers", "offer-delete")));
    await assertSucceeds(deleteDoc(doc(alice, "users/alice/buyerNeeds", "need-delete")));
    await assertSucceeds(deleteDoc(doc(alice, "publicOffers", "offer-delete")));
    await assertSucceeds(deleteDoc(doc(alice, "publicNeeds", "need-delete")));
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
      requestId: "accepted-1", senderUid: "alice", text: "Bonjour", createdAt: new Date()
    }));
    await assertFails(addDoc(collection(alice, "matchMessages"), {
      requestId: "accepted-1", senderUid: "alice", text: "E-mail interdit", senderEmail: "alice@example.test", createdAt: new Date()
    }));
    await assertFails(addDoc(collection(alice, "matchMessages"), {
      requestId: "pending-1", senderUid: "alice", text: "Trop tôt", createdAt: new Date()
    }));
    await assertFails(addDoc(collection(outsider, "matchMessages"), {
      requestId: "accepted-1", senderUid: "charlie", text: "Intrus", createdAt: new Date()
    }));
    await assertFails(addDoc(collection(alice, "matchMessages"), {
      requestId: "accepted-1", senderUid: "alice",
      text: "Champ interdit", createdAt: new Date(), privatePhone: "0600000000"
    }));
    await assertFails(addDoc(collection(alice, "matchMessages"), {
      requestId: "accepted-1", senderUid: "alice", text: "Sans date"
    }));
  });

  it("sécurise les catalogues de prestations et de demandes de service", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    const offer = {
      ownerUid: "alice", company: "Entreprise A", title: "Maintenance électrique",
      description: "Maintenance industrielle", category: "maintenance électrique",
      location: "Lille", countryCode: "FR", qualifications: ["habilitation électrique"],
      remote: false, coverageRadiusKm: 50, requiredQualifications: [],
      remoteAccepted: false, status: "active", createdAt: new Date(), updatedAt: new Date()
    };
    const request = {
      ...offer, title: "Recherche maintenance électrique",
      requiredQualifications: ["habilitation électrique"], remoteAccepted: true
    };
    await assertSucceeds(setDoc(doc(alice, "publicServiceOffers", "service-1"), offer));
    await assertSucceeds(setDoc(doc(alice, "publicServiceRequests", "service-request-1"), request));
    await assertSucceeds(getDoc(doc(bob, "publicServiceOffers", "service-1")));
    await assertSucceeds(getDoc(doc(bob, "publicServiceRequests", "service-request-1")));
    await assertFails(setDoc(doc(bob, "publicServiceOffers", "service-1"), { ...offer, ownerUid: "bob" }));
    await assertFails(setDoc(doc(bob, "publicServiceRequests", "service-request-1"), { ...request, ownerUid: "bob" }));
    await assertFails(setDoc(doc(alice, "publicServiceOffers", "service-private"), {
      ...offer, privateEmail: "alice@example.test"
    }));
    await assertFails(setDoc(doc(alice, "publicServiceRequests", "service-invalid-country"), {
      ...request, countryCode: "FRANCE"
    }));
    await assertFails(setDoc(doc(alice, "publicServiceRequests", "service-invalid-status"), {
      ...request, status: "draft"
    }));
    await assertSucceeds(updateDoc(doc(alice, "publicServiceOffers", "service-1"), {
      description: "Maintenance et dépannage", updatedAt: new Date()
    }));
    await assertFails(deleteDoc(doc(bob, "publicServiceOffers", "service-1")));
    await assertSucceeds(deleteDoc(doc(alice, "publicServiceOffers", "service-1")));
  });

  it("impose le double consentement pour les mises en relation de services", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await testEnv.withSecurityRulesDisabled(async context => {
      const db=context.firestore();
      await setDoc(doc(db,"publicServiceOffers","offer-svc"),{
        ownerUid:"alice",company:"Prestataire A",title:"Maintenance",description:"Service",
        category:"maintenance",location:"Lille",countryCode:"FR",qualifications:[],
        remote:false,coverageRadiusKm:30,requiredQualifications:[],remoteAccepted:false,
        status:"active",createdAt:new Date(),updatedAt:new Date()
      });
      await setDoc(doc(db,"publicServiceRequests","need-svc"),{
        ownerUid:"bob",company:"Client B",title:"Recherche maintenance",description:"Besoin",
        category:"maintenance",location:"Lille",countryCode:"FR",qualifications:[],
        requiredQualifications:[],remote:false,coverageRadiusKm:0,remoteAccepted:false,
        status:"active",createdAt:new Date(),updatedAt:new Date()
      });
    });
    const request = {
      offerId:"offer-svc",serviceRequestId:"need-svc",providerUid:"alice",clientUid:"bob",
      participantUids:["alice","bob"],requesterUid:"alice",recipientUid:"bob",
      requesterCompany:"Prestataire A",recipientCompany:"Client B",
      serviceTitle:"Maintenance",needTitle:"Recherche maintenance",
      status:"pending",createdAt:new Date()
    };
    await assertSucceeds(setDoc(doc(alice,"serviceMatchRequests","svc-1"),request));
    await assertSucceeds(getDoc(doc(bob,"serviceMatchRequests","svc-1")));
    await assertFails(updateDoc(doc(alice,"serviceMatchRequests","svc-1"),{status:"accepted",respondedAt:new Date()}));
    await assertFails(updateDoc(doc(bob,"serviceMatchRequests","svc-1"),{status:"accepted",providerUid:"bob",respondedAt:new Date()}));
    await assertSucceeds(updateDoc(doc(bob,"serviceMatchRequests","svc-1"),{status:"accepted",respondedAt:new Date()}));
    await assertFails(updateDoc(doc(bob,"serviceMatchRequests","svc-1"),{status:"rejected",participantUids:["bob"],respondedAt:new Date()}));
    await assertFails(setDoc(doc(alice,"serviceMatchRequests","svc-extra"),{...request,privateEmail:"secret@example.test"}));
  });

  it("ouvre la messagerie de services uniquement après acceptation bilatérale", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db=context.firestore();
      await setDoc(doc(db,"serviceMatchRequests","svc-accepted"),{
        providerUid:"alice",clientUid:"bob",participantUids:["alice","bob"],status:"accepted"
      });
      await setDoc(doc(db,"serviceMatchRequests","svc-pending"),{
        providerUid:"alice",clientUid:"bob",participantUids:["alice","bob"],status:"pending"
      });
      await setDoc(doc(db,"serviceMatchMessages","seeded-message"),{
        requestId:"svc-accepted",senderUid:"bob",text:"Message existant",createdAt:new Date()
      });
    });
    const alice=testEnv.authenticatedContext("alice").firestore();
    const outsider=testEnv.authenticatedContext("charlie").firestore();
    const message={requestId:"svc-accepted",senderUid:"alice",text:"Bonjour, parlons du besoin.",createdAt:new Date()};
    await assertSucceeds(addDoc(collection(alice,"serviceMatchMessages"),message));
    const ownThread=query(collection(alice,"serviceMatchMessages"),where("requestId","==","svc-accepted"));
    const outsiderThread=query(collection(outsider,"serviceMatchMessages"),where("requestId","==","svc-accepted"));
    await assertSucceeds(getDocs(ownThread));
    await assertFails(getDocs(outsiderThread));
    await assertFails(addDoc(collection(alice,"serviceMatchMessages"),{...message,requestId:"svc-pending"}));
    await assertFails(addDoc(collection(outsider,"serviceMatchMessages"),{...message,senderUid:"charlie"}));
    await assertFails(addDoc(collection(alice,"serviceMatchMessages"),{...message,privateEmail:"secret@example.test"}));
    await assertFails(updateDoc(doc(alice,"serviceMatchMessages","seeded-message"),{text:"modifié"}));
  });


  it("sécurise les profils professionnels et les offres d'emploi", async () => {
    const alice=testEnv.authenticatedContext("alice").firestore();
    const bob=testEnv.authenticatedContext("bob").firestore();
    const profile={
      ownerUid:"alice",title:"Électricien monteur câbleur",category:"électricité industrielle",
      description:"Câblage et maintenance",location:"Lille",countryCode:"FR",
      skills:["câblage","maintenance"],qualifications:["habilitation électrique"],
      engagementTypes:["employment","independent"],availableFrom:"2026-12-01",remote:false,
      publicProfileConsent:true,status:"active",createdAt:new Date(),updatedAt:new Date()
    };
    const opening={
      ownerUid:"alice",company:"Entreprise A",title:"Monteur câbleur",category:"électricité industrielle",
      description:"Poste atelier",location:"Lille",countryCode:"FR",
      requiredSkills:["câblage"],requiredQualifications:["habilitation électrique"],
      engagementType:"employment",startDate:"2026-12-05",remoteAccepted:false,
      status:"active",createdAt:new Date(),updatedAt:new Date()
    };
    await assertSucceeds(setDoc(doc(alice,"publicWorkerProfiles","profile-1"),profile));
    await assertSucceeds(getDoc(doc(bob,"publicWorkerProfiles","profile-1")));
    await assertFails(setDoc(doc(bob,"publicWorkerProfiles","profile-1"),{...profile,ownerUid:"bob"}));
    await assertFails(setDoc(doc(alice,"publicWorkerProfiles","profile-private"),{...profile,privateEmail:"alice@example.test"}));
    await assertFails(setDoc(doc(alice,"publicWorkerProfiles","profile-no-consent"),{...profile,publicProfileConsent:false}));
    await assertSucceeds(setDoc(doc(alice,"publicWorkOpenings","opening-1"),opening));
    await assertSucceeds(getDoc(doc(bob,"publicWorkOpenings","opening-1")));
    await assertFails(setDoc(doc(bob,"publicWorkOpenings","opening-1"),{...opening,ownerUid:"bob"}));
    await assertFails(setDoc(doc(alice,"publicWorkOpenings","opening-private"),{...opening,privatePhone:"0600000000"}));
    await assertFails(setDoc(doc(alice,"publicWorkOpenings","opening-invalid"),{...opening,engagementType:"any"}));
    await assertSucceeds(deleteDoc(doc(alice,"publicWorkerProfiles","profile-1")));
  });

  it("protège les mises en relation et messages du marché du travail", async () => {
    const alice=testEnv.authenticatedContext("alice").firestore(),bob=testEnv.authenticatedContext("bob").firestore(),outsider=testEnv.authenticatedContext("charlie").firestore();
    await testEnv.withSecurityRulesDisabled(async c=>{
      const db=c.firestore();
      await setDoc(doc(db,"publicWorkerProfiles","candidate-1"),{ownerUid:"alice",title:"Électricien câbleur",category:"électricité",description:"Câblage",location:"Lille",countryCode:"FR",skills:["câblage"],qualifications:[],engagementTypes:["employment","independent"],availableFrom:"2026-12-01",remote:false,publicProfileConsent:true,status:"active",createdAt:new Date(),updatedAt:new Date()});
      await setDoc(doc(db,"publicWorkOpenings","opening-1"),{ownerUid:"bob",company:"Entreprise B",title:"Monteur câbleur",category:"électricité",description:"Poste",location:"Lille",countryCode:"FR",requiredSkills:[],requiredQualifications:[],engagementType:"employment",startDate:"2026-12-05",remoteAccepted:false,status:"active",createdAt:new Date(),updatedAt:new Date()});
      await setDoc(doc(db,"publicWorkOpenings","opening-2"),{ownerUid:"bob",company:"Entreprise B",title:"Mission",category:"électricité",description:"Mission",location:"Lille",countryCode:"FR",requiredSkills:[],requiredQualifications:[],engagementType:"independent",startDate:"2026-12-05",remoteAccepted:false,status:"active",createdAt:new Date(),updatedAt:new Date()});
    });
    const req={candidateProfileId:"candidate-1",openingId:"opening-1",candidateUid:"alice",employerUid:"bob",participantUids:["alice","bob"],requesterUid:"alice",recipientUid:"bob",engagementType:"employment",candidateTitle:"Électricien câbleur",openingTitle:"Monteur câbleur",status:"pending",createdAt:new Date()};
    await assertSucceeds(setDoc(doc(alice,"workMatchRequests","work-1"),req));
    await assertFails(setDoc(doc(alice,"workMatchRequests","extra"),{...req,privateEmail:"alice@example.test"}));
    await assertFails(setDoc(doc(alice,"workMatchRequests","wrong-type"),{...req,openingId:"opening-2"}));
    await assertFails(setDoc(doc(outsider,"workMatchRequests","outsider"),{...req,requesterUid:"charlie"}));
    await assertSucceeds(getDoc(doc(bob,"workMatchRequests","work-1")));await assertFails(getDoc(doc(outsider,"workMatchRequests","work-1")));
    await assertFails(updateDoc(doc(alice,"workMatchRequests","work-1"),{status:"accepted",respondedAt:new Date()}));
    await assertSucceeds(updateDoc(doc(bob,"workMatchRequests","work-1"),{status:"accepted",respondedAt:new Date()}));
    await assertFails(updateDoc(doc(bob,"workMatchRequests","work-1"),{status:"rejected",candidateUid:"charlie",respondedAt:new Date()}));
    await testEnv.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),"workMatchRequests","work-pending"),{...req,status:"pending"});});
    await assertFails(addDoc(collection(alice,"workMatchMessages"),{requestId:"work-pending",senderUid:"alice",text:"Trop tôt",createdAt:new Date()}));
    const msg={requestId:"work-1",senderUid:"alice",text:"Bonjour",createdAt:new Date()};
    await assertSucceeds(addDoc(collection(alice,"workMatchMessages"),msg));
    await assertFails(addDoc(collection(alice,"workMatchMessages"),{...msg,privatePhone:"0600000000"}));
    await assertFails(addDoc(collection(outsider,"workMatchMessages"),{...msg,senderUid:"charlie"}));
    const own=await getDocs(query(collection(alice,"workMatchMessages"),where("requestId","==","work-1")));
    await assertFails(updateDoc(own.docs[0].ref,{text:"Modifié"}));
    await assertSucceeds(getDocs(query(collection(bob,"workMatchMessages"),where("requestId","==","work-1"))));
    await assertFails(getDocs(query(collection(outsider,"workMatchMessages"),where("requestId","==","work-1"))));
  });

  it("protège les demandes de vérification des entreprises et qualifications", async () => {
    const alice=testEnv.authenticatedContext("alice").firestore();
    const bob=testEnv.authenticatedContext("bob").firestore();
    const admin=testEnv.authenticatedContext("reviewer",{dealhunterAdmin:true}).firestore();
    const outsider=testEnv.authenticatedContext("charlie").firestore();
    const request={
      ownerUid:"alice",subjectType:"company",subjectName:"Entreprise A",countryCode:"FR",
      evidenceLabel:"Registre public des entreprises",publicEvidenceUrl:"https://annuaire-entreprises.data.gouv.fr/",
      status:"pending",createdAt:new Date(),updatedAt:new Date()
    };
    await assertSucceeds(setDoc(doc(alice,"verificationRequests","verify-1"),request));
    await assertSucceeds(getDoc(doc(alice,"verificationRequests","verify-1")));
    await assertFails(getDoc(doc(bob,"verificationRequests","verify-1")));
    await assertSucceeds(getDoc(doc(admin,"verificationRequests","verify-1")));
    await assertFails(setDoc(doc(alice,"verificationRequests","self-verified"),{...request,status:"verified"}));
    await assertFails(setDoc(doc(alice,"verificationRequests","private-data"),{...request,phone:"0600000000"}));
    await assertFails(setDoc(doc(alice,"verificationRequests","http"),{...request,publicEvidenceUrl:"http://example.test"}));
    await assertFails(updateDoc(doc(alice,"verificationRequests","verify-1"),{status:"verified",updatedAt:new Date()}));
    await assertSucceeds(updateDoc(doc(alice,"verificationRequests","verify-1"),{status:"withdrawn",updatedAt:new Date()}));
    await assertFails(updateDoc(doc(alice,"verificationRequests","verify-1"),{status:"pending",updatedAt:new Date()}));
    await assertFails(updateDoc(doc(bob,"verificationRequests","verify-1"),{status:"verified",reviewedAt:new Date()}));
    await assertSucceeds(setDoc(doc(alice,"verificationRequests","verify-2"),{...request,subjectType:"qualification",subjectName:"Habilitation électrique"}));
    await assertSucceeds(updateDoc(doc(admin,"verificationRequests","verify-2"),{status:"verified",reviewerNote:"Vérification effectuée auprès de l'émetteur.",reviewedAt:new Date()}));
    await assertFails(getDoc(doc(outsider,"verificationRequests","verify-2")));
  });

  it("sécurise les propositions commerciales et la confirmation bilatérale", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(),"matchRequests","deal-match"),requestData("alice","bob","accepted"));
    });
    const alice=testEnv.authenticatedContext("alice").firestore();
    const bob=testEnv.authenticatedContext("bob").firestore();
    const outsider=testEnv.authenticatedContext("charlie").firestore();
    const proposal={
      requestId:"deal-match",sellerUid:"alice",buyerUid:"bob",participantUids:["alice","bob"],
      proposerUid:"alice",accepterUid:"bob",product:"Lot de câbles",quantity:10,unitPrice:2.5,
      totalAmount:25,commissionRate:5,commissionAmount:1.25,status:"proposed",
      sellerConfirmed:false,buyerConfirmed:false,createdAt:new Date(),updatedAt:new Date()
    };
    await assertSucceeds(setDoc(doc(alice,"deals","deal-1"),proposal));
    await assertSucceeds(getDoc(doc(bob,"deals","deal-1")));
    await assertFails(getDoc(doc(outsider,"deals","deal-1")));
    await assertFails(setDoc(doc(alice,"deals","fake"),{...proposal,commissionRate:99}));
    await assertFails(setDoc(doc(alice,"deals","extra"),{...proposal,privateEmail:"a@example.test"}));
    await assertFails(updateDoc(doc(alice,"deals","deal-1"),{status:"agreed",agreedAt:new Date(),updatedAt:new Date()}));
    await assertSucceeds(updateDoc(doc(bob,"deals","deal-1"),{status:"agreed",agreedAt:new Date(),updatedAt:new Date()}));
    await assertSucceeds(updateDoc(doc(alice,"deals","deal-1"),{sellerConfirmed:true,sellerConfirmedAt:new Date(),status:"agreed",updatedAt:new Date()}));
    await assertFails(updateDoc(doc(alice,"deals","deal-1"),{sellerConfirmed:true,sellerConfirmedAt:new Date(),status:"completed",updatedAt:new Date()}));
    await assertSucceeds(updateDoc(doc(bob,"deals","deal-1"),{buyerConfirmed:true,buyerConfirmedAt:new Date(),status:"completed",updatedAt:new Date()}));
    await assertFails(updateDoc(doc(bob,"deals","deal-1"),{totalAmount:1}));
    await assertFails(updateDoc(doc(outsider,"deals","deal-1"),{status:"completed",updatedAt:new Date()}));
    await assertFails(deleteDoc(doc(alice,"deals","deal-1")));
  });

  it("autorise un avis unique seulement après une vente terminée", async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(),"deals","completed-review"),{
        requestId:"deal-match",sellerUid:"alice",buyerUid:"bob",participantUids:["alice","bob"],
        status:"completed",sellerConfirmed:true,buyerConfirmed:true
      });
      await setDoc(doc(context.firestore(),"deals","active-review"),{
        requestId:"deal-match",sellerUid:"alice",buyerUid:"bob",participantUids:["alice","bob"],
        status:"agreed",sellerConfirmed:false,buyerConfirmed:false
      });
    });
    const alice=testEnv.authenticatedContext("alice").firestore();
    const bob=testEnv.authenticatedContext("bob").firestore();
    const outsider=testEnv.authenticatedContext("charlie").firestore();
    const review={dealId:"completed-review",reviewerUid:"alice",subjectUid:"bob",rating:5,comment:"Transaction conforme.",createdAt:new Date()};
    await assertSucceeds(setDoc(doc(alice,"dealReviews","completed-review_alice"),review));
    await assertSucceeds(getDoc(doc(bob,"dealReviews","completed-review_alice")));
    await assertFails(setDoc(doc(alice,"dealReviews","completed-review_alice"),review));
    await assertFails(setDoc(doc(alice,"dealReviews","active-review_alice"),{...review,dealId:"active-review"}));
    await assertFails(setDoc(doc(alice,"dealReviews","self_alice"),{...review,subjectUid:"alice"}));
    await assertFails(setDoc(doc(outsider,"dealReviews","completed-review_charlie"),{...review,reviewerUid:"charlie"}));
    await assertFails(setDoc(doc(alice,"dealReviews","bad-rating_alice"),{...review,rating:6}));
    await assertFails(setDoc(doc(alice,"dealReviews","extra_alice"),{...review,email:"alice@example.test"}));
    await assertFails(updateDoc(doc(alice,"dealReviews","completed-review_alice"),{rating:1}));
    await assertFails(deleteDoc(doc(alice,"dealReviews","completed-review_alice")));
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

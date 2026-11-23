import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, collection, getDocs, updateDoc, query, where, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-web-config.js";

const status = document.getElementById("authStatus");
const accountStatus = document.getElementById("authAccount");
const emailForm = document.getElementById("emailAuthForm");
const emailButton = document.getElementById("emailSignIn");
const createButton = document.getElementById("emailCreate");
const resetButton = document.getElementById("passwordReset");
const googleButton = document.getElementById("googleSignIn");
const appleButton = document.getElementById("appleSignIn");
const signOutButton = document.getElementById("signOut");
const ready = Object.values(firebaseConfig).every(value =>
  typeof value === "string" && value.length > 0 && !value.includes("A_REMPLACER")
);

if (!ready) {
  status.textContent = "À configurer : crée le projet Firebase et renseigne firebase-web-config.js.";
  [emailButton, createButton, googleButton, appleButton].forEach(button => button.disabled = true);
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const isMobileBrowser = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const signInWithProvider = async provider => {
    if (isMobileBrowser) return signInWithRedirect(auth, provider);
    return signInWithPopup(auth, provider);
  };
  const showError = error => {
    const messages = {
      "auth/operation-not-allowed": "Ce mode de connexion n’est pas activé dans Firebase Authentication.",
      "auth/popup-closed-by-user": "Fenêtre de connexion fermée avant la fin.",
      "auth/account-exists-with-different-credential": "Cette adresse e-mail est déjà associée à un autre mode de connexion.",
      "auth/invalid-credential": "Identifiants incorrects. Vérifie ton adresse et ton mot de passe.",
      "auth/user-not-found": "Aucun compte trouvé avec cette adresse. Utilise « Créer un compte ».",
      "auth/wrong-password": "Mot de passe incorrect.",
      "auth/weak-password": "Choisis un mot de passe d’au moins 8 caractères.",
      "auth/email-already-in-use": "Cette adresse possède déjà un compte. Connecte-toi.",
      "auth/invalid-email": "Adresse e-mail invalide."
    };
    status.textContent = messages[error.code] || "Connexion impossible : " + (error.message || error.code);
  };
  const credentials = () => ({
    email: document.getElementById("authEmail").value.trim(),
    password: document.getElementById("authPassword").value
  });

  const loadMatchRequests = async user => {
    // Les ventes restent liées à une demande acceptée et ne sont visibles qu'aux deux participants.
    const [snap, dealSnap, generatedSnap, serviceRequestSnap] = await Promise.all([
      getDocs(query(collection(db,"matchRequests"),where("participantUids","array-contains",user.uid))),
      getDocs(query(collection(db,"deals"),where("participantUids","array-contains",user.uid))),
      getDocs(query(collection(db,"matches"),where("participantUids","array-contains",user.uid))),
      getDocs(query(collection(db,"serviceMatchRequests"),where("participantUids","array-contains",user.uid)))
    ]);
    const serviceRequests = serviceRequestSnap.docs.map(item => ({id:item.id,...item.data()}));
    for(const request of serviceRequests){
      if(request.status!=="accepted")continue;
      const messages=await getDocs(query(collection(db,"serviceMatchMessages"),where("requestId","==",request.id)));
      request.messages=messages.docs.map(item=>({id:item.id,...item.data()})).sort((x,y)=>(x.createdAt?.seconds||0)-(y.createdAt?.seconds||0));
    }
    window.dispatchEvent(new CustomEvent("dealhunter-service-match-requests",{detail:{requests:serviceRequests}}));
    const generatedMatches = generatedSnap.docs.map(item => ({ id:item.id, ...item.data() }));
    window.dispatchEvent(new CustomEvent("dealhunter-generated-matches", { detail:{ matches:generatedMatches } }));
    const deals = dealSnap.docs.map(item => ({id:item.id,...item.data()}));
    window.dispatchEvent(new CustomEvent("dealhunter-deals",{detail:{deals}}));
    const dealsByRequest = new Map();
    deals.forEach(deal => {
      const list=dealsByRequest.get(deal.requestId)||[];
      list.push(deal);dealsByRequest.set(deal.requestId,list);
    });
    const requests = snap.docs.map(item => ({id:item.id,...item.data(),deals:dealsByRequest.get(item.id)||[]}));
    for (const r of requests) {
      if (r.status !== "accepted") continue;
      const otherUid = (r.participantUids || []).find(uid => uid !== user.uid);
      try {
        const [mine, other] = await Promise.all([
          getDoc(doc(db,"matchContacts",r.id+"_"+user.uid)),
          otherUid ? getDoc(doc(db,"matchContacts",r.id+"_"+otherUid)) : Promise.resolve(null)
        ]);
        r.myContact = mine?.exists()?mine.data():null;
        r.otherContact = other?.exists()?other.data():null;
      } catch (contactError) {
        console.error("Lecture des coordonnées partagées impossible :", contactError);
        r.contactLoadError = contactError.code || contactError.message || "erreur inconnue";
      }
      // Charger les messages indépendamment des coordonnées : une erreur
      // sur un document de contact absent ne doit pas masquer la messagerie.
      try {
        const messageSnap = await getDocs(query(collection(db,"matchMessages"),where("requestId","==",r.id)));
        r.messages = messageSnap.docs.map(item=>({id:item.id,...item.data()})).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
      } catch (messageError) {
        console.error("Lecture des messages impossible :", messageError);
        r.messageLoadError = messageError.code || messageError.message || "erreur inconnue";
        r.messages = [];
      }
    }
    window.dispatchEvent(new CustomEvent("dealhunter-match-requests",{detail:{requests}}));
  };
  window.addEventListener("dealhunter-create-service-match-request",async e=>{
    const user=auth.currentUser,d=e.detail||{};
    if(!user||!d.offerId||!d.serviceRequestId){status.textContent="Connecte-toi pour demander une mise en relation.";return;}
    try{
      const [offerSnap,needSnap]=await Promise.all([
        getDoc(doc(db,"publicServiceOffers",d.offerId)),
        getDoc(doc(db,"publicServiceRequests",d.serviceRequestId))
      ]);
      if(!offerSnap.exists()||!needSnap.exists())throw new Error("Une des fiches de service n'existe plus.");
      const offer=offerSnap.data(),need=needSnap.data();
      if(offer.status!=="active"||need.status!=="active"||!offer.ownerUid||!need.ownerUid||offer.ownerUid===need.ownerUid)
        throw new Error("Ces entreprises ne peuvent pas être mises en relation.");
      if(![offer.ownerUid,need.ownerUid].includes(user.uid))throw new Error("Seule une des deux entreprises concernées peut lancer la demande.");
      const existing=await getDocs(query(collection(db,"serviceMatchRequests"),where("offerId","==",d.offerId)));
      if(existing.docs.some(item=>item.data().serviceRequestId===d.serviceRequestId&&item.data().status!=="rejected"))
        throw new Error("Une demande existe déjà pour cette correspondance.");
      const isProvider=user.uid===offer.ownerUid;
      await addDoc(collection(db,"serviceMatchRequests"),{
        offerId:d.offerId,serviceRequestId:d.serviceRequestId,
        providerUid:offer.ownerUid,clientUid:need.ownerUid,
        participantUids:[offer.ownerUid,need.ownerUid],
        requesterUid:user.uid,recipientUid:isProvider?need.ownerUid:offer.ownerUid,
        requesterCompany:isProvider?offer.company:need.company,
        recipientCompany:isProvider?need.company:offer.company,
        serviceTitle:offer.title,needTitle:need.title,
        status:"pending",createdAt:serverTimestamp()
      });
      await loadMatchRequests(user);
      status.textContent="Proposition envoyée. L'autre entreprise doit accepter avant l'ouverture de la conversation.";
    }catch(err){console.error(err);status.textContent="Demande impossible : "+(err.message||err.code);}
  });
  window.addEventListener("dealhunter-send-service-match-message",async e=>{
    const user=auth.currentUser,{requestId,text:messageText}=e.detail||{};
    const message=String(messageText||"").trim();
    if(!user||!requestId||!message||message.length>2000)return;
    try{
      const requestSnap=await getDoc(doc(db,"serviceMatchRequests",requestId));
      if(!requestSnap.exists())throw new Error("Mise en relation introuvable.");
      const request=requestSnap.data();
      if(request.status!=="accepted"||!request.participantUids?.includes(user.uid))
        throw new Error("La messagerie est réservée aux deux entreprises après acceptation.");
      await addDoc(collection(db,"serviceMatchMessages"),{
        requestId,senderUid:user.uid,text:message,createdAt:serverTimestamp()
      });
      await loadMatchRequests(user);
      status.textContent="Message envoyé aux participants de la mise en relation.";
    }catch(err){console.error(err);status.textContent="Envoi du message impossible : "+(err.message||err.code);}
  });

  window.addEventListener("dealhunter-update-service-match-request",async e=>{
    const user=auth.currentUser,{requestId,decision}=e.detail||{};
    if(!user||!requestId||!["accepted","rejected"].includes(decision))return;
    try{
      const ref=doc(db,"serviceMatchRequests",requestId),snap=await getDoc(ref);
      if(!snap.exists()||snap.data().recipientUid!==user.uid||snap.data().status!=="pending")
        throw new Error("Cette demande ne peut plus être modifiée.");
      await updateDoc(ref,{status:decision,respondedAt:serverTimestamp()});
      await loadMatchRequests(user);
      status.textContent=decision==="accepted"?"Mise en relation de services acceptée. Vous pouvez désormais échanger dans la conversation privée.":"Demande de service refusée.";
    }catch(err){console.error(err);status.textContent="Action impossible : "+(err.message||err.code);}
  });

  window.addEventListener("dealhunter-create-match-request",async e=>{
    const user=auth.currentUser,d=e.detail||{};
    if(!user){status.textContent="Connecte-toi pour demander une mise en relation.";return;}
    if(![d.sellerUid,d.buyerUid].includes(user.uid)||d.sellerUid===d.buyerUid){status.textContent="Cette demande n’est pas autorisée pour ce compte.";return;}
    try{
      const isSeller=user.uid===d.sellerUid;
      await addDoc(collection(db,"matchRequests"),{sellerId:d.sellerId,buyerId:d.buyerId,sellerUid:d.sellerUid,buyerUid:d.buyerUid,participantUids:[d.sellerUid,d.buyerUid],requesterUid:user.uid,recipientUid:isSeller?d.buyerUid:d.sellerUid,requesterCompany:isSeller?d.sellerCompany:d.buyerCompany,recipientCompany:isSeller?d.buyerCompany:d.sellerCompany,product:d.product||"",status:"pending",createdAt:serverTimestamp()});
      await loadMatchRequests(user);status.textContent="Demande de mise en relation envoyée.";
    }catch(err){console.error(err);status.textContent="Envoi impossible : "+(err.message||err.code);}
  });
  window.addEventListener("dealhunter-update-match-request",async e=>{
    const user=auth.currentUser,{requestId,status:decision}=e.detail||{};
    if(!user||!requestId||!["accepted","rejected"].includes(decision))return;
    try{const ref=doc(db,"matchRequests",requestId),snap=await getDoc(ref);
      if(!snap.exists()||snap.data().recipientUid!==user.uid||snap.data().status!=="pending"){status.textContent="Cette demande ne peut plus être modifiée.";return;}
      await updateDoc(ref,{status:decision,respondedAt:serverTimestamp()});await loadMatchRequests(user);status.textContent=decision==="accepted"?"Mise en relation acceptée.":"Demande refusée.";
    }catch(err){console.error(err);status.textContent="Action impossible : "+(err.message||err.code);}
  });
  window.addEventListener("dealhunter-propose-deal",async e=>{
    const user=auth.currentUser,d=e.detail||{};
    if(!user||!d.requestId){status.textContent="Connecte-toi et sélectionne une mise en relation.";return;}
    const quantity=Number(d.quantity),unitPrice=Number(d.unitPrice);
    if(!Number.isInteger(quantity)||quantity<=0||!Number.isFinite(unitPrice)||unitPrice<=0){status.textContent="Saisis une quantité entière et un prix unitaire positif.";return;}
    try{
      const requestSnap=await getDoc(doc(db,"matchRequests",d.requestId));
      if(!requestSnap.exists())throw new Error("Mise en relation introuvable.");
      const match=requestSnap.data();
      if(match.status!=="accepted"||!(match.participantUids||[]).includes(user.uid))throw new Error("Une mise en relation acceptée est nécessaire.");
      const totalAmount=Math.round(quantity*unitPrice*100)/100;
      const isSeller=user.uid===match.sellerUid;
      await addDoc(collection(db,"deals"),{
        requestId:d.requestId,sellerUid:match.sellerUid,buyerUid:match.buyerUid,
        participantUids:[match.sellerUid,match.buyerUid],proposerUid:user.uid,
        accepterUid:isSeller?match.buyerUid:match.sellerUid,
        product:String(match.product||"Produit").slice(0,160),quantity,unitPrice,
        totalAmount,commissionRate:5,commissionAmount:Math.round(totalAmount*0.05*100)/100,
        status:"proposed",sellerConfirmed:false,buyerConfirmed:false,
        createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      await loadMatchRequests(user);
      status.textContent="Proposition envoyée. Elle devra être acceptée par l’autre entreprise.";
    }catch(err){console.error(err);status.textContent="Proposition impossible : "+(err.message||err.code);}
  });
  window.addEventListener("dealhunter-accept-deal",async e=>{
    const user=auth.currentUser,{dealId}=e.detail||{};
    if(!user||!dealId)return;
    try{
      const ref=doc(db,"deals",dealId),snap=await getDoc(ref);
      if(!snap.exists()||snap.data().status!=="proposed"||snap.data().accepterUid!==user.uid)throw new Error("Cette proposition ne peut pas être acceptée par ce compte.");
      await updateDoc(ref,{status:"agreed",agreedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      await loadMatchRequests(user);
      status.textContent="Accord enregistré : les deux entreprises ont validé les conditions.";
    }catch(err){console.error(err);status.textContent="Acceptation impossible : "+(err.message||err.code);}
  });
  window.addEventListener("dealhunter-confirm-deal",async e=>{
    const user=auth.currentUser,{dealId}=e.detail||{};
    if(!user||!dealId)return;
    try{
      const ref=doc(db,"deals",dealId),snap=await getDoc(ref);
      if(!snap.exists())throw new Error("Vente introuvable.");
      const deal=snap.data();
      if(deal.status!=="agreed"||!(deal.participantUids||[]).includes(user.uid))throw new Error("La vente doit d’abord être acceptée par les deux entreprises.");
      const isSeller=user.uid===deal.sellerUid;
      const field=isSeller?"sellerConfirmed":"buyerConfirmed";
      if(deal[field])throw new Error("Ta confirmation est déjà enregistrée.");
      const otherConfirmed=isSeller?deal.buyerConfirmed:deal.sellerConfirmed;
      await updateDoc(ref,{
        [field]:true,
        [isSeller?"sellerConfirmedAt":"buyerConfirmedAt"]:serverTimestamp(),
        status:otherConfirmed?"completed":"agreed",
        updatedAt:serverTimestamp()
      });
      await loadMatchRequests(user);
      status.textContent=otherConfirmed?"Les deux confirmations sont enregistrées. Vente marquée comme terminée ; commission de 5 % indicative.":"Confirmation enregistrée. En attente de l’autre entreprise.";
    }catch(err){console.error(err);status.textContent="Confirmation impossible : "+(err.message||err.code);}
  });
  window.addEventListener("dealhunter-send-message",async e=>{
    const user=auth.currentUser,{requestId,text:messageText,onResult}=e.detail||{};
    const message=String(messageText||"").trim();
    const finish=(ok,label)=>{if(typeof onResult==="function")onResult(ok,label);};
    if(!user||!requestId||!message){finish(false,"Compte, demande ou message manquant.");return;}
    if(message.length>2000){finish(false,"Message limité à 2 000 caractères.");return;}
    try{
      const requestSnap=await getDoc(doc(db,"matchRequests",requestId));
      if(!requestSnap.exists()||requestSnap.data().status!=="accepted"||!(requestSnap.data().participantUids||[]).includes(user.uid)){
        finish(false,"La messagerie est disponible uniquement après acceptation par les deux entreprises.");return;
      }
      await addDoc(collection(db,"matchMessages"),{requestId,senderUid:user.uid,text:message,createdAt:serverTimestamp()});
      finish(true,"Message envoyé.");
      await loadMatchRequests(user);
      status.textContent="Message envoyé.";
    }catch(err){
      console.error("Envoi du message impossible :",err);
      const reason=err.code||err.message||"erreur inconnue";
      finish(false,"Message non envoyé : "+reason);
      status.textContent="Message non envoyé : "+reason;
    }
  });

  window.addEventListener("dealhunter-share-contact",async e=>{
    const user=auth.currentUser,{requestId}=e.detail||{};
    if(!user||!requestId||!user.email){status.textContent="Connecte-toi avec une adresse e-mail pour la partager.";return;}
    try{
      const requestRef=doc(db,"matchRequests",requestId),requestSnap=await getDoc(requestRef);
      if(!requestSnap.exists()){status.textContent="Demande introuvable.";return;}
      const requestData=requestSnap.data();
      if(requestData.status!=="accepted"||!(requestData.participantUids||[]).includes(user.uid)){status.textContent="Le partage est disponible uniquement après acceptation.";return;}
      const profileSnap=await getDoc(doc(db,"users",user.uid));
      const profile=profileSnap.exists()?profileSnap.data().company||{}:{};
      const company=profile.name||"Entreprise";
      const phone=String(profile.phone||"").trim();
      if(!phone){status.textContent="Ajoute d’abord ton téléphone professionnel dans Connexion / Compte, puis réessaie.";return;}
      await setDoc(doc(db,"matchContacts",requestId+"_"+user.uid),{
        requestId,ownerUid:user.uid,email:user.email,phone,company,sharedAt:serverTimestamp()
      });
      await loadMatchRequests(user);
      status.textContent="Ton e-mail et ton téléphone professionnels sont partagés uniquement avec l’autre entreprise de cette mise en relation.";
    }catch(err){console.error(err);status.textContent="Partage impossible : "+(err.message||err.code);}
  });

  const loadCloudRecords = async user => {
    const [sellerSnapshot, buyerSnapshot] = await Promise.all([
      getDocs(collection(db, "users", user.uid, "sellerOffers")),
      getDocs(collection(db, "users", user.uid, "buyerNeeds"))
    ]);

    // Publie les annonces existantes dans les catalogues partagés, sans coordonnées personnelles.
    await Promise.all([
      ...sellerSnapshot.docs.map(item => {
        const data = item.data();
        return setDoc(doc(db, "publicOffers", item.id), {
          ownerUid: user.uid, company: data.company || "", product: data.product || "",
          category: data.category || "Autre / à classer",
          quantity: Number(data.quantity ?? data.qty ?? 0),
          unitPrice: Number(data.unitPrice ?? data.price ?? 0),
          location: data.location || "", status: "active",
          createdAt: data.createdAt || serverTimestamp()
        }, { merge: true });
      }),
      ...buyerSnapshot.docs.map(item => {
        const data = item.data();
        return setDoc(doc(db, "publicNeeds", item.id), {
          ownerUid: user.uid, company: data.company || "", product: data.product || "",
          category: data.category || "Autre / à classer",
          quantity: Number(data.quantity ?? data.qty ?? 0),
          maxUnitBudget: Number(data.maxUnitBudget ?? data.budget ?? 0),
          location: data.location || "", status: "active",
          createdAt: data.createdAt || serverTimestamp()
        }, { merge: true });
      })
    ]);

    // Charge les annonces de tous les comptes connectés.
    const [publicSellerSnapshot, publicBuyerSnapshot] = await Promise.all([
      getDocs(collection(db, "publicOffers")),
      getDocs(collection(db, "publicNeeds"))
    ]);

    // Nettoie uniquement les copies publiques orphelines appartenant à ce compte.
    const activeOfferIds = new Set(sellerSnapshot.docs.map(item => item.id));
    const activeNeedIds = new Set(buyerSnapshot.docs.map(item => item.id));
    const staleOfferIds = new Set(publicSellerSnapshot.docs
      .filter(item => item.data().ownerUid === user.uid && !activeOfferIds.has(item.id)).map(item => item.id));
    const staleNeedIds = new Set(publicBuyerSnapshot.docs
      .filter(item => item.data().ownerUid === user.uid && !activeNeedIds.has(item.id)).map(item => item.id));
    const stalePublicDocs = [
      ...[...staleOfferIds].map(id => doc(db, "publicOffers", id)),
      ...[...staleNeedIds].map(id => doc(db, "publicNeeds", id))
    ];
    for (let i = 0; i < stalePublicDocs.length; i += 400) {
      const batch = writeBatch(db);
      stalePublicDocs.slice(i, i + 400).forEach(ref => batch.delete(ref));
      await batch.commit();
    }

    const sellers = publicSellerSnapshot.docs.filter(item => !staleOfferIds.has(item.id)).map(item => {
      const data = item.data();
      return {
        id: item.id, ownerUid: data.ownerUid || "",
        company: data.company || "", product: data.product || "",
        category: data.category || "Autre / à classer",
        qty: Number(data.quantity ?? 0), price: Number(data.unitPrice ?? 0),
        location: data.location || ""
      };
    });
    const buyers = publicBuyerSnapshot.docs.filter(item => !staleNeedIds.has(item.id)).map(item => {
      const data = item.data();
      return {
        id: item.id, ownerUid: data.ownerUid || "",
        company: data.company || "", product: data.product || "",
        category: data.category || "Autre / à classer",
        qty: Number(data.quantity ?? 0), budget: Number(data.maxUnitBudget ?? 0),
        location: data.location || ""
      };
    });
    const [serviceOfferSnapshot, serviceRequestSnapshot] = await Promise.all([
      getDocs(collection(db, "publicServiceOffers")),
      getDocs(collection(db, "publicServiceRequests"))
    ]);
    const serviceOffers = serviceOfferSnapshot.docs.map(item => ({ id:item.id, ...item.data() }));
    const serviceRequests = serviceRequestSnapshot.docs.map(item => ({ id:item.id, ...item.data() }));
    window.dispatchEvent(new CustomEvent("dealhunter-service-data", {
      detail: { offers: serviceOffers, requests: serviceRequests }
    }));
    const [workerProfileSnapshot, workOpeningSnapshot] = await Promise.all([
      getDocs(collection(db, "publicWorkerProfiles")),
      getDocs(collection(db, "publicWorkOpenings"))
    ]);
    window.dispatchEvent(new CustomEvent("dealhunter-work-data", {
      detail: {
        profiles: workerProfileSnapshot.docs.map(item => ({ id: item.id, ...item.data() })),
        openings: workOpeningSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      }
    }));
    window.dispatchEvent(new CustomEvent("dealhunter-cloud-data", {
      detail: { sellers, buyers }
    }));
  };

  window.addEventListener("dealhunter-save-service-record", async event => {
    const user = auth.currentUser;
    const data = event.detail || {};
    if (!user || !["publicServiceOffers", "publicServiceRequests"].includes(data.collectionName)) {
      status.textContent = "Connecte-toi pour publier une offre ou une demande de service.";
      return;
    }
    const collectionName = data.collectionName;
    const record = data.record || {};
    const company = String(record.company || "").trim();
    const title = String(record.title || "").trim();
    const description = String(record.description || "").trim();
    const category = String(record.category || "").trim();
    const location = String(record.location || "").trim();
    const countryCode = String(record.countryCode || "").trim().toUpperCase();
    const qualifications = Array.isArray(record.qualifications)
      ? record.qualifications.map(value => String(value).trim()).filter(Boolean).slice(0, 30) : [];
    const remote = record.remote === true;
    const coverageRadiusKm = Number(record.coverageRadiusKm || 0);
    if (!company || !title || !description || !category || !location || !/^[A-Z]{2}$/.test(countryCode)
      || !Number.isFinite(coverageRadiusKm) || coverageRadiusKm < 0 || coverageRadiusKm > 5000) {
      status.textContent = "Vérifie les champs obligatoires, le code pays ISO à 2 lettres et le rayon (0 à 5 000 km).";
      return;
    }
    try {
      const recordId = String(data.recordId || "").trim();
      const target = recordId ? doc(db, collectionName, recordId) : doc(collection(db, collectionName));
      const payload = {
        ownerUid: user.uid, company, title, description, category, location, countryCode,
        qualifications, remote, coverageRadiusKm,
        requiredQualifications: collectionName === "publicServiceRequests" ? qualifications : [],
        remoteAccepted: collectionName === "publicServiceRequests" && remote,
        status: "active", updatedAt: serverTimestamp()
      };
      if (!recordId) payload.createdAt = serverTimestamp();
      await setDoc(target, payload, { merge: true });
      await loadCloudRecords(user);
      status.textContent = collectionName === "publicServiceOffers"
        ? "Offre de service publiée dans le catalogue professionnel."
        : "Demande de service publiée dans le catalogue professionnel.";
    } catch (error) {
      console.error("Publication du service impossible :", error);
      status.textContent = "Publication impossible : " + (error.message || error.code || "erreur inconnue");
    }
  });


  window.addEventListener("dealhunter-save-work-record", async event => {
    const user = auth.currentUser;
    const data = event.detail || {};
    const record = data.record || {};
    const collectionName = data.collectionName;
    if (!user || !["publicWorkerProfiles", "publicWorkOpenings"].includes(collectionName)) {
      status.textContent = "Connecte-toi pour publier un profil ou une offre professionnelle.";
      return;
    }
    const textValue = key => String(record[key] || "").trim();
    const listValue = key => Array.isArray(record[key]) ? record[key].map(x => String(x).trim()).filter(Boolean).slice(0, 40) : [];
    const countryCode = textValue("countryCode").toUpperCase();
    if (!textValue("title") || !textValue("category") || !textValue("description") ||
        !textValue("location") || !/^[A-Z]{2}$/.test(countryCode)) {
      status.textContent = "Complète le titre, métier, description, ville et code pays ISO à deux lettres.";
      return;
    }
    let payload;
    if (collectionName === "publicWorkerProfiles") {
      const engagementTypes = listValue("engagementTypes");
      if (!record.publicProfileConsent || !engagementTypes.length ||
          engagementTypes.some(x => !["employment", "independent"].includes(x))) {
        status.textContent = "Confirme la publication publique et sélectionne au moins un type d'engagement.";
        return;
      }
      payload = {
        ownerUid: user.uid, title: textValue("title"), category: textValue("category"),
        description: textValue("description"), location: textValue("location"), countryCode,
        skills: listValue("skills"), qualifications: listValue("qualifications"),
        engagementTypes, availableFrom: textValue("availableFrom"),
        remote: record.remote === true, publicProfileConsent: true, status: "active",
        updatedAt: serverTimestamp()
      };
    } else {
      const engagementType = textValue("engagementType");
      if (!textValue("company") || !["employment", "independent"].includes(engagementType)) {
        status.textContent = "Indique l'entreprise et choisis salarié ou mission indépendante.";
        return;
      }
      payload = {
        ownerUid: user.uid, company: textValue("company"), title: textValue("title"),
        category: textValue("category"), description: textValue("description"),
        location: textValue("location"), countryCode,
        requiredSkills: listValue("requiredSkills"), requiredQualifications: listValue("requiredQualifications"),
        engagementType, startDate: textValue("startDate"),
        remoteAccepted: record.remoteAccepted === true, status: "active", updatedAt: serverTimestamp()
      };
    }
    try {
      const recordId = String(data.recordId || "").trim();
      const target = recordId ? doc(db, collectionName, recordId) : doc(collection(db, collectionName));
      if (!recordId) payload.createdAt = serverTimestamp();
      await setDoc(target, payload, { merge: true });
      await loadCloudRecords(user);
      status.textContent = collectionName === "publicWorkerProfiles"
        ? "Profil professionnel publié. Tu peux le retirer en le fermant ou en le supprimant."
        : "Offre professionnelle publiée dans le catalogue DealHunter.";
    } catch (error) {
      console.error("Publication professionnelle impossible :", error);
      status.textContent = "Publication impossible : " + (error.message || error.code || "erreur inconnue");
    }
  });

  window.addEventListener("dealhunter-update-business-record", async event => {
    const user = auth.currentUser;
    const { collectionName, recordId, record } = event.detail || {};
    if (!user || collectionName !== "sellerOffers" || typeof recordId !== "string" || !recordId || !record) {
      status.textContent = "Modification impossible : compte ou stock non valide.";
      return;
    }
    const company = String(record.company || "").trim();
    const product = String(record.product || "").trim();
    const category = String(record.category || "").trim();
    const location = String(record.location || "").trim();
    const quantity = Number(record.quantity);
    const unitPrice = Number(record.unitPrice);
    if (!company || !product || !category || !location || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      status.textContent = "Vérifie les champs : quantité entière positive et prix unitaire supérieur à zéro.";
      return;
    }
    try {
      const privateRef = doc(db, "users", user.uid, "sellerOffers", recordId);
      const publicRef = doc(db, "publicOffers", recordId);
      const [privateSnap, publicSnap] = await Promise.all([getDoc(privateRef), getDoc(publicRef)]);
      if (!privateSnap.exists()) throw new Error("Ce stock n’existe plus dans ton compte.");
      if (publicSnap.exists() && publicSnap.data().ownerUid !== user.uid) {
        throw new Error("La copie du catalogue n’appartient pas à ce compte ; aucune modification effectuée.");
      }
      const original = privateSnap.data();
      const updated = { company, product, category, quantity, unitPrice, location };
      const batch = writeBatch(db);
      batch.update(privateRef, updated);
      batch.set(publicRef, {
        ownerUid: user.uid, ...updated, status: "active",
        createdAt: original.createdAt || serverTimestamp()
      });
      await batch.commit();
      await loadCloudRecords(user);
      status.textContent = "Stock modifié et catalogue partagé synchronisé.";
      window.dispatchEvent(new CustomEvent("dealhunter-business-record-updated"));
    } catch (error) {
      console.error("Modification du stock impossible :", error);
      status.textContent = "Modification impossible : " + (error.message || error.code || "erreur inconnue");
    }
  });

  window.addEventListener("dealhunter-remove-business-record", async event => {
    const user = auth.currentUser;
    const { collectionName, recordId } = event.detail || {};
    if (!user || !["sellerOffers", "buyerNeeds"].includes(collectionName) || typeof recordId !== "string" || !recordId) {
      status.textContent = "Retrait impossible : annonce ou compte non valide.";
      return;
    }
    const privateRef = doc(db, "users", user.uid, collectionName, recordId);
    const isSeller = collectionName === "sellerOffers";
    const publicRef = doc(db, isSeller ? "publicOffers" : "publicNeeds", recordId);
    try {
      const [privateSnap, publicSnap] = await Promise.all([getDoc(privateRef), getDoc(publicRef)]);
      if (publicSnap.exists() && publicSnap.data().ownerUid !== user.uid) {
        throw new Error("La copie du catalogue n'appartient pas à ce compte ; aucune annonce n'a été supprimée.");
      }
      const batch = writeBatch(db);
      if (privateSnap.exists()) batch.delete(privateRef);
      if (publicSnap.exists()) batch.delete(publicRef);
      await batch.commit();
      await loadCloudRecords(user);
      status.textContent = isSeller
        ? "Stock retiré de tes annonces et du catalogue partagé."
        : "Besoin retiré de tes annonces et du catalogue partagé.";
    } catch (error) {
      console.error("Retrait de l'annonce impossible :", error);
      status.textContent = "Retrait impossible : " + (error.message || error.code || "erreur inconnue");
    }
  });

  const saveUserProfile = async user => {
    const userRef = doc(db, "users", user.uid);
    const existing = await getDoc(userRef);
    const profile = {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      updatedAt: serverTimestamp()
    };
    if (!existing.exists()) profile.createdAt = serverTimestamp();
    await setDoc(userRef, profile, { merge: true });
  };

  getRedirectResult(auth).catch(showError);

  onAuthStateChanged(auth, async user => {
    window.dealhunterUserUid = user?.uid || ''; 
    status.replaceChildren();
    if (accountStatus) accountStatus.textContent = user
      ? "Utilisateur connecté : " + (user.email || user.displayName || "compte utilisateur")
      : "Aucun utilisateur connecté.";
    if (user) {
      const label = document.createElement("span");
      label.className = "auth-user";
      label.textContent = "Connecté : " + (user.email || user.displayName || "compte utilisateur");
      status.append(label);
      signOutButton.classList.remove("hidden");
      [emailButton, createButton, googleButton, appleButton].forEach(button => button.disabled = true);
      let firestoreStep = "profil";
      try {
        await saveUserProfile(user);
        firestoreStep = "annonces privées et catalogues partagés";
        await loadCloudRecords(user);
        firestoreStep = "demandes de mise en relation";
        await loadMatchRequests(user);
        status.dataset.firestore = "saved";
      } catch (error) {
        console.error("Erreur Firestore (" + firestoreStep + ") :", error);
        status.dataset.firestore = "error";
        status.append(document.createTextNode(" · Erreur Firestore (" + firestoreStep + ") : " + (error.code || error.message || "erreur inconnue")));
      }
    } else {
      status.textContent = "Aucun compte connecté.";
      delete status.dataset.firestore;
      window.dispatchEvent(new CustomEvent('dealhunter-match-requests', { detail: { requests: [] } }));
      window.dispatchEvent(new CustomEvent('dealhunter-deals', { detail: { deals: [] } }));
      signOutButton.classList.add("hidden");
      [emailButton, createButton, googleButton, appleButton].forEach(button => button.disabled = false);
    }
  });

  googleButton.addEventListener("click", async () => {
    status.textContent = "Ouverture de Google…";
    try { await signInWithProvider(new GoogleAuthProvider()); }
    catch (error) { showError(error); }
  });
  appleButton.addEventListener("click", async () => {
    status.textContent = "Ouverture de la connexion Apple…";
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      await signInWithProvider(provider);
    } catch (error) { showError(error); }
  });
  emailForm.addEventListener("submit", async event => {
    event.preventDefault();
    const { email, password } = credentials();
    status.textContent = "Connexion en cours…";
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch (error) { showError(error); }
  });
  resetButton.addEventListener("click", async () => {
    const email = document.getElementById("authEmail").value.trim();
    if (!email) {
      status.textContent = "Saisis d’abord ton adresse e-mail pour recevoir le lien de réinitialisation.";
      return;
    }
    status.textContent = "Envoi du lien de réinitialisation…";
    try {
      await sendPasswordResetEmail(auth, email);
      status.textContent = "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé. Vérifie aussi les courriers indésirables.";
    } catch (error) {
      showError(error);
    }
  });
  createButton.addEventListener("click", async () => {
    const { email, password } = credentials();
    if (!email || password.length < 8) {
      status.textContent = "Saisis une adresse e-mail et un mot de passe d’au moins 8 caractères.";
      return;
    }
    status.textContent = "Création du compte…";
    try { await createUserWithEmailAndPassword(auth, email, password); }
    catch (error) { showError(error); }
  });
  const sellerForm = document.getElementById("sellerForm");
  const buyerForm = document.getElementById("buyerForm");
  const saveBusinessRecord = async (event, form, collectionName, fields) => {
    if (event.target !== form) return;
    const user = auth.currentUser;
    if (!user) {
      event.preventDefault();
      event.stopImmediatePropagation();
      status.textContent = "Connecte-toi avant d’enregistrer une offre ou un besoin.";
      return;
    }
    const record = Object.fromEntries(fields.map(([key, id, type]) => [
      key, type === "number" ? Number(document.getElementById(id).value) : document.getElementById(id).value.trim()
    ]));
    try {
      const privateRef = await addDoc(collection(db, "users", user.uid, collectionName), {
        ...record,
        createdAt: serverTimestamp(),
        status: "active"
      });
      const isSeller = collectionName === "sellerOffers";
      const publicCollection = isSeller ? "publicOffers" : "publicNeeds";
      const publicRecord = isSeller
        ? { ownerUid: user.uid, company: record.company, product: record.product, category: record.category, quantity: record.quantity, unitPrice: record.unitPrice, location: record.location, status: "active", createdAt: serverTimestamp() }
        : { ownerUid: user.uid, company: record.company, product: record.product, category: record.category, quantity: record.quantity, maxUnitBudget: record.maxUnitBudget, location: record.location, status: "active", createdAt: serverTimestamp() };
      await setDoc(doc(db, publicCollection, privateRef.id), publicRecord);
      await loadCloudRecords(user);
      status.textContent = collectionName === "sellerOffers"
        ? "Stock enregistré et synchronisé depuis Firebase."
        : "Besoin acheteur enregistré et synchronisé depuis Firebase.";
    } catch (error) {
      console.error("Enregistrement Firestore impossible :", error);
      status.textContent = "Enregistrement cloud impossible : " + (error.message || error.code);
    }
  };
  document.addEventListener("submit", event => {
    if (event.target === sellerForm && sellerForm.dataset.editingId) {
      event.preventDefault();
      return;
    }
    if (event.target === sellerForm) {
      saveBusinessRecord(event, sellerForm, "sellerOffers", [
        ["company", "sCompany"], ["product", "sProduct"], ["category", "sCategory"],
        ["quantity", "sQty", "number"], ["unitPrice", "sPrice", "number"], ["location", "sLocation"]
      ]);
    } else if (event.target === buyerForm) {
      saveBusinessRecord(event, buyerForm, "buyerNeeds", [
        ["company", "bCompany"], ["product", "bProduct"], ["category", "bCategory"],
        ["quantity", "bQty", "number"], ["maxUnitBudget", "bBudget", "number"], ["location", "bLocation"]
      ]);
    }
  }, true);

  const companyForm = document.getElementById("companyForm");
  companyForm.addEventListener("submit", async event => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      status.textContent = "Connecte-toi avant de créer ton espace entreprise.";
      return;
    }
    const companyName = document.getElementById("companyName").value.trim();
    const companyCountry = document.getElementById("companyCountry").value;
    const companyPhone = document.getElementById("companyPhone").value.trim();
    if (!companyName) {
      status.textContent = "Saisis le nom de ton entreprise.";
      return;
    }
    const submitButton = document.getElementById("createCompany");
    submitButton.disabled = true;
    status.textContent = "Enregistrement de ton espace entreprise…";
    try {
      await setDoc(doc(db, "users", user.uid), {
        company: {
          name: companyName,
          country: companyCountry,
          phone: companyPhone,
          updatedAt: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      }, { merge: true });
      status.textContent = "Espace entreprise enregistré avec succès.";
      companyForm.reset();
    } catch (error) {
      console.error("Enregistrement de l’entreprise impossible :", error);
      status.textContent = "Enregistrement impossible : " + (error.message || error.code);
    } finally {
      submitButton.disabled = false;
    }
  });

  signOutButton.addEventListener("click", async () => {
    try { await signOut(auth); }
    catch (error) { showError(error); }
  });
}

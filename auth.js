import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, collection, getDocs, onSnapshot, updateDoc, query, where, serverTimestamp, writeBatch, runTransaction
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
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
  const functions = getFunctions(app);
  const createDealProposalCall = httpsCallable(functions, "createDealProposal");
  const acceptDealProposalCall = httpsCallable(functions, "acceptDealProposal");
  const declineDealProposalCall = httpsCallable(functions, "declineDealProposal");
  const confirmDealCompletionCall = httpsCallable(functions, "confirmDealCompletion");
  const cancelDealCall = httpsCallable(functions, "cancelDeal");
  const createDealCheckoutSessionCall = httpsCallable(functions, "createDealCheckoutSession");
  const createSellerConnectAccountCall = httpsCallable(functions, "createSellerConnectAccount");
  const getSellerConnectStatusCall = httpsCallable(functions, "getSellerConnectStatus");
  const createSellerOnboardingLinkCall = httpsCallable(functions, "createSellerOnboardingLink");
  const openDealDisputeCall = httpsCallable(functions, "openDealDispute");
  const inspectDealPaymentReconciliationCall = httpsCallable(functions, "inspectDealPaymentReconciliation");
  const recordDealPaymentReconciliationReviewCall = httpsCallable(functions, "recordDealPaymentReconciliationReview");
  const getDealPaymentReconciliationAdminDashboardCall = httpsCallable(functions, "getDealPaymentReconciliationAdminDashboard");
  const adminQueueButton = document.getElementById("adminRefreshQueueButton");
  const adminQueueStatus = document.getElementById("adminQueueStatus");
  const adminQueue = document.getElementById("adminReconciliationQueue");
  const loadAdminReconciliationQueue = async () => {
    if (!auth.currentUser || !adminQueue) return;
    if (adminQueueButton) adminQueueButton.disabled = true;
    if (adminQueueStatus) adminQueueStatus.textContent = "Chargement des ventes signalées…";
    try {
      const response = await getDealPaymentReconciliationAdminDashboardCall({});
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      adminQueue.replaceChildren();
      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Aucune vente à examiner : aucun risque de paiement, remboursement, litige ou versement signalé.";
        adminQueue.append(empty);
      } else {
        items.forEach(deal => {
          const card = document.createElement("article");
          card.className = "item";
          const title = document.createElement("strong");
          title.textContent = deal.product || "Vente sans libellé";
          const detail = document.createElement("p");
          detail.className = "muted";
          const rawCurrency = String(deal.currency || "EUR").toUpperCase();
          const safeCurrency = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "JPY", "CNY", "INR"].includes(rawCurrency) ? rawCurrency : "EUR";
          const amount = deal.totalAmount === null ? "Montant indisponible" :
            new Intl.NumberFormat("fr-FR", { style: "currency", currency: safeCurrency }).format(deal.totalAmount);
          detail.textContent = "Vente : " + deal.dealId + " · " + amount + " · Paiement : " + (deal.paymentReviewStatus || deal.paymentStatus || "à examiner") + " · Remboursement : " + (deal.refundStatus || "none") + " · Litige : " + (deal.disputeStatus || "none") + " · Versement : " + (deal.transferStatus || "none");
          const audits = document.createElement("p");
          audits.className = "muted";
          audits.textContent = "Dernières décisions : " + (deal.audit?.length ? deal.audit.map(entry => entry.decision).join(", ") : "aucune");
          const inspect = document.createElement("button");
          inspect.type = "button";
          inspect.className = "secondary";
          inspect.textContent = "Inspecter cette vente";
          inspect.disabled = !deal.checkoutSessionId;
          inspect.addEventListener("click", () => {
            document.getElementById("adminDealId").value = deal.dealId || "";
            document.getElementById("adminCheckoutSessionId").value = deal.checkoutSessionId || "";
            document.getElementById("adminDealId").scrollIntoView({ behavior: "smooth", block: "center" });
            document.getElementById("adminDealId").focus();
          });
          card.append(title, detail, audits, inspect);
          adminQueue.append(card);
        });
      }
      if (adminQueueStatus) adminQueueStatus.textContent = items.length + " vente(s) à examiner (paiement, remboursement, litige ou versement) · maximum serveur : " + (response.data?.limit || 100) + ".";
    } catch (error) {
      if (adminQueueStatus) adminQueueStatus.textContent = "File indisponible : " + (error.message || error.code || "erreur inconnue");
    } finally {
      if (adminQueueButton) adminQueueButton.disabled = false;
    }
  };
  adminQueueButton?.addEventListener("click", loadAdminReconciliationQueue);
  let unsubscribeMatches = null;
  let unsubscribeOffers = null;
  let unsubscribeNeeds = null;
  let cloudSellers = [];
  let cloudBuyers = [];
  let cloudMatchDocs = [];
  const publishCloudData = () => {
    const sellerById = new Map(cloudSellers.map(item => [item.id, item]));
    const buyerById = new Map(cloudBuyers.map(item => [item.id, item]));
    const serverMatches = cloudMatchDocs.map(item => {
      const seller = sellerById.get(item.listingId);
      const buyer = buyerById.get(item.requestId);
      if (!seller || !buyer || item.status !== "suggested") return null;
      return { id: item.id, s: seller, b: buyer, score: Number(item.compatibilityScore) || 0 };
    }).filter(Boolean).sort((left, right) => right.score - left.score);
    window.dispatchEvent(new CustomEvent("dealhunter-cloud-data", {
      detail: { sellers: cloudSellers, buyers: cloudBuyers, serverMatches, serverMatchesLoaded: true }
    }));
  };
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
    const snap = await getDocs(query(collection(db,"matchRequests"),where("participantUids","array-contains",user.uid)));
    const dealSnap = await getDocs(query(collection(db,"deals"),where("participantUids","array-contains",user.uid)));
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
  window.addEventListener("dealhunter-create-match-request",async e=>{
    const user=auth.currentUser,d=e.detail||{};
    if(!user){status.textContent="Connecte-toi pour demander une mise en relation.";return;}
    if(![d.sellerUid,d.buyerUid].includes(user.uid)||d.sellerUid===d.buyerUid){status.textContent="Cette demande n’est pas autorisée pour ce compte.";return;}
    try{
      const isSeller=user.uid===d.sellerUid;
      await addDoc(collection(db,"matchRequests"),{sellerId:d.sellerId,buyerId:d.buyerId,sellerUid:d.sellerUid,buyerUid:d.buyerUid,participantUids:[d.sellerUid,d.buyerUid],requesterUid:user.uid,recipientUid:isSeller?d.buyerUid:d.sellerUid,requesterCompany:isSeller?d.sellerCompany:d.buyerCompany,recipientCompany:isSeller?d.buyerCompany:d.sellerCompany,product:d.product||"",unit:d.unit||"unit",status:"pending",createdAt:serverTimestamp()});
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
    const finish=message=>{if(typeof d.onResult==="function")d.onResult(message);};
    if(!user||!d.requestId){status.textContent="Connecte-toi et sélectionne une mise en relation.";finish(status.textContent);return;}
    const quantity=Number(d.quantity),unitPrice=Number(d.unitPrice);
    if(!Number.isSafeInteger(quantity)||quantity<=0||!Number.isFinite(unitPrice)||unitPrice<=0){
      status.textContent="Saisis une quantité entière et un prix unitaire positif.";finish(status.textContent);return;
    }
    try{
      await createDealProposalCall({requestId:d.requestId,quantity,unitPrice});
      await loadMatchRequests(user);
      status.textContent="Proposition envoyée. Elle devra être acceptée par l’autre entreprise.";
      finish(status.textContent);
    }catch(err){console.error(err);status.textContent="Proposition impossible : "+(err.message||err.code);finish(status.textContent);}
  });
  window.addEventListener("dealhunter-accept-deal",async e=>{
    const user=auth.currentUser,{dealId}=e.detail||{};
    if(!user||!dealId)return;
    try{
      await acceptDealProposalCall({dealId});
      await loadMatchRequests(user);
      status.textContent="Accord enregistré. Les conditions sont désormais verrouillées.";
    }catch(err){console.error(err);status.textContent="Acceptation impossible : "+(err.message||err.code);}
  });
  window.addEventListener("dealhunter-decline-deal",async e=>{
    const user=auth.currentUser,{dealId}=e.detail||{};
    if(!user||!dealId)return;
    try{
      await declineDealProposalCall({dealId});
      await loadMatchRequests(user);
      status.textContent="Proposition refusée. Aucun paiement n’a été déclenché.";
    }catch(err){console.error(err);status.textContent="Refus impossible : "+(err.message||err.code);}
  });
  window.addEventListener("dealhunter-cancel-deal",async e=>{
    const user=auth.currentUser,{dealId}=e.detail||{};
    if(!user||!dealId)return;
    try{
      const result=await cancelDealCall({dealId});
      await loadMatchRequests(user);
      status.textContent=result.data?.cancelled
        ?"Vente annulée. La session de paiement a été expirée si elle existait."
        :"Annulation enregistrée et en attente de vérification Stripe.";
    }catch(err){
      console.error(err);
      await loadMatchRequests(user);
      status.textContent="Annulation non finalisée : "+(err.message||err.code)+". Si une vérification Stripe est en cours, aucun versement vendeur ne sera déclenché.";
    }
  });
  window.addEventListener("dealhunter-pay-deal",async e=>{
    const user=auth.currentUser,{dealId}=e.detail||{};
    if(!user||!dealId)return;
    try{
      const result=await createDealCheckoutSessionCall({dealId});
      const url=result.data?.url;
      let checkoutUrl;
      try { checkoutUrl = new URL(url); } catch (_) {
        throw new Error("Lien de paiement sécurisé invalide.");
      }
      if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.stripe.com" ||
          checkoutUrl.username || checkoutUrl.password) {
        throw new Error("Le lien reçu ne correspond pas à la page officielle Stripe Checkout.");
      }
      window.location.assign(checkoutUrl.href);
    }catch(err){console.error(err);status.textContent="Paiement indisponible : "+(err.message||err.code);}
  });
  window.addEventListener("dealhunter-open-dispute",async e=>{
    const user=auth.currentUser,{dealId,reason,description}=e.detail||{};
    if(!user||!dealId)return;
    try{
      await openDealDisputeCall({dealId,reason,description});
      await loadMatchRequests(user);
      status.textContent="Litige enregistré. Le versement vendeur est suspendu pendant son examen.";
    }catch(err){console.error(err);status.textContent="Ouverture du litige impossible : "+(err.message||err.code);}
  });
  window.addEventListener("dealhunter-confirm-deal",async e=>{
    const user=auth.currentUser,{dealId}=e.detail||{};
    if(!user||!dealId)return;
    try{
      const result=await confirmDealCompletionCall({dealId});
      await loadMatchRequests(user);
      status.textContent=result.data?.completed
        ?"Les deux confirmations sont enregistrées. Vente terminée."
        :"Confirmation enregistrée. En attente de l’autre entreprise.";
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
          quantity: Number(data.quantity ?? data.qty ?? 0), unit: data.unit || "unit",
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
          quantity: Number(data.quantity ?? data.qty ?? 0), unit: data.unit || "unit",
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
        qty: Number(data.quantity ?? 0), unit: data.unit || "unit", price: Number(data.unitPrice ?? 0),
        location: data.location || ""
      };
    });
    const buyers = publicBuyerSnapshot.docs.filter(item => !staleNeedIds.has(item.id)).map(item => {
      const data = item.data();
      return {
        id: item.id, ownerUid: data.ownerUid || "",
        company: data.company || "", product: data.product || "",
        category: data.category || "Autre / à classer",
        qty: Number(data.quantity ?? 0), unit: data.unit || "unit", budget: Number(data.maxUnitBudget ?? 0),
        location: data.location || ""
      };
    });

    // Écoute en temps réel des catalogues et des suggestions générées par Cloud Functions.
    [unsubscribeOffers, unsubscribeNeeds, unsubscribeMatches].forEach(stop => { if (stop) stop(); });
    cloudSellers = sellers;
    cloudBuyers = buyers;
    cloudMatchDocs = [];
    publishCloudData();

    unsubscribeOffers = onSnapshot(collection(db, "publicOffers"), snapshot => {
      cloudSellers = snapshot.docs.filter(item => item.data().status === "active").map(item => {
        const data = item.data();
        return {
          id: item.id, ownerUid: data.ownerUid || "",
          company: data.company || "", product: data.product || "",
          category: data.category || "Autre / à classer",
          qty: Number(data.quantity ?? 0), unit: data.unit || "unit",
          price: Number(data.unitPrice ?? 0), location: data.location || ""
        };
      });
      publishCloudData();
    }, error => {
      console.error("Impossible de suivre les offres publiques :", error);
      status.textContent = "Suivi des offres indisponible : " + (error.code || error.message);
    });

    unsubscribeNeeds = onSnapshot(collection(db, "publicNeeds"), snapshot => {
      cloudBuyers = snapshot.docs.filter(item => item.data().status === "active").map(item => {
        const data = item.data();
        return {
          id: item.id, ownerUid: data.ownerUid || "",
          company: data.company || "", product: data.product || "",
          category: data.category || "Autre / à classer",
          qty: Number(data.quantity ?? 0), unit: data.unit || "unit",
          budget: Number(data.maxUnitBudget ?? 0), location: data.location || ""
        };
      });
      publishCloudData();
    }, error => {
      console.error("Impossible de suivre les besoins publics :", error);
      status.textContent = "Suivi des besoins indisponible : " + (error.code || error.message);
    });

    const matchesQuery = query(
      collection(db, "matches"),
      where("participantUids", "array-contains", user.uid)
    );
    unsubscribeMatches = onSnapshot(matchesQuery, snapshot => {
      cloudMatchDocs = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      publishCloudData();
    }, error => {
      console.error("Impossible de suivre les correspondances Firebase :", error);
      status.textContent = "Suivi des correspondances indisponible : " + (error.code || error.message);
    });
  };

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
      const updated = { company, product, category, quantity, unit: String(record.unit || "unit"), unitPrice, location };
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


  const adminTabButton = document.getElementById("adminTabButton");
  const adminAccessStatus = document.getElementById("adminAccessStatus");
  const adminInspectForm = document.getElementById("adminReconciliationInspectForm");
  const adminReviewForm = document.getElementById("adminReconciliationReviewForm");
  const adminInspectStatus = document.getElementById("adminInspectStatus");
  const adminReviewStatus = document.getElementById("adminReviewStatus");
  const adminResult = document.getElementById("adminReconciliationResult");
  const adminRecordButton = document.getElementById("adminRecordReviewButton");
  let adminInspectionReady = false;
  let inspectedDealId = "";
  let inspectedSessionId = "";

  adminInspectForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    const dealId = document.getElementById("adminDealId").value.trim();
    const checkoutSessionId = document.getElementById("adminCheckoutSessionId").value.trim();
    const button = document.getElementById("adminInspectButton");
    button.disabled = true;
    adminInspectionReady = false;
    adminRecordButton.disabled = true;
    adminInspectStatus.textContent = "Inspection Stripe en cours…";
    adminResult.textContent = "Chargement…";
    try {
      const result = await inspectDealPaymentReconciliationCall({ dealId, checkoutSessionId });
      inspectedDealId = dealId;
      inspectedSessionId = checkoutSessionId;
      adminInspectionReady = true;
      adminRecordButton.disabled = false;
      adminResult.textContent = JSON.stringify(result.data, null, 2);
      const checksBox = document.getElementById("adminReconciliationChecks");
      checksBox.replaceChildren();
      const checks = result.data?.checks || {};
      Object.entries(checks).forEach(([name, value]) => {
        const item = document.createElement("article");
        item.className = "item";
        const label = document.createElement("strong");
        const checkLabels = {
          identityMatches: "Identité de la vente et de l'acheteur",
          amountMatches: "Montant Stripe / montant attendu",
          currencyMatches: "Devise de la transaction",
          currentSession: "Session Checkout actuelle",
          checkoutAttemptMatches: "Tentative Checkout actuelle",
          paidInStripe: "Paiement confirmé par Stripe",
          paidInDealHunter: "Paiement enregistré dans DealHunter",
          paymentIntentMatches: "PaymentIntent cohérent"
        };
        label.textContent = checkLabels[name] || name;
        const state = document.createElement("div");
        state.textContent = value === true ? "Conforme" : value === false ? "Écart détecté" : String(value);
        state.className = value === true ? "status-success" : value === false ? "status-warning" : "muted";
        item.append(label, state);
        checksBox.append(item);
      });
      const auditBox = document.getElementById("adminAuditHistory");
      auditBox.replaceChildren();
      const history = Array.isArray(result.data?.reconciliationAudit) ? result.data.reconciliationAudit : [];
      if (!history.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Aucune décision enregistrée pour cette vente.";
        auditBox.append(empty);
      } else {
        history.forEach(entry => {
          const item = document.createElement("article");
          item.className = "item";
          const heading = document.createElement("strong");
          heading.textContent = entry.decision || "Décision sans libellé";
          const details = document.createElement("p");
          details.className = "muted";
          details.textContent = (entry.recordedAt || "Date inconnue") + " · Administrateur : " + (entry.adminUid || "inconnu") + " · Session : " + (entry.checkoutSessionId || "inconnue");
          const notes = document.createElement("p");
          notes.textContent = entry.notes || "Aucune note.";
          const outcome = document.createElement("p");
          outcome.className = "muted";
          outcome.textContent = entry.actionTaken ? "Action enregistrée" : "Aucune action financière exécutée";
          item.append(heading, details, notes, outcome);
          auditBox.append(item);
        });
      }
      adminInspectStatus.textContent = "Inspection terminée. Vérifie les écarts et l’historique avant de consigner une décision.";
      adminReviewStatus.textContent = "Inspection disponible. Une décision humaine et une note sont requises.";
    } catch (error) {
      adminResult.textContent = "Inspection impossible : " + (error.message || error.code || "erreur inconnue");
      adminInspectStatus.textContent = "Échec de l’inspection. Aucune décision ne peut être enregistrée.";
    } finally { button.disabled = false; }
  });

  adminReviewForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!adminInspectionReady || !inspectedDealId || !inspectedSessionId) {
      adminReviewStatus.textContent = "Effectue une inspection avant d’enregistrer une décision.";
      return;
    }
    const decision = document.getElementById("adminReviewDecision").value;
    const notes = document.getElementById("adminReviewNotes").value.trim();
    adminRecordButton.disabled = true;
    adminReviewStatus.textContent = "Enregistrement du journal d’audit…";
    try {
      const result = await recordDealPaymentReconciliationReviewCall({
        dealId: inspectedDealId, checkoutSessionId: inspectedSessionId, decision, notes
      });
      adminReviewStatus.textContent = result.data?.recorded
        ? "Décision enregistrée. Aucune action financière n’a été exécutée. Référence : " + result.data.auditId
        : "Le serveur n’a pas confirmé l’enregistrement.";
      document.getElementById("adminReviewNotes").value = "";
      adminInspectionReady = false;
    } catch (error) {
      adminReviewStatus.textContent = "Enregistrement refusé : " + (error.message || error.code || "erreur inconnue");
    } finally { adminRecordButton.disabled = !adminInspectionReady; }
  });

  onAuthStateChanged(auth, async user => {
    [unsubscribeOffers, unsubscribeNeeds, unsubscribeMatches].forEach(stop => { if (stop) stop(); });
    unsubscribeOffers = null; unsubscribeNeeds = null; unsubscribeMatches = null;
    cloudSellers = []; cloudBuyers = []; cloudMatchDocs = [];
    window.dealhunterUserUid = user?.uid || '';
    if (adminTabButton) adminTabButton.classList.add('hidden');
    adminInspectionReady = false;
    inspectedDealId = ''; inspectedSessionId = '';
    if (adminRecordButton) adminRecordButton.disabled = true;
    status.replaceChildren();
    if (accountStatus) accountStatus.textContent = user
      ? "Utilisateur connecté : " + (user.email || user.displayName || "compte utilisateur")
      : "Aucun utilisateur connecté.";
    if (user) {
      try {
        const token = await user.getIdTokenResult(true);
        const isAdmin = token.claims.admin === true;
        if (adminTabButton) adminTabButton.classList.toggle("hidden", !isAdmin);
        if (isAdmin) await loadAdminReconciliationQueue();
        if (adminAccessStatus) adminAccessStatus.textContent = isAdmin
          ? "Accès administrateur confirmé par le jeton Firebase."
          : "Accès refusé : ce compte ne possède pas le rôle administrateur.";
      } catch (error) {
        if (adminAccessStatus) adminAccessStatus.textContent = "Impossible de vérifier le rôle administrateur.";
      }
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
        if (sellerStripeStatus) {
          try {
            const stripeState = (await getSellerConnectStatusCall({})).data;
            sellerStripeStatus.textContent = !stripeState.configured
              ? "Compte vendeur Stripe non configuré."
              : stripeState.payoutsEnabled
                ? "Stripe Connect opérationnel : versements vendeur activés."
                : "Compte Stripe créé : vérification entreprise / coordonnées bancaires en attente (" + stripeState.onboardingStatus + ").";
          } catch (stripeStatusError) {
            console.warn("État Stripe vendeur indisponible :", stripeStatusError);
          }
        }
      } catch (error) {
        console.error("Erreur Firestore (" + firestoreStep + ") :", error);
        status.dataset.firestore = "error";
        status.append(document.createTextNode(" · Erreur Firestore (" + firestoreStep + ") : " + (error.code || error.message || "erreur inconnue")));
      }
    } else {
      if (adminAccessStatus) adminAccessStatus.textContent = "Connecte-toi avec un compte administrateur pour accéder à cet espace.";
      [unsubscribeOffers, unsubscribeNeeds, unsubscribeMatches].forEach(stop => { if (stop) stop(); });
      unsubscribeOffers = null; unsubscribeNeeds = null; unsubscribeMatches = null;
      cloudSellers = []; cloudBuyers = []; cloudMatchDocs = [];
      status.textContent = "Aucun compte connecté.";
      delete status.dataset.firestore;
      window.dispatchEvent(new CustomEvent('dealhunter-cloud-data', { detail: { sellers: [], buyers: [], serverMatches: [], serverMatchesLoaded: false } }));
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
        ? { ownerUid: user.uid, company: record.company, product: record.product, category: record.category, quantity: record.quantity, unit: record.unit || "unit", unitPrice: record.unitPrice, location: record.location, status: "active", createdAt: serverTimestamp() }
        : { ownerUid: user.uid, company: record.company, product: record.product, category: record.category, quantity: record.quantity, unit: record.unit || "unit", maxUnitBudget: record.maxUnitBudget, location: record.location, status: "active", createdAt: serverTimestamp() };
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
        ["quantity", "sQty", "number"], ["unit", "sUnit"], ["unitPrice", "sPrice", "number"], ["location", "sLocation"]
      ]);
    } else if (event.target === buyerForm) {
      saveBusinessRecord(event, buyerForm, "buyerNeeds", [
        ["company", "bCompany"], ["product", "bProduct"], ["category", "bCategory"],
        ["quantity", "bQty", "number"], ["unit", "bUnit"], ["maxUnitBudget", "bBudget", "number"], ["location", "bLocation"]
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

  const sellerStripeButton = document.getElementById("sellerStripeOnboarding");
  const sellerStripeStatus = document.getElementById("sellerStripeStatus");
  sellerStripeButton?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) {
      if (sellerStripeStatus) sellerStripeStatus.textContent = "Connecte-toi pour configurer les paiements vendeur.";
      return;
    }
    sellerStripeButton.disabled = true;
    if (sellerStripeStatus) sellerStripeStatus.textContent = "Préparation sécurisée du compte Stripe Connect…";
    try {
      await createSellerConnectAccountCall({});
      const result = await createSellerOnboardingLinkCall({});
      const url = result.data?.url;
      const parsed = url ? new URL(url) : null;
      if (!parsed || parsed.protocol !== "https:" || parsed.hostname !== "connect.stripe.com") {
        throw new Error("Lien d’onboarding Stripe invalide.");
      }
      if (sellerStripeStatus) sellerStripeStatus.textContent = "Redirection vers Stripe pour vérifier l’entreprise et les coordonnées bancaires…";
      window.location.assign(parsed.href);
    } catch (error) {
      console.error("Configuration Stripe Connect impossible :", error);
      if (sellerStripeStatus) sellerStripeStatus.textContent = "Configuration indisponible : " + (error.message || error.code) + ". Le mode paiement peut être désactivé ou l’espace entreprise incomplet.";
      sellerStripeButton.disabled = false;
    }
  });

  signOutButton.addEventListener("click", async () => {
    try { await signOut(auth); }
    catch (error) { showError(error); }
  });
}

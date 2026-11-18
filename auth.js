import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, collection, getDocs, updateDoc, query, where, serverTimestamp
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
    // Charger d'abord les demandes : une erreur sur les coordonnées ne doit pas masquer la liste.
    const snap = await getDocs(query(collection(db,"matchRequests"),where("participantUids","array-contains",user.uid)));
    const requests = snap.docs.map(item => ({id:item.id,...item.data()}));
    window.dispatchEvent(new CustomEvent("dealhunter-match-requests",{detail:{requests}}));
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
    }
    window.dispatchEvent(new CustomEvent("dealhunter-match-requests",{detail:{requests}}));
  };
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
    const sellers = publicSellerSnapshot.docs.map(item => {
      const data = item.data();
      return {
        id: item.id, ownerUid: data.ownerUid || "",
        company: data.company || "", product: data.product || "",
        category: data.category || "Autre / à classer",
        qty: Number(data.quantity ?? 0), price: Number(data.unitPrice ?? 0),
        location: data.location || ""
      };
    });
    const buyers = publicBuyerSnapshot.docs.map(item => {
      const data = item.data();
      return {
        id: item.id, ownerUid: data.ownerUid || "",
        company: data.company || "", product: data.product || "",
        category: data.category || "Autre / à classer",
        qty: Number(data.quantity ?? 0), budget: Number(data.maxUnitBudget ?? 0),
        location: data.location || ""
      };
    });
    window.dispatchEvent(new CustomEvent("dealhunter-cloud-data", {
      detail: { sellers, buyers }
    }));
  };

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

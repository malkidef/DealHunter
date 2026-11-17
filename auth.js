const status = document.getElementById("authStatus");
const account = document.getElementById("authAccount");
const companyForm = document.getElementById("companyForm");
const emailForm = document.getElementById("emailAuthForm");
const signUpButton = document.getElementById("emailSignUp");
const signOutButton = document.getElementById("signOut");
const googleButton = document.getElementById("googleSignIn");

let auth = null;
let db = null;
let currentUser = null;
let firebaseApi = null;

function setStatus(message, error = false) {
  if (!status) return;
  status.textContent = message;
  status.style.borderColor = error ? "#8b4141" : "#66552a";
}
function showAccount(user, companies = []) {
  if (!account) return;
  if (!user) {
    account.textContent = "Aucun utilisateur connecté.";
    return;
  }
  const companyNames = companies.map((c) => c.name).filter(Boolean);
  account.textContent = "Connecté : " + (user.email || user.uid) +
    (companyNames.length ? " · Entreprise(s) : " + companyNames.join(", ") : " · Aucune entreprise enregistrée.");
}
function requireConfigured() {
  return Boolean(window.DEALHUNTER_FIREBASE_CONFIG &&
    window.DEALHUNTER_FIREBASE_CONFIG.apiKey &&
    window.DEALHUNTER_FIREBASE_CONFIG.projectId);
}

async function init() {
  if (!requireConfigured()) {
    setStatus("Firebase non configuré. Ajoute firebase-config.js à partir du modèle firebase-config.example.js après avoir créé ton projet Firebase.");
    return;
  }
  try {
    const appSdk = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js");
    const authSdk = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js");
    const dbSdk = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");
    const app = appSdk.initializeApp(window.DEALHUNTER_FIREBASE_CONFIG);
    auth = authSdk.getAuth(app);
    db = dbSdk.getFirestore(app);
    firebaseApi = { ...authSdk, ...dbSdk };
    authSdk.onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      if (!user) {
        showAccount(null);
        setStatus("Firebase connecté. Connecte-toi ou crée un compte pour continuer.");
        return;
      }
      try {
        const q = dbSdk.query(dbSdk.collection(db, "companies"), dbSdk.where("ownerUid", "==", user.uid));
        const result = await dbSdk.getDocs(q);
        const companies = result.docs.map((d) => ({ id: d.id, ...d.data() }));
        showAccount(user, companies);
        if (companies[0]) localStorage.setItem("dh_company_id", companies[0].id);
        setStatus("Compte connecté. " + (companies.length ? "Espace entreprise disponible." : "Crée maintenant ton espace entreprise."));
      } catch (error) {
        showAccount(user);
        setStatus("Connecté, mais impossible de charger les entreprises : " + error.message, true);
      }
    });
  } catch (error) {
    setStatus("Initialisation Firebase impossible : " + error.message, true);
  }
}

emailForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!auth || !firebaseApi) return setStatus("Configure Firebase avant de te connecter.", true);
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  try {
    await firebaseApi.signInWithEmailAndPassword(auth, email, password);
    setStatus("Connexion réussie.");
  } catch (error) {
    setStatus("Connexion impossible : " + error.message, true);
  }
});

signUpButton?.addEventListener("click", async () => {
  if (!auth || !firebaseApi) return setStatus("Configure Firebase avant de créer un compte.", true);
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  if (!email || password.length < 8) return setStatus("Saisis un e-mail valide et un mot de passe d’au moins 8 caractères.", true);
  try {
    await firebaseApi.createUserWithEmailAndPassword(auth, email, password);
    setStatus("Compte créé et connecté.");
  } catch (error) {
    setStatus("Création du compte impossible : " + error.message, true);
  }
});

googleButton?.addEventListener("click", async () => {
  if (!auth || !firebaseApi) return setStatus("Configure Firebase avant de te connecter.", true);
  try {
    await firebaseApi.signInWithPopup(auth, new firebaseApi.GoogleAuthProvider());
    setStatus("Connexion Google réussie.");
  } catch (error) {
    setStatus("Connexion Google impossible : " + error.message, true);
  }
});

companyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || !db || !firebaseApi) return setStatus("Connecte-toi avant de créer une entreprise.", true);
  const name = document.getElementById("companyName").value.trim();
  const countryCode = document.getElementById("companyCountry").value;
  if (!name || name.length > 160) return setStatus("Le nom de l’entreprise doit contenir entre 1 et 160 caractères.", true);
  try {
    const company = await firebaseApi.addDoc(firebaseApi.collection(db, "companies"), {
      ownerUid: currentUser.uid,
      name,
      countryCode,
      email: currentUser.email || "",
      verificationStatus: "pending",
      createdAt: firebaseApi.serverTimestamp(),
      updatedAt: firebaseApi.serverTimestamp()
    });
    localStorage.setItem("dh_company_id", company.id);
    setStatus("Espace entreprise créé. Vérification de l’entreprise en attente.");
    companyForm.reset();
    const q = firebaseApi.query(firebaseApi.collection(db, "companies"), firebaseApi.where("ownerUid", "==", currentUser.uid));
    const result = await firebaseApi.getDocs(q);
    showAccount(currentUser, result.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (error) {
    setStatus("Création de l’entreprise impossible : " + error.message, true);
  }
});

signOutButton?.addEventListener("click", async () => {
  if (!auth || !firebaseApi) return setStatus("Aucune session Firebase active.");
  try {
    await firebaseApi.signOut(auth);
    localStorage.removeItem("dh_company_id");
    setStatus("Déconnexion effectuée.");
  } catch (error) {
    setStatus("Déconnexion impossible : " + error.message, true);
  }
});

init();

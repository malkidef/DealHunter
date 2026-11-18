import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-web-config.js";

const status = document.getElementById("authStatus");
const emailForm = document.getElementById("emailAuthForm");
const emailButton = document.getElementById("emailSignIn");
const createButton = document.getElementById("emailCreate");
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
    status.replaceChildren();
    if (user) {
      const label = document.createElement("span");
      label.className = "auth-user";
      label.textContent = "Connecté : " + (user.email || user.displayName || "compte utilisateur");
      status.append(label);
      signOutButton.classList.remove("hidden");
      [emailButton, createButton, googleButton, appleButton].forEach(button => button.disabled = true);
      try {
        await saveUserProfile(user);
        status.dataset.firestore = "saved";
      } catch (error) {
        console.error("Enregistrement du profil Firestore impossible :", error);
        status.dataset.firestore = "error";
        status.append(document.createTextNode(" · Profil non enregistré dans la base : vérifie les règles Firestore."));
      }
    } else {
      status.textContent = "Aucun compte connecté.";
      delete status.dataset.firestore;
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
  signOutButton.addEventListener("click", async () => {
    try { await signOut(auth); }
    catch (error) { showError(error); }
  });
}

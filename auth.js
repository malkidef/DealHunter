import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
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
  status.textContent = "À configurer : crée le projet Firebase et renseigne firebase-web-config.js. Les connexions Google, Apple et e-mail seront disponibles après cette étape.";
  [emailButton, createButton, googleButton, appleButton].forEach(button => button.disabled = true);
} else {
  const auth = getAuth(initializeApp(firebaseConfig));
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

  onAuthStateChanged(auth, user => {
    status.replaceChildren();
    if (user) {
      const label = document.createElement("span");
      label.className = "auth-user";
      label.textContent = "Connecté : " + (user.email || user.displayName || "compte utilisateur");
      status.append(label);
      signOutButton.classList.remove("hidden");
      [emailButton, createButton, googleButton, appleButton].forEach(button => button.disabled = true);
    } else {
      status.textContent = "Aucun compte connecté.";
      signOutButton.classList.add("hidden");
      [emailButton, createButton, googleButton, appleButton].forEach(button => button.disabled = false);
    }
  });

  googleButton.addEventListener("click", async () => {
    status.textContent = "Ouverture de Google…";
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (error) { showError(error); }
  });
  appleButton.addEventListener("click", async () => {
    status.textContent = "Ouverture de la connexion Apple…";
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      await signInWithPopup(auth, provider);
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

// Import Firebase (Modular Web SDK)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// ✅ Your Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCip1q8LbZN_tnBZgQ2Vp2RZ4C8PZQxPaw",
  authDomain: "hauntsync-forum-4b992.firebaseapp.com",
  projectId: "hauntsync-forum-4b992",
  storageBucket: "hauntsync-forum-4b992.appspot.com",
  messagingSenderId: "245053989822",
  appId: "1:245053989822:web:62e7b06c25c76e20f283d8"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ✅ Register New User
window.register = function () {
  const name = document.getElementById("name").value;
  const haunt = document.getElementById("haunt").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      alert(`✅ Registered as ${userCredential.user.email}`);
    })
    .catch((error) => {
      alert(`❌ ${error.message}`);
    });
};

// ✅ Login Existing User
window.login = function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      alert(`✅ Logged in as ${userCredential.user.email}`);
    })
    .catch((error) => {
      alert(`❌ ${error.message}`);
    });
};

// ✅ Sign In With Google
window.googleLogin = function () {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider)
    .then((result) => {
      alert(`✅ Signed in as ${result.user.email}`);
    })
    .catch((error) => {
      alert(`❌ ${error.message}`);
    });
};

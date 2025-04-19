// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCj0jLq5zNUoQjv8v9kZb6YzBQzP4ZP3pw",
  authDomain: "hauntsync-forum-4b992.firebaseapp.com",
  projectId: "hauntsync-forum-4b992",
  storageBucket: "hauntsync-forum-4b992.appspot.com",
  messagingSenderId: "245962082982",
  appId: "1:245962082982:web:bcb0ac4c3c20c7e29b2340"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Register event
document.getElementById("register-btn").addEventListener("click", () => {
  const name = document.getElementById("name").value;
  const haunt = document.getElementById("haunt").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      alert(`✅ Registered as: ${user.email}\nName: ${name}\nHaunt: ${haunt}`);
      // TODO: Optionally store name/haunt in Firestore or Realtime DB
    })
    .catch((error) => {
      alert(`❌ Registration Error: ${error.message}`);
    });
});

// Login event
document.getElementById("login-btn").addEventListener("click", () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      alert(`✅ Logged in as: ${user.email}`);
      // TODO: Redirect or show portal UI
    })
    .catch((error) => {
      alert(`❌ Login Error: ${error.message}`);
    });
});

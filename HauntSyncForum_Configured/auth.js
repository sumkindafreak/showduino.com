// Firebase config (yours)
const firebaseConfig = {
  apiKey: "AIzaSyCip1q8LbZN_tnBZgQ2Vp2RZ4C8PZQxPaw",
  authDomain: "hauntsync-forum-4b992.firebaseapp.com",
  projectId: "hauntsync-forum-4b992",
  storageBucket: "hauntsync-forum-4b992.appspot.com",
  messagingSenderId: "245053989822",
  appId: "1:245053989822:web:62e7b06c25c76e20f283d8"
};

// Init Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// 🔐 Register
function register() {
  const name = document.getElementById("name").value;
  const haunt = document.getElementById("haunt").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  auth.createUserWithEmailAndPassword(email, password)
    .then((cred) => {
      alert(`✅ Registered: ${cred.user.email}`);
    })
    .catch((err) => {
      alert(`❌ ${err.message}`);
    });
}

// 🔑 Login
function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  auth.signInWithEmailAndPassword(email, password)
    .then((cred) => {
      alert(`✅ Logged in: ${cred.user.email}`);
    })
    .catch((err) => {
      alert(`❌ ${err.message}`);
    });
}

// 🔓 Google Login
function googleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then((result) => {
      alert(`✅ Google Sign-In: ${result.user.email}`);
    })
    .catch((error) => {
      alert(`❌ ${error.message}`);
    });
}

// ✅ Attach functions once DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById("registerBtn").addEventListener("click", register);
  document.getElementById("loginBtn").addEventListener("click", login);
  document.getElementById("googleBtn").addEventListener("click", googleLogin);
});

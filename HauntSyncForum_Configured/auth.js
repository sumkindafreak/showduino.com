// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCjdh1wafL8ukJgucbya9X8kzQQtP2WPWw",
  authDomain: "hauntsync-forum-4b992.firebaseapp.com",
  projectId: "hauntsync-forum-4b992",
  storageBucket: "hauntsync-forum-4b992.appspot.com",
  messagingSenderId: "165297838270",
  appId: "1:165297838270:web:1e4a3278e2d7de23b92490"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// REGISTER
document.getElementById("registerBtn").addEventListener("click", () => {
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;

  auth.createUserWithEmailAndPassword(email, password)
    .then(userCredential => {
      alert("✅ Registered as: " + userCredential.user.email);
    })
    .catch(error => {
      alert("❌ " + error.message);
    });
});

// LOGIN
document.getElementById("loginBtn").addEventListener("click", () => {
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;

  auth.signInWithEmailAndPassword(email, password)
    .then(userCredential => {
      alert("✅ Logged in as: " + userCredential.user.email);
    })
    .catch(error => {
      alert("❌ " + error.message);
    });
});


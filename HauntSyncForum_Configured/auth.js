// ✅ Firebase Config (your exact values)
const firebaseConfig = {
  apiKey: "AIzaSyCip1q8LbZN_tnBZgQ2Vp2RZ4C8PZQxPaw",
  authDomain: "hauntsync-forum-4b992.firebaseapp.com",
  projectId: "hauntsync-forum-4b992",
  storageBucket: "hauntsync-forum-4b992.appspot.com",
  messagingSenderId: "245053989822",
  appId: "1:245053989822:web:62e7b06c25c76e20f283d8"
};

// ✅ Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ✅ Register Function
function register() {
  const name = document.getElementById("name").value.trim();
  const haunt = document.getElementById("haunt").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("Email and password are required.");
    return;
  }

  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      alert(`✅ Registered as ${userCredential.user.email}`);
      // Optionally: Save 'name' and 'haunt' to Firestore later
    })
    .catch((error) => {
      alert(`❌ Registration Error:\n${error.message}`);
    });
}

// ✅ Login Function
function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("Please enter your email and password.");
    return;
  }

  auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      alert(`✅ Logged in as ${userCredential.user.email}`);
      // TODO: Redirect to portal or show content
    })
    .catch((error) => {
      alert(`❌ Login Error:\n${error.message}`);
    });
}

// ✅ Google Sign-In
function googleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then((result) => {
      alert(`✅ Google Sign-In: ${result.user.email}`);
    })
    .catch((error) => {
      alert(`❌ Google Login Error:\n${error.message}`);
    });
}

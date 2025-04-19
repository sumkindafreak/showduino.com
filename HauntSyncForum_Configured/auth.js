// Your Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "hauntsync-forum-4b992.firebaseapp.com",
  projectId: "hauntsync-forum-4b992",
  storageBucket: "hauntsync-forum-4b992.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Register function
function register() {
  const name = document.getElementById("name").value;
  const haunt = document.getElementById("haunt").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  firebase.auth().createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      alert(`✅ Registered as: ${userCredential.user.email}`);
      // Optionally, save 'name' and 'haunt' to Firestore here
    })
    .catch((error) => {
      alert(`❌ Registration Error: ${error.message}`);
    });
}

// Login function
function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  firebase.auth().signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      alert(`✅ Logged in as: ${userCredential.user.email}`);
      // Optionally, redirect to another page here
    })
    .catch((error) => {
      alert(`❌ Login Error: ${error.message}`);
    });
}

// Google Sign-In function
function googleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .then((result) => {
      alert(`✅ Google Sign-In: ${result.user.email}`);
    })
    .catch((error) => {
      alert(`❌ Google Login Error: ${error.message}`);
    });
}

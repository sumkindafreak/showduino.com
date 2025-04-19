// Initialize Firebase (compat style)
const firebaseConfig = {
  apiKey: "AIzaSyCj0jLq5zNUoQjv8v9kZb6YzBQzP4ZP3pw",
  authDomain: "hauntsync-forum-4b992.firebaseapp.com",
  projectId: "hauntsync-forum-4b992",
  storageBucket: "hauntsync-forum-4b992.appspot.com",
  messagingSenderId: "245962082982",
  appId: "1:245962082982:web:bcb0ac4c3c20c7e29b2340"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// Register function
function register() {
  const name = document.getElementById("name").value;
  const haunt = document.getElementById("haunt").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      alert(`✅ Registered as: ${user.email}\nName: ${name}\nHaunt: ${haunt}`);
      // TODO: Save name/haunt to Firestore later
    })
    .catch((error) => {
      alert(`❌ Registration Error: ${error.message}`);
    });
}

// Login function
function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      alert(`✅ Logged in as: ${user.email}`);
      // TODO: Load portal or redirect
    })
    .catch((error) => {
      alert(`❌ Login Error: ${error.message}`);
    });
}

// Optional: Google login
function googleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();

  auth.signInWithPopup(provider)
    .then((result) => {
      const user = result.user;
      alert(`✅ Google Login: ${user.email}`);
    })
    .catch((error) => {
      alert(`❌ Google Login Error: ${error.message}`);
    });
}

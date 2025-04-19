// ✅ Firebase config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY", // Replace with your actual values
  authDomain: "hauntsync-forum-4b992.firebaseapp.com",
  projectId: "hauntsync-forum-4b992",
  storageBucket: "hauntsync-forum-4b992.appspot.com",
  messagingSenderId: "525589326062",
  appId: "1:525589326062:web:cfa0d7dc272c292fbb2840"
};

// ✅ Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ✅ Register and Save User Data to Firestore
window.register = function () {
  const name = document.getElementById("name").value.trim();
  const haunt = document.getElementById("haunt").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("❌ Email and password are required.");
    return;
  }

  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const user = userCredential.user;

      return db.collection("users").doc(user.uid).set({
        name: name || "Unnamed",
        haunt: haunt || "Unknown",
        email: user.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    })
    .then(() => {
      alert("✅ Registered and saved!");
      window.location.href = "forum.html";
    })
    .catch((error) => {
      alert("❌ " + error.message);
    });
};

// ✅ Login
window.login = function () {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      alert(`✅ Logged in as: ${userCredential.user.email}`);
      window.location.href = "forum.html";
    })
    .catch((error) => {
      alert("❌ " + error.message);
    });
};

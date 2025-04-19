// Your Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCj0jL2...REDACTED", // use your full key
  authDomain: "hauntsync-forum-4b992.firebaseapp.com",
  projectId: "hauntsync-forum-4b992",
  storageBucket: "hauntsync-forum-4b992.appspot.com",
  messagingSenderId: "525589326062",
  appId: "1:525589326062:web:cfa0d7dc272c292fbb2840"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// REGISTER FUNCTION
window.register = function () {
  const name = document.getElementById("name").value;
  const haunt = document.getElementById("haunt").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  firebase.auth().createUserWithEmailAndPassword(email, password)
    .then(userCredential => {
      alert("✅ Registered as: " + userCredential.user.email);
    })
    .catch(error => {
      alert("❌ " + error.message);
    });
};

// LOGIN FUNCTION
window.login = function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  firebase.auth().signInWithEmailAndPassword(email, password)
    .then(userCredential => {
      alert("✅ Logged in as: " + userCredential.user.email);
    })
    .catch(error => {
      alert("❌ " + error.message);
    });
};

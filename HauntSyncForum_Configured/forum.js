// Firestore reference
const db = firebase.firestore();
const auth = firebase.auth();

// 🧠 On page load, ensure user is logged in
auth.onAuthStateChanged(user => {
  if (!user) {
    alert("You must be signed in.");
    window.location.href = "index.html";
  } else {
    loadUserProfile(user.uid);
    loadThreads();
  }
});

// 🔒 Logout function
function logout() {
  auth.signOut().then(() => {
    alert("Signed out.");
    window.location.href = "index.html";
  });
}

// 🧑‍🔧 Load user profile data
function loadUserProfile(uid) {
  db.collection("users").doc(uid).get()
    .then(doc => {
      if (doc.exists) {
        const data = doc.data();
        document.getElementById("ritual-persona").value = data.name || "";
        document.getElementById("ritual-haunt").value = data.haunt || "";
        document.getElementById("ritual-sigil").value = data.sigil || "";
      }
    })
    .catch(error => {
      console.error("Failed to load profile:", error);
    });
}

// 💾 Save ritual profile info
function saveRitualProfile() {
  const user = auth.currentUser;
  if (!user) return;

  const persona = document.getElementById("ritual-persona").value;
  const haunt = document.getElementById("ritual-haunt").value;
  const sigil = document.getElementById("ritual-sigil").value;

  db.collection("users").doc(user.uid).update({
    name: persona,
    haunt: haunt,
    sigil: sigil
  })
    .then(() => {
      alert("🔮 Ritual profile saved.");
    })
    .catch(error => {
      alert("❌ Failed to save profile: " + error.message

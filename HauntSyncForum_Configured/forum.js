// ✅ Initialize Firestore & Auth
const db = firebase.firestore();
const auth = firebase.auth();

// ✅ Check if user is logged in on page load
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log("🧙 Logged in as:", user.email);
    loadThreads(); // Automatically load forum threads
  } else {
    alert("❌ You must be signed in");
    window.location.href = "index.html";
  }
});

// ✅ Logout
function logout() {
  auth.signOut().then(() => {
    console.log("👋 Signed out");
    window.location.href = "https://show-duino.com"; // 🔁 Redirect after logout
  });
}

// ✅ Save Ritual Profile
function saveRitualProfile() {
  const name = document.getElementById("ritual-persona").value;
  const haunt = document.getElementById("ritual-haunt").value;
  const sigil = document.getElementById("ritual-sigil").value;

  const user = auth.currentUser;
  if (!user) return alert("❌ Not logged in");

  db.collection("users").doc(user.uid).update({
    name,
    haunt,
    sigil,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  })
    .then(() => alert("✅ Ritual profile updated"))
    .catch((error) => alert("❌ " + error.message));
}

// ✅ Post a Thread
function postThread() {
  const content = document.getElementById("thread-content").value.trim();
  const user = auth.currentUser;
  if (!user || !content) return;

  db.collection("threads").add({
    content,
    user: user.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  })
    .then(() => {
      document.getElementById("thread-content").value = "";
      loadThreads(); // Refresh thread list
    })
    .catch((error) => alert("❌ " + error.message));
}

// ✅ Load Threads
function loadThreads() {
  const list = document.getElementById("threads-list");
  list.innerHTML = "";

  db.collection("threads")
    .orderBy("createdAt", "desc")
    .limit(10)
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const li = document.createElement("li");
        li.textContent = `${doc.data().user}: ${doc.data().content}`;
        list.appendChild(li);
      });
    });
}

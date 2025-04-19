// Initialize Firestore & Auth
const db = firebase.firestore();
const auth = firebase.auth();

// ✅ Check if user is logged in on page load
auth.onAuthStateChanged(user => {
  if (!user) {
    alert("You must be signed in.");
    window.location.href = "index.html";
  } else {
    loadUserProfile(user.uid);
    loadThreads();
  }
});

// ✅ LOGOUT and redirect to Show-duino.com
function logout() {
  firebase.auth().signOut()
    .then(() => {
      console.log("✅ Logged out");
      window.location.href = "https://show-duino.com"; // ✅ redirect
    })
    .catch((error) => {
      alert("❌ Error signing out: " + error.message);
    });
}

// ✅ Load user profile data from Firestore
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

// ✅ Save ritual profile to Firestore
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
      alert("❌ Failed to save profile: " + error.message);
    });
}

// ✅ Post a new thread to Firestore
function postThread() {
  const user = auth.currentUser;
  if (!user) return;

  const content = document.getElementById("thread-content").value;
  if (!content.trim()) {
    alert("Please enter a thread message.");
    return;
  }

  db.collection("threads").add({
    uid: user.uid,
    content: content,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  })
    .then(() => {
      document.getElementById("thread-content").value = "";
      loadThreads(); // refresh thread list
    })
    .catch(error => {
      alert("❌ Failed to post thread: " + error.message);
    });
}

// ✅ Load all threads
function loadThreads() {
  const threadsList = document.getElementById("threads-list");
  threadsList.innerHTML = "";

  db.collection("threads")
    .orderBy("timestamp", "desc")
    .limit(20)
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const thread = doc.data();
        const li = document.createElement("li");
        const time = thread.timestamp?.toDate().toLocaleString() || "Unknown time";
        li.textContent = `${thread.content} (${time})`;
        threadsList.appendChild(li);
      });
    })
    .catch(error => {
      alert("❌ Failed to load threads: " + error.message);
    });
}

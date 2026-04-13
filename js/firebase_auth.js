// Firebase Authentication
// Handles sign-in, sign-up, sign-out, Google auth, and auth state changes
// Gracefully degrades when Firebase is not configured

class FirebaseAuth {
  constructor() {
    this.user = null;
    this._callbacks = [];
    this._unsubscribe = null;
  }

  init() {
    if (!FirebaseConfig.isReady()) {
      console.warn('[FirebaseAuth] Firebase not ready – auth disabled.');
      return this;
    }
    this._unsubscribe = window._firebaseAuth.onAuthStateChanged(user => {
      this.user = user;
      this._callbacks.forEach(fn => { try { fn(user); } catch (_) {} });
    });
    return this;
  }

  onAuthStateChanged(callback) {
    this._callbacks.push(callback);
    // Fire immediately with current state
    try { callback(this.user); } catch (_) {}
    return this;
  }

  async signIn(email, password) {
    if (!FirebaseConfig.isReady()) throw new Error('Firebase not configured');
    try {
      const cred = await window._firebaseAuth.signInWithEmailAndPassword(email, password);
      this.user = cred.user;
      return cred.user;
    } catch (err) {
      throw new Error(FirebaseAuth._friendlyError(err.code));
    }
  }

  async signUp(email, password, username = '') {
    if (!FirebaseConfig.isReady()) throw new Error('Firebase not configured');
    try {
      const cred = await window._firebaseAuth.createUserWithEmailAndPassword(email, password);
      if (username && cred.user) {
        await cred.user.updateProfile({ displayName: username });
      }
      this.user = cred.user;
      // Create user document in Firestore
      if (window._firebaseFirestore) {
        await window._firebaseFirestore.collection('users').doc(cred.user.uid).set({
          uid: cred.user.uid,
          email,
          displayName: username || email,
          subscription: 'free',
          createdAt: new Date().toISOString()
        }, { merge: true });
      }
      return cred.user;
    } catch (err) {
      throw new Error(FirebaseAuth._friendlyError(err.code));
    }
  }

  async signOut() {
    if (!FirebaseConfig.isReady()) return;
    await window._firebaseAuth.signOut();
    this.user = null;
  }

  async signInWithGoogle() {
    if (!FirebaseConfig.isReady()) throw new Error('Firebase not configured');
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const cred = await window._firebaseAuth.signInWithPopup(provider);
      this.user = cred.user;
      return cred.user;
    } catch (err) {
      throw new Error(FirebaseAuth._friendlyError(err.code));
    }
  }

  async resetPassword(email) {
    if (!FirebaseConfig.isReady()) throw new Error('Firebase not configured');
    await window._firebaseAuth.sendPasswordResetEmail(email);
  }

  isSignedIn() { return !!this.user; }

  getDisplayName() {
    if (!this.user) return 'Guest';
    return this.user.displayName || this.user.email || 'User';
  }

  getEmail() { return this.user ? this.user.email : null; }
  getUID()   { return this.user ? this.user.uid : null; }

  static _friendlyError(code) {
    const msgs = {
      'auth/wrong-password':       'Incorrect password.',
      'auth/user-not-found':       'No account found with that email.',
      'auth/email-already-in-use': 'An account already exists with that email.',
      'auth/weak-password':        'Password must be at least 6 characters.',
      'auth/invalid-email':        'Invalid email address.',
      'auth/popup-closed-by-user': 'Google sign-in cancelled.',
      'auth/network-request-failed': 'Network error. Check your connection.'
    };
    return msgs[code] || 'Authentication error. Please try again.';
  }

  destroy() {
    if (this._unsubscribe) this._unsubscribe();
  }
}

window.FirebaseAuth = FirebaseAuth;

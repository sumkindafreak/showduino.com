// ⚠ SECURITY WARNING: DO NOT commit real Firebase credentials to version control.
// Use environment variables, a build-time injection step, or a secrets manager in production.
//
// Firebase Configuration
// ─────────────────────────────────────────────────────────────────────────────
// SETUP: Replace the PLACEHOLDER values below with your actual Firebase project config.
// Get your config from: Firebase Console → Project Settings → Your apps → SDK setup
// Until replaced, Firebase features are disabled and the app runs in offline/local-only mode.
// ─────────────────────────────────────────────────────────────────────────────

class FirebaseConfig {
  static get _config() {
    return {
      // ↓↓↓  Replace every PLACEHOLDER_* value with your real Firebase credentials  ↓↓↓
      apiKey:            "PLACEHOLDER_API_KEY",
      authDomain:        "PLACEHOLDER_PROJECT_ID.firebaseapp.com",
      projectId:         "PLACEHOLDER_PROJECT_ID",
      storageBucket:     "PLACEHOLDER_PROJECT_ID.appspot.com",
      messagingSenderId: "PLACEHOLDER_SENDER_ID",
      appId:             "PLACEHOLDER_APP_ID"
      // ↑↑↑  Do not leave placeholder values in production deployments  ↑↑↑
    };
  }

  static get _isConfigured() {
    const cfg = FirebaseConfig._config;
    return cfg.apiKey && !cfg.apiKey.startsWith('PLACEHOLDER_') && !cfg.projectId.startsWith('PLACEHOLDER_');
  }

  static initFirebase() {
    if (!FirebaseConfig._isConfigured) {
      console.warn('[FirebaseConfig] Firebase not configured – running in demo/offline mode.');
      window._firebaseApp = null;
      window._firebaseAuth = null;
      window._firebaseFirestore = null;
      return false;
    }

    try {
      if (typeof firebase === 'undefined') {
        console.warn('[FirebaseConfig] Firebase SDK not loaded.');
        return false;
      }

      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(FirebaseConfig._config);
      }

      window._firebaseApp = firebase.app();
      window._firebaseAuth = firebase.auth();
      window._firebaseFirestore = firebase.firestore();

      // Enable offline persistence
      window._firebaseFirestore.enablePersistence({ synchronizeTabs: true }).catch(err => {
        if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
          console.warn('[FirebaseConfig] Persistence error:', err.code);
        }
      });

      console.log('[FirebaseConfig] Firebase initialized successfully.');
      return true;
    } catch (err) {
      console.error('[FirebaseConfig] Init error:', err);
      return false;
    }
  }

  static getCurrentUser() {
    try {
      return window._firebaseAuth ? window._firebaseAuth.currentUser : null;
    } catch (_) {
      return null;
    }
  }

  static isReady() {
    return !!(window._firebaseApp && window._firebaseAuth && window._firebaseFirestore);
  }
}

window.FirebaseConfig = FirebaseConfig;

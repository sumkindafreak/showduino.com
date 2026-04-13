// Firebase Configuration
// IMPORTANT: Replace these placeholder values with your actual Firebase project config.
// Get config from: https://console.firebase.google.com → Project Settings → Your apps → SDK setup

class FirebaseConfig {
  static get _config() {
    return {
      // TODO: Replace with your actual Firebase project credentials
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT_ID.appspot.com",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_APP_ID"
    };
  }

  static get _isConfigured() {
    const cfg = FirebaseConfig._config;
    return cfg.apiKey && cfg.apiKey !== 'YOUR_API_KEY' && cfg.projectId !== 'YOUR_PROJECT_ID';
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

/* global SHOWDUINO_CONFIG */
(function () {
  'use strict';

  const SDK_VERSION = '10.12.5';
  let firebaseApp = null;
  let firebaseAuth = null;
  let firestoreDb = null;
  let sdk = null;

  function getConfig() {
    return window.SHOWDUINO_CONFIG || { features: {}, firebase: {} };
  }

  function assertEnabled(feature) {
    const config = getConfig();
    if (!config.features.firebase || !config.features[feature]) {
      throw new Error(`Showduino feature "${feature}" is currently disabled.`);
    }
  }

  function validateFirebaseConfig(config) {
    const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
    const missing = required.filter((key) => !config[key]);
    if (missing.length) {
      throw new Error(`Firebase configuration is incomplete: ${missing.join(', ')}`);
    }
  }

  async function loadSdk() {
    if (sdk) return sdk;

    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`)
    ]);

    sdk = { ...appModule, ...authModule, ...firestoreModule };
    return sdk;
  }

  async function initialise() {
    const config = getConfig();
    if (!config.features.firebase) return null;
    if (firebaseApp) return firebaseApp;

    validateFirebaseConfig(config.firebase);
    const firebaseSdk = await loadSdk();
    firebaseApp = firebaseSdk.initializeApp(config.firebase);
    firebaseAuth = firebaseSdk.getAuth(firebaseApp);
    firestoreDb = firebaseSdk.getFirestore(firebaseApp);
    return firebaseApp;
  }

  async function signIn(email, password) {
    assertEnabled('authentication');
    await initialise();
    return sdk.signInWithEmailAndPassword(firebaseAuth, email, password);
  }

  async function register(email, password, displayName) {
    assertEnabled('authentication');
    await initialise();
    const credential = await sdk.createUserWithEmailAndPassword(firebaseAuth, email, password);
    if (displayName) await sdk.updateProfile(credential.user, { displayName });
    return credential;
  }

  async function signOut() {
    assertEnabled('authentication');
    await initialise();
    return sdk.signOut(firebaseAuth);
  }

  async function saveProject(project) {
    assertEnabled('cloudSync');
    await initialise();
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Sign in before syncing a project.');
    if (!project || !project.project || !project.project.id) throw new Error('Project requires project.id.');

    const projectRef = sdk.doc(firestoreDb, 'users', user.uid, 'projects', project.project.id);
    await sdk.setDoc(projectRef, {
      ...project,
      ownerUid: user.uid,
      updatedAt: sdk.serverTimestamp()
    }, { merge: true });
  }

  async function loadProject(projectId) {
    assertEnabled('cloudSync');
    await initialise();
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Sign in before loading a cloud project.');

    const snapshot = await sdk.getDoc(sdk.doc(firestoreDb, 'users', user.uid, 'projects', projectId));
    return snapshot.exists() ? snapshot.data() : null;
  }

  async function getIdToken() {
    await initialise();
    const user = firebaseAuth && firebaseAuth.currentUser;
    return user ? user.getIdToken() : null;
  }

  function onAuthChanged(callback) {
    const config = getConfig();
    if (!config.features.firebase || !config.features.authentication) {
      callback(null);
      return function unsubscribe() {};
    }

    let unsubscribe = function unsubscribe() {};
    initialise()
      .then(() => { unsubscribe = sdk.onAuthStateChanged(firebaseAuth, callback); })
      .catch((error) => console.error('[Showduino Firebase]', error));
    return () => unsubscribe();
  }

  window.ShowduinoFirebase = Object.freeze({
    initialise,
    signIn,
    register,
    signOut,
    saveProject,
    loadProject,
    getIdToken,
    onAuthChanged,
    isEnabled: () => Boolean(getConfig().features.firebase)
  });
})();

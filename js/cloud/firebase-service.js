/* global SHOWDUINO_CONFIG */
(function () {
  'use strict';

  const SDK_VERSION = '10.12.5';
  const ACCOUNT_URL = 'https://show-duino.com/account.html';
  let firebaseApp = null;
  let firebaseAuth = null;
  let firestoreDb = null;
  let sdk = null;
  let persistenceReady = null;

  function getConfig() {
    return window.SHOWDUINO_CONFIG || { features: {}, firebase: {} };
  }

  function enabled() {
    const config = getConfig();
    return Boolean(config.features?.firebase && config.firebase?.apiKey && config.firebase?.projectId);
  }

  function assertEnabled(feature) {
    const config = getConfig();
    if (!enabled() || !config.features?.[feature]) {
      throw new Error(`Showduino feature "${feature}" is currently disabled.`);
    }
  }

  function validateFirebaseConfig(config) {
    const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
    const missing = required.filter((key) => !config[key]);
    if (missing.length) throw new Error(`Firebase configuration is incomplete: ${missing.join(', ')}`);
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
    if (!enabled()) return null;
    if (firebaseApp) {
      if (persistenceReady) await persistenceReady;
      return firebaseApp;
    }

    const config = getConfig();
    validateFirebaseConfig(config.firebase);
    const firebaseSdk = await loadSdk();
    firebaseApp = firebaseSdk.initializeApp(config.firebase);
    firebaseAuth = firebaseSdk.getAuth(firebaseApp);
    firestoreDb = firebaseSdk.getFirestore(firebaseApp);
    persistenceReady = firebaseSdk.setPersistence(firebaseAuth, firebaseSdk.browserLocalPersistence)
      .catch((error) => console.warn('[Showduino Firebase] Auth persistence unavailable', error));
    await persistenceReady;
    return firebaseApp;
  }

  function timestampToIso(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  async function waitForUser() {
    await initialise();
    if (!firebaseAuth) return null;
    if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
    return new Promise((resolve) => {
      const unsubscribe = sdk.onAuthStateChanged(firebaseAuth, (user) => {
        unsubscribe();
        resolve(user || null);
      });
    });
  }

  async function upsertProfile(user, displayName, extras) {
    if (!user) return null;
    const safeName = String(displayName || user.displayName || 'Showduino Creator').trim().slice(0, 60);
    const profileRef = sdk.doc(firestoreDb, 'profiles', user.uid);
    const existing = await sdk.getDoc(profileRef);
    const payload = {
      displayName: safeName,
      email: user.email || '',
      updatedAt: sdk.serverTimestamp(),
      ...(extras || {})
    };
    if (!existing.exists()) payload.createdAt = sdk.serverTimestamp();
    await sdk.setDoc(profileRef, payload, { merge: true });
    return { id: user.uid, ...payload };
  }

  async function register(email, password, displayName) {
    assertEnabled('authentication');
    await initialise();
    const credential = await sdk.createUserWithEmailAndPassword(firebaseAuth, email, password);
    const safeName = String(displayName || '').trim().slice(0, 60);
    if (safeName) await sdk.updateProfile(credential.user, { displayName: safeName });
    await upsertProfile(credential.user, safeName || 'Showduino Creator');
    try {
      await sdk.sendEmailVerification(credential.user, { url: `${ACCOUNT_URL}?verified=1` });
    } catch (error) {
      console.warn('[Showduino Firebase] Verification email was not sent', error);
    }
    return credential;
  }

  async function signIn(email, password) {
    assertEnabled('authentication');
    await initialise();
    const credential = await sdk.signInWithEmailAndPassword(firebaseAuth, email, password);
    await upsertProfile(credential.user);
    return credential;
  }

  async function resendVerification() {
    assertEnabled('authentication');
    const user = await waitForUser();
    if (!user) throw new Error('Sign in first, then resend the verification email.');
    if (user.emailVerified) return true;
    await sdk.sendEmailVerification(user, { url: `${ACCOUNT_URL}?verified=1` });
    return true;
  }

  async function requestPasswordReset(email) {
    assertEnabled('authentication');
    await initialise();
    return sdk.sendPasswordResetEmail(firebaseAuth, email, { url: ACCOUNT_URL });
  }

  async function signOut() {
    assertEnabled('authentication');
    await initialise();
    return sdk.signOut(firebaseAuth);
  }

  function onAuthChanged(callback) {
    if (!enabled() || !getConfig().features?.authentication) {
      callback(null);
      return function unsubscribe() {};
    }
    let unsubscribe = function unsubscribe() {};
    initialise()
      .then(() => { unsubscribe = sdk.onAuthStateChanged(firebaseAuth, callback); })
      .catch((error) => {
        console.error('[Showduino Firebase]', error);
        callback(null);
      });
    return () => unsubscribe();
  }

  async function getCurrentUser() {
    if (!enabled()) return null;
    return waitForUser();
  }

  async function getProfile() {
    const user = await getCurrentUser();
    if (!user) return null;
    const snapshot = await sdk.getDoc(sdk.doc(firestoreDb, 'profiles', user.uid));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    return {
      id: user.uid,
      ...data,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt)
    };
  }

  function ensureProjectId(project) {
    project.project = project.project || {};
    if (!project.project.id) project.project.id = window.crypto?.randomUUID?.() || `project_${Date.now()}`;
    return project.project.id;
  }

  async function saveProject(project) {
    assertEnabled('cloudSync');
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to save this show to the cloud.');
    const id = ensureProjectId(project);
    const ref = sdk.doc(firestoreDb, 'users', user.uid, 'projects', id);
    const existing = await sdk.getDoc(ref);
    const payload = {
      id,
      name: project.project?.name || 'Untitled Show',
      format: project.package?.format || 'showduino-production',
      formatVersion: project.package?.version || 1,
      projectData: project,
      updatedAt: sdk.serverTimestamp()
    };
    if (!existing.exists()) payload.createdAt = sdk.serverTimestamp();
    await sdk.setDoc(ref, payload, { merge: true });
    return { id, ...payload };
  }

  async function listProjects() {
    assertEnabled('cloudSync');
    const user = await getCurrentUser();
    if (!user) return [];
    const queryRef = sdk.query(
      sdk.collection(firestoreDb, 'users', user.uid, 'projects'),
      sdk.orderBy('updatedAt', 'desc'),
      sdk.limit(100)
    );
    const snapshot = await sdk.getDocs(queryRef);
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name || 'Untitled Show',
        format: data.format || 'showduino-production',
        formatVersion: data.formatVersion || 1,
        createdAt: timestampToIso(data.createdAt),
        updatedAt: timestampToIso(data.updatedAt)
      };
    });
  }

  async function loadProject(projectId) {
    assertEnabled('cloudSync');
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in before loading a cloud show.');
    const snapshot = await sdk.getDoc(sdk.doc(firestoreDb, 'users', user.uid, 'projects', projectId));
    return snapshot.exists() ? snapshot.data().projectData || null : null;
  }

  async function deleteProject(projectId) {
    assertEnabled('cloudSync');
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in before deleting a cloud show.');
    await sdk.deleteDoc(sdk.doc(firestoreDb, 'users', user.uid, 'projects', projectId));
  }

  async function saveDevice(device) {
    assertEnabled('cloudSync');
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in before syncing devices.');
    const id = device.id || window.crypto?.randomUUID?.() || `device_${Date.now()}`;
    const ref = sdk.doc(firestoreDb, 'users', user.uid, 'devices', id);
    await sdk.setDoc(ref, {
      ...device,
      id,
      updatedAt: sdk.serverTimestamp(),
      createdAt: device.createdAt || sdk.serverTimestamp()
    }, { merge: true });
    return id;
  }

  async function listDevices() {
    assertEnabled('cloudSync');
    const user = await getCurrentUser();
    if (!user) return [];
    const snapshot = await sdk.getDocs(sdk.collection(firestoreDb, 'users', user.uid, 'devices'));
    return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  }

  async function deleteDevice(deviceId) {
    assertEnabled('cloudSync');
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in before removing a cloud device.');
    await sdk.deleteDoc(sdk.doc(firestoreDb, 'users', user.uid, 'devices', deviceId));
  }

  async function createPost(post) {
    assertEnabled('community');
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to post in HauntSync.');
    const profile = await getProfile();
    const title = String(post?.title || '').trim().slice(0, 120);
    const content = String(post?.content || '').trim().slice(0, 5000);
    const category = String(post?.category || 'General').trim().slice(0, 40);
    if (!title || !content) throw new Error('Add a title and message before posting.');
    return sdk.addDoc(sdk.collection(firestoreDb, 'posts'), {
      title,
      content,
      category,
      authorId: user.uid,
      authorName: profile?.displayName || user.displayName || 'Showduino Creator',
      authorHaunt: profile?.haunt || '',
      createdAt: sdk.serverTimestamp(),
      updatedAt: sdk.serverTimestamp()
    });
  }

  function listenPosts(callback, maxPosts) {
    if (!enabled() || !getConfig().features?.community) {
      callback([]);
      return function unsubscribe() {};
    }
    let unsubscribe = function unsubscribe() {};
    initialise().then(() => {
      const queryRef = sdk.query(
        sdk.collection(firestoreDb, 'posts'),
        sdk.orderBy('createdAt', 'desc'),
        sdk.limit(maxPosts || 40)
      );
      unsubscribe = sdk.onSnapshot(queryRef, (snapshot) => {
        callback(snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt)
          };
        }));
      }, (error) => console.error('[HauntSync posts]', error));
    }).catch((error) => console.error('[HauntSync posts]', error));
    return () => unsubscribe();
  }

  async function deletePost(postId) {
    assertEnabled('community');
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to manage your posts.');
    await sdk.deleteDoc(sdk.doc(firestoreDb, 'posts', postId));
  }

  async function addComment(postId, content) {
    assertEnabled('community');
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to reply in HauntSync.');
    const profile = await getProfile();
    const safeContent = String(content || '').trim().slice(0, 2500);
    if (!safeContent) throw new Error('Write a reply first.');
    return sdk.addDoc(sdk.collection(firestoreDb, 'posts', postId, 'comments'), {
      content: safeContent,
      authorId: user.uid,
      authorName: profile?.displayName || user.displayName || 'Showduino Creator',
      createdAt: sdk.serverTimestamp(),
      updatedAt: sdk.serverTimestamp()
    });
  }

  function listenComments(postId, callback, maxComments) {
    let unsubscribe = function unsubscribe() {};
    initialise().then(() => {
      const queryRef = sdk.query(
        sdk.collection(firestoreDb, 'posts', postId, 'comments'),
        sdk.orderBy('createdAt', 'asc'),
        sdk.limit(maxComments || 100)
      );
      unsubscribe = sdk.onSnapshot(queryRef, (snapshot) => {
        callback(snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return { id: docSnap.id, ...data, createdAt: timestampToIso(data.createdAt) };
        }));
      }, (error) => console.error('[HauntSync comments]', error));
    }).catch((error) => console.error('[HauntSync comments]', error));
    return () => unsubscribe();
  }

  async function deleteComment(postId, commentId) {
    assertEnabled('community');
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to manage your replies.');
    await sdk.deleteDoc(sdk.doc(firestoreDb, 'posts', postId, 'comments', commentId));
  }

  async function updateProfile(fields) {
    assertEnabled('authentication');
    const user = await getCurrentUser();
    if (!user) throw new Error('Sign in to update your profile.');
    const safe = {
      displayName: String(fields?.displayName || user.displayName || 'Showduino Creator').trim().slice(0, 60),
      haunt: String(fields?.haunt || '').trim().slice(0, 100),
      bio: String(fields?.bio || '').trim().slice(0, 500)
    };
    if (safe.displayName !== user.displayName) await sdk.updateProfile(user, { displayName: safe.displayName });
    await upsertProfile(user, safe.displayName, { haunt: safe.haunt, bio: safe.bio });
    return getProfile();
  }

  window.ShowduinoFirebase = Object.freeze({
    enabled,
    isEnabled: enabled,
    initialise,
    register,
    signIn,
    signOut,
    resendVerification,
    requestPasswordReset,
    onAuthChanged,
    getCurrentUser,
    getProfile,
    updateProfile,
    saveProject,
    listProjects,
    loadProject,
    deleteProject,
    saveDevice,
    listDevices,
    deleteDevice,
    createPost,
    listenPosts,
    deletePost,
    addComment,
    listenComments,
    deleteComment
  });
})();

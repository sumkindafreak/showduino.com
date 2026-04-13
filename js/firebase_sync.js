// Firebase Sync
// Cloud project storage and sync with offline queue fallback

class FirebaseSync {
  constructor(auth) {
    this._auth = auth;
    this.syncEnabled = false;
    this._queue = [];
    this._db = null;
    this._queueKey = 'showduino_sync_queue';
    this._loadQueue();
  }

  init() {
    if (!FirebaseConfig.isReady()) {
      console.warn('[FirebaseSync] Firebase not ready – sync disabled.');
      return this;
    }
    this._db = window._firebaseFirestore;
    this.syncEnabled = true;

    if (this._auth) {
      this._auth.onAuthStateChanged(user => {
        if (user) {
          this.syncEnabled = true;
          this.processSyncQueue();
        } else {
          this.syncEnabled = false;
        }
      });
    }
    return this;
  }

  _loadQueue() {
    try {
      const raw = localStorage.getItem(this._queueKey);
      this._queue = raw ? JSON.parse(raw) : [];
    } catch (_) { this._queue = []; }
  }

  _saveQueue() {
    try { localStorage.setItem(this._queueKey, JSON.stringify(this._queue)); } catch (_) {}
  }

  _getUID() {
    const auth = this._auth || window.firebaseAuth;
    return auth ? auth.getUID() : null;
  }

  async syncProject(project) {
    if (!project || !project.project) return { success: false, queued: false };

    const uid = this._getUID();
    if (!uid) return { success: false, queued: false };

    // Update timestamp
    project.project.updatedAt = new Date().toISOString();

    if (!this.syncEnabled || !this._db) {
      this._queue.push({ type: 'syncProject', data: project, ts: Date.now() });
      this._saveQueue();
      return { success: false, queued: true };
    }

    try {
      const docRef = this._db
        .collection('users').doc(uid)
        .collection('projects').doc(project.project.id);

      await docRef.set({
        ...project,
        _meta: {
          uid,
          syncedAt: new Date().toISOString(),
          version: 1
        }
      });
      return { success: true, queued: false };
    } catch (err) {
      console.warn('[FirebaseSync] Sync failed, queuing:', err);
      this._queue.push({ type: 'syncProject', data: project, ts: Date.now() });
      this._saveQueue();
      return { success: false, queued: true };
    }
  }

  async loadProject(id) {
    const uid = this._getUID();
    if (!uid || !this._db) return null;

    try {
      const doc = await this._db
        .collection('users').doc(uid)
        .collection('projects').doc(id)
        .get();

      if (!doc.exists) return null;
      const data = doc.data();
      delete data._meta;
      return data;
    } catch (err) {
      console.warn('[FirebaseSync] Load failed:', err);
      return null;
    }
  }

  async loadProjects() {
    const uid = this._getUID();
    if (!uid || !this._db) return [];

    try {
      const snapshot = await this._db
        .collection('users').doc(uid)
        .collection('projects')
        .orderBy('project.updatedAt', 'desc')
        .limit(50)
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        delete data._meta;
        return data;
      });
    } catch (err) {
      console.warn('[FirebaseSync] Load projects failed:', err);
      return [];
    }
  }

  async deleteProject(id) {
    const uid = this._getUID();
    if (!uid || !this._db) return false;
    try {
      await this._db.collection('users').doc(uid).collection('projects').doc(id).delete();
      return true;
    } catch (_) { return false; }
  }

  async processSyncQueue() {
    if (!this.syncEnabled || !this._db || this._queue.length === 0) return;
    const uid = this._getUID();
    if (!uid) return;

    const toProcess = [...this._queue];
    this._queue = [];
    this._saveQueue();

    for (const item of toProcess) {
      try {
        if (item.type === 'syncProject') {
          await this.syncProject(item.data);
        }
      } catch (err) {
        console.warn('[FirebaseSync] Queue process error:', err);
        this._queue.push(item);
      }
    }
    this._saveQueue();
  }

  getQueueLength() { return this._queue.length; }
}

window.FirebaseSync = FirebaseSync;

'use strict';
/* Google sign-in + sync to a visible "TUONTA" folder in the user's own Google Drive.
   - Sign-in uses Google's OAuth redirect (works inside installed iPhone/Android apps).
   - Firebase Auth is signed in with the same Google account (used for sharing later).
   - Drive scope is drive.file: TUONTA can only see files it created itself. */
const CFG = window.TUONTA_CONFIG || {};
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';
const DATA_NAME = 'TUONTA data (do not edit).json';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const Sync = {
  status: 'off', message: '', listeners: [], running: false, editsDuringRun: false, timer: null,
  meta: {}, account: null, token: null,
  load() {
    try { this.meta = JSON.parse(localStorage.getItem('tu.sync') || '{}'); } catch (e) { this.meta = {}; }
    try { this.account = JSON.parse(localStorage.getItem('tu.account') || 'null'); } catch (e) { this.account = null; }
    try { this.token = JSON.parse(localStorage.getItem('tu.token') || 'null'); } catch (e) { this.token = null; }
  },
  saveMeta() { localStorage.setItem('tu.sync', JSON.stringify(this.meta)); },
  configured() { return !!(CFG.googleClientId && CFG.googleClientId.trim()); },
  signedIn() { return !!this.account; },
  tokenOk() { return !!(this.token && this.token.exp > now() + 60000); },
  onStatus(fn) { this.listeners.push(fn); },
  setStatus(s, msg) { this.status = s; this.message = msg || ''; this.listeners.forEach((f) => { try { f(s); } catch (e) { } }); },
  clk(x) { return Math.max(x.updatedAt || 0, x.syncAt || 0); },
  pendingCount() { const ls = this.meta.lastSync || 0; let n = 0; KINDS.forEach((k) => Store.all(k).forEach((x) => { if (this.clk(x) > ls) n++; })); return n; },
  statusText() {
    if (!this.signedIn()) return 'Saved on this device only';
    switch (this.status) {
      case 'syncing': return 'Syncing…';
      case 'offline': { const n = this.pendingCount(); return 'Offline' + (n ? ' · ' + n + ' change' + (n > 1 ? 's' : '') + ' waiting' : ''); }
      case 'reconnect': return 'Tap to reconnect Google Drive';
      case 'error': return 'Sync problem — tap to retry';
      default: return this.meta.lastSync ? 'Synced ' + fmtRel(this.meta.lastSync) : 'Ready to sync';
    }
  },
  redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ''); },

  /* ---------- sign-in ---------- */
  signIn(silent) {
    if (!this.configured()) { toast('Google sign-in is not set up yet (see README → config.js)'); return; }
    const state = uid();
    sessionStorage.setItem('tu.oauthState', state);
    sessionStorage.setItem('tu.oauthSilent', silent ? '1' : '');
    sessionStorage.setItem('tu.returnTo', !location.hash || location.hash.startsWith('#/welcome') ? '#/notes' : location.hash);
    if (silent) localStorage.setItem('tu.silentTry', String(now()));
    const p = new URLSearchParams({ client_id: CFG.googleClientId.trim(), redirect_uri: this.redirectUri(), response_type: 'token', scope: SCOPES, include_granted_scopes: 'true', state });
    if (silent) p.set('prompt', 'none');
    else if (!this.account) p.set('prompt', 'consent select_account');
    if (this.account && this.account.email) p.set('login_hint', this.account.email);
    location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
  },
  /* Called at start-up: reads the token Google sends back in the URL */
  handleRedirect() {
    const h = location.hash;
    if (!/(^#|&)(access_token|error)=/.test(h)) return false;
    const p = new URLSearchParams(h.slice(1));
    const back = sessionStorage.getItem('tu.returnTo') || '#/notes';
    const silent = sessionStorage.getItem('tu.oauthSilent') === '1';
    history.replaceState(null, '', location.pathname + location.search + back);
    if (p.get('state') !== sessionStorage.getItem('tu.oauthState')) return true;
    sessionStorage.removeItem('tu.oauthState');
    if (p.get('error')) {
      if (this.account) this.setStatus('reconnect');
      if (!silent) setTimeout(() => toast('Google sign-in was cancelled'), 400);
      return true;
    }
    const granted = p.get('scope') || '';
    if (!granted.includes('drive.file')) { setTimeout(() => toast('Please allow Google Drive access so TUONTA can save your notes there'), 400); }
    this.token = { access: p.get('access_token'), exp: now() + (Number(p.get('expires_in')) || 3600) * 1000 };
    localStorage.setItem('tu.token', JSON.stringify(this.token));
    this._afterToken();
    return true;
  },
  async _afterToken() {
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + this.token.access } });
      if (r.ok) {
        const u = await r.json();
        const prev = this.account && this.account.email;
        this.account = { email: u.email, name: u.name || u.email, picture: u.picture || '' };
        localStorage.setItem('tu.account', JSON.stringify(this.account));
        if (prev && prev !== u.email) { this.meta = {}; this.saveMeta(); }
        if (!prev) setTimeout(() => toast('Signed in as ' + u.email), 300);
      }
    } catch (e) { console.warn(e); }
    this.firebaseSignIn();
    this.setStatus('idle');
    this.sync();
  },
  async firebaseSignIn() {
    const fb = CFG.firebase || {};
    if (!fb.apiKey || !this.tokenOk()) return;
    try {
      await loadScript('vendor/firebase-app-compat.js'); await loadScript('vendor/firebase-auth-compat.js');
      if (!firebase.apps.length) firebase.initializeApp(fb);
      const cred = firebase.auth.GoogleAuthProvider.credential(null, this.token.access);
      await firebase.auth().signInWithCredential(cred);
    } catch (e) { console.warn('Firebase sign-in skipped:', e && e.message); }
  },
  async signOut() {
    this.account = null; this.token = null; this.meta = {};
    ['tu.account', 'tu.token', 'tu.sync'].forEach((k) => localStorage.removeItem(k));
    try { if (window.firebase && firebase.apps.length) await firebase.auth().signOut(); } catch (e) { }
    this.setStatus('off');
  },
  /* At start-up: refresh an expired token quietly (a quick hop to Google and back) */
  bootCheck() {
    if (!this.signedIn() || !this.configured()) { this.setStatus('off'); return; }
    if (this.tokenOk()) { this.setStatus('idle'); this.firebaseSignIn(); setTimeout(() => this.sync(), 800); return; }
    if (!navigator.onLine) { this.setStatus('offline'); return; }
    const last = Number(localStorage.getItem('tu.silentTry') || 0);
    if (now() - last > 10 * 60000) { this.signIn(true); return; }
    this.setStatus('reconnect');
  },

  /* ---------- change tracking ---------- */
  markDirty() {
    this.meta.dirty = true; this.saveMeta();
    if (this.running) this.editsDuringRun = true;
    if (!this.signedIn()) return;
    if (!navigator.onLine) { this.setStatus('offline'); return; }
    clearTimeout(this.timer); this.timer = setTimeout(() => this.sync(), 4000);
  },

  /* ---------- Drive API ---------- */
  async api(url, opts = {}) {
    if (!this.tokenOk()) { const e = new Error('token'); e.code = 401; throw e; }
    opts.headers = Object.assign({ Authorization: 'Bearer ' + this.token.access }, opts.headers || {});
    const r = await fetch(url.startsWith('http') ? url : 'https://www.googleapis.com/drive/v3/' + url, opts);
    if (r.status === 401) { this.token = null; localStorage.removeItem('tu.token'); const e = new Error('token'); e.code = 401; throw e; }
    if (r.status === 404) { const e = new Error('not found'); e.code = 404; throw e; }
    if (!r.ok) { let m = r.status + ''; try { const j = await r.json(); m = (j.error && j.error.message) || m; } catch (e) { } const e = new Error(m); e.code = r.status; throw e; }
    return r;
  },
  async findOrCreateFolder(name, parentId) {
    const q = "name='" + name.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "' and mimeType='" + FOLDER_MIME + "' and trashed=false and '" + parentId + "' in parents";
    const r = await (await this.api('files?fields=files(id)&spaces=drive&q=' + encodeURIComponent(q))).json();
    if (r.files && r.files.length) return r.files[0].id;
    return this.createFolder(name, parentId);
  },
  async createFolder(name, parentId) {
    const r = await (await this.api('files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }) })).json();
    return r.id;
  },
  async alive(id) {
    if (!id) return false;
    try { const f = await (await this.api('files/' + id + '?fields=id,trashed')).json(); return !f.trashed; } catch (e) { if (e.code === 404) return false; throw e; }
  },
  /* create or update a file's metadata + bytes (resumable upload works for any size) */
  async upload({ id, name, mimeType, parents, blob, moveFrom }) {
    const meta = { name, mimeType };
    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id';
    let method = 'POST';
    if (id) {
      method = 'PATCH';
      url = 'https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=resumable&fields=id';
      if (moveFrom && parents && moveFrom !== parents[0]) url += '&addParents=' + parents[0] + '&removeParents=' + moveFrom;
    } else meta.parents = parents;
    const init = await this.api(url, { method, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType }, body: JSON.stringify(meta) });
    const loc = init.headers.get('Location');
    if (!loc) throw new Error('Upload could not start');
    const put = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob });
    if (!put.ok) throw new Error('Upload failed (' + put.status + ')');
    return (await put.json()).id;
  },
  async trash(id) { try { await this.api('files/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); } catch (e) { if (e.code !== 404) throw e; } },
  async rename(id, name, parent, oldParent) {
    let url = 'files/' + id + '?fields=id';
    if (parent && oldParent && parent !== oldParent) url += '&addParents=' + parent + '&removeParents=' + oldParent;
    await this.api(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  },
  async downloadBlob(id) { return (await this.api('files/' + id + '?alt=media')).blob(); },
  folderUrl() { return this.meta.rootId ? 'https://drive.google.com/drive/folders/' + this.meta.rootId : 'https://drive.google.com/'; },

  /* ---------- the sync run ---------- */
  async sync(manual) {
    if (!this.signedIn() || this.running) return;
    if (!navigator.onLine) { this.setStatus('offline'); if (manual) toast('You are offline. Changes will sync when you reconnect.'); return; }
    if (!this.tokenOk()) { this.setStatus('reconnect'); if (manual) this.signIn(false); return; }
    this.running = true; this.editsDuringRun = false; this.setStatus('syncing');
    try {
      const m = this.meta;
      if (!(await this.alive(m.rootId))) { m.rootId = await this.findOrCreateFolder('TUONTA', 'root'); m.notesId = null; m.attId = null; m.dataId = null; this.resetDriveIds(); }
      if (!(await this.alive(m.notesId))) m.notesId = await this.findOrCreateFolder('Notes', m.rootId);
      if (!(await this.alive(m.attId))) m.attId = await this.findOrCreateFolder('Attachments', m.rootId);
      this.saveMeta();
      // 1. pull and merge
      let remote = null;
      if (!m.dataId) {
        const q = "name='" + DATA_NAME + "' and trashed=false and '" + m.rootId + "' in parents";
        const r = await (await this.api('files?fields=files(id)&q=' + encodeURIComponent(q))).json();
        if (r.files && r.files.length) m.dataId = r.files[0].id;
      }
      if (m.dataId) {
        try { remote = await (await this.api('files/' + m.dataId + '?alt=media')).json(); } catch (e) { if (e.code === 404) m.dataId = null; else throw e; }
      }
      let pulled = false;
      if (remote && remote.app === 'TUONTA') pulled = await this.merge(remote);
      if (pulled) await Store.purgeTrash();
      // 2. files
      await this.pushAttachments();
      await this.pushMarkdown();
      // 3. push data
      const localNewer = !remote || KINDS.some((k) => Store.all(k).some((x) => this.clk(x) > (remote.savedAt || 0)));
      if (localNewer || m.dirty) {
        const data = this.snapshot();
        m.dataId = await this.upload({ id: m.dataId, name: DATA_NAME, mimeType: 'application/json', parents: [m.rootId], blob: new Blob([JSON.stringify(data)], { type: 'application/json' }) });
      }
      m.lastSync = now();
      if (!this.editsDuringRun) m.dirty = false;
      this.saveMeta();
      this.setStatus('idle');
      if (pulled) Store.emit('sync', null);
      if (manual) toast('Synced with Google Drive');
    } catch (e) {
      console.warn('sync', e);
      if (e.code === 401) { this.setStatus('reconnect'); if (manual) this.signIn(false); }
      else if (!navigator.onLine) this.setStatus('offline');
      else { this.setStatus('error', e.message); if (manual) toast('Sync problem: ' + e.message); }
    } finally {
      this.running = false;
      if (this.editsDuringRun && this.status === 'idle') { clearTimeout(this.timer); this.timer = setTimeout(() => this.sync(), 3000); }
    }
  },
  resetDriveIds() {
    Store.all('notes').forEach((n) => { n.mdFileId = null; n.mdSyncedAt = 0; n.mdParent = null; });
    Store.all('notebooks').forEach((b) => { b.driveFolderId = null; b.driveName = null; b.driveParent = null; });
    Store.all('atts').forEach((a) => { a.driveId = null; });
  },
  snapshot() {
    const o = { app: 'TUONTA', v: 1, savedAt: now() };
    KINDS.forEach((k) => { o[k] = Store.all(k); });
    return o;
  },
  pushHist(hist, ver) {
    const h = (hist || []).filter((x) => x.updatedAt !== ver.updatedAt);
    h.push({ title: ver.title, content: ver.content, updatedAt: ver.updatedAt });
    return h.sort((a, b) => a.updatedAt - b.updatedAt).slice(-5);
  },
  /* newer = later real edit; syncAt (Drive bookkeeping) only breaks ties */
  newer(a, b) { const au = a.updatedAt || 0, bu = b.updatedAt || 0; return au !== bu ? au > bu : (a.syncAt || 0) > (b.syncAt || 0); },
  carryDrive(to, from) {
    let moved = false;
    ['mdFileId', 'mdParent', 'mdSyncedAt', 'driveFolderId', 'driveName', 'driveParent', 'driveId'].forEach((k) => { if (from[k] && !to[k]) { to[k] = from[k]; moved = true; } });
    return moved;
  },
  async merge(remote) {
    const last = this.meta.lastSync || 0; let changed = false;
    for (const k of KINDS) {
      for (const r of remote[k] || []) {
        const l = Store.get(k, r.id);
        if (!l) { await Store.putRaw(k, r); changed = true; continue; }
        const bothEdited = k === 'notes' && !l.purged && !r.purged && l.content !== r.content && (l.updatedAt || 0) > last && (r.updatedAt || 0) > last;
        if (this.newer(r, l)) {
          if (bothEdited) r.history = this.pushHist(r.history, l);
          this.carryDrive(r, l);
          await Store.putRaw(k, r); changed = true;
        } else {
          let dirty = this.carryDrive(l, r);
          if (bothEdited && (r.updatedAt || 0) < (l.updatedAt || 0)) { l.history = this.pushHist(l.history, r); dirty = true; }
          if (dirty) await Store.putRaw(k, l);
        }
      }
    }
    return changed;
  },
  async stamp(kind, obj) { obj.syncAt = now(); await Store.putRaw(kind, obj); },
  async pushAttachments() {
    for (const a of Store.all('atts')) {
      if (a.deletedAt) { if (a.driveId) { await this.trash(a.driveId); a.driveId = null; await this.stamp('atts', a); } continue; }
      if (a.driveId) continue;
      const blob = await Store.getBlob(a.id);
      if (!blob) continue;
      a.driveId = await this.upload({ name: a.name, mimeType: a.type || 'application/octet-stream', parents: [this.meta.attId], blob });
      await this.stamp('atts', a);
    }
  },
  async nbFolder(nb, cache, depth = 0) {
    if (cache[nb.id]) return cache[nb.id];
    const parentFolder = nb.parentId && Store.get('notebooks', nb.parentId) && depth < 5 ? await this.nbFolder(Store.get('notebooks', nb.parentId), cache, depth + 1) : this.meta.notesId;
    const name = safeName(nb.name);
    if (nb.driveFolderId && !(await this.alive(nb.driveFolderId))) nb.driveFolderId = null;
    if (!nb.driveFolderId) {
      nb.driveFolderId = await this.createFolder(name, parentFolder);
      nb.driveName = name; nb.driveParent = parentFolder; await this.stamp('notebooks', nb);
    } else if (nb.driveName !== name || nb.driveParent !== parentFolder) {
      await this.rename(nb.driveFolderId, name, parentFolder, nb.driveParent);
      nb.driveName = name; nb.driveParent = parentFolder; await this.stamp('notebooks', nb);
    }
    cache[nb.id] = nb.driveFolderId;
    return nb.driveFolderId;
  },
  async pushMarkdown() {
    const cache = {};
    for (const nb of Store.all('notebooks')) {
      if (nb.deletedAt && nb.driveFolderId) { await this.trash(nb.driveFolderId); nb.driveFolderId = null; await this.stamp('notebooks', nb); }
    }
    for (const n of Store.all('notes')) {
      if (n.purged || n.deletedAt) {
        if (n.mdFileId) { await this.trash(n.mdFileId); n.mdFileId = null; n.mdParent = null; n.mdSyncedAt = 0; await this.stamp('notes', n); }
        continue;
      }
      const nb = n.notebookId && Store.get('notebooks', n.notebookId);
      const parent = nb && !nb.deletedAt ? await this.nbFolder(nb, cache) : this.meta.notesId;
      if (n.mdFileId && n.mdSyncedAt >= n.updatedAt && n.mdParent === parent) continue;
      const md = Exporter.markdown(n);
      const blob = new Blob([md], { type: 'text/markdown' });
      let id = null;
      try { id = await this.upload({ id: n.mdFileId, name: safeName(n.title) + '.md', mimeType: 'text/markdown', parents: [parent], blob, moveFrom: n.mdParent }); }
      catch (e) { if (e.code === 404 && n.mdFileId) id = await this.upload({ name: safeName(n.title) + '.md', mimeType: 'text/markdown', parents: [parent], blob }); else throw e; }
      n.mdFileId = id; n.mdParent = parent; n.mdSyncedAt = n.updatedAt; await this.stamp('notes', n);
    }
  },
  /* fetch an attachment's bytes on a device that doesn't have them yet */
  async fetchBlob(att) {
    let b = await Store.getBlob(att.id);
    if (b) return b;
    if (!att.driveId || !this.tokenOk()) return null;
    b = await this.downloadBlob(att.driveId);
    await Store.putBlob(att.id, b);
    return b;
  }
};
Sync.load();
window.addEventListener('online', () => { if (Sync.signedIn()) { if (Sync.tokenOk()) Sync.sync(); else Sync.setStatus('reconnect'); } });
window.addEventListener('offline', () => { if (Sync.signedIn()) Sync.setStatus('offline'); });

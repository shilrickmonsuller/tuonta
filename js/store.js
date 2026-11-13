'use strict';
/* Local storage: everything lives in IndexedDB on the device first.
   Kinds: notebooks, notes, cards, reviews, templates, atts (attachment info). Blobs (file bytes) are kept apart. */
const KINDS = ['notebooks', 'notes', 'cards', 'reviews', 'templates', 'atts'];
const Store = {
  db: null,
  S: {},
  listeners: [],
  async init() {
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open('tuonta', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        KINDS.concat(['blobs']).forEach((k) => { if (!db.objectStoreNames.contains(k)) db.createObjectStore(k, { keyPath: k === 'blobs' ? 'id' : 'id' }); });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    for (const k of KINDS) {
      const rows = await this._all(k);
      this.S[k] = new Map(rows.map((x) => [x.id, x]));
    }
    if (!localStorage.getItem('tu.seeded') && this.S.notebooks.size === 0 && this.S.notes.size === 0) await this.seed();
    await this.purgeTrash();
  },
  _tx(kind, mode) { return this.db.transaction(kind, mode).objectStore(kind); },
  _all(kind) { return new Promise((res, rej) => { const r = this._tx(kind, 'readonly').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); },
  _put(kind, obj) { return new Promise((res, rej) => { const r = this._tx(kind, 'readwrite').put(obj); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
  _del(kind, id) { return new Promise((res, rej) => { const r = this._tx(kind, 'readwrite').delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
  get(kind, id) { return this.S[kind].get(id); },
  all(kind) { return Array.from(this.S[kind].values()); },
  /* Save a change made by the user: stamps updatedAt and queues a sync */
  async put(kind, obj, opts = {}) {
    if (!opts.keepTime) obj.updatedAt = now();
    if (!obj.createdAt) obj.createdAt = obj.updatedAt || now();
    this.S[kind].set(obj.id, obj);
    await this._put(kind, obj);
    if (!opts.noSync) Sync.markDirty();
    this.emit(kind, obj);
    return obj;
  },
  /* Save without stamping (used by sync merge and restore) */
  async putRaw(kind, obj) { this.S[kind].set(obj.id, obj); await this._put(kind, obj); },
  async hardDelete(kind, id) { this.S[kind].delete(id); await this._del(kind, id); },
  async putBlob(id, blob) { await this._put('blobs', { id, blob }); },
  async getBlob(id) { return new Promise((res) => { const r = this._tx('blobs', 'readonly').get(id); r.onsuccess = () => res(r.result ? r.result.blob : null); r.onerror = () => res(null); }); },
  async delBlob(id) { await this._del('blobs', id); },
  on(fn) { this.listeners.push(fn); },
  emit(kind, obj) { this.listeners.forEach((f) => { try { f(kind, obj); } catch (e) { console.error(e); } }); },

  /* ---------- notes ---------- */
  liveNotes() { return this.all('notes').filter((n) => !n.deletedAt && !n.purged); },
  activeNotes() { return this.liveNotes().filter((n) => !n.archived); },
  newNote(fields = {}) {
    return Object.assign({ id: uid(), title: '', content: '', text: '', template: 'free', notebookId: fields.notebookId || null, tags: [], color: null, pinned: false, favorite: false, archived: false, deletedAt: null, reminderAt: null, reminderDone: false, tasks: [], attIds: [], history: [] }, fields);
  },
  sortNotes(list, by = Settings.get('sort')) {
    const f = { edited: (a, b) => b.updatedAt - a.updatedAt, created: (a, b) => b.createdAt - a.createdAt, title: (a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled') }[by] || ((a, b) => b.updatedAt - a.updatedAt);
    return list.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || f(a, b));
  },
  search(q, list) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return list;
    return list.filter((n) => {
      const atts = (n.attIds || []).map((id) => { const a = this.get('atts', id); return a ? (a.name + ' ' + (a.text || '')) : ''; }).join(' ');
      const hay = ((n.title || '') + ' ' + (n.text || '') + ' ' + (n.tags || []).map((t) => '#' + t + ' ' + t).join(' ') + ' ' + atts).toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  },
  allTags() {
    const m = new Map();
    this.liveNotes().forEach((n) => (n.tags || []).forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  },
  /* ---------- notebooks ---------- */
  notebooks() { return this.all('notebooks').filter((b) => !b.deletedAt).sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name)); },
  nbChildren(parentId) { return this.notebooks().filter((b) => (b.parentId || null) === (parentId || null)); },
  nbTree() { const out = []; const walk = (pid, depth) => this.nbChildren(pid).forEach((b) => { out.push({ nb: b, depth }); if (depth < 2) walk(b.id, depth + 1); }); walk(null, 0); return out; },
  nbDescendants(id) { const ids = [id]; this.nbChildren(id).forEach((c) => ids.push(...this.nbDescendants(c.id))); return ids; },
  nbPath(id) { const p = []; let b = this.get('notebooks', id); let guard = 0; while (b && guard++ < 6) { p.unshift(b); b = b.parentId ? this.get('notebooks', b.parentId) : null; } return p; },
  nbCount(id) { const ids = new Set(this.nbDescendants(id)); return this.activeNotes().filter((n) => ids.has(n.notebookId)).length; },
  /* ---------- tasks (copied out of note checklists) ---------- */
  allTasks() {
    const out = [];
    this.activeNotes().forEach((n) => (n.tasks || []).forEach((t) => out.push(Object.assign({ noteId: n.id, noteTitle: n.title || 'Untitled' }, t))));
    return out;
  },
  async purgeTrash() {
    const limit = now() - 30 * DAY;
    for (const n of this.all('notes')) {
      if (n.deletedAt && !n.purged && n.deletedAt < limit) await this.purgeNote(n);
    }
  },
  async purgeNote(n) {
    for (const id of n.attIds || []) { const a = this.get('atts', id); if (a) { a.deletedAt = now(); await this.put('atts', a); } await this.delBlob(id); }
    for (const c of this.all('cards')) if (c.noteId === n.id && !c.deletedAt) { c.deletedAt = now(); await this.put('cards', c); }
    await this.put('notes', { id: n.id, purged: true, deletedAt: n.deletedAt || now(), createdAt: n.createdAt, mdFileId: n.mdFileId || null });
  },
  async seed() {
    const names = [['Work', COLORS[0]], ['Projects', COLORS[1]], ['Study', COLORS[2]], ['Personal', COLORS[3]]];
    /* fixed ids + an old timestamp, so the starter items from two devices merge into one and never override real edits */
    let i = 0; const ids = {}; const t0 = 1;
    for (const [name, color] of names) { const b = { id: 'nb-' + name.toLowerCase(), name, color, parentId: null, order: i++, createdAt: now(), updatedAt: t0 }; ids[name] = b.id; await this.put('notebooks', b, { noSync: true, keepTime: true }); }
    const today = dayKey(now());
    const html = '<p>TUONTA keeps your notes, tasks and flashcards in one place. Everything is saved on this phone first, so it works offline.</p>' +
      '<h3>Try these</h3>' +
      Tpl.task('Tap + to make a note from a template', today) + Tpl.task('Add a due date to a task — it shows up in Today and on the Calendar') +
      Tpl.task('Highlight a key phrase, then tap “Make flashcards”') + Tpl.task('Open the menu → Sync & backup to connect Google Drive') +
      '<p><br></p>';
    const n = this.newNote({ id: 'note-welcome', title: 'Welcome to TUONTA', content: html, notebookId: ids.Personal, pinned: true, createdAt: now(), updatedAt: t0 });
    n.text = plainText(html); n.tasks = Editor.extractTasks(html).map((t, k) => Object.assign(t, { id: 'welcome-' + k }));
    const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('.task').forEach((t, k) => { t.dataset.id = 'welcome-' + k; }); n.content = d.innerHTML;
    await this.put('notes', n, { noSync: true, keepTime: true });
    localStorage.setItem('tu.seeded', '1');
  }
};

/* ---------- device settings (not synced) ---------- */
const Settings = {
  d: { theme: 'system', startPage: 'notes', sort: 'edited' },
  load() { try { Object.assign(this.d, JSON.parse(localStorage.getItem('tu.settings') || '{}')); } catch (e) { } },
  get(k) { return this.d[k]; },
  set(k, v) { this.d[k] = v; localStorage.setItem('tu.settings', JSON.stringify(this.d)); }
};
Settings.load();

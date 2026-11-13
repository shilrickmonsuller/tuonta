'use strict';
/* Start-up, routing, theme, reminders, offline service worker */
const App = {
  version: '1.0.0',
  newNoteIds: new Set(),
  depth: 0, goingBack: false, currentRoute: '',

  async start() {
    this.applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
    $$('#tabbar [data-icon]').forEach((s) => { s.innerHTML = icon(s.dataset.icon); });
    try { await Store.init(); } catch (e) {
      $('#view').innerHTML = '<div class="empty"><b>TUONTA could not open its storage</b>If you are in a private browsing window, open TUONTA in a normal window.</div>'; console.error(e); return;
    }
    const fromGoogle = Sync.handleRedirect();
    if (!fromGoogle) {
      if (!localStorage.getItem('tu.welcomed')) { if (!location.hash || location.hash === '#/') location.replace('#/welcome'); }
      else if (!location.hash || location.hash === '#/') location.replace('#/' + (Settings.get('startPage') || 'notes'));
    } else localStorage.setItem('tu.welcomed', '1');
    window.addEventListener('hashchange', () => { if (this.goingBack) { this.depth = Math.max(0, this.depth - 1); this.goingBack = false; } else this.depth++; this.render(); });
    Store.on((kind) => {
      if (kind !== 'sync') return;
      if (Editor.note) { const n = Store.get('notes', Editor.note.id); if (n && !Editor.saveTimer && document.activeElement !== Editor.body && document.activeElement !== Editor.titleEl && n.content !== Editor.body.innerHTML) Editor.render(n.id); else Editor.updateStatus(); }
      else if (!document.querySelector('#sheets .sheet-wrap') && !(document.activeElement && document.activeElement.id === 'q')) this.render();
    });
    Sync.onStatus(() => {
      const s = $('#dr-status'); if (s) s.textContent = Sync.statusText();
      Editor.updateStatus();
      $('#banner').innerHTML = Sync.status === 'reconnect' && Sync.signedIn() && !location.hash.startsWith('#/welcome') ? '<span>Google Drive needs you to sign in again to sync.</span><button type="button" id="bn-re">Reconnect</button>' : '';
      const b = $('#bn-re'); if (b) b.onclick = () => Sync.signIn(false);
      if (location.hash === '#/sync' && !document.querySelector('#sheets .sheet-wrap')) Views.syncPage();
    });
    if (!fromGoogle) Sync.bootCheck();
    this.render();
    setInterval(() => this.checkReminders(), 30000);
    setTimeout(() => this.checkReminders(), 1500);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { this.checkReminders(); if (Sync.signedIn() && Sync.tokenOk()) Sync.sync(); else if (Sync.signedIn() && !Sync.tokenOk() && navigator.onLine) Sync.setStatus('reconnect'); }
      else if (Editor.note) Editor.save();
    });
    window.addEventListener('pagehide', () => { if (Editor.note) Editor.save(); });
    this.registerSW();
  },
  go(h) { if (location.hash === h) this.render(); else location.hash = h; },
  back() {
    if (this.depth > 0) { this.goingBack = true; history.back(); }
    else { history.replaceState(null, '', '#/notes'); this.render(); }
  },
  applyTheme() {
    const t = Settings.get('theme');
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#0F141C' : '#F6F7F9';
  },
  async render() {
    const h = location.hash || '#/notes';
    const parts = h.replace(/^#\//, '').split('/');
    const [r, a] = [parts[0], parts.slice(1).join('/')];
    if (Editor.note && !(r === 'note' && a === Editor.note.id)) await Editor.leave();
    document.onselectionchange = null;
    document.body.classList.toggle('no-tabs', ['note', 'study', 'welcome'].includes(r));
    $('#drawer').classList.remove('open');
    $('#sheets').innerHTML = '';
    const tab = ['notes', 'nb'].includes(r) ? 'notes' : r === 'notebooks' ? 'notebooks' : ['review', 'deck'].includes(r) ? 'review' : 'more';
    $$('#tabbar a').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
    if (this.currentRoute !== h) window.scrollTo(0, 0);
    this.currentRoute = h;
    const dec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
    switch (r) {
      case 'welcome': Views.welcome(); break;
      case 'note': Editor.render(a); break;
      case 'nb': Views.home(a); break;
      case 'notebooks': Views.notebooks(); break;
      case 'review': Views.review(); break;
      case 'study': Views.study(a || null); break;
      case 'deck': Views.deck(a || '_'); break;
      case 'more': Views.more(); break;
      case 'today': Views.today(); break;
      case 'calendar': Views.calendar(); break;
      case 'list': Views.list(a); break;
      case 'tags': Views.tags(); break;
      case 'tag': Views.tag(dec(a)); break;
      case 'sync': Views.syncPage(); break;
      case 'settings': Views.settings(); break;
      case 'templates': Views.templates(); break;
      default: Views.home(null);
    }
    if (Sync.status === 'reconnect' && Sync.signedIn() && r !== 'welcome' && !$('#banner').innerHTML) Sync.setStatus('reconnect');
  },

  /* ---------- reminders (shown while the app is open) ---------- */
  async askNotify(force) {
    if (!('Notification' in window)) { if (force) toast('Notifications are not supported here. Reminders will show inside TUONTA.'); return; }
    if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) { } }
    else if (force && Notification.permission === 'denied') toast('Notifications are blocked. Allow them in your phone or browser settings.');
  },
  async checkReminders() {
    const t = now();
    for (const n of Store.activeNotes()) {
      if (!n.reminderAt || n.reminderDone || n.reminderFired || n.reminderAt > t) continue;
      n.reminderFired = true; await Store.put('notes', n, { keepTime: true, noSync: true });
      const title = n.title || 'Untitled note';
      toast('Reminder: ' + title, 'Open', () => App.go('#/note/' + n.id));
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
          const body = (n.text || '').slice(0, 120) || 'Tap to open';
          if (reg) reg.showNotification('TUONTA reminder: ' + title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'rem-' + n.id, data: { url: '#/note/' + n.id } });
          else new Notification('TUONTA reminder: ' + title, { body, icon: 'icons/icon-192.png' });
        } catch (e) { console.warn(e); }
      }
    }
  },

  registerSW() {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      if (!reg) return;
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('A new version of TUONTA is ready', 'Reload', () => location.reload()); });
      });
    }).catch((e) => console.warn('SW', e));
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.open) App.go(e.data.open); });
  }
};
App.start();

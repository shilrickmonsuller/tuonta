'use strict';
/* The note editor: rich text, checklists with due dates, Cornell, tables, links, attachments, voice, scan */
const Editor = {
  note: null, isNew: false, body: null, titleEl: null, savedRange: null, saveTimer: null, statusEl: null,

  /* ---------- tasks inside notes ---------- */
  extractTasks(html) {
    const d = document.createElement('div'); d.innerHTML = html || '';
    return Array.from(d.querySelectorAll('.task')).map((t) => ({ id: t.dataset.id || uid(), text: ((t.querySelector('.ttext') || t).textContent || '').trim(), done: t.dataset.done === '1', due: t.dataset.due || null })).filter((t) => t.text);
  },
  decorate(root) {
    const today = dayKey(now()); const seen = new Set();
    root.querySelectorAll('.task').forEach((t) => {
      if (!t.dataset.id || seen.has(t.dataset.id)) { t.dataset.id = uid(); t.dataset.done = '0'; t.dataset.due = ''; }
      seen.add(t.dataset.id);
      let box = t.querySelector(':scope > .tbox'); if (!box) { box = document.createElement('span'); box.className = 'tbox'; t.prepend(box); }
      box.setAttribute('contenteditable', 'false'); box.setAttribute('role', 'checkbox'); box.setAttribute('aria-checked', t.dataset.done === '1' ? 'true' : 'false'); box.setAttribute('aria-label', 'Done');
      let tt = t.querySelector(':scope > .ttext');
      if (!tt) { tt = document.createElement('span'); tt.className = 'ttext'; Array.from(t.childNodes).forEach((c) => { if (c !== box && !(c.classList && c.classList.contains('tdue'))) tt.appendChild(c); }); box.after(tt); }
      let due = t.querySelector(':scope > .tdue'); if (!due) { due = document.createElement('span'); due.className = 'tdue'; t.appendChild(due); }
      due.setAttribute('contenteditable', 'false'); due.setAttribute('role', 'button'); due.setAttribute('aria-label', 'Due date');
      const d = t.dataset.due;
      due.className = 'tdue' + (d ? (d < today && t.dataset.done !== '1' ? ' set over' : ' set') : '');
      due.innerHTML = d ? esc(fmtDue(d)) : icon('calendar');
    });
    root.querySelectorAll('.chead').forEach((h) => h.setAttribute('contenteditable', 'false'));
    root.querySelectorAll('a.nlink').forEach((a) => { a.setAttribute('contenteditable', 'false'); const n = Store.get('notes', a.dataset.note); if (n && !n.purged) a.textContent = n.title || 'Untitled'; });
  },

  /* ---------- open / render ---------- */
  render(noteId) {
    const n = Store.get('notes', noteId);
    if (!n || n.purged) { App.go('#/notes'); toast('That note no longer exists'); return; }
    this.note = n;
    this.isNew = !!App.newNoteIds.has(n.id);
    document.body.classList.add('no-tabs');
    const nb = n.notebookId && Store.get('notebooks', n.notebookId);
    const tpl = Tpl.find(n.template);
    $('#topbar').innerHTML =
      '<button class="ibtn" data-act="back" aria-label="Back">' + icon('back') + '</button>' +
      '<div id="ed-status" class="small muted" style="flex:1;font-weight:600"></div>' +
      '<button class="ibtn" data-act="fav" aria-label="Favorite" aria-pressed="' + !!n.favorite + '">' + icon(n.favorite ? 'starFill' : 'star') + '</button>' +
      '<button class="ibtn" data-act="reminder" aria-label="Reminder">' + icon(n.reminderAt && !n.reminderDone ? 'bellOn' : 'bell') + '</button>' +
      '<button class="ibtn" data-act="menu" aria-label="Note options">' + icon('dots') + '</button>';
    const ro = !!n.deletedAt;
    $('#view').innerHTML =
      (ro ? '<div class="card" style="background:var(--red-soft);color:var(--red-text);border:0"><b>This note is in Trash.</b> <button class="btn" data-act="restore" style="margin-top:8px">' + icon('restore') + 'Restore</button></div>' : '') +
      '<div class="ed-meta">' +
      '<button class="pill" data-act="move">' + (nb ? '<span class="dot" style="background:' + esc(nb.color) + '"></span>' + esc(Store.nbPath(nb.id).map((b) => b.name).join(' / ')) : icon('folder') + 'No notebook') + '</button>' +
      (tpl && tpl.id !== 'free' ? '<span class="pill">' + icon('template') + esc(tpl.name) + '</span>' : '') +
      '<button class="pill" data-act="tags">' + icon('tag') + ((n.tags || []).length ? esc(n.tags.map((t) => '#' + t).join(' ')) : 'Add tags') + '</button>' +
      (n.reminderAt && !n.reminderDone ? '<button class="pill amber" data-act="reminder">' + icon('bell') + esc(fmtDate(n.reminderAt) + ' ' + fmtTime(n.reminderAt)) + '</button>' : '') +
      (n.archived ? '<span class="pill">' + icon('archive') + 'Archived</span>' : '') +
      '</div>' +
      '<label for="ed-title" class="sr">Title</label><textarea id="ed-title" class="ed-title" rows="1" placeholder="Title" ' + (ro ? 'readonly' : '') + '>' + esc(n.title) + '</textarea>' +
      '<div id="ed-body" class="ed-body" contenteditable="' + (ro ? 'false' : 'true') + '" data-ph="Start writing…" role="textbox" aria-multiline="true" aria-label="Note text">' + (n.content || '') + '</div>' +
      '<div class="ed-extra" id="ed-extra"></div>' +
      '<input type="file" id="f-any" multiple hidden><input type="file" id="f-img" accept="image/*" multiple hidden><input type="file" id="f-cam" accept="image/*" capture="environment" hidden>' +
      (ro ? '' : this.toolbarHtml());
    this.body = $('#ed-body'); this.titleEl = $('#ed-title'); this.statusEl = $('#ed-status');
    this.decorate(this.body);
    this.autosize();
    this.renderExtra();
    this.updateStatus();
    this.bind();
    if (this.isNew && !n.title && !ro) setTimeout(() => this.titleEl.focus(), 80);
  },
  toolbarHtml() {
    const b = (act, ic, label, extra = '') => '<button type="button" data-tb="' + act + '" aria-label="' + label + '" ' + extra + '>' + ic + '</button>';
    return '<div class="toolbar" id="toolbar" role="toolbar" aria-label="Formatting">' +
      b('bold', '<span style="font-weight:800">B</span>', 'Bold') + b('italic', '<span style="font-style:italic;font-weight:600;font-family:Georgia,serif">I</span>', 'Italic') +
      b('mark', icon('highlight'), 'Highlight') + b('heading', icon('heading'), 'Heading') +
      b('ul', icon('ul'), 'Bullet list') + b('ol', icon('ol'), 'Numbered list') + b('task', icon('check'), 'Checklist') +
      '<span class="sep"></span>' +
      '<button type="button" class="txt" data-tb="rowAdd" aria-label="Add table row" hidden>+ Row</button><button type="button" class="txt" data-tb="colAdd" aria-label="Add table column" hidden>+ Col</button><button type="button" class="txt" data-tb="rowDel" aria-label="Delete table row" hidden>− Row</button>' +
      '<button type="button" class="txt" data-tb="cueAdd" aria-label="Add Cornell row" hidden>+ Cue row</button>' +
      b('table', icon('table'), 'Insert table') + b('link', icon('link'), 'Link to another note') +
      '<span class="sep"></span>' +
      b('image', icon('image'), 'Add image') + b('camera', icon('camera'), 'Take photo or scan') + b('file', icon('clip'), 'Attach file') + b('voice', icon('mic'), 'Record voice note') +
      '</div>';
  },
  autosize() { const t = this.titleEl; if (!t) return; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; },
  updateStatus() {
    if (!this.statusEl || !this.note) return;
    let s;
    if (this.saveTimer) s = 'Saving…';
    else if (this.note.deletedAt) s = 'In Trash';
    else if (!Sync.signedIn()) s = 'Saved on this device';
    else if (Sync.status === 'offline' || !navigator.onLine) s = 'Saved · offline';
    else if (Sync.status === 'syncing') s = 'Saved · syncing…';
    else if ((Sync.meta.lastSync || 0) >= (this.note.updatedAt || 0)) s = 'Synced';
    else if (Sync.status === 'reconnect') s = 'Saved · reconnect to sync';
    else s = 'Saved';
    this.statusEl.textContent = s;
  },

  /* ---------- saving ---------- */
  scheduleSave() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.save(), 600); this.updateStatus(); },
  async save() {
    clearTimeout(this.saveTimer); this.saveTimer = null;
    const n = this.note; if (!n || !this.body || n.deletedAt) { this.updateStatus(); return; }
    const html = this.cleanHtml(this.body.innerHTML);
    const title = this.titleEl.value.trim();
    if (html === n.content && title === n.title) { this.updateStatus(); return; }
    n.content = html; n.title = title; n.text = plainText(html); n.tasks = this.extractTasks(html);
    await Store.put('notes', n);
    const poss = SRS.extract(html).length > 0;
    if (poss !== this.lastPossible) { this.lastPossible = poss; this.renderExtra(); }
    if (this.isNew && (title || n.text || (n.attIds || []).length)) { this.isNew = false; App.newNoteIds.delete(n.id); }
    this.updateStatus();
  },
  cleanHtml(h) { return h.replace(/<br class="[^"]*">/g, '<br>').trim() === '<br>' ? '' : h; },
  async leave() {
    if (!this.note) return;
    await this.save();
    const n = this.note;
    if (App.newNoteIds.has(n.id) && !n.title && !n.text && !(n.attIds || []).length && !n.reminderAt) {
      App.newNoteIds.delete(n.id);
      await Store.hardDelete('notes', n.id);
    }
    this.note = null; this.body = null;
    document.body.classList.remove('no-tabs');
  },

  /* ---------- events ---------- */
  bind() {
    const tb = $('#topbar');
    tb.onclick = (e) => { const a = e.target.closest('[data-act]'); if (a) this.action(a.dataset.act); };
    $('#view').onclick = (e) => {
      const a = e.target.closest('[data-act]'); if (a && !a.closest('#ed-body')) { this.action(a.dataset.act, a); return; }
      const link = e.target.closest('a.nlink'); if (link) { e.preventDefault(); this.save().then(() => App.go('#/note/' + link.dataset.note)); return; }
      const box = e.target.closest('.tbox'); if (box && !this.note.deletedAt) { const t = box.parentElement; t.dataset.done = t.dataset.done === '1' ? '0' : '1'; this.decorate(this.body); this.scheduleSave(); return; }
      const due = e.target.closest('.tdue'); if (due && !this.note.deletedAt) { this.dueSheet(due.parentElement); return; }
      const att = e.target.closest('[data-att]'); if (att) { if (e.target.closest('.x')) this.removeAtt(att.dataset.att); else if (!e.target.closest('audio')) this.openAtt(att.dataset.att); }
    };
    if (this.note.deletedAt) return;
    this.titleEl.addEventListener('input', () => { this.autosize(); this.scheduleSave(); });
    this.titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.body.focus(); this.placeCaret(this.body.firstElementChild || this.body, false); } });
    this.body.addEventListener('input', () => { this.scheduleSave(); });
    this.body.addEventListener('keydown', (e) => this.onKey(e));
    this.body.addEventListener('paste', (e) => {
      const txt = e.clipboardData && e.clipboardData.getData('text/plain');
      if (txt != null && e.clipboardData.types.includes('text/html')) { e.preventDefault(); document.execCommand('insertText', false, txt); }
    });
    const bar = $('#toolbar');
    bar.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    bar.addEventListener('click', (e) => { const b = e.target.closest('[data-tb]'); if (b) this.tool(b.dataset.tb); });
    $('#f-any').onchange = (e) => { this.addFiles(e.target.files); e.target.value = ''; };
    $('#f-img').onchange = (e) => { this.addFiles(e.target.files); e.target.value = ''; };
    $('#f-cam').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) this.scanChoice(f); };
    document.onselectionchange = () => this.toolbarState();
  },
  toolbarState() {
    const bar = $('#toolbar'); if (!bar || !this.body) return;
    const sel = getSelection(); const inside = sel.rangeCount && this.body.contains(sel.anchorNode);
    let bold = false, ital = false; try { bold = inside && document.queryCommandState('bold'); ital = inside && document.queryCommandState('italic'); } catch (e) { }
    bar.querySelector('[data-tb=bold]').classList.toggle('on', !!bold);
    bar.querySelector('[data-tb=italic]').classList.toggle('on', !!ital);
    const node = inside ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement) : null;
    const inTable = !!(node && node.closest('td,th') && this.body.contains(node.closest('table')));
    const inCornell = !!(node && node.closest('.cornell'));
    ['rowAdd', 'colAdd', 'rowDel'].forEach((k) => { bar.querySelector('[data-tb=' + k + ']').hidden = !inTable; });
    bar.querySelector('[data-tb=cueAdd]').hidden = !inCornell;
    if (inside) this.savedRange = sel.getRangeAt(0).cloneRange();
  },
  placeCaret(el, atEnd) {
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(!atEnd);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  },
  restoreRange() {
    this.body.focus();
    if (this.savedRange && this.body.contains(this.savedRange.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(this.savedRange); return true; }
    this.placeCaret(this.body, true); return false;
  },
  currentBlock() {
    const s = getSelection(); if (!s.rangeCount) return null;
    let n = s.anchorNode; if (n.nodeType === 3) n = n.parentElement;
    if (!n || !this.body.contains(n)) return null;
    return n.closest('.task') || n.closest('p,h2,h3,li,div.callout,div:not(#ed-body)');
  },
  onKey(e) {
    const s = getSelection(); if (!s.rangeCount) return;
    let n = s.anchorNode; if (n.nodeType === 3) n = n.parentElement;
    const tt = n && n.closest && n.closest('.ttext');
    if (!tt || !this.body.contains(tt)) return;
    const task = tt.parentElement;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!tt.textContent.trim()) { const p = document.createElement('p'); p.innerHTML = '<br>'; task.replaceWith(p); this.placeCaret(p, false); this.scheduleSave(); return; }
      const r = s.getRangeAt(0); const rest = document.createRange(); rest.setStart(r.endContainer, r.endOffset); rest.setEnd(tt, tt.childNodes.length);
      const frag = rest.extractContents();
      const wrap = document.createElement('div'); wrap.innerHTML = Tpl.task(); const nt = wrap.firstChild;
      const ntt = nt.querySelector('.ttext');
      if (frag.textContent.length) { ntt.innerHTML = ''; ntt.appendChild(frag); }
      if (!tt.textContent.length) tt.innerHTML = '<br>';
      task.after(nt); this.decorate(this.body); this.placeCaret(ntt, false); this.scheduleSave();
    } else if (e.key === 'Backspace') {
      const r = s.getRangeAt(0); if (!r.collapsed) return;
      const before = document.createRange(); before.setStart(tt, 0); before.setEnd(r.startContainer, r.startOffset);
      if (before.toString().length === 0) {
        e.preventDefault();
        const p = document.createElement('p'); p.innerHTML = tt.innerHTML || '<br>'; task.replaceWith(p); this.placeCaret(p, false); this.scheduleSave();
      }
    }
  },

  /* ---------- toolbar ---------- */
  tool(t) {
    if (['image', 'camera', 'file', 'voice'].includes(t)) {
      if (t === 'image') $('#f-img').click(); else if (t === 'camera') $('#f-cam').click(); else if (t === 'file') $('#f-any').click(); else this.recordVoice();
      return;
    }
    this.restoreRange();
    const ex = (c, v) => document.execCommand(c, false, v);
    switch (t) {
      case 'bold': ex('bold'); break;
      case 'italic': ex('italic'); break;
      case 'mark': this.toggleMark(); break;
      case 'heading': {
        const b = this.currentBlock(); const tag = b ? b.tagName : 'P';
        ex('formatBlock', tag === 'H2' ? 'h3' : tag === 'H3' ? 'p' : 'h2'); break;
      }
      case 'ul': ex('insertUnorderedList'); break;
      case 'ol': ex('insertOrderedList'); break;
      case 'task': this.toggleTask(); break;
      case 'table': ex('insertHTML', Tpl.table()); break;
      case 'link': this.linkPicker(); return;
      case 'rowAdd': case 'rowDel': case 'colAdd': this.tableEdit(t); break;
      case 'cueAdd': {
        const s = getSelection(); let n = s.anchorNode; if (n && n.nodeType === 3) n = n.parentElement;
        const c = n && n.closest('.cornell'); if (!c) break;
        const row = n.closest('.crow'); const w = document.createElement('div'); w.innerHTML = Tpl.cornellRow(); const nr = w.firstChild;
        if (row) row.after(nr); else c.appendChild(nr);
        this.placeCaret(nr.querySelector('.cue'), false); break;
      }
    }
    this.decorate(this.body); this.scheduleSave(); this.toolbarState();
  },
  toggleMark() {
    const s = getSelection(); if (!s.rangeCount) return;
    const r = s.getRangeAt(0);
    let n = r.commonAncestorContainer; if (n.nodeType === 3) n = n.parentElement;
    const m = n.closest('mark');
    if (m && this.body.contains(m)) { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); m.remove(); p.normalize(); return; }
    if (r.collapsed) { toast('Select some text first, then tap highlight'); return; }
    const mk = document.createElement('mark');
    try { r.surroundContents(mk); } catch (e) { mk.appendChild(r.extractContents()); r.insertNode(mk); }
    s.removeAllRanges(); const nr = document.createRange(); nr.selectNodeContents(mk); nr.collapse(false); s.addRange(nr);
  },
  toggleTask() {
    const b = this.currentBlock();
    if (b && b.classList.contains('task')) { const p = document.createElement('p'); p.innerHTML = b.querySelector('.ttext') ? (b.querySelector('.ttext').innerHTML || '<br>') : '<br>'; b.replaceWith(p); this.placeCaret(p, true); return; }
    const w = document.createElement('div');
    if (b && ['P', 'H2', 'H3', 'LI'].includes(b.tagName) && b.closest('#ed-body') === this.body && !b.closest('.cornell,td')) {
      w.innerHTML = Tpl.task(); const t = w.firstChild; const tt = t.querySelector('.ttext');
      if (b.textContent.trim()) tt.innerHTML = b.innerHTML;
      if (b.tagName === 'LI') { const list = b.parentElement; b.remove(); list.after(t); if (!list.children.length) list.remove(); }
      else b.replaceWith(t);
      this.placeCaret(tt, true);
    } else {
      document.execCommand('insertHTML', false, Tpl.task());
      const all = this.body.querySelectorAll('.task'); const last = Array.from(all).find((t) => !t.querySelector('.ttext').textContent.trim());
      if (last) this.placeCaret(last.querySelector('.ttext'), false);
    }
  },
  tableEdit(t) {
    const s = getSelection(); let n = s.anchorNode; if (n && n.nodeType === 3) n = n.parentElement;
    const cell = n && n.closest('td,th'); if (!cell) return;
    const row = cell.parentElement; const table = cell.closest('table');
    if (t === 'rowAdd') { const nr = row.cloneNode(true); nr.querySelectorAll('td,th').forEach((c) => { c.innerHTML = '<br>'; }); row.after(nr); this.placeCaret(nr.firstElementChild, false); }
    if (t === 'rowDel') { const rows = table.querySelectorAll('tr'); if (rows.length > 1) { const nx = row.nextElementSibling || row.previousElementSibling; row.remove(); this.placeCaret(nx.firstElementChild, false); } else { table.remove(); } }
    if (t === 'colAdd') { const idx = Array.from(row.children).indexOf(cell); table.querySelectorAll('tr').forEach((r) => { const c = document.createElement(r.children[idx] ? r.children[idx].tagName.toLowerCase() : 'td'); c.innerHTML = '<br>'; (r.children[idx] || r.lastElementChild).after(c); }); }
  },
  linkPicker() {
    const cur = this.note.id;
    const list = () => Store.sortNotes(Store.activeNotes().filter((n) => n.id !== cur));
    const rows = (arr) => arr.slice(0, 40).map((n) => '<button class="item" data-id="' + n.id + '">' + icon('note') + '<span class="grow"><span>' + esc(n.title || 'Untitled') + '</span></span></button>').join('') || '<div class="empty">No other notes yet</div>';
    sheet('<h2>Link to a note</h2><div class="search" style="margin-bottom:10px">' + icon('search') + '<input id="lp-q" placeholder="Search notes" aria-label="Search notes" autocomplete="off"></div><div class="group" id="lp-list">' + rows(list()) + '</div>', (el, close) => {
      el.querySelector('#lp-q').oninput = (e) => { el.querySelector('#lp-list').innerHTML = rows(Store.search(e.target.value, list())); };
      el.querySelector('#lp-list').onclick = (e) => {
        const b = e.target.closest('[data-id]'); if (!b) return;
        const n = Store.get('notes', b.dataset.id); close();
        this.restoreRange();
        document.execCommand('insertHTML', false, '<a class="nlink" data-note="' + n.id + '" href="#/note/' + n.id + '" contenteditable="false">' + esc(n.title || 'Untitled') + '</a>&nbsp;');
        this.decorate(this.body); this.scheduleSave();
      };
    });
  },
  dueSheet(task) {
    const cur = task.dataset.due || '';
    const today = startOfDay(); const opt = (label, t) => '<button class="btn" data-d="' + dayKey(t) + '">' + label + '</button>';
    const nextMon = today + ((8 - new Date(today).getDay()) % 7 || 7) * DAY;
    sheet('<h2>Due date</h2><p class="muted small" style="margin:-8px 4px 12px">' + esc((task.querySelector('.ttext') || task).textContent.trim() || 'Task') + '</p>' +
      '<div class="row" style="margin-bottom:14px">' + opt('Today', today) + opt('Tomorrow', today + DAY) + opt('Next week', nextMon) + '</div>' +
      '<div class="field"><label for="due-in">Pick a date</label><input id="due-in" type="date" class="input" value="' + esc(cur) + '"></div>' +
      '<div class="actions"><button class="btn danger" data-clear>Clear</button><button class="btn primary" data-ok>Save</button></div>', (el, close) => {
      const set = (v) => { task.dataset.due = v || ''; this.decorate(this.body); this.scheduleSave(); close(); };
      el.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => set(b.dataset.d); });
      el.querySelector('[data-clear]').onclick = () => set('');
      el.querySelector('[data-ok]').onclick = () => set(el.querySelector('#due-in').value);
    });
  },

  /* ---------- attachments ---------- */
  async renderExtra() {
    const n = this.note; const box = $('#ed-extra'); if (!box) return;
    const atts = (n.attIds || []).map((id) => Store.get('atts', id)).filter((a) => a && !a.deletedAt);
    const cards = Store.all('cards').filter((c) => c.noteId === n.id && !c.deletedAt);
    const possible = SRS.extract(n.content).length; this.lastPossible = possible > 0;
    let h = '';
    if (atts.length) h += '<div class="atts">' + atts.map((a) => {
      const isImg = (a.type || '').startsWith('image/'); const isAud = (a.type || '').startsWith('audio/');
      return '<div class="att' + (isAud ? ' audio' : '') + '" data-att="' + a.id + '" role="button" tabindex="0" aria-label="' + esc(a.name) + '">' +
        (n.deletedAt ? '' : '<button class="x" aria-label="Remove ' + esc(a.name) + '">' + icon('x') + '</button>') +
        (isImg ? '<img alt="' + esc(a.name) + '" data-src="' + a.id + '">' : isAud ? '<audio controls preload="none" data-src="' + a.id + '"></audio>' : icon((a.type || '').includes('pdf') ? 'pdf' : 'file')) +
        (isImg ? '' : '<span class="nm">' + esc(a.name) + '</span><span class="muted">' + fmtSize(a.size || 0) + '</span>') + '</div>';
    }).join('') + '</div>';
    if (!n.deletedAt && (possible || cards.length)) {
      h += '<div class="card" style="margin:0"><h3>Flashcards</h3><p>' + (cards.length ? cards.length + ' card' + (cards.length > 1 ? 's' : '') + ' from this note.' : 'Turn your Cornell cues and highlights into cards.') + '</p><div class="row">' +
        (possible ? '<button class="btn soft" data-act="cards">' + icon('cards') + 'Make flashcards</button>' : '') +
        (cards.length ? '<a class="btn" href="#/study/' + n.id + '">' + icon('play') + 'Review</a><a class="btn" href="#/deck/' + n.id + '">Edit cards</a>' : '') + '</div></div>';
    }
    if (!n.deletedAt && (n.history || []).length) h += '<button class="btn" data-act="history" style="align-self:flex-start">' + icon('restore') + 'Earlier versions (' + n.history.length + ')</button>';
    box.innerHTML = h;
    for (const el of box.querySelectorAll('[data-src]')) {
      const a = Store.get('atts', el.dataset.src);
      Sync.fetchBlob(a).then((b) => { if (b) el.src = URL.createObjectURL(b); }).catch(() => { });
    }
  },
  async addFiles(files) {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) await this.addBlob(f, f.name, f.type);
  },
  async addBlob(blob, name, type) {
    const n = this.note;
    const a = { id: uid(), noteId: n.id, name: name || 'File', type: type || blob.type || 'application/octet-stream', size: blob.size, text: '', driveId: null, deletedAt: null };
    await Store.putBlob(a.id, blob);
    await Store.put('atts', a);
    n.attIds = (n.attIds || []).concat(a.id);
    if (this.isNew) { this.isNew = false; App.newNoteIds.delete(n.id); }
    await this.save(); await Store.put('notes', n);
    this.renderExtra();
    toast('Added ' + a.name);
    Exporter.extractText(a, blob).then(async (txt) => { if (txt) { a.text = txt; await Store.put('atts', a); } }).catch((e) => console.warn(e));
  },
  async removeAtt(id) {
    const a = Store.get('atts', id); if (!a) return;
    if (!(await confirmSheet('Remove attachment?', a.name, 'Remove', true))) return;
    a.deletedAt = now(); await Store.put('atts', a); await Store.delBlob(id);
    this.note.attIds = (this.note.attIds || []).filter((x) => x !== id); await Store.put('notes', this.note);
    this.renderExtra();
  },
  async openAtt(id) {
    const a = Store.get('atts', id); if (!a) return;
    let blob = null;
    try { blob = await Sync.fetchBlob(a); } catch (e) { }
    if (!blob) { toast(Sync.signedIn() ? 'This file is not on this device yet. Connect to the internet and sync.' : 'File not found on this device'); return; }
    const url = URL.createObjectURL(blob);
    const isImg = (a.type || '').startsWith('image/');
    sheet('<h2 style="word-break:break-word">' + esc(a.name) + '</h2>' +
      (isImg ? '<img src="' + url + '" alt="' + esc(a.name) + '" style="width:100%;border-radius:12px;margin-bottom:12px">' : '<p class="muted" style="margin:0 4px 14px">' + fmtSize(a.size || 0) + (a.text ? ' · searchable text found' : '') + '</p>') +
      '<div class="actions"><a class="btn" href="' + url + '" target="_blank" rel="noopener">Open</a><button class="btn primary" data-dl>' + icon('download') + 'Download</button></div>', (el) => {
      el.querySelector('[data-dl]').onclick = () => download(a.name, blob);
    });
  },
  scanChoice(file) {
    sheet('<h2>Photo added</h2><p class="muted" style="margin:0 4px 14px">Is this a document page? TUONTA can make it sharper and black-and-white so it is easy to read.</p><div class="actions"><button class="btn" data-k>Keep photo</button><button class="btn primary" data-s>' + icon('scan') + 'Enhance as document</button></div>', (el, close) => {
      el.querySelector('[data-k]').onclick = () => { close(); this.addBlob(file, 'Photo ' + fmtDate(now()) + ' ' + fmtTime(now()).replace(':', '.') + '.jpg', file.type || 'image/jpeg'); };
      el.querySelector('[data-s]').onclick = async () => { close(); try { const b = await Exporter.enhanceScan(file); this.addBlob(b, 'Scan ' + fmtDate(now()) + ' ' + fmtTime(now()).replace(':', '.') + '.jpg', 'image/jpeg'); } catch (e) { toast('Could not enhance — kept the original photo'); this.addBlob(file, file.name || 'Photo.jpg', file.type); } };
    });
  },
  async recordVoice() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Voice recording is not supported in this browser'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { toast('Microphone access was blocked'); return; }
    const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
    const mime = types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = []; let cancelled = false; const t0 = now(); let tick;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop()); clearInterval(tick);
      if (cancelled || !chunks.length) return;
      const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      this.addBlob(new Blob(chunks, { type }), 'Voice ' + fmtDate(now()) + ' ' + fmtTime(now()).replace(':', '.') + '.' + ext, type);
    };
    rec.start(1000);
    const close = sheet('<h2>Recording</h2><div class="rec" style="margin:4px 4px 18px"><span class="live"></span><span id="rec-t">0:00</span></div><div class="actions"><button class="btn" data-c>Cancel</button><button class="btn primary" data-s>' + icon('stop') + 'Stop & save</button></div>', (el, c) => {
      tick = setInterval(() => { const s = Math.floor((now() - t0) / 1000); const t = el.querySelector('#rec-t'); if (t) t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 500);
      el.querySelector('[data-c]').onclick = () => { cancelled = true; c(); rec.stop(); };
      el.querySelector('[data-s]').onclick = () => { c(); rec.stop(); };
      el.parentElement.querySelector('.scrim').onclick = () => { c(); rec.stop(); };
    });
    return close;
  },

  /* ---------- note actions ---------- */
  async action(act, el) {
    const n = this.note; if (!n) return;
    switch (act) {
      case 'back': await this.save(); App.back(); break;
      case 'fav': n.favorite = !n.favorite; await this.save(); await Store.put('notes', n); this.render(n.id); break;
      case 'reminder': Views.reminderSheet(n, () => this.render(n.id)); break;
      case 'menu': this.menu(); break;
      case 'move': Views.notebookPicker(n.notebookId, async (id) => { await this.save(); n.notebookId = id; await Store.put('notes', n); this.render(n.id); }); break;
      case 'tags': this.tagSheet(); break;
      case 'restore': n.deletedAt = null; await Store.put('notes', n); this.render(n.id); toast('Restored'); break;
      case 'cards': { await this.save(); const r = await SRS.makeFromNote(n); toast(r.added ? 'Made ' + r.added + ' new flashcard' + (r.added > 1 ? 's' : '') : 'No new cards — they are already made'); this.renderExtra(); break; }
      case 'history': this.historySheet(); break;
    }
  },
  menu() {
    const n = this.note;
    const it = (a, ic, label) => '<button class="item" data-m="' + a + '">' + icon(ic) + label + '</button>';
    sheet('<h2>' + esc(n.title || 'Untitled') + '</h2><div class="group">' +
      it('pin', 'pin', n.pinned ? 'Unpin' : 'Pin to top') + it('color', 'palette', 'Color label') + it('move', 'move', 'Move to notebook') + it('tags', 'tag', 'Tags') + it('reminder', 'bell', 'Reminder') +
      '</div><div class="group">' + it('md', 'download', 'Export as Markdown') + it('pdf', 'file', 'Export as PDF (print)') + it('share', 'share', 'Share text') + it('tpl', 'template', 'Save as my template') +
      '</div><div class="group">' + it('archive', 'archive', n.archived ? 'Unarchive' : 'Archive') + (n.deletedAt ? it('restore', 'restore', 'Restore') + it('forever', 'trash', 'Delete forever') : it('delete', 'trash', 'Move to Trash')) + '</div>', (el, close) => {
      el.onclick = async (e) => {
        const b = e.target.closest('[data-m]'); if (!b) return; close();
        await this.save();
        switch (b.dataset.m) {
          case 'pin': n.pinned = !n.pinned; await Store.put('notes', n); toast(n.pinned ? 'Pinned' : 'Unpinned'); break;
          case 'color': Views.colorSheet(n.color, true, async (c) => { n.color = c; await Store.put('notes', n); toast('Color label saved'); }); return;
          case 'move': return this.action('move');
          case 'tags': return this.tagSheet();
          case 'reminder': return this.action('reminder');
          case 'md': Exporter.downloadMd(n); return;
          case 'pdf': Exporter.print(n); return;
          case 'share': Exporter.share(n); return;
          case 'tpl': { const name = await promptSheet('Save as template', 'Template name', n.title || 'My template'); if (name) { await Store.put('templates', { id: uid(), name, desc: 'My template', title: '', html: n.content }); toast('Template saved'); } return; }
          case 'archive': n.archived = !n.archived; await Store.put('notes', n); toast(n.archived ? 'Archived' : 'Moved back to notes'); break;
          case 'delete': n.deletedAt = now(); await Store.put('notes', n); App.newNoteIds.delete(n.id); this.note = null; App.back(); toast('Moved to Trash', 'Undo', async () => { n.deletedAt = null; await Store.put('notes', n); App.render(); }); return;
          case 'restore': n.deletedAt = null; await Store.put('notes', n); toast('Restored'); break;
          case 'forever': if (await confirmSheet('Delete forever?', 'This cannot be undone.', 'Delete', true)) { await Store.purgeNote(n); this.note = null; App.back(); } return;
        }
        if (this.note) this.render(n.id);
      };
    });
  },
  tagSheet() {
    const n = this.note; let tags = (n.tags || []).slice();
    const all = Store.allTags().map((t) => t[0]);
    const draw = (el) => {
      const pool = Array.from(new Set(all.concat(tags))).sort();
      el.querySelector('#tg-list').innerHTML = pool.map((t) => '<button class="chip' + (tags.includes(t) ? ' on' : '') + '" data-t="' + esc(t) + '">#' + esc(t) + '</button>').join('') || '<span class="muted small">No tags yet</span>';
    };
    sheet('<h2>Tags</h2><form id="tg-f" class="row" style="margin-bottom:12px;flex-wrap:nowrap"><input class="input" id="tg-in" placeholder="Add a tag, e.g. exam" aria-label="New tag" autocomplete="off" autocapitalize="none"><button class="btn primary">Add</button></form><div class="chips" id="tg-list" style="flex-wrap:wrap;margin:0;padding:0"></div><div class="actions" style="margin-top:16px"><button class="btn primary" data-close>Done</button></div>', (el) => {
      draw(el);
      const commit = async () => { n.tags = tags; await this.save(); await Store.put('notes', n); };
      el.querySelector('#tg-f').onsubmit = async (e) => { e.preventDefault(); const v = el.querySelector('#tg-in').value; v.split(/[,\s]+/).map((x) => x.replace(/^#/, '').trim().toLowerCase()).filter(Boolean).forEach((x) => { if (!tags.includes(x)) tags.push(x); }); el.querySelector('#tg-in').value = ''; draw(el); await commit(); };
      el.querySelector('#tg-list').onclick = async (e) => { const b = e.target.closest('[data-t]'); if (!b) return; const t = b.dataset.t; tags = tags.includes(t) ? tags.filter((x) => x !== t) : tags.concat(t); draw(el); await commit(); };
      const obs = new MutationObserver(() => { if (!document.body.contains(el)) { obs.disconnect(); if (this.note === n) this.render(n.id); } }); obs.observe($('#sheets'), { childList: true });
    });
  },
  historySheet() {
    const n = this.note; const h = (n.history || []).slice().reverse();
    sheet('<h2>Earlier versions</h2><p class="muted small" style="margin:-6px 4px 12px">Kept when the same note was edited on two devices before syncing.</p><div class="group">' + h.map((v, i) => '<button class="item" data-i="' + i + '"><span class="grow"><span>' + esc(v.title || 'Untitled') + '</span><span class="sub">' + esc(fmtDate(v.updatedAt) + ' ' + fmtTime(v.updatedAt)) + '</span></span>' + icon('chevR') + '</button>').join('') + '</div>', (el, close) => {
      el.onclick = (e) => {
        const b = e.target.closest('[data-i]'); if (!b) return; const v = h[Number(b.dataset.i)]; close();
        sheet('<h2>' + esc(v.title || 'Untitled') + '</h2><div class="card rich" style="max-height:50vh;overflow:auto">' + v.content + '</div><div class="actions"><button class="btn" data-close>Close</button><button class="btn primary" data-r>Restore this version</button></div>', (el2, c2) => {
          el2.querySelector('[data-r]').onclick = async () => { c2(); n.history = Sync.pushHist(n.history, n); n.title = v.title; n.content = v.content; n.text = plainText(v.content); n.tasks = this.extractTasks(v.content); await Store.put('notes', n); this.render(n.id); toast('Version restored'); };
        });
      };
    });
  }
};

/* ---------- export, file text, scans ---------- */
const Exporter = {
  markdown(n) {
    const out = [];
    const inline = (node) => {
      let s = '';
      node.childNodes.forEach((c) => {
        if (c.nodeType === 3) { s += c.textContent; return; }
        if (c.nodeType !== 1) return;
        const t = c.tagName;
        if (c.classList.contains('tdue') || c.classList.contains('tbox')) return;
        if (t === 'BR') s += '\n';
        else if (t === 'B' || t === 'STRONG') s += '**' + inline(c) + '**';
        else if (t === 'I' || t === 'EM') s += '*' + inline(c) + '*';
        else if (t === 'MARK') s += '==' + inline(c) + '==';
        else if (t === 'A' && c.classList.contains('nlink')) s += '[[' + c.textContent + ']]';
        else if (t === 'A') s += '[' + c.textContent + '](' + c.getAttribute('href') + ')';
        else s += inline(c);
      });
      return s;
    };
    const block = (node, depth) => {
      node.childNodes.forEach((c) => {
        if (c.nodeType === 3) { if (c.textContent.trim()) out.push(c.textContent.trim(), ''); return; }
        if (c.nodeType !== 1) return;
        const t = c.tagName;
        if (c.classList.contains('task')) { const due = c.dataset.due ? ' (due ' + c.dataset.due + ')' : ''; out.push('- [' + (c.dataset.done === '1' ? 'x' : ' ') + '] ' + inline(c.querySelector('.ttext') || c).trim() + due); return; }
        if (c.classList.contains('cornell')) {
          out.push('', '| Cue | Notes |', '| --- | --- |');
          c.querySelectorAll('.crow').forEach((r) => (r.textContent.trim()) && out.push('| ' + inline(r.querySelector('.cue')).trim().replace(/\n/g, ' ') + ' | ' + inline(r.querySelector('.cnote')).trim().replace(/\n/g, '<br>') + ' |'));
          out.push(''); return;
        }
        if (c.classList.contains('callout')) { out.push('> ' + inline(c).trim(), ''); return; }
        if (t === 'H2') out.push('## ' + inline(c).trim(), '');
        else if (t === 'H3') out.push('### ' + inline(c).trim(), '');
        else if (t === 'UL' || t === 'OL') { let i = 1; c.querySelectorAll(':scope > li').forEach((li) => out.push('  '.repeat(depth) + (t === 'OL' ? (i++) + '. ' : '- ') + inline(li).trim())); out.push(''); }
        else if (t === 'TABLE') {
          const rows = Array.from(c.querySelectorAll('tr')).map((r) => Array.from(r.children).map((td) => inline(td).trim().replace(/\n/g, ' ').replace(/\|/g, '\\|')));
          if (rows.length) { out.push('| ' + rows[0].join(' | ') + ' |', '|' + rows[0].map(() => ' --- |').join('')); rows.slice(1).forEach((r) => out.push('| ' + r.join(' | ') + ' |')); out.push(''); }
        } else if (t === 'P' || t === 'DIV') { const s = inline(c).trim(); if (s) out.push(s, ''); else if (t === 'DIV' && c.children.length) block(c, depth); }
        else { const s = inline(c).trim(); if (s) out.push(s, ''); }
      });
    };
    const d = document.createElement('div'); d.innerHTML = n.content || '';
    block(d, 0);
    const nb = n.notebookId && Store.get('notebooks', n.notebookId);
    const head = ['# ' + (n.title || 'Untitled'), ''];
    const meta = [];
    if (nb) meta.push('Notebook: ' + Store.nbPath(nb.id).map((b) => b.name).join(' / '));
    if ((n.tags || []).length) meta.push('Tags: ' + n.tags.map((t) => '#' + t).join(' '));
    meta.push('Updated: ' + new Date(Math.max(n.updatedAt || 0, n.createdAt || 0) || now()).toLocaleString());
    const atts = (n.attIds || []).map((id) => Store.get('atts', id)).filter((a) => a && !a.deletedAt);
    const tail = atts.length ? ['', '---', 'Attachments (in the TUONTA/Attachments folder): ' + atts.map((a) => a.name).join(', ')] : [];
    return head.concat(['*' + meta.join(' · ') + '*', ''], out, tail).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  },
  downloadMd(n) { download(safeName(n.title) + '.md', new Blob([this.markdown(n)], { type: 'text/markdown' })); },
  async share(n) {
    const text = this.markdown(n);
    if (navigator.share) { try { await navigator.share({ title: n.title || 'Note', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch (e) { this.downloadMd(n); }
  },
  print(n) {
    let p = $('#print-area'); if (!p) { p = document.createElement('div'); p.id = 'print-area'; p.className = 'print-only rich'; document.body.appendChild(p); }
    const nb = n.notebookId && Store.get('notebooks', n.notebookId);
    p.innerHTML = '<h1 style="font-size:24px;margin:0 0 4px">' + esc(n.title || 'Untitled') + '</h1><p style="color:#555;font-size:12px;margin:0 0 16px">' + esc([nb ? nb.name : '', (n.tags || []).map((t) => '#' + t).join(' '), fmtDate(n.updatedAt || now(), true)].filter(Boolean).join(' · ')) + '</p><div class="ed-body">' + (n.content || '') + '</div>';
    Editor.decorate(p);
    p.querySelectorAll('.tdue:not(.set)').forEach((e) => e.remove());
    setTimeout(() => window.print(), 50);
  },
  async extractText(att, blob) {
    const type = att.type || '';
    if (type.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(att.name)) return (await blob.text()).slice(0, 100000);
    if (type === 'application/pdf' || /\.pdf$/i.test(att.name)) {
      await loadScript('vendor/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      const pdf = await window.pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
      let txt = '';
      for (let i = 1; i <= Math.min(pdf.numPages, 60); i++) { const pg = await pdf.getPage(i); const c = await pg.getTextContent(); txt += c.items.map((x) => x.str).join(' ') + '\n'; if (txt.length > 100000) break; }
      return txt.slice(0, 100000);
    }
    return '';
  },
  async enhanceScan(file) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const max = 2200; const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * sc), h = Math.round(img.naturalHeight * sc);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h); const p = d.data; const hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) { const g = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0; p[i] = g; hist[g]++; }
    const total = w * h; let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { lo = i; break; } }
    acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.08) { hi = i; break; } }
    const range = Math.max(1, hi - lo);
    for (let i = 0; i < p.length; i += 4) { let v = (p[i] - lo) * 255 / range; v = v < 0 ? 0 : v > 255 ? 255 : v; v = 255 * Math.pow(v / 255, 1.35); p[i] = p[i + 1] = p[i + 2] = v; }
    x.putImageData(d, 0, 0);
    return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.85));
  }
};

/* keep the toolbar above the phone keyboard */
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => { const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop); document.documentElement.style.setProperty('--kb', kb + 'px'); document.body.classList.toggle('kb-open', kb > 80); };
  vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
}

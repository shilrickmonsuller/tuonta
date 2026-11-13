'use strict';
/* All screens except the editor */
const Views = {
  q: '', calMonth: null, calSel: null,

  topbar(title, opts = {}) {
    $('#topbar').innerHTML =
      (opts.back ? '<button class="ibtn" data-top="back" aria-label="Back">' + icon('back') + '</button>' : '<button class="ibtn raised" data-top="menu" aria-label="Open menu">' + icon('menu') + '</button>') +
      '<h1 class="' + (opts.back ? '' : 'center') + '">' + esc(title) + '</h1>' +
      (opts.right || '<a class="ibtn raised" href="#/calendar" aria-label="Calendar">' + icon('calendar') + '</a>');
    $('#topbar').onclick = (e) => {
      const b = e.target.closest('[data-top]'); if (!b) return;
      if (b.dataset.top === 'menu') Views.openDrawer();
      else if (b.dataset.top === 'back') App.back();
      else if (opts.onRight) opts.onRight(b.dataset.top);
    };
  },
  fab() { return '<button class="fab" data-v="new" aria-label="New note">' + icon('plus') + '</button>'; },

  noteCard(n) {
    const nb = n.notebookId && Store.get('notebooks', n.notebookId);
    const tpl = Tpl.find(n.template);
    const tasks = n.tasks || []; const done = tasks.filter((t) => t.done).length;
    const atts = (n.attIds || []).length;
    const snippet = (n.text || '').slice(0, 160);
    return '<a class="ncard" href="#/note/' + n.id + '">' + (n.color ? '<span class="stripe" style="background:' + esc(n.color) + '"></span>' : '') +
      '<div class="meta">' + (nb ? '<span class="nb-tag"><span class="dot" style="background:' + esc(nb.color) + '"></span>' + esc(nb.name) + '</span>' : '') +
      '<span>' + esc((tpl && tpl.id !== 'free' ? tpl.name + ' · ' : '') + fmtRel(Math.max(n.updatedAt || 0, n.createdAt || 0))) + '</span></div>' +
      '<div class="t">' + (n.pinned ? icon('pin') : '') + '<span>' + esc(n.title || 'Untitled') + '</span>' + (n.favorite ? icon('starFill') : '') + '</div>' +
      (snippet ? '<div class="s">' + esc(snippet) + '</div>' : '') +
      ((tasks.length || atts || n.reminderAt || (n.tags || []).length) ? '<div class="f">' +
        (tasks.length ? '<span>' + icon('check') + done + ' of ' + tasks.length + ' done</span>' : '') +
        (atts ? '<span>' + icon('clip') + atts + '</span>' : '') +
        (n.reminderAt && !n.reminderDone ? '<span>' + icon('bell') + esc(fmtDate(n.reminderAt)) + '</span>' : '') +
        ((n.tags || []).length ? '<span>' + esc(n.tags.slice(0, 3).map((t) => '#' + t).join(' ')) + '</span>' : '') + '</div>' : '') +
      '</a>';
  },
  noteList(list, emptyHtml) { return list.length ? '<div class="notes">' + list.map((n) => this.noteCard(n)).join('') + '</div>' : '<div class="empty">' + emptyHtml + '</div>'; },

  /* ---------- drawer ---------- */
  openDrawer() {
    const d = $('#drawer'); const p = d.querySelector('.drawer-panel');
    const a = Sync.account; const route = location.hash;
    const it = (href, ic, label, cnt) => '<a class="item' + (route === href ? ' on' : '') + '" href="' + href + '">' + icon(ic) + label + (cnt != null ? '<span class="cnt">' + cnt + '</span>' : '') + '</a>';
    p.innerHTML = '<a class="profile" href="#/sync" style="text-decoration:none;color:inherit">' +
      '<div class="avatar">' + (a && a.picture ? '<img src="' + esc(a.picture) + '" alt="" referrerpolicy="no-referrer">' : a ? esc((a.name || '?')[0].toUpperCase()) : icon('user')) + '</div>' +
      '<div style="min-width:0"><div class="n">' + esc(a ? a.name : 'Not signed in') + '</div><div class="st" id="dr-status">' + esc(Sync.statusText()) + '</div></div></a>' +
      '<div class="group">' + it('#/notes', 'note', 'All notes', Store.activeNotes().length) +
      '<div class="glabel">Notebooks</div>' +
      Store.nbTree().map(({ nb, depth }) => '<a class="item ' + (depth ? 'nb-child' + (depth > 1 ? '2' : '') : '') + (route === '#/nb/' + nb.id ? ' on' : '') + '" href="#/nb/' + nb.id + '"><span class="dot" style="background:' + esc(nb.color) + '"></span>' + esc(nb.name) + '<span class="cnt">' + Store.nbCount(nb.id) + '</span></a>').join('') +
      '<button class="item" data-dr="newnb" style="color:var(--muted)">' + icon('plus') + 'New notebook</button></div>' +
      '<div class="group">' + it('#/today', 'today', 'Today') + it('#/calendar', 'calendar', 'Calendar') + it('#/list/reminders', 'bell', 'Reminders') + it('#/list/favorites', 'star', 'Favorites') + it('#/tags', 'tag', 'Tags') + it('#/list/archive', 'archive', 'Archive') + it('#/list/trash', 'trash', 'Trash') + '</div>' +
      '<div class="group">' + it('#/sync', 'sync', 'Sync & backup') + it('#/settings', 'settings', 'Settings') + '</div>';
    d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
    const close = () => { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); };
    d.querySelector('.drawer-scrim').onclick = close;
    p.onclick = (e) => { if (e.target.closest('a')) close(); if (e.target.closest('[data-dr=newnb]')) { close(); this.notebookSheet(null); } };
  },

  /* ---------- Home ---------- */
  home(filterNb) {
    const nb = filterNb && Store.get('notebooks', filterNb);
    if (filterNb && !nb) { App.go('#/notes'); return; }
    this.topbar(nb ? nb.name : 'TUONTA', nb ? { back: true, right: '<button class="ibtn" data-top="nbmenu" aria-label="Notebook options">' + icon('dots') + '</button>', onRight: () => this.notebookMenu(nb) } : {});
    const tops = Store.nbChildren(nb ? nb.id : null);
    const today = this.todayCounts();
    let h = '<div class="search">' + icon('search') + '<input id="q" type="search" placeholder="Search notes, tasks, tags, files" aria-label="Search" value="' + esc(this.q) + '" autocomplete="off"></div>';
    h += '<div class="chips" role="list">' + (nb ? '' : '<a class="chip on" href="#/notes">All</a>') +
      tops.map((b) => '<a class="chip" href="#/nb/' + b.id + '"><span class="dot" style="background:' + esc(b.color) + '"></span>' + esc(b.name) + '</a>').join('') +
      (nb ? '' : '<button class="chip" data-v="newnb">' + icon('plus').replace('<svg', '<svg width="16" height="16"') + 'Notebook</button>') + '</div>';
    if (!nb && !this.q) {
      h += '<div class="today-card"><div class="lbl">TODAY · ' + esc(new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()) + '</div>' +
        '<div class="stats"><a class="stat" href="#/today"><b>' + today.tasks + '</b><span>tasks due' + (today.overdue ? ' · ' + today.overdue + ' late' : '') + '</span></a>' +
        '<a class="stat" href="#/review"><b>' + today.cards + '</b><span>cards due</span></a>' +
        '<a class="stat" href="#/list/reminders"><b>' + today.reminders + '</b><span>reminders</span></a></div>' +
        '<div class="row">' + (today.cards ? '<a class="btn-w" href="#/study">Start review</a>' : '') + '<a class="' + (today.cards ? 'btn-o' : 'btn-w') + '" href="#/today">Open Today</a></div></div>';
    }
    h += '<div id="list-wrap"></div>' + this.fab();
    $('#view').innerHTML = h;
    const draw = () => {
      let list = Store.activeNotes();
      if (nb) { const ids = new Set(Store.nbDescendants(nb.id)); list = list.filter((n) => ids.has(n.notebookId)); }
      const searching = !!this.q.trim();
      if (searching) list = Store.search(this.q, Store.liveNotes().filter((n) => !nb || new Set(Store.nbDescendants(nb.id)).has(n.notebookId)));
      list = Store.sortNotes(list);
      const sortLbl = { edited: 'Edited', created: 'Created', title: 'Title' }[Settings.get('sort')] || 'Edited';
      $('#list-wrap').innerHTML = '<div class="sec-h"><h2>' + (searching ? list.length + ' result' + (list.length === 1 ? '' : 's') : nb ? 'Notes' : 'Recent notes') + '</h2><button class="sub" data-v="sort">Sort: ' + sortLbl + '</button></div>' +
        this.noteList(list, searching ? '<b>Nothing found</b>Try another word or a #tag' : '<b>No notes yet</b>Tap + to write your first one');
    };
    draw();
    const qi = $('#q');
    qi.oninput = debounce(() => { const had = !!this.q; this.q = qi.value; if (!!this.q !== had && !nb) { this.home(filterNb); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); } else draw(); }, 200);
    $('#view').onclick = (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      if (b.dataset.v === 'new') this.newNoteSheet(nb ? nb.id : null);
      if (b.dataset.v === 'newnb') this.notebookSheet(null);
      if (b.dataset.v === 'sort') { const order = ['edited', 'created', 'title']; Settings.set('sort', order[(order.indexOf(Settings.get('sort')) + 1) % 3]); draw(); }
    };
  },
  todayCounts() {
    const tk = dayKey(now());
    const tasks = Store.allTasks().filter((t) => !t.done && t.due && t.due <= tk);
    const end = startOfDay() + DAY;
    return { tasks: tasks.length, overdue: tasks.filter((t) => t.due < tk).length, cards: SRS.due().length, reminders: Store.activeNotes().filter((n) => n.reminderAt && !n.reminderDone && n.reminderAt < end).length };
  },

  /* ---------- new note ---------- */
  newNoteSheet(nbId) {
    const tpls = Tpl.all();
    sheet('<h2>New note</h2><div class="group">' + tpls.map((t) => '<button class="item" data-t="' + esc(t.id) + '">' + icon(t.id === 'free' ? 'note' : t.id === 'checklist' ? 'check' : t.id === 'cornell' ? 'cards' : 'template') + '<span class="grow"><span>' + esc(t.name) + '</span><span class="sub">' + esc(t.desc || '') + '</span></span></button>').join('') + '</div>' +
      '<div class="group"><button class="item" data-q="scan">' + icon('scan') + '<span class="grow"><span>Scan a document</span><span class="sub">Take a photo and clean it up</span></span></button><button class="item" data-q="voice">' + icon('mic') + '<span class="grow"><span>Voice note</span><span class="sub">Record now, add text later</span></span></button></div>', (el, close) => {
      el.onclick = async (e) => {
        const b = e.target.closest('[data-t],[data-q]'); if (!b) return; close();
        const t = b.dataset.t ? Tpl.find(b.dataset.t) : Tpl.find('free');
        const html = Tpl.instantiate(t.html);
        const n = Store.newNote({ title: t.title || '', content: html, template: t.builtIn ? t.id : 'free', notebookId: nbId || null });
        n.text = plainText(html); n.tasks = Editor.extractTasks(html);
        await Store.put('notes', n);
        App.newNoteIds.add(n.id);
        App.go('#/note/' + n.id);
        if (b.dataset.q) setTimeout(() => { if (b.dataset.q === 'scan') $('#f-cam') && $('#f-cam').click(); else Editor.recordVoice(); }, 250);
      };
    });
  },

  /* ---------- notebooks ---------- */
  notebooks() {
    this.topbar('Notebooks');
    const tree = Store.nbTree();
    $('#view').innerHTML = '<div class="group" style="margin-top:6px">' + (tree.length ? tree.map(({ nb, depth }) => '<a class="item ' + (depth ? 'nb-child' + (depth > 1 ? '2' : '') : '') + '" href="#/nb/' + nb.id + '"><span class="dot" style="background:' + esc(nb.color) + '"></span><span class="grow"><span>' + esc(nb.name) + '</span></span><span class="cnt">' + Store.nbCount(nb.id) + '</span>' + icon('chevR') + '</a>').join('') : '<div class="empty">No notebooks yet</div>') + '</div>' +
      '<button class="btn soft block" data-v="newnb">' + icon('plus') + 'New notebook</button>' +
      '<p class="muted small" style="margin:14px 4px">Tip: open a notebook and use ⋮ to rename it, change its color or add a sub-notebook.</p>' + this.fab();
    $('#view').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; if (b.dataset.v === 'newnb') this.notebookSheet(null); if (b.dataset.v === 'new') this.newNoteSheet(null); };
  },
  notebookSheet(nb, parentId) {
    const editing = !!nb; let color = nb ? nb.color : COLORS[Store.notebooks().length % COLORS.length];
    const parents = Store.nbTree().filter(({ nb: b, depth }) => depth < 2 && (!nb || !Store.nbDescendants(nb.id).includes(b.id)));
    const pid = nb ? nb.parentId : parentId || '';
    sheet('<h2>' + (editing ? 'Edit notebook' : 'New notebook') + '</h2><form><div class="field"><label for="nb-n">Name</label><input id="nb-n" class="input" value="' + esc(nb ? nb.name : '') + '" required autofocus autocomplete="off"></div>' +
      '<div class="field"><span class="lab">Color</span><div class="swatches" id="nb-c">' + COLORS.map((c) => '<button type="button" class="sw' + (c === color ? ' on' : '') + '" style="background:' + c + '" data-c="' + c + '" aria-label="Color ' + c + '"></button>').join('') + '</div></div>' +
      '<div class="field"><label for="nb-p">Inside</label><select id="nb-p" class="input"><option value="">— Top level —</option>' + parents.map(({ nb: b, depth }) => '<option value="' + b.id + '"' + (b.id === pid ? ' selected' : '') + '>' + '  '.repeat(depth) + esc(b.name) + '</option>').join('') + '</select></div>' +
      '<div class="actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">' + (editing ? 'Save' : 'Create') + '</button></div></form>', (el, close) => {
      el.querySelector('#nb-c').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; el.querySelectorAll('.sw').forEach((s) => s.classList.toggle('on', s === b)); };
      el.querySelector('form').onsubmit = async (e) => {
        e.preventDefault(); const name = el.querySelector('#nb-n').value.trim(); if (!name) return;
        const o = nb || { id: uid(), order: Store.notebooks().length };
        o.name = name; o.color = color; o.parentId = el.querySelector('#nb-p').value || null;
        await Store.put('notebooks', o); close(); App.render(); toast(editing ? 'Notebook saved' : 'Notebook created');
      };
    });
  },
  notebookMenu(nb) {
    sheet('<h2>' + esc(nb.name) + '</h2><div class="group"><button class="item" data-m="edit">' + icon('edit') + 'Rename, color or move</button><button class="item" data-m="sub">' + icon('plus') + 'Add sub-notebook</button><button class="item" data-m="del" style="color:var(--red-text)">' + icon('trash') + 'Delete notebook</button></div>', (el, close) => {
      el.onclick = async (e) => {
        const b = e.target.closest('[data-m]'); if (!b) return; close();
        if (b.dataset.m === 'edit') this.notebookSheet(nb);
        if (b.dataset.m === 'sub') { if (Store.nbPath(nb.id).length >= 3) toast('Notebooks can go 3 levels deep'); else this.notebookSheet(null, nb.id); }
        if (b.dataset.m === 'del') {
          const ids = Store.nbDescendants(nb.id); const notes = Store.liveNotes().filter((n) => ids.includes(n.notebookId));
          if (!(await confirmSheet('Delete “' + nb.name + '”?', (ids.length > 1 ? 'Its sub-notebooks are deleted too. ' : '') + (notes.length ? notes.length + ' note' + (notes.length > 1 ? 's' : '') + ' will move to Trash (restorable for 30 days).' : 'It has no notes.'), 'Delete', true))) return;
          for (const n of notes) { n.deletedAt = now(); await Store.put('notes', n); }
          for (const id of ids) { const x = Store.get('notebooks', id); x.deletedAt = now(); await Store.put('notebooks', x); }
          App.go('#/notebooks'); toast('Notebook deleted');
        }
      };
    });
  },
  notebookPicker(current, cb) {
    sheet('<h2>Move to notebook</h2><div class="group"><button class="item' + (!current ? ' on' : '') + '" data-id="">' + icon('note') + 'No notebook</button>' +
      Store.nbTree().map(({ nb, depth }) => '<button class="item ' + (depth ? 'nb-child' + (depth > 1 ? '2' : '') : '') + (nb.id === current ? ' on' : '') + '" data-id="' + nb.id + '"><span class="dot" style="background:' + esc(nb.color) + '"></span>' + esc(nb.name) + '</button>').join('') +
      '</div><button class="btn soft block" data-new>' + icon('plus') + 'New notebook</button>', (el, close) => {
      el.onclick = (e) => { if (e.target.closest('[data-new]')) { close(); this.notebookSheet(null); return; } const b = e.target.closest('[data-id]'); if (!b) return; close(); cb(b.dataset.id || null); };
    });
  },
  colorSheet(current, allowNone, cb) {
    sheet('<h2>Color label</h2><div class="swatches" style="margin:4px 4px 18px">' + (allowNone ? '<button class="sw none' + (!current ? ' on' : '') + '" data-c="" aria-label="No color">' + icon('x') + '</button>' : '') + COLORS.map((c) => '<button class="sw' + (c === current ? ' on' : '') + '" style="background:' + c + '" data-c="' + c + '" aria-label="Color"></button>').join('') + '</div>', (el, close) => {
      el.onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; close(); cb(b.dataset.c || null); };
    });
  },
  reminderSheet(n, done) {
    const base = new Date(); const at = (d, h, m = 0) => { const x = new Date(base); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.getTime(); };
    const quick = [['In 1 hour', now() + 3600000], ['Tonight 8 PM', at(0, 20)], ['Tomorrow 9 AM', at(1, 9)], ['Next Monday 9 AM', at(((8 - base.getDay()) % 7) || 7, 9)]].filter((q) => q[1] > now());
    const cur = n.reminderAt && !n.reminderDone ? n.reminderAt : at(1, 9);
    sheet('<h2>Reminder</h2><div class="row" style="margin-bottom:14px">' + quick.map((q) => '<button class="btn" data-t="' + q[1] + '">' + q[0] + '</button>').join('') + '</div>' +
      '<div class="field"><label for="rm-in">Date and time</label><input id="rm-in" type="datetime-local" class="input" value="' + toLocalInput(cur) + '"></div>' +
      '<p class="muted small" style="margin:-4px 4px 12px">Reminders pop up while TUONTA is open, and show on the Today card.</p>' +
      '<div class="actions">' + (n.reminderAt ? '<button class="btn danger" data-clear>Remove</button>' : '<button class="btn" data-close>Cancel</button>') + '<button class="btn primary" data-ok>Save</button></div>', (el, close) => {
      const set = async (t) => {
        n.reminderAt = t; n.reminderDone = false; n.reminderFired = false; await Store.put('notes', n); close();
        if (t) { toast('Reminder set for ' + fmtDate(t) + ' ' + fmtTime(t)); App.askNotify(); } else toast('Reminder removed');
        done && done();
      };
      el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => set(Number(b.dataset.t)); });
      el.querySelector('[data-ok]').onclick = () => { const v = el.querySelector('#rm-in').value; if (v) set(new Date(v).getTime()); };
      const c = el.querySelector('[data-clear]'); if (c) c.onclick = () => set(null);
    });
  },

  /* ---------- Today ---------- */
  async toggleTask(noteId, taskId) {
    const n = Store.get('notes', noteId); if (!n) return;
    const d = document.createElement('div'); d.innerHTML = n.content;
    const t = d.querySelector('.task[data-id="' + CSS.escape(taskId) + '"]'); if (!t) return;
    t.dataset.done = t.dataset.done === '1' ? '0' : '1';
    Editor.decorate(d);
    n.content = d.innerHTML; n.tasks = Editor.extractTasks(n.content); n.text = plainText(n.content);
    await Store.put('notes', n);
    return t.dataset.done === '1';
  },
  taskRow(t, showNote = true) {
    const tk = dayKey(now());
    return '<div class="item" style="align-items:flex-start;padding-top:10px;padding-bottom:10px"><button class="tbox-btn" data-task="' + esc(t.noteId) + '|' + esc(t.id) + '" aria-label="Mark done" style="flex:none;width:24px;height:24px;border-radius:7px;border:2px solid var(--muted);background:' + (t.done ? 'var(--primary)' : 'transparent') + ';margin-top:1px"></button>' +
      '<a class="grow" href="#/note/' + esc(t.noteId) + '" style="text-decoration:none;color:inherit"><span style="white-space:normal' + (t.done ? ';text-decoration:line-through;color:var(--muted)' : '') + '">' + esc(t.text) + '</span>' +
      '<span class="sub">' + (t.due ? '<b style="color:' + (t.due < tk && !t.done ? 'var(--red-text)' : 'var(--amber-text)') + '">' + esc(fmtDue(t.due)) + '</b> · ' : '') + (showNote ? esc(t.noteTitle) : '') + '</span></a></div>';
  },
  today() {
    this.topbar('Today', { back: true });
    const tk = dayKey(now()); const in7 = dayKey(now() + 7 * DAY);
    const tasks = Store.allTasks().filter((t) => !t.done && t.due);
    const over = tasks.filter((t) => t.due < tk).sort((a, b) => a.due.localeCompare(b.due));
    const tod = tasks.filter((t) => t.due === tk);
    const soon = tasks.filter((t) => t.due > tk && t.due <= in7).sort((a, b) => a.due.localeCompare(b.due));
    const end = startOfDay() + DAY;
    const rem = Store.activeNotes().filter((n) => n.reminderAt && !n.reminderDone && n.reminderAt < end).sort((a, b) => a.reminderAt - b.reminderAt);
    const due = SRS.due().length;
    const sec = (title, inner) => '<div class="sec-h"><h2>' + title + '</h2></div>' + inner;
    let h = '<div class="stats3"><div class="stat-b"><b>' + (over.length + tod.length) + '</b><span>TASKS DUE</span></div><div class="stat-b"><b>' + due + '</b><span>CARDS DUE</span></div><div class="stat-b"><b>' + rem.length + '</b><span>REMINDERS</span></div></div>';
    if (due) h += '<a class="btn primary block" href="#/study">' + icon('play') + 'Review ' + due + ' flashcard' + (due > 1 ? 's' : '') + '</a>';
    if (rem.length) h += sec('Reminders', '<div class="group">' + rem.map((n) => '<div class="item"><a class="grow" href="#/note/' + n.id + '" style="text-decoration:none;color:inherit"><span>' + esc(n.title || 'Untitled') + '</span><span class="sub" style="color:' + (n.reminderAt < now() ? 'var(--red-text)' : 'var(--muted)') + '">' + esc(fmtTime(n.reminderAt)) + (n.reminderAt < startOfDay() ? ' · ' + esc(fmtDate(n.reminderAt)) : '') + '</span></a><button class="btn" data-rdone="' + n.id + '" style="height:36px">Done</button></div>').join('') + '</div>');
    if (over.length) h += sec('Overdue', '<div class="group">' + over.map((t) => this.taskRow(t)).join('') + '</div>');
    h += sec('Due today', tod.length ? '<div class="group">' + tod.map((t) => this.taskRow(t)).join('') + '</div>' : '<div class="empty" style="padding:16px">Nothing due today. Add due dates to checklist items to see them here.</div>');
    if (soon.length) h += sec('Next 7 days', '<div class="group">' + soon.map((t) => this.taskRow(t)).join('') + '</div>');
    $('#view').innerHTML = h;
    $('#view').onclick = async (e) => {
      const b = e.target.closest('[data-task]'); if (b) { const [nid, tid] = b.dataset.task.split('|'); const d = await this.toggleTask(nid, tid); toast(d ? 'Task done' : 'Task reopened', 'Undo', async () => { await this.toggleTask(nid, tid); this.today(); }); this.today(); return; }
      const r = e.target.closest('[data-rdone]'); if (r) { const n = Store.get('notes', r.dataset.rdone); n.reminderDone = true; await Store.put('notes', n); this.today(); }
    };
  },

  /* ---------- Calendar ---------- */
  calendar() {
    this.topbar('Calendar', { back: true, right: '<button class="ibtn" data-top="today" aria-label="Go to today">' + icon('today') + '</button>', onRight: () => { this.calMonth = null; this.calSel = dayKey(now()); this.calendar(); } });
    const base = new Date(); if (this.calMonth == null) this.calMonth = new Date(base.getFullYear(), base.getMonth(), 1).getTime();
    if (!this.calSel) this.calSel = dayKey(now());
    const m = new Date(this.calMonth); const y = m.getFullYear(), mo = m.getMonth();
    const first = new Date(y, mo, 1); const startDow = first.getDay();
    const start = new Date(y, mo, 1 - startDow).getTime();
    const map = {};
    const add = (k, kind, item) => { (map[k] = map[k] || { note: [], task: [], rem: [] })[kind].push(item); };
    Store.activeNotes().forEach((n) => { add(dayKey(n.createdAt), 'note', n); if (n.reminderAt && !n.reminderDone) add(dayKey(n.reminderAt), 'rem', n); });
    Store.allTasks().forEach((t) => { if (t.due) add(t.due, 'task', t); });
    const tk = dayKey(now());
    let g = '';
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d) => { g += '<div class="dow" aria-hidden="true">' + d + '</div>'; });
    for (let i = 0; i < 42; i++) {
      const t = new Date(start); t.setDate(t.getDate() + i); const k = dayKey(t.getTime()); const e = map[k];
      if (i >= 35 && t.getMonth() !== mo) break;
      g += '<button class="' + (t.getMonth() !== mo ? 'out ' : '') + (k === tk ? 'today ' : '') + (k === this.calSel ? 'sel' : '') + '" data-day="' + k + '" aria-label="' + esc(t.toDateString()) + '">' + t.getDate() +
        '<span class="dots">' + (e && e.note.length ? '<i class="c-note"></i>' : '') + (e && e.task.length ? '<i class="c-task"></i>' : '') + (e && e.rem.length ? '<i class="c-rem"></i>' : '') + '</span></button>';
    }
    const sel = map[this.calSel] || { note: [], task: [], rem: [] };
    const selDate = parseDayKey(this.calSel);
    let list = '';
    if (sel.rem.length) list += '<div class="glabel">Reminders</div><div class="group">' + sel.rem.map((n) => '<a class="item" href="#/note/' + n.id + '">' + icon('bell') + '<span class="grow"><span>' + esc(n.title || 'Untitled') + '</span><span class="sub">' + esc(fmtTime(n.reminderAt)) + '</span></span></a>').join('') + '</div>';
    if (sel.task.length) list += '<div class="glabel">Tasks due</div><div class="group">' + sel.task.map((t) => this.taskRow(t)).join('') + '</div>';
    if (sel.note.length) list += '<div class="glabel">Notes created</div>' + this.noteList(Store.sortNotes(sel.note), '');
    $('#view').innerHTML = '<div class="cal-h"><button class="ibtn" data-cal="-1" aria-label="Previous month">' + icon('back') + '</button><b>' + MONTHS_L[mo] + ' ' + y + '</b><button class="ibtn" data-cal="1" aria-label="Next month">' + icon('chevR') + '</button></div>' +
      '<div class="cal">' + g + '</div><div class="legend"><span><i class="dot c-note"></i>Notes</span><span><i class="dot c-task"></i>Tasks</span><span><i class="dot c-rem"></i>Reminders</span></div>' +
      '<div class="sec-h"><h2>' + esc(new Date(selDate).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })) + '</h2></div>' + (list || '<div class="empty" style="padding:16px">Nothing on this day</div>') + this.fab();
    $('#view').onclick = async (e) => {
      const c = e.target.closest('[data-cal]'); if (c) { const d = new Date(this.calMonth); d.setMonth(d.getMonth() + Number(c.dataset.cal)); this.calMonth = d.getTime(); this.calendar(); return; }
      const d = e.target.closest('[data-day]'); if (d) { this.calSel = d.dataset.day; const dd = parseDayKey(d.dataset.day); const dm = new Date(dd); if (dm.getMonth() !== mo) this.calMonth = new Date(dm.getFullYear(), dm.getMonth(), 1).getTime(); this.calendar(); return; }
      const b = e.target.closest('[data-task]'); if (b) { const [nid, tid] = b.dataset.task.split('|'); await this.toggleTask(nid, tid); this.calendar(); return; }
      if (e.target.closest('[data-v=new]')) this.newNoteSheet(null);
    };
  },

  /* ---------- filtered lists ---------- */
  list(kind) {
    const cfg = {
      favorites: ['Favorites', () => Store.activeNotes().filter((n) => n.favorite), '<b>No favorites yet</b>Tap the star in a note to add it here'],
      reminders: ['Reminders', () => Store.activeNotes().filter((n) => n.reminderAt && !n.reminderDone).sort((a, b) => a.reminderAt - b.reminderAt), '<b>No reminders</b>Tap the bell in a note to set one'],
      archive: ['Archive', () => Store.liveNotes().filter((n) => n.archived), '<b>Archive is empty</b>Archived notes are hidden from Home but still searchable'],
      trash: ['Trash', () => Store.all('notes').filter((n) => n.deletedAt && !n.purged).sort((a, b) => b.deletedAt - a.deletedAt), '<b>Trash is empty</b>']
    }[kind];
    if (!cfg) { App.go('#/notes'); return; }
    this.topbar(cfg[0], { back: true, right: kind === 'trash' ? '<button class="ibtn" data-top="empty" aria-label="Empty trash">' + icon('trash') + '</button>' : ' ', onRight: async () => {
      const t = cfg[1](); if (!t.length) return;
      if (await confirmSheet('Empty Trash?', t.length + ' note' + (t.length > 1 ? 's' : '') + ' will be deleted forever.', 'Empty Trash', true)) { for (const n of t) await Store.purgeNote(n); this.list('trash'); toast('Trash emptied'); }
    } });
    let list = cfg[1](); if (kind !== 'reminders' && kind !== 'trash') list = Store.sortNotes(list);
    let h = '';
    if (kind === 'trash' && list.length) h += '<p class="muted small" style="margin:0 4px 12px">Notes are deleted for good 30 days after they are moved here.</p>';
    if (kind === 'reminders') h += list.length ? '<div class="notes">' + list.map((n) => '<div style="position:relative">' + this.noteCard(n) + '</div>').join('') + '</div>' : '<div class="empty">' + cfg[2] + '</div>';
    else if (kind === 'trash') h += list.length ? '<div class="notes">' + list.map((n) => '<div class="card" style="margin:0"><b>' + esc(n.title || 'Untitled') + '</b><p class="small" style="margin:4px 0 10px">Deleted ' + esc(fmtRel(n.deletedAt)) + ' · ' + Math.max(0, 30 - Math.floor((now() - n.deletedAt) / DAY)) + ' days left</p><div class="row"><button class="btn soft" data-restore="' + n.id + '">' + icon('restore') + 'Restore</button><a class="btn" href="#/note/' + n.id + '">View</a><button class="btn danger" data-purge="' + n.id + '">Delete</button></div></div>').join('') + '</div>' : '<div class="empty">' + cfg[2] + '</div>';
    else h += this.noteList(list, cfg[2]);
    $('#view').innerHTML = h;
    $('#view').onclick = async (e) => {
      const r = e.target.closest('[data-restore]'); if (r) { const n = Store.get('notes', r.dataset.restore); n.deletedAt = null; await Store.put('notes', n); this.list(kind); toast('Restored'); return; }
      const p = e.target.closest('[data-purge]'); if (p) { if (await confirmSheet('Delete forever?', 'This cannot be undone.', 'Delete', true)) { await Store.purgeNote(Store.get('notes', p.dataset.purge)); this.list(kind); } }
    };
  },
  tags() {
    this.topbar('Tags', { back: true });
    const tags = Store.allTags();
    $('#view').innerHTML = tags.length ? '<div class="group">' + tags.map(([t, c]) => '<a class="item" href="#/tag/' + encodeURIComponent(t) + '">' + icon('tag') + '<span class="grow"><span>#' + esc(t) + '</span></span><span class="cnt">' + c + '</span></a>').join('') + '</div>' : '<div class="empty"><b>No tags yet</b>Add tags from a note’s tag button</div>';
    $('#view').onclick = null;
  },
  tag(t) {
    this.topbar('#' + t, { back: true });
    $('#view').innerHTML = this.noteList(Store.sortNotes(Store.liveNotes().filter((n) => (n.tags || []).includes(t))), '<b>No notes with this tag</b>');
    $('#view').onclick = null;
  },

  /* ---------- Review ---------- */
  review() {
    this.topbar('Review');
    const cards = SRS.live(); const due = SRS.due();
    const byNote = new Map();
    cards.forEach((c) => { const k = c.noteId || '_'; if (!byNote.has(k)) byNote.set(k, { total: 0, due: 0 }); byNote.get(k).total++; });
    due.forEach((c) => { const k = c.noteId || '_'; if (byNote.has(k)) byNote.get(k).due++; });
    let h = '<div class="stats3" style="margin-top:6px"><div class="stat-b"><b>' + due.length + '</b><span>DUE TODAY</span></div><div class="stat-b"><b>' + SRS.streak() + '</b><span>DAY STREAK</span></div><div class="stat-b"><b>' + cards.length + '</b><span>ALL CARDS</span></div></div>';
    h += due.length ? '<a class="btn primary block" href="#/study">' + icon('play') + 'Start review (' + due.length + ')</a>' : '<div class="card"><h3>' + (cards.length ? 'All caught up' : 'No flashcards yet') + '</h3><p>' + (cards.length ? 'You reviewed ' + SRS.reviewedToday() + ' card' + (SRS.reviewedToday() === 1 ? '' : 's') + ' today. Come back tomorrow to keep your streak.' : 'Write a Cornell note or highlight key phrases in any note, then tap “Make flashcards”.') + '</p></div>';
    if (byNote.size) {
      h += '<div class="sec-h"><h2>Decks</h2></div><div class="group">' + Array.from(byNote.entries()).map(([nid, s]) => {
        const n = Store.get('notes', nid);
        return '<a class="item" href="#/deck/' + esc(nid) + '">' + icon('cards') + '<span class="grow"><span>' + esc(n ? n.title || 'Untitled' : 'My cards') + '</span><span class="sub">' + s.total + ' card' + (s.total > 1 ? 's' : '') + (s.due ? ' · <b style="color:var(--primary-text)">' + s.due + ' due</b>' : '') + '</span></span>' + icon('chevR') + '</a>';
      }).join('') + '</div>';
    }
    h += '<button class="btn soft block" data-v="addcard" style="margin-top:4px">' + icon('plus') + 'Add a card by hand</button>';
    $('#view').innerHTML = h;
    $('#view').onclick = (e) => { if (e.target.closest('[data-v=addcard]')) this.cardSheet(null, '_'); };
  },
  deck(noteId) {
    const n = Store.get('notes', noteId);
    this.topbar(n ? n.title || 'Untitled' : 'My cards', { back: true });
    const cards = SRS.live().filter((c) => (c.noteId || '_') === noteId).sort((a, b) => a.due - b.due);
    const dueN = SRS.due().filter((c) => (c.noteId || '_') === noteId).length;
    $('#view').innerHTML = '<div class="row" style="margin:4px 0 14px">' + (dueN ? '<a class="btn primary" href="#/study/' + esc(noteId) + '">' + icon('play') + 'Review ' + dueN + ' due</a>' : '') + '<button class="btn soft" data-v="add">' + icon('plus') + 'Add card</button>' + (n ? '<a class="btn" href="#/note/' + n.id + '">Open note</a>' : '') + '</div>' +
      (cards.length ? '<div class="notes">' + cards.map((c) => '<button class="card" data-card="' + c.id + '" style="text-align:left;width:100%;margin:0;cursor:pointer"><b style="white-space:pre-wrap">' + esc(c.front) + '</b><p style="margin:6px 0 0;white-space:pre-wrap">' + esc(c.back) + '</p><p class="small" style="margin:8px 0 0">' + (c.due < startOfDay() + DAY ? 'Due now' : 'Next: ' + esc(fmtDate(c.due))) + '</p></button>').join('') + '</div>' : '<div class="empty">No cards in this deck</div>');
    $('#view').onclick = (e) => {
      if (e.target.closest('[data-v=add]')) { this.cardSheet(null, noteId); return; }
      const b = e.target.closest('[data-card]'); if (b) this.cardSheet(Store.get('cards', b.dataset.card), noteId);
    };
  },
  cardSheet(card, noteId) {
    sheet('<h2>' + (card ? 'Edit card' : 'New card') + '</h2><form><div class="field"><label for="cf">Question (front)</label><textarea id="cf" class="input" required autofocus>' + esc(card ? card.front : '') + '</textarea></div><div class="field"><label for="cb">Answer (back)</label><textarea id="cb" class="input" required>' + esc(card ? card.back : '') + '</textarea></div>' +
      '<div class="actions">' + (card ? '<button type="button" class="btn danger" data-del>Delete</button>' : '<button type="button" class="btn" data-close>Cancel</button>') + '<button class="btn primary">Save</button></div></form>', (el, close) => {
      el.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const c = card || SRS.newCard({ noteId: noteId === '_' ? null : noteId, key: 'u:' + uid() });
        c.front = el.querySelector('#cf').value.trim(); c.back = el.querySelector('#cb').value.trim();
        await Store.put('cards', c); close(); App.render(); toast('Card saved');
      };
      const d = el.querySelector('[data-del]'); if (d) d.onclick = async () => { card.deletedAt = now(); await Store.put('cards', card); close(); App.render(); toast('Card deleted'); };
    });
  },
  study(noteId) {
    document.body.classList.add('no-tabs');
    const queue = SRS.due(noteId).map((c) => c.id); const total = queue.length; let i = 0, again = new Set(), shown = false, reviewed = 0;
    const n = noteId && Store.get('notes', noteId);
    const draw = () => {
      const c = Store.get('cards', queue[i]);
      const head = '<button class="ibtn" data-top="back" aria-label="Close review">' + icon('x') + '</button><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="small muted" style="font-weight:700">' + esc(n ? (n.title || 'Untitled') + ' · ' : '') + (c ? 'Card ' + Math.min(i + 1, queue.length) + ' of ' + queue.length : 'Done') + '</div><div class="progress"><div style="width:' + Math.round((Math.min(i, queue.length) / Math.max(1, queue.length)) * 100) + '%"></div></div></div><span class="pill amber">' + icon('flame') + SRS.streak() + '</span>';
      $('#topbar').innerHTML = head; $('#topbar').onclick = (e) => { if (e.target.closest('[data-top=back]')) App.back(); };
      if (!c) {
        $('#view').innerHTML = '<div class="flash" style="align-items:center;justify-content:center;text-align:center"><div style="width:64px;height:64px;color:var(--green-text)">' + icon('today') + '</div><div class="q">' + (total ? 'Review done!' : 'Nothing due') + '</div><p class="muted">' + (total ? 'You reviewed ' + reviewed + ' card' + (reviewed === 1 ? '' : 's') + '. Streak: ' + SRS.streak() + ' day' + (SRS.streak() === 1 ? '' : 's') + '.' : 'No cards are due right now.') + '</p><a class="btn primary" href="#/review">Back to Review</a></div>';
        return;
      }
      const src = c.noteId && Store.get('notes', c.noteId);
      $('#view').innerHTML = '<div class="flash" data-flip role="button" tabindex="0" aria-label="Show answer"><div class="lbl">QUESTION</div><div class="q">' + esc(c.front) + '</div>' +
        (shown ? '<hr><div class="lbl" style="color:var(--green-text)">ANSWER</div><div class="a">' + esc(c.back) + '</div>' : '<p class="muted" style="margin-top:auto">Tap to show the answer</p>') +
        (src ? '<div class="src">' + esc(src.title || 'Untitled') + ' · <a href="#/note/' + src.id + '">Open note</a></div>' : '') + '</div>' +
        (shown ? '<div class="grades"><button class="g-again" data-g="1">Again<span>' + SRS.label(c, 1) + '</span></button><button class="g-hard" data-g="2">Hard<span>' + SRS.label(c, 2) + '</span></button><button class="g-good" data-g="3">Good<span>' + SRS.label(c, 3) + '</span></button><button class="g-easy" data-g="4">Easy<span>' + SRS.label(c, 4) + '</span></button></div>' : '<button class="btn primary block" data-flip style="margin-top:14px;height:56px">Show answer</button>');
    };
    $('#view').onclick = async (e) => {
      if (e.target.closest('a')) return;
      const g = e.target.closest('[data-g]');
      if (g) { const c = Store.get('cards', queue[i]); const grade = Number(g.dataset.g); await SRS.grade(c, grade); reviewed++; if (grade === 1 && !again.has(c.id)) { again.add(c.id); queue.push(c.id); } i++; shown = false; draw(); return; }
      if (e.target.closest('[data-flip]') && !shown) { shown = true; draw(); }
    };
    draw();
  },

  /* ---------- More ---------- */
  more() {
    this.topbar('More');
    const it = (href, ic, label, sub) => '<a class="item" href="' + href + '">' + icon(ic) + '<span class="grow"><span>' + label + '</span>' + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</span>' + icon('chevR') + '</a>';
    $('#view').innerHTML = '<div class="group" style="margin-top:6px">' + it('#/today', 'today', 'Today') + it('#/calendar', 'calendar', 'Calendar') + it('#/list/reminders', 'bell', 'Reminders') + it('#/list/favorites', 'star', 'Favorites') + it('#/tags', 'tag', 'Tags') + '</div>' +
      '<div class="group">' + it('#/list/archive', 'archive', 'Archive') + it('#/list/trash', 'trash', 'Trash') + it('#/templates', 'template', 'My templates') + '</div>' +
      '<div class="group">' + it('#/sync', 'sync', 'Sync & backup', Sync.statusText()) + it('#/settings', 'settings', 'Settings') + '</div>' +
      '<p class="muted small" style="text-align:center">TUONTA · version ' + App.version + '</p>';
    $('#view').onclick = null;
  },
  templates() {
    this.topbar('My templates', { back: true });
    const mine = Store.all('templates').filter((t) => !t.deletedAt);
    $('#view').innerHTML = '<p class="muted small" style="margin:0 4px 12px">Save any note as a template from its ⋮ menu. Built-in templates: ' + esc(Tpl.builtIns().map((t) => t.name).join(', ')) + '.</p>' +
      (mine.length ? '<div class="group">' + mine.map((t) => '<div class="item">' + icon('template') + '<span class="grow"><span>' + esc(t.name) + '</span></span><button class="ibtn" data-ren="' + t.id + '" aria-label="Rename">' + icon('edit') + '</button><button class="ibtn" data-del="' + t.id + '" aria-label="Delete">' + icon('trash') + '</button></div>').join('') + '</div>' : '<div class="empty"><b>No templates of your own yet</b></div>');
    $('#view').onclick = async (e) => {
      const r = e.target.closest('[data-ren]'); if (r) { const t = Store.get('templates', r.dataset.ren); const v = await promptSheet('Rename template', 'Name', t.name); if (v) { t.name = v; await Store.put('templates', t); this.templates(); } return; }
      const d = e.target.closest('[data-del]'); if (d) { const t = Store.get('templates', d.dataset.del); if (await confirmSheet('Delete template “' + t.name + '”?', 'Notes made from it are not affected.', 'Delete', true)) { t.deletedAt = now(); await Store.put('templates', t); this.templates(); } }
    };
  },

  /* ---------- Sync & backup ---------- */
  syncPage() {
    this.topbar('Sync & backup', { back: true });
    const a = Sync.account;
    let h = '';
    if (!Sync.configured()) {
      h += '<div class="card"><h3>Google Drive sync is not set up yet</h3><p>Your notes are saved on this device. To sync across devices, fill in <b>config.js</b> using the steps in README.md, then upload it again.</p></div>';
    } else if (!a) {
      h += '<div class="card"><h3>Sync with Google Drive</h3><p>Sign in to keep your notes and files in a <b>TUONTA</b> folder in your own Google Drive, and use them on your other devices.</p><button class="btn block" data-s="signin" style="background:var(--surface);border:1px solid var(--line)"><span style="width:20px;height:20px">' + icon('google') + '</span>Sign in with Google</button></div>';
    } else {
      h += '<div class="card"><div class="row" style="flex-wrap:nowrap;margin-bottom:12px"><div class="avatar">' + (a.picture ? '<img src="' + esc(a.picture) + '" alt="" referrerpolicy="no-referrer">' : esc((a.name || '?')[0])) + '</div><div style="min-width:0"><b>' + esc(a.name) + '</b><div class="small muted" style="overflow:hidden;text-overflow:ellipsis">' + esc(a.email) + '</div></div></div>' +
        '<p id="sy-st"><b>' + esc(Sync.statusText()) + '</b>' + (Sync.status === 'error' && Sync.message ? '<br><span class="small">' + esc(Sync.message) + '</span>' : '') + '</p>' +
        '<div class="row"><button class="btn primary" data-s="now">' + icon('sync') + 'Sync now</button><a class="btn" href="' + esc(Sync.folderUrl()) + '" target="_blank" rel="noopener">' + icon('drive') + 'Open TUONTA folder</a></div></div>' +
        '<div class="card"><h3>What is in your Drive</h3><p><b>TUONTA / Notes</b> — a readable Markdown copy of every note, in folders that match your notebooks.<br><b>TUONTA / Attachments</b> — your photos, PDFs, files and voice notes.<br><b>TUONTA data (do not edit).json</b> — what the app uses to sync. Editing it by hand can break syncing.</p></div>';
    }
    h += '<div class="card"><h3>Backup</h3><p>Download one file with all your notes, cards and attachments. Keep it somewhere safe. Restoring merges it into what is already here.</p><div class="row"><button class="btn soft" data-s="backup">' + icon('download') + 'Download backup</button><button class="btn" data-s="restore">' + icon('upload') + 'Restore backup</button></div>' +
      (localStorage.getItem('tu.lastBackup') ? '<p class="small" style="margin:10px 0 0">Last backup: ' + esc(fmtRel(Number(localStorage.getItem('tu.lastBackup')))) + '</p>' : '') + '<input type="file" id="rs-f" accept=".json,application/json" hidden></div>';
    if (a) h += '<button class="btn danger block" data-s="signout">Sign out</button>';
    $('#view').innerHTML = h;
    $('#view').onclick = async (e) => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      const s = b.dataset.s;
      if (s === 'signin') Sync.signIn(false);
      if (s === 'now') { await Sync.sync(true); this.syncPage(); }
      if (s === 'backup') Backup.download();
      if (s === 'restore') $('#rs-f').click();
      if (s === 'signout') { if (await confirmSheet('Sign out?', 'Your notes stay on this device. They will not sync until you sign in again.', 'Sign out', true)) { await Sync.signOut(); this.syncPage(); } }
    };
    $('#rs-f').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await Backup.restore(f); };
  },

  /* ---------- Settings ---------- */
  async settings() {
    this.topbar('Settings', { back: true });
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    let est = ''; try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); est = fmtSize(e.usage || 0) + ' used on this device'; } } catch (e) { }
    const notif = 'Notification' in window ? Notification.permission : 'unsupported';
    const opt = (v, l, cur) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + l + '</option>';
    $('#view').innerHTML = '<div class="card"><div class="field"><label for="st-start">Start page</label><select id="st-start" class="input">' + opt('notes', 'Home (notes)', Settings.get('startPage')) + opt('today', 'Today', Settings.get('startPage')) + opt('review', 'Review', Settings.get('startPage')) + opt('calendar', 'Calendar', Settings.get('startPage')) + '</select></div>' +
      '<div class="field" style="margin:0"><label for="st-theme">Appearance</label><select id="st-theme" class="input">' + opt('system', 'Match my phone', Settings.get('theme')) + opt('light', 'Light', Settings.get('theme')) + opt('dark', 'Dark', Settings.get('theme')) + '</select></div></div>' +
      '<div class="card"><h3>Protect my data from cleanup</h3><p>Phones can clear website storage when space runs low. Turn this on so your notes on this device are kept.</p>' + (persisted ? '<span class="pill blue">' + icon('shield') + 'Protected</span>' : '<button class="btn soft" data-st="persist">' + icon('shield') + 'Protect my data</button>') + (est ? '<p class="small" style="margin:10px 0 0">' + esc(est) + '</p>' : '') + '</div>' +
      '<div class="card"><h3>Reminder pop-ups</h3><p>Reminders show while TUONTA is open. On iPhone, add TUONTA to your Home Screen first.</p>' + (notif === 'granted' ? '<span class="pill blue">Notifications on</span>' : notif === 'unsupported' ? '<span class="pill">Not supported here — reminders show inside the app</span>' : notif === 'denied' ? '<span class="pill">Blocked — allow notifications in your phone settings</span>' : '<button class="btn soft" data-st="notify">' + icon('bell') + 'Allow notifications</button>') + '</div>' +
      '<div class="card"><h3>Install on your phone</h3><p><b>iPhone:</b> open in Safari → Share → Add to Home Screen.<br><b>Android:</b> Chrome menu ⋮ → Install app.</p></div>' +
      '<p class="muted small" style="text-align:center">TUONTA · version ' + App.version + '</p>';
    $('#st-start').onchange = (e) => Settings.set('startPage', e.target.value);
    $('#st-theme').onchange = (e) => { Settings.set('theme', e.target.value); App.applyTheme(); };
    $('#view').onclick = async (e) => {
      const b = e.target.closest('[data-st]'); if (!b) return;
      if (b.dataset.st === 'persist') { const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; toast(ok ? 'Your data is protected' : 'Your browser did not allow this yet. Install TUONTA to your Home Screen and try again.'); this.settings(); }
      if (b.dataset.st === 'notify') { await App.askNotify(true); this.settings(); }
    };
  },

  /* ---------- welcome ---------- */
  welcome() {
    document.body.classList.add('no-tabs');
    $('#topbar').innerHTML = '';
    $('#view').innerHTML = '<div class="welcome"><img src="icons/icon-192.png" alt=""><h1>TUONTA</h1><p>Notes, tasks and flashcards for work, projects and study.</p>' +
      '<ul><li>Works offline — saved on your phone first</li><li>Checklists with due dates, a Today view and a calendar</li><li>Flashcards from your notes with spaced review</li><li>Syncs to a TUONTA folder in your own Google Drive</li></ul>' +
      (Sync.configured() ? '<button class="btn block" data-w="google" style="background:var(--surface);border:1px solid var(--line);height:52px"><span style="width:20px;height:20px">' + icon('google') + '</span>Sign in with Google</button>' : '') +
      '<button class="btn ' + (Sync.configured() ? '' : 'primary ') + 'block" data-w="local" style="height:52px">Use offline on this device</button>' +
      (Sync.configured() ? '<p class="small muted" style="text-align:center">You can sign in later from Sync & backup.</p>' : '') + '</div>';
    $('#view').onclick = (e) => {
      const b = e.target.closest('[data-w]'); if (!b) return;
      localStorage.setItem('tu.welcomed', '1'); document.body.classList.remove('no-tabs');
      if (b.dataset.w === 'google') { sessionStorage.setItem('tu.returnTo', '#/notes'); Sync.signIn(false); }
      else App.go('#/notes');
    };
  }
};

/* ---------- backup / restore ---------- */
const Backup = {
  async download() {
    toast('Preparing backup…');
    const o = Sync.snapshot(); o.backup = true; o.blobs = {};
    for (const a of Store.all('atts')) { if (a.deletedAt) continue; const b = await Store.getBlob(a.id); if (b) o.blobs[a.id] = await blobToB64(b); }
    download('TUONTA backup ' + dayKey(now()) + '.json', new Blob([JSON.stringify(o)], { type: 'application/json' }));
    localStorage.setItem('tu.lastBackup', String(now()));
    setTimeout(() => { if (location.hash === '#/sync') Views.syncPage(); }, 500);
  },
  async restore(file) {
    let o; try { o = JSON.parse(await file.text()); } catch (e) { toast('That file is not a TUONTA backup'); return; }
    if (!o || o.app !== 'TUONTA') { toast('That file is not a TUONTA backup'); return; }
    if (!(await confirmSheet('Restore this backup?', 'Notes from the backup are merged in. Where the same note exists, the newer version is kept.', 'Restore'))) return;
    let n = 0;
    for (const k of KINDS) for (const r of o[k] || []) {
      const l = Store.get(k, r.id);
      if (!l || Sync.newer(r, l)) { await Store.putRaw(k, r); n++; }
    }
    for (const [id, b64] of Object.entries(o.blobs || {})) { if (!(await Store.getBlob(id))) { const a = Store.get('atts', id); await Store.putBlob(id, b64ToBlob(b64, a && a.type)); } }
    Sync.markDirty();
    toast('Restored ' + n + ' item' + (n === 1 ? '' : 's'));
    App.render();
  }
};

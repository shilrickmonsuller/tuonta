'use strict';
/* Spaced repetition (a simplified SM-2) and flashcard helpers */
const SRS = {
  newCard(fields) { return Object.assign({ id: uid(), noteId: null, key: null, front: '', back: '', due: now(), interval: 0, ease: 2.5, reps: 0, lapses: 0, deletedAt: null }, fields); },
  /* returns {due, interval, ease, reps, lapses} for a grade 1..4 */
  next(c, g) {
    let { interval, ease, reps, lapses } = c; const t = now();
    if (g === 1) { // Again
      return { due: t + 10 * 60000, interval: 0, ease: Math.max(1.3, ease - 0.2), reps: 0, lapses: lapses + 1 };
    }
    let days;
    if (g === 2) { days = reps === 0 ? 1 : Math.max(1, Math.round(interval * 1.2)); ease = Math.max(1.3, ease - 0.15); }
    else if (g === 3) { days = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease); }
    else { days = reps === 0 ? 4 : reps === 1 ? 7 : Math.round(interval * ease * 1.3); ease = ease + 0.15; }
    days = Math.max(1, Math.min(days, 3650));
    return { due: startOfDay(t + days * DAY) + 4 * 3600000, interval: days, ease, reps: reps + 1, lapses };
  },
  label(c, g) {
    const n = this.next(c, g);
    if (g === 1) return '10 min';
    const d = n.interval; if (d < 30) return d + (d === 1 ? ' day' : ' days'); if (d < 365) return Math.round(d / 30) + ' mo'; return (d / 365).toFixed(1) + ' yr';
  },
  live() { return Store.all('cards').filter((c) => !c.deletedAt && (!c.noteId || (Store.get('notes', c.noteId) && !Store.get('notes', c.noteId).deletedAt && !Store.get('notes', c.noteId).purged))); },
  due(noteId) { const end = startOfDay() + DAY; return this.live().filter((c) => c.due < end && (!noteId || c.noteId === noteId)).sort((a, b) => a.due - b.due); },
  async grade(c, g) {
    Object.assign(c, this.next(c, g));
    await Store.put('cards', c);
    await Store.put('reviews', { id: uid(), cardId: c.id, grade: g, at: now() });
  },
  streak() {
    const days = new Set(Store.all('reviews').map((r) => dayKey(r.at)));
    let d = startOfDay(), n = 0;
    if (!days.has(dayKey(d))) d -= DAY; // today not done yet still counts yesterday's streak
    while (days.has(dayKey(d))) { n++; d -= DAY; }
    return n;
  },
  reviewedToday() { const s = startOfDay(); return Store.all('reviews').filter((r) => r.at >= s).length; },
  /* Build cards from Cornell cues and highlighted text in a note's HTML */
  extract(html) {
    const d = document.createElement('div'); d.innerHTML = html || '';
    const out = [];
    d.querySelectorAll('.cornell .crow').forEach((row) => {
      const cue = (row.querySelector('.cue') || {}).textContent || '';
      const note = row.querySelector('.cnote') ? row.querySelector('.cnote').innerText || row.querySelector('.cnote').textContent : '';
      if (cue.trim() && note.trim()) out.push({ key: 'c:' + hashStr(cue.trim()), front: cue.trim(), back: note.trim() });
    });
    d.querySelectorAll('mark').forEach((m) => {
      const ans = m.textContent.trim(); if (!ans) return;
      const block = m.closest('p,li,div.task,.cnote,td,th,h2,h3,.callout') || m.parentElement;
      const clone = block.cloneNode(true);
      clone.querySelectorAll('.tdue,.tbox').forEach((x) => x.remove());
      const marks = clone.querySelectorAll('mark');
      const idx = Array.from(block.querySelectorAll('mark')).indexOf(m);
      if (marks[idx]) marks[idx].textContent = '_____';
      let q = clone.textContent.replace(/\s+/g, ' ').trim();
      if (q === '_____' || q.length < 8) { // highlight is the whole line: use the nearest heading or cue as the question
        const row = m.closest('.crow'); const cue = row && row.querySelector('.cue');
        q = cue && cue.textContent.trim() ? cue.textContent.trim() : 'Recall: ' + (block.previousElementSibling ? block.previousElementSibling.textContent.trim().slice(0, 80) : 'this highlight');
      } else q = 'Fill in the blank:\n' + q;
      out.push({ key: 'm:' + hashStr(ans + '|' + q), front: q, back: ans });
    });
    return out;
  },
  async makeFromNote(note) {
    const found = this.extract(note.content);
    const existing = new Set(Store.all('cards').filter((c) => c.noteId === note.id && !c.deletedAt).map((c) => c.key));
    let added = 0;
    for (const f of found) { if (existing.has(f.key)) continue; await Store.put('cards', this.newCard(Object.assign({ noteId: note.id }, f))); existing.add(f.key); added++; }
    return { added, total: found.length };
  }
};

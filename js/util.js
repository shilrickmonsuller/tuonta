'use strict';
/* Small helpers shared by every part of TUONTA */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const now = () => Date.now();
const DAY = 86400000;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; };

const COLORS = ['#2456C8', '#D98A00', '#1F7A4D', '#8A4FD8', '#C0392B', '#0E8A8A', '#B5487A', '#5B6474'];

const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  menu: P('<path d="M4 7h16M4 12h16M4 17h10"/>'),
  calendar: P('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  note: P('<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>'),
  folder: P('<path d="M4 5h6l2 2h8v12H4z"/>'),
  cards: P('<rect x="4" y="6" width="13" height="14" rx="2"/><path d="M8 3h11a1 1 0 011 1v13"/>'),
  more: P('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
  dots: P('<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>'),
  back: P('<path d="M15 5l-7 7 7 7"/>'),
  x: P('<path d="M6 6l12 12M18 6L6 18"/>'),
  star: P('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  starFill: '<svg viewBox="0 0 24 24" fill="#FFC24A" stroke="#D98A00" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  bell: P('<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 004 0"/>'),
  bellOn: '<svg viewBox="0 0 24 24" fill="#FFC24A" stroke="#D98A00" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 004 0" fill="none"/></svg>',
  clock: P('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
  highlight: P('<path d="M14 4l6 6-9 9H5v-6z"/><path d="M3 21h8"/>'),
  ul: P('<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.5" cy="7" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17" r="1"/>'),
  ol: P('<path d="M10 7h10M10 12h10M10 17h10M4 6l1.5-1V9M3.8 15.2a1.2 1.2 0 112 1.2L4 18.5h2.2"/>'),
  check: P('<path d="M4 7l2 2 3-3M4 15l2 2 3-3M12 8h8M12 16h8"/>'),
  table: P('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M3.5 15h17M10 4.5v15"/>'),
  link: P('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'),
  image: P('<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20 16l-5-5-8 8"/>'),
  clip: P('<path d="M21 12l-8.5 8.5a5 5 0 01-7-7L14 5a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 8"/>'),
  camera: P('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  mic: P('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'),
  trash: P('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  archive: P('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>'),
  tag: P('<path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/>'),
  sync: P('<path d="M7 18a4 4 0 01-.5-8A6 6 0 0118 9a4.5 4.5 0 01-1 9z"/><path d="M12 16v-5M10 13l2-2 2 2"/>'),
  settings: P('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'),
  chevR: P('<path d="M9 5l7 7-7 7"/>'),
  pin: P('<path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/>'),
  download: P('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  upload: P('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  share: P('<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/>'),
  edit: P('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  file: P('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>'),
  pdf: P('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 14h6M9 17h4"/>'),
  today: P('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  palette: P('<path d="M12 3a9 9 0 100 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.8-1.7H17a4 4 0 004-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>'),
  move: P('<path d="M4 5h6l2 2h8v12H4z"/><path d="M10 13h6M13 10l3 3-3 3"/>'),
  template: P('<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  restore: P('<path d="M4 12a8 8 0 108-8 8 8 0 00-6 2.7L4 9"/><path d="M4 4v5h5"/>'),
  heading: '<svg viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="17" text-anchor="middle" font-size="15" font-weight="800" fill="currentColor" font-family="inherit">H</text></svg>',
  flame: P('<path d="M12 21c4 0 7-2.8 7-6.8 0-3.5-2.5-5.8-4-8.2-.5 2-1.6 3.2-3 3.7.4-2.6-.4-5.4-3-6.7.2 3.3-4 5.6-4 11.2C5 18.2 8 21 12 21z"/>'),
  scan: P('<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M7 12h10"/>'),
  play: P('<path d="M7 5l12 7-12 7z"/>'),
  stop: P('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
  drive: P('<path d="M8 4h8l6 10-4 6H6l-4-6z"/><path d="M8 4l6 10M16 4l-6 10M2 14h20"/>'),
  sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>'),
  shield: P('<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>')
};
const icon = (n) => ICONS[n] || '';

/* ---------- dates ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_L = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const startOfDay = (t = now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const parseDayKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
function fmtDate(t, withYear) {
  const d = new Date(t), n = new Date();
  const s = MONTHS[d.getMonth()] + ' ' + d.getDate();
  return (withYear || d.getFullYear() !== n.getFullYear()) ? s + ', ' + d.getFullYear() : s;
}
function fmtTime(t) { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function fmtRel(t) {
  const diff = now() - t;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
  if (startOfDay(t) === startOfDay()) return 'today ' + fmtTime(t);
  if (startOfDay(t) === startOfDay() - DAY) return 'yesterday';
  return fmtDate(t);
}
function fmtDue(dueKey) {
  if (!dueKey) return '';
  const t = parseDayKey(dueKey), today = startOfDay();
  if (t === today) return 'Today';
  if (t === today + DAY) return 'Tomorrow';
  if (t === today - DAY) return 'Yesterday';
  return fmtDate(t);
}
function toLocalInput(t) { const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); }
function fmtSize(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(0) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
function plainText(html) { const d = document.createElement('div'); d.innerHTML = html || ''; d.querySelectorAll('.tdue,.chead').forEach((e) => e.remove()); d.querySelectorAll('p,div,li,h2,h3,tr,br').forEach((e) => e.after(' ')); return d.textContent.replace(/\s+/g, ' ').trim(); }

/* ---------- toast ---------- */
let toastT;
function toast(msg, action, fn, ms = 3200) {
  const el = $('#toast');
  el.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action) + '</button>' : '');
  el.classList.add('show');
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); fn && fn(); };
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), action ? 5500 : ms);
}

/* ---------- bottom sheets ---------- */
function sheet(html, onMount) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = '<button class="scrim" aria-label="Close"></button><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>';
  $('#sheets').appendChild(wrap);
  const close = () => { wrap.remove(); };
  wrap.querySelector('.scrim').onclick = close;
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  if (onMount) onMount(wrap.querySelector('.sheet'), close);
  const f = wrap.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 60);
  return close;
}
function confirmSheet(title, text, okLabel, danger) {
  return new Promise((res) => {
    let done = false;
    const close = sheet('<h2>' + esc(title) + '</h2>' + (text ? '<p class="muted" style="margin:0 4px 14px">' + esc(text) + '</p>' : '') +
      '<div class="actions"><button class="btn" data-a="no">Cancel</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" data-a="ok">' + esc(okLabel || 'OK') + '</button></div>', (el, c) => {
      el.querySelector('[data-a=no]').onclick = () => { done = true; c(); res(false); };
      el.querySelector('[data-a=ok]').onclick = () => { done = true; c(); res(true); };
    });
    const obs = new MutationObserver(() => { if (!done && !document.querySelector('#sheets .sheet-wrap')) { obs.disconnect(); res(false); } });
    obs.observe($('#sheets'), { childList: true });
  });
}
function promptSheet(title, label, value, okLabel) {
  return new Promise((res) => {
    let done = false;
    sheet('<h2>' + esc(title) + '</h2><form><div class="field"><label for="ps-in">' + esc(label) + '</label><input id="ps-in" class="input" value="' + esc(value || '') + '" autofocus autocomplete="off"></div><div class="actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">' + esc(okLabel || 'Save') + '</button></div></form>', (el, c) => {
      el.querySelector('form').onsubmit = (e) => { e.preventDefault(); done = true; const v = el.querySelector('input').value.trim(); c(); res(v); };
      const obs = new MutationObserver(() => { if (!document.body.contains(el)) { obs.disconnect(); if (!done) res(null); } });
      obs.observe($('#sheets'), { childList: true });
    });
  });
}
function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function safeName(s) { return (s || 'Untitled').replace(/[\\/:*?"<>|#]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled'; }
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
function blobToB64(blob) { return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1] || ''); fr.readAsDataURL(blob); }); }
function b64ToBlob(b64, type) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: type || 'application/octet-stream' }); }
function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector('script[src="' + src + '"]')) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }

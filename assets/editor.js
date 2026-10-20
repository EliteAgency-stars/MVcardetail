// Admin "Site editor": theme, texts, sections, cards and custom blocks for the home and booking pages,
// with a live preview (the real page in an iframe, re-rendered from the draft on every change).
import { sb, esc } from '/assets/common.js';
import { FONTS, THEME_DEFAULT, ICONS, sanitize } from '/assets/site.js';

const $ = id => document.getElementById(id);
const frame = $('ed-frame'), controls = $('ed-controls'), status = $('ed-status');
const SRC = { home: '/?preview=1', booking: '/booking.html?preview=1' };
const COLORS = [['accent', 'Accent'], ['offer', 'Highlight'], ['bg', 'Background'], ['surface', 'Cards'], ['text', 'Text']];

let draft = null, saved = '', page = 'home', meta = { texts: [], blocks: [], outside: [] }, services = [], photos = [];
const open = new Set(); // custom blocks / cards whose edit form is expanded
const uid = p => p + Math.random().toString(36).slice(2, 8);
const cfg = () => (draft.pages[page] ||= {});

async function load() {
  const [{ data: rows }, { data: sv }, { data: ph }] = await Promise.all([
    sb.from('mvcd_settings').select('key,value').in('key', ['theme', 'page_home', 'page_booking']),
    sb.from('mvcd_services').select('slug,name').order('level'),
    sb.from('mvcd_photos').select('url,caption').order('sort'),
  ]);
  const v = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
  draft = { theme: { ...THEME_DEFAULT, ...(v.theme || {}) }, pages: { home: v.page_home || {}, booking: v.page_booking || {} } };
  saved = JSON.stringify(draft);
  services = sv || []; photos = ph || [];
  setStatus();
  showPage(page);
}

// ---------- Preview ----------
function showPage(p) {
  page = p;
  document.querySelectorAll('#ed-page button').forEach(b => b.setAttribute('aria-pressed', b.dataset.page === p));
  frame.src = SRC[p];
}
let t;
const push = () => { clearTimeout(t); t = setTimeout(() => frame.contentWindow?.postMessage({ type: 'mvcd-preview', theme: draft.theme, page: cfg() }, location.origin), 120); };
const changed = () => { setStatus(); push(); };
const setStatus = () => { status.textContent = JSON.stringify(draft) === saved ? 'All changes saved' : 'Unsaved changes'; };

addEventListener('message', e => {
  if (e.origin !== location.origin || e.data?.type !== 'mvcd-ready' || e.source !== frame.contentWindow) return;
  readMeta();
  push();
  renderControls();
});
// What the page says it can edit: texts and sections (read from the real page, so new markup shows up automatically)
function readMeta() {
  const doc = frame.contentDocument, seen = new Set();
  meta.texts = [...doc.querySelectorAll('[data-edit]')].filter(el => !seen.has(el.dataset.edit) && seen.add(el.dataset.edit))
    .map(el => ({ key: el.dataset.edit, label: el.dataset.label || el.dataset.edit, orig: el.dataset.orig ?? el.innerHTML }));
  const box = doc.querySelector('[data-blocks]');
  meta.blocks = [...box.children].filter(c => c.dataset.block).map(c => ({ id: c.dataset.block, label: c.dataset.label || c.dataset.block, lock: c.dataset.lock !== undefined, custom: c.classList.contains('cb') }));
  meta.outside = [...doc.querySelectorAll('[data-block]')].filter(c => !box.contains(c)).map(c => ({ id: c.dataset.block, label: c.dataset.label || c.dataset.block }));
}

// ---------- Small DOM helpers ----------
const h = (tag, props = {}, ...kids) => { const el = Object.assign(document.createElement(tag), props); el.append(...kids.flat().filter(k => k != null)); return el; };
const box = (title, ...kids) => h('div', { className: 'card ed-box' }, h('h3', { textContent: title }), ...kids);
const btn = (text, onclick, title = '') => h('button', { type: 'button', textContent: text, onclick, title });
const field = (label, input) => h('label', { className: 'field' }, label, input);
const input = (value, oninput, props = {}) => h('input', { type: 'text', value: value ?? '', oninput: e => oninput(e.target.value), ...props });
const move = (list, i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; };
const toggle = (arr, id) => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];

// Rich text: bold, italic, accent color, link, clear. Output is sanitized to the same tags the site renders.
function rich(value, onChange) {
  const area = h('div', { className: 'rt-box', contentEditable: 'true' });
  area.innerHTML = sanitize(value || '');
  const emit = () => onChange(sanitize(area.innerHTML));
  area.oninput = emit;
  const cmd = (c, v) => () => { area.focus(); document.execCommand(c, false, v); emit(); };
  const accent = () => {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !area.contains(sel.anchorNode)) return;
    const r = sel.getRangeAt(0), span = h('span', { className: 'accent' });
    span.append(r.extractContents()); r.insertNode(span); emit();
  };
  const link = () => { const u = prompt('Link (https://…, tel:…, mailto:… or /page)'); if (u) cmd('createLink', u)(); };
  const clear = () => { area.innerHTML = esc(area.innerText).replace(/\n/g, '<br>'); emit(); };
  const bar = h('div', { className: 'rt-bar' },
    h('button', { type: 'button', innerHTML: '<b>B</b>', title: 'Bold', onmousedown: e => e.preventDefault(), onclick: cmd('bold') }),
    h('button', { type: 'button', innerHTML: '<i>I</i>', title: 'Italic', onmousedown: e => e.preventDefault(), onclick: cmd('italic') }),
    h('button', { type: 'button', innerHTML: '<span style="color:var(--accent)">A</span>', title: 'Accent color', onmousedown: e => e.preventDefault(), onclick: accent }),
    h('button', { type: 'button', textContent: 'Link', onmousedown: e => e.preventDefault(), onclick: link }),
    h('button', { type: 'button', textContent: 'Clear', onclick: clear }));
  return h('div', { className: 'rt' }, bar, area);
}

// ---------- Panels ----------
function renderControls() {
  const scroll = controls.scrollTop;
  controls.replaceChildren(themePanel(), sectionsPanel(), ...(page === 'home' ? [cardsPanel()] : []), textsPanel());
  controls.scrollTop = scroll;
}

function themePanel() {
  const th = draft.theme;
  const colors = h('div', { className: 'ed-colors' }, COLORS.map(([k, label]) =>
    h('label', {}, h('input', { type: 'color', value: th[k], oninput: e => { th[k] = e.target.value; changed(); } }), label)));
  const fontSel = k => h('select', { onchange: e => { th[k] = e.target.value; changed(); } },
    Object.keys(FONTS).map(f => h('option', { value: f, textContent: f, selected: th[k] === f })));
  return box('Design (whole website)', colors,
    h('div', { className: 'grid' }, field('Headline font', fontSel('font_display')), field('Text font', fontSel('font_body'))),
    h('label', { className: 'toggle' }, h('input', { type: 'checkbox', checked: th.upper !== false, onchange: e => { th.upper = e.target.checked; changed(); } }), 'Headlines in CAPITALS'),
    field(`Corner roundness`, h('input', { type: 'range', min: 0, max: 32, value: th.radius, oninput: e => { th.radius = +e.target.value; changed(); } })),
    h('div', {}, btn('Reset design to MV defaults', () => { draft.theme = { ...THEME_DEFAULT }; changed(); renderControls(); })));
}

function sectionsPanel() {
  const c = cfg();
  c.order = meta.blocks.map(b => b.id); // current on-page order, kept in sync with the preview
  c.hidden ||= []; c.blocks ||= [];
  const rows = meta.blocks.map((b, i) => {
    const off = c.hidden.includes(b.id);
    const custom = c.blocks.find(x => x.id === b.id);
    const acts = h('div', { className: 'acts' },
      btn('↑', () => { move(c.order, i, -1); move(meta.blocks, i, -1); changed(); renderControls(); }, 'Move up'),
      btn('↓', () => { move(c.order, i, 1); move(meta.blocks, i, 1); changed(); renderControls(); }, 'Move down'),
      b.lock ? null : btn(off ? 'Show' : 'Hide', () => { c.hidden = toggle(c.hidden, b.id); changed(); renderControls(); }),
      custom ? btn(open.has(b.id) ? 'Close' : 'Edit', () => { open.has(b.id) ? open.delete(b.id) : open.add(b.id); renderControls(); }) : null,
      custom ? btn('✕', () => { if (!confirm('Delete this block?')) return; c.blocks = c.blocks.filter(x => x.id !== b.id); meta.blocks.splice(i, 1); c.order = c.order.filter(x => x !== b.id); changed(); renderControls(); }, 'Delete') : null);
    return h('div', { className: `ed-row ${off ? 'off' : ''}` }, h('span', { textContent: (custom ? custom.title || 'Custom block' : b.label) + (custom ? ' (custom)' : '') }), acts,
      custom && open.has(b.id) ? blockForm(custom) : null);
  });
  const outside = meta.outside.map(b => {
    const off = c.hidden.includes(b.id);
    return h('div', { className: `ed-row ${off ? 'off' : ''}` }, h('span', { textContent: b.label }),
      h('div', { className: 'acts' }, btn(off ? 'Show' : 'Hide', () => { c.hidden = toggle(c.hidden, b.id); changed(); renderControls(); })));
  });
  const add = (title, html, buttons) => () => {
    const b = { id: uid('cb_'), title, html, buttons };
    c.blocks.push(b); meta.blocks.push({ id: b.id, label: title, custom: true }); c.order.push(b.id); open.add(b.id);
    changed(); renderControls();
  };
  return box(page === 'home' ? 'Sections (order and visibility)' : 'Booking steps and sections', ...rows, ...outside,
    h('div', { className: 'row' },
      btn('+ Text block', add('New section', 'Write something here.', [])),
      btn('+ Buttons block', add('', '', [{ label: 'WhatsApp us', url: '', style: 'wa' }]))));
}

function blockForm(b) {
  const list = h('div', { className: 'ed-sub' });
  const drawButtons = () => list.replaceChildren(...b.buttons.map((x, i) => h('div', { className: 'ed-btnrow' },
    input(x.label, v => { x.label = v; changed(); }, { placeholder: 'Button text' }),
    input(x.url, v => { x.url = v; changed(); }, { placeholder: x.style === 'wa' ? 'Empty = WhatsApp chat' : 'Link: /booking, tel:…, https://…' }),
    h('select', { onchange: e => { x.style = e.target.value; changed(); drawButtons(); } },
      [['primary', 'Main'], ['outline', 'Outline'], ['wa', 'WhatsApp']].map(([v, l]) => h('option', { value: v, textContent: l, selected: x.style === v }))),
    btn('✕', () => { b.buttons.splice(i, 1); changed(); drawButtons(); }))));
  drawButtons();
  return h('div', { className: 'ed-sub' },
    field('Title', input(b.title, v => { b.title = v; changed(); })),
    h('div', {}, h('div', { className: 'ed-text-label', textContent: 'Text' }), rich(b.html, v => { b.html = v; changed(); })),
    h('div', { className: 'ed-text-label', textContent: 'Buttons' }), list,
    h('div', {}, btn('+ Add button', () => { b.buttons.push({ label: 'Book now', url: '/booking', style: 'primary' }); changed(); drawButtons(); })));
}

function cardsPanel() {
  const c = cfg(); c.cards ||= {}; const k = c.cards;
  k.extra ||= []; k.hidden ||= [];
  const all = [...services.map(s => ({ id: s.slug, label: s.name })), ...k.extra.map(x => ({ id: x.id, label: x.title || 'New card', extra: x })), { id: 'contact', label: 'Contact us' }];
  const rank = id => { const i = (k.order || []).indexOf(id); return i < 0 ? 1e3 + all.findIndex(x => x.id === id) : i; };
  all.sort((a, b) => rank(a.id) - rank(b.id));
  k.order = all.map(x => x.id);
  const rows = all.map((x, i) => {
    const off = k.hidden.includes(x.id);
    return h('div', { className: `ed-row ${off ? 'off' : ''}` }, h('span', { textContent: x.label + (x.extra ? ' (custom)' : '') }),
      h('div', { className: 'acts' },
        btn('↑', () => { move(k.order, i, -1); changed(); renderControls(); }),
        btn('↓', () => { move(k.order, i, 1); changed(); renderControls(); }),
        btn(off ? 'Show' : 'Hide', () => { k.hidden = toggle(k.hidden, x.id); changed(); renderControls(); }),
        x.extra ? btn(open.has(x.id) ? 'Close' : 'Edit', () => { open.has(x.id) ? open.delete(x.id) : open.add(x.id); renderControls(); }) : null,
        x.extra ? btn('✕', () => { if (!confirm('Delete this card?')) return; k.extra = k.extra.filter(e => e.id !== x.id); k.order = k.order.filter(e => e !== x.id); changed(); renderControls(); }) : null),
      x.extra && open.has(x.id) ? cardForm(x.extra) : null);
  });
  return box('Cards on the home page', h('p', { className: 'muted', style: 'margin:0;font-size:13px', textContent: 'Service names, prices and photos are edited in "Services & prices".' }), ...rows,
    h('div', {}, btn('+ New card', () => { const x = { id: uid('cc_'), title: 'Ceramic coating', meta: 'Quote on WhatsApp', button: 'Get a quote', url: '', icon: 'shield', image: '' }; k.extra.push(x); open.add(x.id); changed(); renderControls(); })));
}

function cardForm(x) {
  const photoList = h('datalist', { id: `ph-${x.id}` }, photos.map(p => h('option', { value: p.url, textContent: p.caption })));
  return h('div', { className: 'ed-sub' },
    field('Title', input(x.title, v => { x.title = v; changed(); })),
    field('Small text (price, time…)', input(x.meta, v => { x.meta = v; changed(); })),
    field('Button text', input(x.button, v => { x.button = v; changed(); })),
    field('Button link (/booking, tel:…, https://…; empty = booking)', input(x.url, v => { x.url = v; changed(); })),
    field('Photo (pick from your photos or paste a link)', input(x.image, v => { x.image = v; changed(); }, { list: `ph-${x.id}` })), photoList,
    field('Icon', h('select', { onchange: e => { x.icon = e.target.value; changed(); } }, Object.keys(ICONS).map(i => h('option', { value: i, textContent: i, selected: x.icon === i })))));
}

function textsPanel() {
  const c = cfg(); c.texts ||= {};
  const rows = meta.texts.map(tx => {
    const holder = h('div');
    const draw = () => holder.replaceChildren(rich(c.texts[tx.key] || tx.orig, v => { c.texts[tx.key] = v; changed(); }));
    draw();
    return h('div', {}, h('div', { className: 'ed-text-label' }, h('span', { textContent: tx.label }),
      btn('Reset', () => { delete c.texts[tx.key]; changed(); draw(); })), holder);
  });
  return box('Texts', h('p', { className: 'muted', style: 'margin:0;font-size:13px', textContent: 'Select words and use A to paint them in the accent color.' }), ...rows);
}

// ---------- Save / discard ----------
$('ed-save').onclick = async () => {
  const b = $('ed-save'); b.disabled = true;
  const { error } = await sb.from('mvcd_settings').upsert([
    { key: 'theme', value: draft.theme }, { key: 'page_home', value: draft.pages.home }, { key: 'page_booking', value: draft.pages.booking }]);
  b.disabled = false;
  if (error) return alert(error.message);
  saved = JSON.stringify(draft); setStatus();
  status.textContent = 'Published ✓';
};
$('ed-discard').onclick = () => { if (confirm('Discard all unsaved changes?')) { open.clear(); load(); } };
$('ed-page').onclick = e => { const b = e.target.closest('[data-page]'); if (b && b.dataset.page !== page) showPage(b.dataset.page); };
$('ed-device').onclick = e => {
  const b = e.target.closest('[data-device]'); if (!b) return;
  document.querySelectorAll('#ed-device button').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('ed-frame-wrap').classList.toggle('desktop', b.dataset.device === 'desktop');
};
addEventListener('beforeunload', e => { if (draft && JSON.stringify(draft) !== saved) e.preventDefault(); });

// Start when the tab is first opened (and the admin is signed in)
let started = false;
document.querySelector('[data-tab="editor"]').addEventListener('click', async () => {
  if (started) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  started = true;
  load();
});

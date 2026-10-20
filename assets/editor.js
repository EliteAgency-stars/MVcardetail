// Admin "Site editor": theme, texts, sections, cards and custom blocks for the home and booking pages,
// with a live preview (the real page in an iframe, re-rendered from the draft on every change).
import { sb, esc } from '/assets/common.js';
import { FONTS, THEME_DEFAULT, ICONS, LOGO_DEFAULT, sanitize } from '/assets/site.js';

const $ = id => document.getElementById(id);
const frame = $('ed-frame'), controls = $('ed-controls'), status = $('ed-status');
const SRC = { home: '/?preview=1', booking: '/booking.html?preview=1' };
const COLORS = [['accent', 'Accent'], ['offer', 'Highlight'], ['bg', 'Background'], ['surface', 'Cards'], ['text', 'Text']];

let draft = null, saved = '', page = 'home', meta = { texts: [], blocks: [], outside: [] }, services = [], photos = [];
let picked = null; // what was clicked in the preview: { card } | { text } | { block }
const open = new Set(); // custom blocks / cards whose edit form is expanded
const uid = p => p + Math.random().toString(36).slice(2, 8);
const cfg = () => (draft.pages[page] ||= {});

async function load() {
  const [{ data: rows }, { data: sv }, { data: ph }] = await Promise.all([
    sb.from('mvcd_settings').select('key,value').in('key', ['theme', 'page_home', 'page_booking']),
    sb.from('mvcd_services').select('*').order('level'),
    sb.from('mvcd_photos').select('url,caption').order('sort'),
  ]);
  const v = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
  draft = { theme: { ...THEME_DEFAULT, ...(v.theme || {}) }, pages: { home: v.page_home || {}, booking: v.page_booking || {} }, services: {} };
  saved = JSON.stringify(draft);
  services = sv || []; photos = ph || [];
  setStatus();
  showPage(page);
}

// ---------- Preview ----------
function showPage(p) {
  page = p; picked = null;
  document.querySelectorAll('#ed-page button').forEach(b => b.setAttribute('aria-pressed', b.dataset.page === p));
  frame.src = SRC[p];
}
let t;
const push = () => { clearTimeout(t); t = setTimeout(() => frame.contentWindow?.postMessage({ type: 'mvcd-preview', theme: draft.theme, page: { ...cfg(), serviceEdits: draft.services } }, location.origin), 120); };
const changed = () => { setStatus(); push(); };
const setStatus = () => { status.textContent = JSON.stringify(draft) === saved ? 'All changes saved' : 'Unsaved changes'; };

addEventListener('message', e => {
  if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
  if (e.data?.type === 'mvcd-pick') {
    picked = { card: e.data.card, text: e.data.text, block: e.data.block };
    renderControls();
    controls.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (e.data?.type !== 'mvcd-ready') return;
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
const input = (value, oninput, { list, ...props } = {}) => {
  const el = h('input', { type: 'text', value: value ?? '', oninput: e => oninput(e.target.value), ...props });
  if (list) el.setAttribute('list', list); // read-only property, must be an attribute
  return el;
};
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
  controls.replaceChildren(...(picked ? [selectedPanel()] : [h('p', { className: 'muted', style: 'margin:0;font-size:13px', textContent: 'Tip: click any card, text or section in the preview to edit it.' })]),
    themePanel(), sectionsPanel(), ...(page === 'home' ? [cardsPanel()] : []), textsPanel());
  controls.scrollTop = scroll;
}

function themePanel() {
  const th = draft.theme;
  const colors = h('div', { className: 'ed-colors' }, COLORS.map(([k, label]) =>
    h('label', {}, h('input', { type: 'color', value: th[k], oninput: e => { th[k] = e.target.value; changed(); } }), label)));
  const fontSel = k => h('select', { onchange: e => { th[k] = e.target.value; changed(); } },
    Object.keys(FONTS).map(f => h('option', { value: f, textContent: f, selected: th[k] === f })));
  const logoImg = h('img', { src: th.logo || LOGO_DEFAULT, alt: 'Logo', style: 'height:56px;width:auto;border-radius:10px;background:#000' });
  const logoFile = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    status.textContent = 'Uploading logo…';
    try {
      th.logo = await uploadImage(f, 'logo', 600); logoImg.src = th.logo;
      status.textContent = 'Creating app icons…';
      th.icons = await makeIcons(th.logo, th.bg);
      changed(); renderControls();
    } catch (err) { alert(err.message); setStatus(); }
  } });
  const logo = h('div', { className: 'row' }, logoImg,
    h('label', { className: 'btn small' }, 'Upload new logo', logoFile),
    th.logo ? btn('Use MV default', () => { th.logo = ''; delete th.icons; changed(); renderControls(); }) : null);
  return box('Design (whole website)', h('div', { className: 'ed-text-label', textContent: 'Logo' }), logo, colors,
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

// ---------- Clicked in the preview ----------
function selectedPanel() {
  const { card, text, block } = picked;
  const close = h('div', {}, btn('Close', () => { picked = null; renderControls(); }));
  const c = cfg();
  if (card) {
    const svc = services.find(x => x.slug === card);
    const extra = (c.cards?.extra || []).find(x => x.id === card);
    const title = svc ? (draft.services[svc.slug]?.name ?? svc.name) : extra ? extra.title : 'Contact us';
    const parts = [];
    if (svc) parts.push(serviceForm(svc));
    if (extra) parts.push(cardForm(extra));
    if (card === 'contact') parts.push(textField('contact_title'));
    if (page === 'home') parts.push(cardMoveRow(card));
    return selBox(`Card: ${title}`, ...parts, close);
  }
  if (text) return selBox('Text', textField(text), close);
  if (block) {
    const b = meta.blocks.find(x => x.id === block) || meta.outside.find(x => x.id === block);
    const custom = (c.blocks || []).find(x => x.id === block);
    return selBox(`Section: ${custom?.title || b?.label || block}`, custom ? blockForm(custom) : h('p', { className: 'muted', style: 'margin:0', textContent: 'Move or hide it in the sections list below.' }), close);
  }
  return h('div');
}
const selBox = (title, ...kids) => { const el = box(title, ...kids); el.style.borderColor = 'var(--accent)'; el.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)'; return el; };

// Service details edited from the preview; saved to the services on publish
function serviceForm(sv) {
  const val = k => draft.services[sv.slug]?.[k] ?? sv[k];
  const set = (k, v) => { (draft.services[sv.slug] ||= {})[k] = v; changed(); };
  const num = (label, k, step = 1) => field(label, h('input', { type: 'number', min: 0, step, value: val(k), oninput: ev => set(k, +ev.target.value) }));
  const dl = h('datalist', { id: `sv-ph-${sv.slug}` }, photos.map(p => h('option', { value: p.url, textContent: p.caption })));
  return h('div', { className: 'ed-sub' },
    field('Name', input(val('name'), v => set('name', v))),
    h('div', { className: 'grid' }, num('Sedan / Coupe ($)', 'price'), num('SUV / Crossover ($)', 'price_suv'), num('Truck / Large SUV / Van ($)', 'price_truck')),
    num('Duration (minutes)', 'duration_min', 5),
    field('Card photo (pick one of your photos or paste a link)', input(val('image_url'), v => set('image_url', v), { list: `sv-ph-${sv.slug}` })), dl,
    h('label', { className: 'toggle' }, h('input', { type: 'checkbox', checked: !!val('popular'), onchange: ev => set('popular', ev.target.checked) }), '"Most popular" label'),
    h('p', { className: 'muted', style: 'margin:0;font-size:12px', textContent: 'Included items and fine print are in the "Services & prices" tab.' }));
}
function cardMoveRow(id) {
  const k = (cfg().cards ||= {}); k.hidden ||= [];
  const i = (k.order || []).indexOf(id), off = k.hidden.includes(id);
  return h('div', { className: 'row' },
    btn('↑ Move up', () => { if (i > 0) { move(k.order, i, -1); changed(); renderControls(); } }),
    btn('↓ Move down', () => { if (i >= 0) { move(k.order, i, 1); changed(); renderControls(); } }),
    btn(off ? 'Show card' : 'Hide card', () => { k.hidden = toggle(k.hidden, id); changed(); renderControls(); }));
}
function textField(key) {
  const c = cfg(); c.texts ||= {};
  const tx = meta.texts.find(x => x.key === key) || { key, label: key, orig: '' };
  const holder = h('div');
  const draw = () => holder.replaceChildren(rich(c.texts[key] || tx.orig, v => { c.texts[key] = v; changed(); }));
  draw();
  setTimeout(() => holder.querySelector('.rt-box')?.focus({ preventScroll: true }), 50);
  return h('div', {}, h('div', { className: 'ed-text-label' }, h('span', { textContent: tx.label }), btn('Reset', () => { delete c.texts[key]; changed(); draw(); })), holder);
}

// Image upload to the site's storage (downscaled WebP, transparency kept)
async function uploadImage(file, folder, max = 1600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise(r => cv.toBlob(r, 'image/webp', .9));
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const { error } = await sb.storage.from('mvcd-media').upload(path, blob, { contentType: 'image/webp' });
  if (error) throw error;
  return sb.storage.from('mvcd-media').getPublicUrl(path).data.publicUrl;
}

// App icons (home screen) from the logo: square PNGs on the background color.
// 'maskable' keeps the logo inside Android's safe zone so round/squircle masks never cut it.
async function makeIcons(logoUrl, bg = '#000000') {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  // load event, not img.decode(): decode() can stall while the tab isn't painting
  await new Promise((ok, fail) => { img.onload = ok; img.onerror = () => fail(new Error('Could not load the logo image')); img.src = logoUrl; });
  // Fill with the logo's own corner color (so a logo on black gets a seamless black icon); transparent corners use the site background
  const probe = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  probe.drawImage(img, 0, 0, 4, 4, 0, 0, 1, 1);
  const [r, g, b2, a] = probe.getImageData(0, 0, 1, 1).data;
  if (a > 200) bg = '#' + [r, g, b2].map(v => v.toString(16).padStart(2, '0')).join('');
  const stamp = Date.now(), out = {};
  for (const [key, size, fill] of [['192', 192, .92], ['512', 512, .92], ['maskable', 512, .72], ['180', 180, .92]]) {
    const cv = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const ctx = cv.getContext('2d');
    ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(bg) ? bg : '#000000';
    ctx.fillRect(0, 0, size, size);
    const k = Math.min(size * fill / img.naturalWidth, size * fill / img.naturalHeight);
    const w = img.naturalWidth * k, h2 = img.naturalHeight * k;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (size - w) / 2, (size - h2) / 2, w, h2);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const path = `icons/${stamp}-${key}.png`;
    const { error } = await sb.storage.from('mvcd-media').upload(path, blob, { contentType: 'image/png' });
    if (error) throw error;
    out[key] = sb.storage.from('mvcd-media').getPublicUrl(path).data.publicUrl;
  }
  return out;
}

// ---------- Save / discard ----------
$('ed-save').onclick = async () => {
  const b = $('ed-save'); b.disabled = true;
  if (draft.theme.logo && !draft.theme.icons) {
    status.textContent = 'Creating app icons…';
    try { draft.theme.icons = await makeIcons(draft.theme.logo, draft.theme.bg); } catch (err) { b.disabled = false; return alert(`App icons: ${err.message}`); }
  }
  const { error } = await sb.from('mvcd_settings').upsert([
    { key: 'theme', value: draft.theme }, { key: 'page_home', value: draft.pages.home }, { key: 'page_booking', value: draft.pages.booking }]);
  let err = error;
  for (const [slug, row] of Object.entries(draft.services)) {
    if (err || !Object.keys(row).length) continue;
    ({ error: err } = await sb.from('mvcd_services').update(row).eq('slug', slug));
    if (!err) Object.assign(services.find(x => x.slug === slug) || {}, row);
  }
  b.disabled = false;
  if (err) return alert(err.message);
  draft.services = {};
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

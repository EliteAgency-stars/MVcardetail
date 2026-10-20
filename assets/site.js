// Admin-editable site: theme (colors, fonts) and page config (texts, custom blocks, order, hidden).
// Pages mark editable bits in their HTML:
//   data-edit="key" data-label="..."   text the admin can rewrite (rich text, sanitized)
//   [data-blocks]                      container whose [data-block] children can be reordered / hidden
//   data-block="id" data-label="..."   a section; add data-lock to forbid hiding it
// Page config shape: { texts: {key: html}, order: [ids], hidden: [ids], blocks: [{ id, title, html, buttons: [{ label, url, style }] }] }

export const FONTS = {
  'General Sans': null, 'Satoshi': null, // self-hosted
  'Inter': 'Inter:wght@400;500;600;700', 'Montserrat': 'Montserrat:wght@400;500;600;700;800',
  'Poppins': 'Poppins:wght@400;500;600;700', 'Oswald': 'Oswald:wght@400;500;600;700',
  'Bebas Neue': 'Bebas+Neue', 'Barlow Condensed': 'Barlow+Condensed:wght@400;500;600;700',
  'Archivo': 'Archivo:wght@400;500;600;700;800', 'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700',
  'Playfair Display': 'Playfair+Display:wght@400;600;700', 'Roboto': 'Roboto:wght@400;500;700',
};
export const THEME_DEFAULT = {
  accent: '#2ee6d6', offer: '#ffb020', bg: '#070809', surface: '#101215', text: '#f3f4f5',
  font_display: 'General Sans', font_body: 'Satoshi', upper: true, radius: 18, logo: '',
};
export const LOGO_DEFAULT = '/img/logo.webp';

// Readable ink on top of a color (buttons on the accent)
const ink = hex => {
  const n = parseInt(hex.slice(1), 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#0b0c0d' : '#ffffff';
};
const loadFont = name => {
  const q = FONTS[name];
  if (!q || document.querySelector(`link[data-font="${name}"]`)) return;
  const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${q}&display=swap` });
  l.dataset.font = name;
  document.head.append(l);
};

export function applyTheme(theme, { cache = true } = {}) {
  const t = { ...THEME_DEFAULT, ...(theme || {}) };
  const r = document.documentElement.style;
  const hex = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : null;
  for (const k of ['accent', 'offer', 'bg', 'surface', 'text']) if (hex(t[k])) r.setProperty(`--${k}`, t[k]);
  if (hex(t.accent)) r.setProperty('--accent-ink', ink(t.accent));
  if (hex(t.surface)) r.setProperty('--surface-2', `color-mix(in srgb, ${t.surface} 88%, #ffffff)`);
  [t.font_display, t.font_body].forEach(loadFont);
  if (t.font_display in FONTS) r.setProperty('--display', `'${t.font_display}', system-ui, sans-serif`);
  if (t.font_body in FONTS) r.setProperty('--body', `'${t.font_body}', system-ui, sans-serif`);
  r.setProperty('--display-case', t.upper === false ? 'none' : 'uppercase');
  r.setProperty('--radius', `${Math.min(32, Math.max(0, +t.radius || 0))}px`);
  const logo = safeUrl(t.logo) || LOGO_DEFAULT;
  const setLogo = () => document.querySelectorAll('[data-logo]').forEach(el => el[el.tagName === 'LINK' ? 'href' : 'src'] = logo);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', setLogo, { once: true }) : setLogo();
  if (cache && !new URLSearchParams(location.search).has('preview')) try { localStorage.setItem('mvcd-theme', JSON.stringify(t)); } catch {}
}

// Rich text from the admin: only a few inline tags survive
export function sanitize(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html ?? '');
  const walk = node => [...node.childNodes].forEach(n => {
    if (n.nodeType === 3) return;
    if (n.nodeType !== 1) return n.remove();
    walk(n);
    const tag = n.tagName;
    if (['B', 'STRONG', 'I', 'EM', 'BR'].includes(tag)) { [...n.attributes].forEach(a => n.removeAttribute(a.name)); return; }
    if (tag === 'A' && safeUrl(n.getAttribute('href'))) { const h = n.getAttribute('href'); [...n.attributes].forEach(a => n.removeAttribute(a.name)); n.setAttribute('href', h); if (/^https?:/.test(h)) { n.target = '_blank'; n.rel = 'noopener'; } return; }
    if (tag === 'SPAN' && n.classList.contains('accent')) { [...n.attributes].forEach(a => a.name !== 'class' && n.removeAttribute(a.name)); n.className = 'accent'; return; }
    const block = ['DIV', 'P'].includes(tag) && n.nextSibling;
    n.replaceWith(...n.childNodes, ...(block ? [document.createElement('br')] : []));
  });
  walk(tpl.content);
  return tpl.innerHTML;
}
export const safeUrl = u => /^(https?:\/\/|tel:|mailto:|\/(?!\/)|#)/i.test(String(u || '').trim()) ? String(u).trim() : '';
const escAttr = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderBlock(b, waUrl) {
  const el = document.createElement('div');
  el.className = 'card cb';
  el.dataset.block = b.id;
  el.dataset.label = b.title || 'Custom block';
  const btns = (b.buttons || []).map(x => {
    const url = x.style === 'wa' && !safeUrl(x.url) ? waUrl : safeUrl(x.url);
    if (!url || !x.label) return '';
    const ext = /^https?:/.test(url) ? ' target="_blank" rel="noopener"' : '';
    return `<a class="btn ${x.style === 'outline' ? '' : x.style === 'wa' ? 'wa' : 'primary'}" href="${escAttr(url)}"${ext}>${escAttr(x.label)}</a>`;
  }).join('');
  el.innerHTML = `${b.title ? `<h2 class="cb-title">${escAttr(b.title)}</h2>` : ''}${b.html ? `<div class="cb-text">${sanitize(b.html)}</div>` : ''}${btns ? `<div class="cb-btns">${btns}</div>` : ''}`;
  return el;
}

// Idempotent: safe to call again with a new config (live preview in the admin)
export function applyPage(cfg = {}, { waUrl = '#' } = {}) {
  document.querySelectorAll('[data-edit]').forEach(el => {
    if (el.dataset.orig === undefined) el.dataset.orig = el.innerHTML;
    const v = cfg.texts?.[el.dataset.edit];
    el.innerHTML = v ? sanitize(v) : el.dataset.orig;
    delete el.dataset.shine; // let shineText() split the new words again
  });
  const box = document.querySelector('[data-blocks]');
  if (box) {
    box.querySelectorAll(':scope > .cb').forEach(n => n.remove());
    if (box.dataset.def === undefined) box.dataset.def = [...box.children].map(c => c.dataset.block).filter(Boolean).join(',');
    const blocks = (cfg.blocks || []).filter(b => b?.id);
    blocks.forEach(b => box.append(renderBlock(b, waUrl)));
    const seen = new Set();
    [...(cfg.order || []), ...box.dataset.def.split(','), ...blocks.map(b => b.id)].forEach(id => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const el = box.querySelector(`:scope > [data-block="${CSS.escape(id)}"]`);
      if (el) box.append(el);
    });
  }
  const hidden = new Set(cfg.hidden || []);
  document.querySelectorAll('[data-block]').forEach(el => { if (el.dataset.lock === undefined) el.hidden = hidden.has(el.dataset.block); });
}

// In the admin's preview iframe: re-render whenever the editor sends a draft
export function onPreview(fn) {
  if (!new URLSearchParams(location.search).has('preview') || parent === window) return;
  addEventListener('message', e => {
    if (e.origin === location.origin && e.data?.type === 'mvcd-preview') { applyTheme(e.data.theme, { cache: false }); fn(e.data.page || {}); }
  });
  parent.postMessage({ type: 'mvcd-ready' }, location.origin);

  // Click-to-edit: outline what the pointer is over, and on click tell the editor what to open.
  // Cards win over texts inside them; texts win over the section around them.
  const style = document.createElement('style');
  style.textContent = '.mv-pick{outline:2px dashed var(--accent)!important;outline-offset:3px;cursor:pointer!important}';
  document.head.append(style);
  const target = el => el.closest?.('[data-card]') || el.closest?.('[data-edit]') || el.closest?.('[data-block]');
  let cur = null;
  addEventListener('mouseover', e => { const t = target(e.target); if (t === cur) return; cur?.classList.remove('mv-pick'); cur = t; t?.classList.add('mv-pick'); });
  addEventListener('click', e => {
    const t = target(e.target);
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    parent.postMessage({ type: 'mvcd-pick', card: t.dataset.card, text: t.dataset.edit, block: t.dataset.block }, location.origin);
  }, true);
}

// Card icons (Tabler-style outline paths), shared by the home page and the admin icon picker
export const ICONS = {
  drop: 'M7.5 19.42c2.6 2.1 6.4 2.1 9 0c2.6 -2.1 3.26 -5.7 1.56 -8.54l-4.89 -7.26a1.38 1.38 0 0 0 -2.35 0l-4.89 7.26c-1.7 2.84 -1.04 6.44 1.57 8.54z',
  sparkles: 'M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z',
  seat: 'M5 11a2 2 0 0 1 2 2v2h10v-2a2 2 0 1 1 4 0v4a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2zM5 11v-5a3 3 0 0 1 3 -3h8a3 3 0 0 1 3 3v5M6 19v2M18 19v2',
  car: 'M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5',
  diamond: 'M6 5h12l3 5l-8.5 9.5a.7 .7 0 0 1 -1 0l-8.5 -9.5l3 -5M10 12l-2 -2.2l.6 -1',
  shield: 'M11.46 20.85a12 12 0 0 1 -7.96 -14.85a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06M15 19l2 2l4 -4',
  star: 'M12 17.75l-6.17 3.24l1.18 -6.87l-5 -4.86l6.9 -1l3.08 -6.25l3.08 6.25l6.9 1l-5 4.86l1.18 6.87z',
  gift: 'M3 8m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1zM12 8l0 13M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5',
  calendar: 'M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2zM16 3v4M8 3v4M4 11h16',
  phone: 'M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2',
};

// Paint the last known theme right away so returning visitors don't see a flash of the default colors
try { const c = localStorage.getItem('mvcd-theme'); if (c) applyTheme(JSON.parse(c)); } catch {}

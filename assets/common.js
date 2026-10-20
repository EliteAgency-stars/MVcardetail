import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

// Public values only (publishable key; RLS protects writes).
export const SUPABASE_URL = 'https://opagblruzwsrxsggkjsa.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_O30dPx3jfAA3m2CUnw7nCQ_jsuZiwRj';
export const N8N = 'https://n8n.santiagoorj.beer/webhook/mvcd';
export const PHONE = '+1 954 268 7993';
export const WHATSAPP = '19542687993';
export const EMAIL = 'mvcardetail01@gmail.com';
export const TZ = 'America/New_York';
// Mon..Sat opening hours in minutes from midnight (Eastern). Sunday closed. Mirrors mvcd_book().
export const HOURS = { 1: [480, 1110], 2: [480, 1110], 3: [480, 1110], 4: [480, 1110], 5: [480, 1110], 6: [540, 900] };
export const BUFFER_MIN = 30;

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export const money = n => '$' + Number(n).toFixed(Number(n) % 1 ? 2 : 0);
export const dur = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`;
export const wa = text => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Eastern wall-clock time -> real Date (handles DST via Intl).
export function etDate(y, m, d, minutes) {
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60));
  const off = tzOffsetMin(guess);
  const real = new Date(guess.getTime() - off * 60000);
  const off2 = tzOffsetMin(real);
  return off2 === off ? real : new Date(guess.getTime() - off2 * 60000);
}
function tzOffsetMin(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(date).map(x => [x.type, x.value]));
  return (Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - date.getTime()) / 60000;
}
// Today's date parts in Eastern time.
export function etToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day };
}
export const fmtTime = date => date.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
export const fmtDay = date => date.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });

export async function loadContent() {
  const [services, settings, photos, testimonials] = await Promise.all([
    sb.from('mvcd_services').select('*').eq('active', true).order('level'),
    sb.from('mvcd_settings').select('*'),
    sb.from('mvcd_photos').select('*').order('sort'),
    sb.from('mvcd_testimonials').select('*').eq('published', true).order('created_at', { ascending: false }),
  ]);
  const cfg = Object.fromEntries((settings.data || []).map(r => [r.key, r.value]));
  return { services: services.data || [], offer: cfg.offer, google: cfg.google, photos: photos.data || [], testimonials: testimonials.data || [] };
}

const I = {
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.27-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41Z"/></svg>',
  ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  fb: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.95.93-1.95 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z"/></svg>',
  tt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03a10.4 10.4 0 0 1-5.82-1.9c-.01 2.92.01 5.84-.02 8.75a7.6 7.6 0 0 1-1.35 3.94 7.43 7.43 0 0 1-5.91 3.21 7.3 7.3 0 0 1-4.08-1.03 7.5 7.5 0 0 1-3.63-7.2 7.46 7.46 0 0 1 8.73-6.68c.02 1.48-.04 2.96-.04 4.44a3.4 3.4 0 0 0-4.38 2.12c-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87a3.4 3.4 0 0 0 2.77-1.61c.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6 -6M11 6l.46 -.54a5 5 0 0 1 7.07 7.07l-.53 .47M13 18l-.4 .53a5.07 5.07 0 0 1 -7.12 0a4.97 4.97 0 0 1 0 -7.07l.52 -.46"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
};
export function icons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = I[el.dataset.icon] || ''; });
}
// Wrap each word of .display headings in <span class="w"> so the shine can travel word by word.
export function shineText(root = document) {
  root.querySelectorAll('.display:not([data-shine])').forEach(el => {
    el.dataset.shine = '';
    el.setAttribute('aria-label', el.textContent.trim());
    let i = 0;
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 1) return walk(n);
      if (n.nodeType !== 3 || !n.textContent.trim()) return;
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) return frag.append(part);
        const s = document.createElement('span');
        s.className = 'w'; s.style.setProperty('--i', i++); s.setAttribute('aria-hidden', 'true'); s.textContent = part;
        frag.append(s);
      });
      n.replaceWith(frag);
    });
    walk(el);
  });
}
export function reveal() {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  document.querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el));
}

export const offerFor =(offer, slug) => offer && offer.active && offer.service === slug ? offer : null;

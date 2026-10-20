import { sb, shineText, loadContent, money, dur, wa, esc, icons, offerFor, etDate, etToday, fmtTime, fmtDay, HOURS, BUFFER_MIN, N8N } from '/assets/common.js';

const $ = id => document.getElementById(id);
const form = $('form');
const params = new URLSearchParams(location.search);
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelectorAll('.wa-link').forEach(a => a.href = wa('Hi MV Car Detail! I have a question about booking.'));
icons();
shineText();

const state = { service: null, day: null, start: null, slots: [] };

// 3D car loads in parallel; the page still works if WebGL is unavailable.
let car = null;
const caption = $('caption');
const say = text => { caption.textContent = text; caption.classList.remove('swap'); void caption.offsetWidth; caption.classList.add('swap'); };
import('/assets/car3d.js').then(m => { car = m.mountCar($('car'), say); if (state.service) car.setLevel(state.service.level); })
  .catch(() => { $('car').remove(); say('Preview unavailable on this device'); });

const { services, offer, photos } = await loadContent();

// ---------- Step 1: packages ----------
$('pkgs').innerHTML = services.map(s => {
  const o = offerFor(offer, s.slug);
  return `<label class="pkg"><input type="radio" name="service" value="${s.slug}">
    <b>${esc(s.name)}${o ? '<span class="tag deal">Offer</span>' : s.popular ? '<span class="tag">Popular</span>' : ''}</b>
    <span class="p">${o ? `<s>${money(s.price)}</s>${money(o.price)}` : money(s.price)}</span>
    <small>${dur(s.duration_min)}</small></label>`;
}).join('');

function pickService(slug) {
  const s = services.find(x => x.slug === slug) || services.find(x => x.popular) || services[0];
  if (!s) return;
  state.service = s;
  form.querySelector(`input[name=service][value="${s.slug}"]`).checked = true;
  $('lvlname').textContent = s.name;
  [...$('lvlbar').children].forEach((el, i) => el.classList.toggle('on', i < s.level));
  $('pkgdetail').innerHTML = `<details><summary>What's included</summary><ul>${s.includes.map(i => `<li>${esc(i)}</li>`).join('')}</ul></details>`;
  const o = offerFor(offer, s.slug);
  $('firstbox').hidden = !o;
  if (o) $('firsttext').innerHTML = `<b>First visit?</b> Pay ${money(o.price)} instead of ${money(s.price)}`;
  car?.setLevel(s.level);
  renderDays(); renderTimes(); summary();
}
$('pkgs').addEventListener('change', e => pickService(e.target.value));
$('replay').onclick = () => state.service && car?.setLevel(state.service.level);
if (params.get('offer')) $('first').checked = true;
$('first').onchange = summary;

// ---------- Step 3: live availability ----------
const DAYS = 30;
const today = etToday();
const dayList = Array.from({ length: DAYS }, (_, i) => {
  const d = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay(), key: d.toISOString().slice(0, 10) };
});

function slotsFor(day) {
  const h = HOURS[day.dow], s = state.service;
  if (!h || !s) return [];
  const minStart = Date.now() + 2 * 3600e3;
  const out = [];
  for (let m = h[0]; m + s.duration_min <= h[1]; m += 30) {
    const start = etDate(day.y, day.m, day.d, m);
    const end = new Date(start.getTime() + (s.duration_min + BUFFER_MIN) * 60e3);
    const busy = start.getTime() < minStart || state.slots.some(b => b.s < end && b.e > start);
    out.push({ start, busy });
  }
  return out;
}

function renderDays() {
  $('days').innerHTML = dayList.map(day => {
    const free = slotsFor(day).filter(x => !x.busy).length;
    const closed = !HOURS[day.dow];
    const wd = new Date(Date.UTC(day.y, day.m - 1, day.d)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const mo = new Date(Date.UTC(day.y, day.m - 1, day.d)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    return `<button type="button" class="day" data-key="${day.key}" aria-pressed="${state.day?.key === day.key}" ${closed || !free ? 'disabled' : ''}>
      <span>${wd}</span><b>${day.d}</b><em>${closed ? 'Closed' : free ? mo : 'Full'}</em></button>`;
  }).join('');
  if (!state.day || $('days').querySelector(`[data-key="${state.day.key}"]`)?.disabled) {
    const first = $('days').querySelector('.day:not(:disabled)');
    state.day = first ? dayList.find(d => d.key === first.dataset.key) : null;
    first?.setAttribute('aria-pressed', 'true');
  }
}
$('days').addEventListener('click', e => {
  const b = e.target.closest('.day'); if (!b || b.disabled) return;
  state.day = dayList.find(d => d.key === b.dataset.key);
  state.start = null;
  $('days').querySelectorAll('.day').forEach(x => x.setAttribute('aria-pressed', x === b));
  renderTimes(); summary();
});

function renderTimes() {
  const list = state.day ? slotsFor(state.day) : [];
  if (state.start && !ov.classList.contains('show') && list.some(x => x.busy && +x.start === +state.start)) {
    // Someone else just took the slot we had selected
    const lost = state.start; state.start = null; summary();
    $('err').textContent = `${fmtTime(lost)} was just booked by someone else. Please pick another time.`;
  }
  $('times').innerHTML = list.map(x => `<button type="button" class="time" data-t="${+x.start}" ${x.busy ? 'disabled' : ''} aria-pressed="${+x.start === +state.start}">${fmtTime(x.start)}</button>`).join('');
  $('noslots').hidden = list.some(x => !x.busy);
}
$('times').addEventListener('click', e => {
  const b = e.target.closest('.time'); if (!b || b.disabled) return;
  state.start = new Date(+b.dataset.t);
  $('times').querySelectorAll('.time').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('err').textContent = '';
  summary();
});

async function loadSlots() {
  const until = new Date(Date.now() + (DAYS + 1) * 864e5).toISOString();
  const { data } = await sb.from('mvcd_slots').select('start_at,end_at').gt('end_at', new Date().toISOString()).lt('start_at', until);
  state.slots = (data || []).map(r => ({ s: new Date(r.start_at), e: new Date(r.end_at) }));
  const prev = new Set([...$('times').querySelectorAll('.time:not(:disabled)')].map(b => b.dataset.t));
  renderDays(); renderTimes();
  $('times').querySelectorAll('.time:disabled').forEach(b => prev.has(b.dataset.t) && b.classList.add('gone'));
}
// Realtime: any booking anywhere (or a Google Calendar sync) refreshes the grid instantly.
sb.channel('mvcd-slots').on('postgres_changes', { event: '*', schema: 'public', table: 'mvcd_slots' }, loadSlots).subscribe();
setInterval(loadSlots, 60e3); // also rolls "too soon" slots off as time passes

// ---------- Summary ----------
function price() {
  const s = state.service; if (!s) return null;
  const o = offerFor(offer, s.slug);
  return o && $('first').checked ? o.price : s.price;
}
function summary() {
  const s = state.service;
  $('sum-pkg').textContent = s ? s.name : '-';
  const when = state.start ? `${fmtDay(state.start)}, ${fmtTime(state.start)}` : 'Pick a time';
  $('sum-when').textContent = when; $('m-when').textContent = state.start ? when : `${s?.name || ''} · pick a time`;
  const p = price();
  $('sum-total').innerHTML = p == null ? '-' : p < s.price ? `<s class="muted" style="font-size:18px;font-weight:400">${money(s.price)}</s> ${money(p)}` : money(p);
  $('m-total').textContent = p == null ? '-' : money(p);
  ['s1', 's2', 's3', 's4'].forEach((id, i) => $(id).classList.toggle('done', [!!s, form.address.value.trim().length > 3, !!state.start,
    form.name.value.trim() && form.phone.value.trim() && /\S+@\S+\.\S+/.test(form.email.value) && form.vehicle.value.trim()][i]));
}
form.addEventListener('input', summary);

// ---------- Submit + Rappi-style confirmation ----------
const ov = $('ov');
const steps = ['Checking availability…', 'Reserving your slot…', 'Sending your calendar invite…'];
function procText(t) { const p = $('proctext'); p.textContent = t; p.classList.remove('swap'); void p.offsetWidth; p.classList.add('swap'); }

form.addEventListener('submit', async e => {
  e.preventDefault();
  $('err').textContent = '';
  const f = Object.fromEntries(new FormData(form));
  const missing = !state.service ? 's1' : f.address.trim().length < 4 ? 's2' : !state.start ? 's3'
    : !(f.name.trim() && f.phone.trim().length >= 7 && /\S+@\S+\.\S+/.test(f.email) && f.vehicle.trim()) ? 's4' : null;
  if (missing) {
    $('err').textContent = { s1: 'Choose a package.', s2: 'Add the service address.', s3: 'Pick a date and time.', s4: 'Complete your contact details.' }[missing];
    $(missing).scrollIntoView({ behavior: 'smooth', block: 'center' });
    $(missing).querySelector('input:not([type=radio]):not([type=checkbox]), button.time:not(:disabled)')?.focus({ preventScroll: true });
    return;
  }
  // Light wave grows from the button that was pressed
  const btn = e.submitter || form.querySelector('.confirm');
  const r = btn.getBoundingClientRect();
  ov.style.setProperty('--ox', `${r.left + r.width / 2}px`); ov.style.setProperty('--oy', `${r.top + r.height / 2}px`);
  ov.className = 'ov show';
  document.body.style.overflow = 'hidden';
  const booked = { service: state.service, start: state.start, price: price() };
  let i = 0; procText(steps[0]);
  const tick = setInterval(() => procText(steps[Math.min(++i, steps.length - 1)]), 900);

  const call = sb.rpc('mvcd_book', {
    p_service: state.service.slug, p_start: state.start.toISOString(), p_city: f.city, p_address: f.address,
    p_name: f.name, p_phone: f.phone, p_email: f.email, p_vehicle: f.vehicle, p_notes: f.notes || '', p_first_time: !!f.first,
  });
  const [{ data: id, error }] = await Promise.all([call, sleep(2600)]);
  clearInterval(tick);

  if (error) {
    $('errtext').textContent = error.message.replace(/^.*?:\s*/, '') || 'Something went wrong. Please try again.';
    ov.classList.add('err');
    loadSlots();
    return;
  }
  // n8n: Google Calendar event + admin email (fire and forget)
  fetch(`${N8N}/booking`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: id }), keepalive: true }).catch(() => {});
  showConfirmed(id, f, booked);
});
$('errclose').onclick = () => { ov.className = 'ov'; document.body.style.overflow = ''; $('s3').scrollIntoView({ behavior: 'smooth', block: 'center' }); };

function showConfirmed(id, f, { service: s, start, price: paid }) {
  const end = new Date(+start + s.duration_min * 60e3);
  const ref = 'MV-' + id.slice(0, 6).toUpperCase();
  $('ref').textContent = `Reference ${ref} · invite sent to ${f.email}`;
  $('ticket').innerHTML = `<div><span>Package</span><b>${esc(s.name)}</b></div><div><span>Date</span><b>${fmtDay(start)}</b></div>
    <div><span>Time</span><b>${fmtTime(start)} – ${fmtTime(end)} ET</b></div><div><span>Address</span><b>${esc(f.address)}</b></div>
    <div><span>Starting price</span><b>${money(paid)}</b></div>`;
  $('waconfirm').href = wa(`Hi MV Car Detail! I just booked ${s.name} for ${fmtDay(start)} at ${fmtTime(start)} (ref ${ref}).\nName: ${f.name}\nVehicle: ${f.vehicle}\nAddress: ${f.address}\nCan you confirm? Thanks!`);

  const title = `MV Car Detail · ${s.name}`;
  const details = `Ref ${ref}. ${s.name} for your ${f.vehicle}. Questions: WhatsApp +1 954 268 7993`;
  const z = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = `/api/ics?${new URLSearchParams({ title, start: start.toISOString(), end: end.toISOString(), location: f.address, details })}`;
  const gcal = `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${z(start)}/${z(end)}`, location: f.address, details })}`;
  const apple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  $('altcal').href = apple ? gcal : ics;
  $('altcal').textContent = apple ? 'Use Google Calendar instead' : 'Use Apple / Outlook calendar (.ics)';

  ov.classList.add('done');
  icons(ov);
  const ok = $('ok'), remind = $('remind');
  // Spotlight the reminder button once the check animation lands
  setTimeout(() => { ok.classList.add('focus'); remind.focus({ preventScroll: true }); remind.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 1600);
  remind.onclick = () => {
    if (apple) location.href = ics; else window.open(gcal, '_blank', 'noopener');
    remind.classList.remove('spot'); remind.classList.add('on');
    $('remindtxt').textContent = 'Reminder on ✓';
    ok.classList.add('seen');
  };
  setTimeout(() => ok.classList.add('seen'), 7000);
}

// ---------- Recent work: ken-burns slideshow ----------
const gal = photos.filter(p => p.section === 'gallery');
$('kb').innerHTML = gal.map((p, i) => `<figure class="${i ? '' : 'on'}"><img src="${esc(p.url)}" alt="${esc(p.caption)}" ${i > 1 ? 'loading="lazy"' : ''}><figcaption>${esc(p.caption)}</figcaption></figure>`).join('');
$('thumbs').innerHTML = gal.map((p, i) => `<button type="button" class="${i ? '' : 'on'}" aria-label="${esc(p.caption)}"><img src="${esc(p.url)}" alt="" loading="lazy"></button>`).join('');
let cur = 0, timer;
const show = n => {
  const figs = $('kb').children, th = $('thumbs').children;
  if (!figs.length) return;
  figs[cur].classList.remove('on'); th[cur].classList.remove('on');
  cur = (n + figs.length) % figs.length;
  figs[cur].classList.add('on'); th[cur].classList.add('on');
  const strip = $('thumbs'); // scroll the strip only, never the page
  strip.scrollTo({ left: th[cur].offsetLeft - strip.clientWidth / 2 + 32, behavior: 'smooth' });
  clearInterval(timer); timer = setInterval(() => show(cur + 1), 5000);
};
$('thumbs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show([...$('thumbs').children].indexOf(b)); });
show(0);

// ---------- Init ----------
pickService(params.get('service'));
loadSlots();

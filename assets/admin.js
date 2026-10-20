import { sb, money, esc, fmtDay, fmtTime, N8N, sizeLabel } from '/assets/common.js';

const $ = id => document.getElementById(id);
const flash = el => { el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 1800); };

// ---------- Auth ----------
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  $('login').hidden = !!session;
  $('app').hidden = !session;
  if (session) { loadBookings(); loadServices(); loadOffer(); loadPhotos(); loadTestimonials(); loadGoogle(); loadPush(); }
}
$('loginform').onsubmit = async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const { error } = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
  $('loginerr').textContent = error ? 'Wrong email or password.' : '';
  if (!error) boot();
};
$('logout').onclick = async () => { await sb.auth.signOut(); boot(); };

// ---------- Tabs ----------
document.querySelector('.tabs').onclick = e => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b));
  document.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== b.dataset.tab);
};

// ---------- Bookings ----------
async function loadBookings() {
  const mode = $('bkfilter').value, now = new Date().toISOString();
  let q = sb.from('mvcd_bookings').select('*');
  if (mode === 'upcoming') q = q.gte('start_at', now).order('start_at');
  else if (mode === 'past') q = q.lt('start_at', now).order('start_at', { ascending: false });
  else q = q.order('start_at', { ascending: false });
  const { data } = await q.limit(200);
  $('bookings').innerHTML = (data || []).map(b => {
    const s = new Date(b.start_at);
    return `<article class="card bk" data-id="${b.id}">
      <div><b>${esc(b.name)}</b> · ${esc(b.service_name)} (${esc(sizeLabel(b.vehicle_size))}) · ${money(b.price)}${b.offer_applied ? ' (offer)' : ''}</div>
      <span class="st ${b.status}">${b.status}</span>
      <div class="meta">${fmtDay(s)} · ${fmtTime(s)} ET · ${esc(b.city)}<br>${esc(b.address)}<br>${esc(b.vehicle)} · ${esc(b.phone)} · ${esc(b.email)}${b.notes ? '<br>Notes: ' + esc(b.notes) : ''}</div>
      <div class="acts">
        <a class="btn small wa" target="_blank" rel="noopener" href="https://wa.me/${b.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '1$1')}?text=${encodeURIComponent(`Hi ${b.name}, this is MV Car Detail confirming your ${b.service_name} on ${fmtDay(s)} at ${fmtTime(s)}.`)}">WhatsApp</a>
        <a class="btn small" href="tel:${esc(b.phone)}">Call</a>
        ${b.status !== 'done' ? `<button class="btn small" data-status="done">Mark done</button>` : ''}
        ${b.status !== 'cancelled' ? `<button class="btn small danger" data-status="cancelled">Cancel</button>` : `<button class="btn small" data-status="confirmed">Restore</button>`}
      </div></article>`;
  }).join('') || '<p class="muted">No bookings here yet.</p>';
}
$('bkfilter').onchange = loadBookings;
$('bookings').onclick = async e => {
  const b = e.target.closest('[data-status]'); if (!b) return;
  const id = b.closest('[data-id]').dataset.id, status = b.dataset.status;
  if (status === 'cancelled' && !confirm('Cancel this booking? The time slot opens up again and the calendar event is removed.')) return;
  const { error } = await sb.from('mvcd_bookings').update({ status }).eq('id', id);
  if (error) return alert(error.message);
  if (status === 'cancelled') fetch(`${N8N}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: id }) }).catch(() => {});
  loadBookings();
};

// ---------- Services ----------
async function loadServices() {
  const { data } = await sb.from('mvcd_services').select('*').order('level');
  $('offerservice').innerHTML = (data || []).map(s => `<option value="${s.slug}">${esc(s.name)}</option>`).join('');
  $('services').innerHTML = (data || []).map(s => `<form class="card box" data-slug="${s.slug}">
    <div class="grid">
      <label class="field">Name<input type="text" name="name" value="${esc(s.name)}" required></label>
      <label class="field">Sedan / Coupe ($)<input type="number" name="price" min="0" step="1" value="${s.price}" required></label>
      <label class="field">SUV / Crossover ($)<input type="number" name="price_suv" min="0" step="1" value="${s.price_suv}" required></label>
      <label class="field">Truck / Large SUV / Van ($)<input type="number" name="price_truck" min="0" step="1" value="${s.price_truck}" required></label>
      <label class="field">Duration (minutes)<input type="number" name="duration_min" min="15" step="5" value="${s.duration_min}" required></label>
    </div>
    <label class="field">Short description<input type="text" name="tagline" value="${esc(s.tagline)}"></label>
    <label class="field">Card photo on /landing (URL, e.g. one from the Photos tab)<input type="text" name="image_url" value="${esc(s.image_url || '')}"></label>
    <label class="field">What's included (one per line)<textarea name="includes" rows="6">${esc(s.includes.join('\n'))}</textarea></label>
    <label class="field">Fine print<textarea name="note" rows="2">${esc(s.note)}</textarea></label>
    <div class="row">
      <label class="toggle"><input type="checkbox" name="popular" ${s.popular ? 'checked' : ''}> “Most popular” badge</label>
      <label class="toggle"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Visible on site</label>
    </div>
    <div class="row"><button class="btn primary" type="submit">Save ${esc(s.name)}</button><span class="saved">Saved ✓</span></div>
  </form>`).join('');
}
$('services').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, d = Object.fromEntries(new FormData(f));
  const row = {
    name: d.name.trim(), price: +d.price, price_suv: +d.price_suv, price_truck: +d.price_truck, duration_min: +d.duration_min, tagline: d.tagline.trim(), note: d.note.trim(), image_url: (d.image_url || '').trim(),
    includes: d.includes.split('\n').map(x => x.trim()).filter(Boolean), popular: !!d.popular, active: !!d.active,
  };
  const { error } = await sb.from('mvcd_services').update(row).eq('slug', f.dataset.slug);
  if (error) return alert(error.message);
  flash(f.querySelector('.saved'));
};

// ---------- Offer ----------
async function loadOffer() {
  const { data } = await sb.from('mvcd_settings').select('value').eq('key', 'offer').maybeSingle();
  const o = data?.value || {}, f = $('offerform');
  f.active.checked = !!o.active;
  ['price', 'code', 'headline', 'detail'].forEach(k => f[k].value = o[k] ?? '');
  setTimeout(() => o.service && (f.service.value = o.service));
}
$('offerform').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, d = Object.fromEntries(new FormData(f));
  const value = { active: !!d.active, service: d.service, price: +d.price, code: d.code.trim().toUpperCase(), headline: d.headline.trim(), detail: d.detail.trim() };
  const { error } = await sb.from('mvcd_settings').upsert({ key: 'offer', value });
  if (error) return alert(error.message);
  flash(f.querySelector('.saved'));
};

// ---------- Photos ----------
// Downscale to max 1600px WebP before upload: fast pages, small storage.
async function shrink(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/webp', .82));
}
async function upload(file, folder) {
  const blob = await shrink(file);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const { error } = await sb.storage.from('mvcd-media').upload(path, blob, { contentType: 'image/webp' });
  if (error) throw error;
  return sb.storage.from('mvcd-media').getPublicUrl(path).data.publicUrl;
}

async function loadPhotos() {
  const { data } = await sb.from('mvcd_photos').select('*').order('section').order('sort');
  $('photos').innerHTML = (data || []).map(p => `<form class="card ph" data-id="${p.id}">
    <img src="${esc(p.url)}" alt="" loading="lazy">
    <div class="f">
      <input type="text" name="caption" value="${esc(p.caption)}" placeholder="Caption">
      <input type="text" readonly value="${esc(p.url)}" onclick="this.select()" title="Photo link: copy it into a service's card photo" style="font-size:12px;min-height:36px;color:var(--muted)">
      <div class="row" style="flex-wrap:nowrap">
        <select name="section"><option value="gallery" ${p.section === 'gallery' ? 'selected' : ''}>Gallery</option><option value="hero" ${p.section === 'hero' ? 'selected' : ''}>Hero</option></select>
        <input type="number" name="sort" value="${p.sort}" title="Order" style="width:80px">
      </div>
      <div class="row"><button class="btn small primary" type="submit">Save</button><button class="btn small danger" type="button" data-del>Delete</button><span class="saved">✓</span></div>
    </div></form>`).join('');
}
$('photos').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, d = Object.fromEntries(new FormData(f));
  const { error } = await sb.from('mvcd_photos').update({ caption: d.caption, section: d.section, sort: +d.sort }).eq('id', f.dataset.id);
  if (error) return alert(error.message);
  flash(f.querySelector('.saved'));
};
$('photos').onclick = async e => {
  if (!e.target.matches('[data-del]') || !confirm('Delete this photo from the site?')) return;
  const f = e.target.closest('form');
  await sb.from('mvcd_photos').delete().eq('id', f.dataset.id);
  const url = f.querySelector('img').src, marker = '/mvcd-media/';
  if (url.includes(marker)) await sb.storage.from('mvcd-media').remove([url.split(marker)[1]]);
  loadPhotos();
};
async function addPhotos(files) {
  const drop = $('drop'), label = drop.querySelector('b'), old = label.textContent;
  const { data: last } = await sb.from('mvcd_photos').select('sort').order('sort', { ascending: false }).limit(1);
  let sort = (last?.[0]?.sort ?? 0) + 1;
  for (const [i, file] of [...files].entries()) {
    label.textContent = `Uploading ${i + 1}/${files.length}…`;
    try {
      const url = await upload(file, 'photos');
      await sb.from('mvcd_photos').insert({ url, caption: '', section: 'gallery', sort: sort++ });
    } catch (err) { alert(`${file.name}: ${err.message}`); }
  }
  label.textContent = old;
  loadPhotos();
}
$('files').onchange = e => addPhotos(e.target.files);
const drop = $('drop');
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); addPhotos(e.dataTransfer.files); };

// ---------- Google rating ----------
async function loadGoogle() {
  const { data } = await sb.from('mvcd_settings').select('value').eq('key', 'google').maybeSingle();
  const g = data?.value || {}, f = $('gform');
  ['rating', 'count', 'url'].forEach(k => f[k].value = g[k] ?? '');
}
$('gform').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  const value = { rating: +f.rating.value, count: +f.count.value, url: f.url.value.trim() };
  const { error } = await sb.from('mvcd_settings').upsert({ key: 'google', value });
  if (error) return alert(error.message);
  flash(f.querySelector('.saved'));
};

// ---------- Testimonials ----------
async function loadTestimonials() {
  const { data } = await sb.from('mvcd_testimonials').select('*').order('created_at', { ascending: false });
  $('tlist').innerHTML = (data || []).map(t => `<article class="card tm" data-id="${t.id}">
    ${t.photo_url ? `<img src="${esc(t.photo_url)}" alt="">` : '<span></span>'}
    <div><b>${esc(t.name)}</b> <span class="muted">${esc(t.vehicle)} · ${'★'.repeat(t.rating)}</span><p style="margin:6px 0 0">${esc(t.text)}</p></div>
    <div class="row" style="flex-direction:column;align-items:end">
      <label class="toggle"><input type="checkbox" data-pub ${t.published ? 'checked' : ''}> Published</label>
      <button class="btn small danger" data-del>Delete</button>
    </div></article>`).join('') || '<p class="muted">No testimonials yet. Add your first one above.</p>';
}
$('tform').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, d = new FormData(f), btn = f.querySelector('button');
  btn.disabled = true;
  try {
    const photo = d.get('photo');
    const photo_url = photo && photo.size ? await upload(photo, 'testimonials') : null;
    const { error } = await sb.from('mvcd_testimonials').insert({
      name: d.get('name').trim(), vehicle: d.get('vehicle').trim(), rating: +d.get('rating'), text: d.get('text').trim(), photo_url,
    });
    if (error) throw error;
    f.reset(); flash(f.querySelector('.saved')); loadTestimonials();
  } catch (err) { alert(err.message); }
  btn.disabled = false;
};
$('tlist').onclick = async e => {
  const card = e.target.closest('[data-id]'); if (!card) return;
  if (e.target.matches('[data-pub]')) await sb.from('mvcd_testimonials').update({ published: e.target.checked }).eq('id', card.dataset.id);
  if (e.target.matches('[data-del]') && confirm('Delete this testimonial?')) { await sb.from('mvcd_testimonials').delete().eq('id', card.dataset.id); loadTestimonials(); }
};

boot();

// ---------- Notifications ----------
async function loadPush() {
  const [{ count }, { data: sent }] = await Promise.all([
    sb.from('mvcd_push_subs').select('id', { count: 'exact', head: true }),
    sb.from('mvcd_push_messages').select('*').order('created_at', { ascending: false }).limit(30),
  ]);
  $('pushcount').textContent = `${count ?? 0} device${count === 1 ? '' : 's'} with notifications on`;
  $('pushlist').innerHTML = (sent || []).map(m => `<article class="card bk"><div><b>${esc(m.title)}</b><br><span class="meta">${esc(m.body)}</span></div>
    <span class="meta">${new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}<br>${m.sent} delivered${m.failed ? ` · ${m.failed} failed` : ''}</span></article>`).join('') || '<p class="muted">Nothing sent yet.</p>';
}
$('pushform').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, d = Object.fromEntries(new FormData(f)), btn = f.querySelector('button');
  if (!confirm(`Send "${d.title}" to everyone with notifications on?`)) return;
  btn.disabled = true; $('pushsaved').textContent = 'Sending…'; $('pushsaved').classList.add('on');
  const { data: { session } } = await sb.auth.getSession();
  const { data, error } = await sb.functions.invoke('mvcd-push', { body: { action: 'broadcast', ...d }, headers: { Authorization: `Bearer ${session?.access_token}` } });
  btn.disabled = false;
  $('pushsaved').textContent = error || data?.error ? `Error: ${data?.error || error.message}` : `Sent ✓ ${data.delivered} delivered`;
  if (!error && !data?.error) f.reset();
  loadPush();
};

// MV Car Detail push notifications (Web Push to the installed app / browser)
//   POST { action: 'confirm', booking_id }        -> "Booking confirmed" to the devices that subscribed with that booking (once, within 1 h)
//   POST { action: 'reminders' } + x-cron-secret  -> reminders ~24 h and ~2 h before each confirmed booking (pg_cron every 10 min)
//   POST { action: 'broadcast', title, body, url } + admin session -> message to every subscribed device
// Deployed with verify_jwt = false: each action authenticates itself as described above.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Sub = { id: number; endpoint: string; p256dh: string; auth: string };
type Booking = { id: string; service_name: string; start_at: string; created_at: string; city: string; address: string };

let secrets: Record<string, string> | null = null;
async function keys() {
  if (secrets) return secrets;
  const { data, error } = await db.from('mvcd_private').select('key,value');
  if (error) throw error;
  secrets = Object.fromEntries(data.map(r => [r.key, r.value]));
  webpush.setVapidDetails('mailto:mvcardetail01@gmail.com', secrets.vapid_public, secrets.vapid_private);
  return secrets;
}

async function send(subs: Sub[], payload: Record<string, string>) {
  let delivered = 0, failed = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
      delivered++;
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from('mvcd_push_subs').delete().eq('id', s.id); // device unsubscribed / app removed
    }
  }));
  return { delivered, failed };
}

const ET = 'America/New_York';
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' });
const atShop = (b: Booking) => (b.city || '').startsWith('Shop');
const where = (b: Booking) => (atShop(b) ? 'our shop, 3937 Pembroke Rd, Hollywood' : b.address);

async function devicesFor(bookingId: string): Promise<Sub[]> {
  const { data } = await db.from('mvcd_push_subs').select('id,endpoint,p256dh,auth').contains('booking_ids', [bookingId]);
  return data || [];
}
// The (booking_id, kind) primary key makes every notification fire at most once, even if cron runs overlap
async function once(bookingId: string, kind: string) {
  const { error } = await db.from('mvcd_push_sent').insert({ booking_id: bookingId, kind });
  return !error;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const k = await keys();

    if (body.action === 'confirm') {
      const { data: b } = await db.from('mvcd_bookings').select('*').eq('id', body.booking_id).maybeSingle();
      if (!b || Date.now() - new Date(b.created_at).getTime() > 3600e3) return json({ ok: false });
      const subs = await devicesFor(b.id);
      if (!subs.length) return json({ ok: false, reason: 'no device' });
      if (!(await once(b.id, 'confirm'))) return json({ ok: true, already: true });
      return json({ ok: true, ...(await send(subs, {
        title: 'Booking confirmed ✓',
        body: `${b.service_name} · ${when(b.start_at)} ET. We'll remind you before your appointment.`,
        url: '/', tag: `mvcd-${b.id}`,
      })) });
    }

    if (body.action === 'reminders') {
      if (req.headers.get('x-cron-secret') !== k.cron_secret) return json({ error: 'forbidden' }, 403);
      const now = Date.now();
      const { data: list } = await db.from('mvcd_bookings').select('*').eq('status', 'confirmed')
        .gt('start_at', new Date(now).toISOString()).lt('start_at', new Date(now + 24 * 3600e3 + 60e3).toISOString());
      let sent = 0;
      for (const b of (list || []) as Booking[]) {
        const start = new Date(b.start_at).getTime(), left = start - now;
        const subs = await devicesFor(b.id);
        if (!subs.length) continue;
        if (left <= 2 * 3600e3 + 60e3) {
          if (await once(b.id, '2h')) {
            await send(subs, {
              title: atShop(b) ? 'See you in about 2 hours' : 'We arrive in about 2 hours',
              body: `${b.service_name} at ${time(b.start_at)} · ${where(b)}`,
              url: '/', tag: `mvcd-${b.id}`,
            });
            sent++;
          }
        } else if (new Date(b.created_at).getTime() < start - 23 * 3600e3 && await once(b.id, '24h')) {
          await send(subs, {
            title: left > 12 * 3600e3 ? 'Your detail is tomorrow' : 'Your detail is today',
            body: `${b.service_name} at ${time(b.start_at)} ET. Need to change it? Tap to message us on WhatsApp.`,
            url: 'https://wa.me/19542687993', tag: `mvcd-${b.id}`,
          });
          sent++;
        }
      }
      return json({ ok: true, sent });
    }

    if (body.action === 'broadcast') {
      const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      const { data: { user } } = await db.auth.getUser(jwt);
      const { data: admin } = user
        ? await db.from('mvcd_admins').select('email').eq('email', (user.email || '').toLowerCase()).maybeSingle()
        : { data: null };
      if (!admin) return json({ error: 'forbidden' }, 403);
      const title = String(body.title || '').trim().slice(0, 80);
      const text = String(body.body || '').trim().slice(0, 240);
      let url = String(body.url || '/').trim();
      if (!/^(https?:\/\/|\/)/.test(url)) url = '/';
      if (!title || !text) return json({ error: 'Title and message are required' }, 400);
      const { data: subs } = await db.from('mvcd_push_subs').select('id,endpoint,p256dh,auth');
      const r = await send(subs || [], { title, body: text, url });
      await db.from('mvcd_push_messages').insert({ title, body: text, url, sent: r.delivered, failed: r.failed });
      return json({ ok: true, ...r });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

// GET /api/icon?s=192|512|maskable|180 -> the app icon for the logo published in the Site editor.
// The manifest and the iPhone touch icon point here, so a new logo becomes the app icon without a redeploy.
const SB = 'https://opagblruzwsrxsggkjsa.supabase.co';
const KEY = 'sb_publishable_O30dPx3jfAA3m2CUnw7nCQ_jsuZiwRj'; // public key; settings are readable by anyone (RLS)
const FALLBACK = { 192: '/icons/icon-192.png', 512: '/icons/icon-512.png', maskable: '/icons/maskable-512.png', 180: '/icons/apple-touch-icon.png' };

export default async function handler(req, res) {
  const size = String(req.query.s || '192');
  let url = FALLBACK[size] || FALLBACK[192];
  try {
    const r = await fetch(`${SB}/rest/v1/mvcd_settings?key=eq.theme&select=value`, { headers: { apikey: KEY } });
    const [row] = await r.json();
    const custom = row?.value?.icons?.[size];
    if (typeof custom === 'string' && custom.startsWith(`${SB}/storage/v1/object/public/mvcd-media/`)) url = custom;
  } catch { /* fall back to the bundled MV icon */ }
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400');
  res.redirect(302, url);
}

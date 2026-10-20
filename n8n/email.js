// Admin email template — Proyectum IA design (tables + inline styles for email clients). Prepended to n8n Code nodes by build.py.
const SITE = 'https://mvcardetail.com';
const PROYECTUM = 'https://ia.proyectumia.com';
const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function emailHtml({ kicker, title, intro, rows, buttons }) {
  const row = ([k, v]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #134753;font-family:Arial,sans-serif;font-size:13px;color:#8fb6bb;width:38%;vertical-align:top;">${h(k)}</td><td style="padding:9px 0;border-bottom:1px solid #134753;font-family:Arial,sans-serif;font-size:14px;color:#eafffd;font-weight:bold;">${h(v)}</td></tr>`;
  const btn = ([label, url], i) => `<a href="${h(url)}" style="display:inline-block;margin:0 8px 10px 0;padding:13px 22px;border-radius:999px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;${i === 0 ? 'background:#22FDF9;color:#03181c;' : 'background:#0a2933;color:#22FDF9;border:1px solid #134753;'}">${h(label)}</a>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${h(title)}</title></head>
<body style="margin:0;padding:0;background:#04141a;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04141a;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#071f27;border:1px solid #134753;border-radius:20px;overflow:hidden;">
  <tr><td style="background:linear-gradient(100deg,#22FDF9,#7ff5f2);background-color:#22FDF9;padding:24px 32px;text-align:center;">
    <span style="font-family:Arial,sans-serif;font-weight:bold;font-size:13px;letter-spacing:2px;color:#03181c;text-transform:uppercase;">Proyectum IA · MV Car Detail</span>
  </td></tr>
  <tr><td style="padding:34px 32px 8px;">
    <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#22FDF9;">${h(kicker)}</p>
    <h1 style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:24px;line-height:1.25;color:#eafffd;">${h(title)}</h1>
    <p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#c7e6e3;">${h(intro)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 24px;background:#0a2933;border:1px solid #134753;border-radius:14px;"><tr><td style="padding:10px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${rows.map(row).join('')}</table>
    </td></tr></table>
    <div>${buttons.map(btn).join('')}</div>
  </td></tr>
  <tr><td style="padding:16px 32px 8px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#0a2933;border:1px solid #22FDF9;border-radius:14px;"><tr><td style="padding:20px 22px;text-align:center;">
      <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;color:#eafffd;">Aprende a usar la IA TÚ:</p>
      <p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#c7e6e3;">Automatizaciones como esta, contenido y estrategia con Inteligencia Artificial para tu negocio.</p>
      <a href="${PROYECTUM}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#22FDF9;color:#03181c;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;">Conoce Proyectum IA →</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:20px 32px 30px;">
    <hr style="border:none;border-top:1px solid #134753;margin:0 0 16px;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:#8fb6bb;">
      Automatic notification for MV Car Detail · <a href="${SITE}" style="color:#22FDF9;">mvcardetail.com</a> · +1 954 268 7993<br>
      Built and automated by <a href="${PROYECTUM}" style="color:#22FDF9;">Proyectum IA</a> · contact@proyectumia.com
    </p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

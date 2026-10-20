// GET /api/ics?title&start&end&location&details -> calendar file with reminders.
// Served (not a blob) so iPhone Safari shows its native "Add to Calendar" sheet.
export default function handler(req, res) {
  const q = req.query;
  const start = new Date(q.start), end = new Date(q.end);
  if (isNaN(start) || isNaN(end)) return res.status(400).send('Bad dates');
  const z = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const t = s => String(s || '').slice(0, 500).replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MV Car Detail//Booking//EN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${z(start)}-${Math.random().toString(36).slice(2)}@mvcardetail`,
    `DTSTAMP:${z(new Date())}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`,
    `SUMMARY:${t(q.title || 'MV Car Detail appointment')}`,
    `LOCATION:${t(q.location)}`, `DESCRIPTION:${t(q.details)}`,
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Your car detail is tomorrow', 'END:VALARM',
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:MV Car Detail arrives in 2 hours', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="mv-car-detail.ics"');
  res.send(ics);
}

"""Generates the n8n workflow JSON files (run: python n8n/build.py).
Keeps the email HTML in one place (email.js) shared by both notification workflows."""
import json, pathlib

HERE = pathlib.Path(__file__).parent
EMAIL_JS = (HERE / 'email.js').read_text(encoding='utf-8')
SUPABASE = {'supabaseApi': {'id': 'THvLwrLqw5eFmIfU', 'name': 'Supabase · Proyectum IA (service role)'}}
GMAIL = {'gmailOAuth2': {'name': 'Marketing proyectum IA'}}
GCAL = {'googleCalendarOAuth2Api': {'name': 'Marketing Calendar'}}
ADMIN = 'mvcardetail01@gmail.com'


def node(name, type_, version, pos, params, creds=None, **extra):
    n = {'parameters': params, 'name': name, 'type': type_, 'typeVersion': version, 'position': pos}
    if creds:
        n['credentials'] = creds
    n.update(extra)
    return n


def chain(*names):
    return {a: {'main': [[{'node': b, 'type': 'main', 'index': 0}]]} for a, b in zip(names, names[1:])}


def webhook(path):
    return node('Webhook', 'n8n-nodes-base.webhook', 2, [0, 0], {
        'httpMethod': 'POST', 'path': path, 'responseMode': 'onReceived',
        'options': {'allowedOrigins': '*'},
    }, webhookId=path.replace('/', '-'))


def get_booking(pos):
    return node('Booking', 'n8n-nodes-base.supabase', 1, pos, {
        'operation': 'get', 'tableId': 'mvcd_bookings',
        'filters': {'conditions': [{'keyName': 'id', 'keyValue': '={{ $json.body.booking_id }}'}]},
    }, SUPABASE)


def if_node(name, pos, left, op, right=None):
    cond = {'id': name, 'leftValue': left, 'operator': op}
    if right is not None:
        cond['rightValue'] = right
    return node(name, 'n8n-nodes-base.if', 2, pos, {
        'conditions': {'options': {'caseSensitive': True, 'typeValidation': 'loose'}, 'combinator': 'and', 'conditions': [cond]},
        'options': {},
    })


def gmail(pos):
    return node('Email admin', 'n8n-nodes-base.gmail', 2.1, pos, {
        'sendTo': ADMIN, 'subject': '={{ $json.subject }}', 'emailType': 'html', 'message': '={{ $json.html }}',
        'options': {'appendAttribution': False, 'senderName': 'MV Car Detail · Proyectum IA'},
    }, GMAIL)


def code(name, pos, js):
    return node(name, 'n8n-nodes-base.code', 2, pos, {'jsCode': js})


# ---------- 1. New booking: Calendar event + invite to client, admin email ----------
booking_js = EMAIL_JS + r"""
const b = $('Booking').first().json;
const size = { sedan: 'Sedan / Coupe', suv: 'SUV / Crossover', truck: 'Truck / Large SUV / Van' }[b.vehicle_size] || 'Sedan / Coupe';
const start = DateTime.fromISO(b.start_at).setZone('America/New_York');
const end = start.plus({ minutes: Math.round((new Date(b.end_at) - new Date(b.start_at)) / 60000) - 30 }); // without travel buffer
return [{ json: {
  ...b,
  ev_start: start.toISO(), ev_end: end.toISO(),
  ev_title: `MV Car Detail · ${b.service_name} · ${b.name}`,
  ev_desc: `${b.service_name} — starting at $${b.price}${b.offer_applied ? ' (first-time offer)' : ''}\nVehicle: ${b.vehicle} (${size})\nPhone: ${b.phone}\nNotes: ${b.notes || '-'}\n\nQuestions or changes: English (786) 568-6564 · Español / WhatsApp (954) 268-7993\n[mvcd:${b.id}]`,
  subject: `New booking: ${b.service_name} · ${start.toFormat('ccc LLL d, h:mm a')} · ${b.name}`,
  html: emailHtml({
    kicker: 'New booking', title: `${b.name} booked ${b.service_name}`,
    intro: 'A new appointment was booked on the website. It is already on Google Calendar and the client received the invite.',
    rows: [
      ['Package', b.service_name], ['Starting price', `$${b.price}${b.offer_applied ? ' · first-time offer' : ''}`],
      ['Date', start.toFormat('cccc, LLLL d')], ['Time', `${start.toFormat('h:mm a')} – ${end.toFormat('h:mm a')} ET`],
      ['Where', b.city], ['Address', b.address], ['Vehicle', `${b.vehicle} · ${size}`], ['Client', b.name], ['Phone', b.phone], ['Email', b.email], ['Notes', b.notes || '—'],
    ],
    buttons: [
      ['WhatsApp client', `https://wa.me/${b.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '1$1')}?text=${encodeURIComponent(`Hi ${b.name}! This is MV Car Detail confirming your ${b.service_name} on ${start.toFormat('cccc LLL d')} at ${start.toFormat('h:mm a')}.`)}`],
      ['Open admin panel', `${SITE}/admin`],
    ],
  }),
} }];
"""
booking = {
    'name': 'MV Car Detail · Nueva reserva',
    'nodes': [
        webhook('mvcd/booking'),
        get_booking([220, 0]),
        if_node('Not synced yet', [440, 0], '={{ $json.gcal_event_id }}', {'type': 'string', 'operation': 'empty', 'singleValue': True}),
        code('Prepare', [660, 0], booking_js),
        node('Calendar event', 'n8n-nodes-base.googleCalendar', 1.3, [880, 0], {
            'calendar': {'__rl': True, 'value': 'primary', 'mode': 'list'},
            'start': '={{ $json.ev_start }}', 'end': '={{ $json.ev_end }}',
            'additionalFields': {
                'summary': '={{ $json.ev_title }}', 'description': '={{ $json.ev_desc }}', 'location': '={{ $json.address }}',
                'attendees': ['={{ $json.email }}', ADMIN], 'sendUpdates': 'all',
            },
        }, GCAL),
        node('Save event id', 'n8n-nodes-base.supabase', 1, [1100, 0], {
            'operation': 'update', 'tableId': 'mvcd_bookings', 'filterType': 'manual', 'matchType': 'allFilters',
            'filters': {'conditions': [{'keyName': 'id', 'condition': 'eq', 'keyValue': "={{ $('Prepare').first().json.id }}"}]},
            'fieldsUi': {'fieldValues': [{'fieldId': 'gcal_event_id', 'fieldValue': '={{ $json.id }}'}]},
        }, SUPABASE),
        code('Email data', [1320, 0], "return [{ json: $('Prepare').first().json }];"),
        gmail([1540, 0]),
    ],
    'connections': {
        **chain('Webhook', 'Booking', 'Not synced yet'),
        'Not synced yet': {'main': [[{'node': 'Prepare', 'type': 'main', 'index': 0}], []]},
        **chain('Prepare', 'Calendar event', 'Save event id', 'Email data', 'Email admin'),
    },
    'settings': {'executionOrder': 'v1'},
}

# ---------- 2. Cancellation from the admin panel ----------
cancel_js = EMAIL_JS + r"""
const b = $('Booking').first().json;
const start = DateTime.fromISO(b.start_at).setZone('America/New_York');
return [{ json: { ...b,
  subject: `Booking cancelled: ${b.service_name} · ${start.toFormat('ccc LLL d, h:mm a')} · ${b.name}`,
  html: emailHtml({
    kicker: 'Booking cancelled', title: `${b.name}'s ${b.service_name} was cancelled`,
    intro: 'The booking was cancelled from the admin panel. The time slot is open again on the website and the Google Calendar event was removed (the client was notified by Google).',
    rows: [['Package', b.service_name], ['Was scheduled', `${start.toFormat('cccc, LLLL d · h:mm a')} ET`], ['Client', b.name], ['Phone', b.phone], ['Email', b.email]],
    buttons: [['Open admin panel', `${SITE}/admin`]],
  }) } }];
"""
cancel = {
    'name': 'MV Car Detail · Reserva cancelada',
    'nodes': [
        webhook('mvcd/cancel'),
        get_booking([220, 0]),
        if_node('Really cancelled', [440, 0], '={{ $json.status }}', {'type': 'string', 'operation': 'equals'}, 'cancelled'),
        code('Prepare', [660, 0], cancel_js),
        if_node('Has event', [880, 0], '={{ $json.gcal_event_id }}', {'type': 'string', 'operation': 'notEmpty', 'singleValue': True}),
        node('Delete event', 'n8n-nodes-base.googleCalendar', 1.3, [1100, -100], {
            'operation': 'delete', 'calendar': {'__rl': True, 'value': 'primary', 'mode': 'list'},
            'eventId': '={{ $json.gcal_event_id }}', 'options': {'sendUpdates': 'all'},
        }, GCAL, continueOnFail=True),
        code('Email data', [1320, 0], "return [{ json: $('Prepare').first().json }];"),
        gmail([1540, 0]),
    ],
    'connections': {
        **chain('Webhook', 'Booking', 'Really cancelled'),
        'Really cancelled': {'main': [[{'node': 'Prepare', 'type': 'main', 'index': 0}], []]},
        'Prepare': {'main': [[{'node': 'Has event', 'type': 'main', 'index': 0}]]},
        'Has event': {'main': [[{'node': 'Delete event', 'type': 'main', 'index': 0}], [{'node': 'Email data', 'type': 'main', 'index': 0}]]},
        **chain('Delete event', 'Email data', 'Email admin'),
    },
    'settings': {'executionOrder': 'v1'},
}

# ---------- 3. Google Calendar -> website availability (every 5 min) ----------
sync_js = r"""
// Busy blocks from Google Calendar that did NOT come from a website booking (those are already in mvcd_slots).
const events = [];
for (const { json: e } of $input.all()) {
  if (!e.id || e.status === 'cancelled' || e.transparency === 'transparent') continue;
  if ((e.description || '').includes('[mvcd:')) continue;
  const start = e.start?.dateTime || (e.start?.date && DateTime.fromISO(e.start.date, { zone: 'America/New_York' }).toISO());
  const end = e.end?.dateTime || (e.end?.date && DateTime.fromISO(e.end.date, { zone: 'America/New_York' }).toISO());
  if (start && end) events.push({ id: e.id, start, end });
}
return [{ json: { events } }];
"""
sync = {
    'name': 'MV Car Detail · Sincronizar Google Calendar',
    'nodes': [
        node('Every 5 minutes', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 0], {'rule': {'interval': [{'field': 'minutes', 'minutesInterval': 5}]}}),
        node('Calendar events', 'n8n-nodes-base.googleCalendar', 1.3, [220, 0], {
            'operation': 'getAll', 'calendar': {'__rl': True, 'value': 'primary', 'mode': 'list'}, 'returnAll': True,
            'timeMin': '={{ $now.toISO() }}', 'timeMax': '={{ $now.plus({ days: 45 }).toISO() }}',
            'options': {'singleEvents': True},
        }, GCAL, alwaysOutputData=True),
        code('Busy blocks', [440, 0], sync_js),
        node('Save to Supabase', 'n8n-nodes-base.httpRequest', 4.2, [660, 0], {
            'method': 'POST', 'url': 'https://opagblruzwsrxsggkjsa.supabase.co/rest/v1/rpc/mvcd_sync_gcal',
            'authentication': 'predefinedCredentialType', 'nodeCredentialType': 'supabaseApi',
            'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ JSON.stringify({ p_events: $json.events }) }}', 'options': {},
        }, SUPABASE),
    ],
    'connections': chain('Every 5 minutes', 'Calendar events', 'Busy blocks', 'Save to Supabase'),
    'settings': {'executionOrder': 'v1'},
}

for fname, wf in [('mvcd-reserva.workflow.json', booking), ('mvcd-cancelacion.workflow.json', cancel), ('mvcd-sync-calendar.workflow.json', sync)]:
    (HERE / fname).write_text(json.dumps(wf, ensure_ascii=False, indent=2), encoding='utf-8')
    print('wrote', fname)

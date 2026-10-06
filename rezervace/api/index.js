import { randomBytes } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PIN = process.env.ADMIN_PIN;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PUBLIC_URL = process.env.PUBLIC_URL;

const TZ = 'Europe/Prague';
const SLOT_STEP = 30;
const DEFAULT_DURATION = 60;
const DEFAULT_VALVE_HOURS = 48;

/* ---------- databáze ---------- */

async function db(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
    },
  });
  if (!res.ok) throw new Error(`DB ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const selectOne = async (path) => (await db(path))[0] || null;

/* ---------- čas ---------- */

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const fromMin = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function tzOffsetMinutes(ts) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
    .formatToParts(new Date(ts))
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  const asUTC = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second,
  );
  return (asUTC - Math.floor(ts / 1000) * 1000) / 60000;
}

// Místní pražský čas (den + minuty od půlnoci) na UTC timestamp.
function localToTs(day, minutes) {
  const [y, m, d] = day.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let ts = naive;
  for (let i = 0; i < 2; i++) ts = naive - tzOffsetMinutes(ts) * 60000;
  return ts;
}

function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// ISO týden — pondělí jako první den.
function weekRange(day) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const shift = (dt.getUTCDay() + 6) % 7;
  const monday = new Date(dt.getTime() - shift * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  return [monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
}

/* ---------- logika řetězu ----------
   Rezervace musí navazovat na už obsazený čas, aby Anince nevznikaly
   mezery mezi tréninky. Výjimky: prázdný blok (kotva) a pojistka,
   která před blížícím se dnem otevře celé okno. */

export function computeDaySlots({ day, blocks, bookings, valveHours, nowTs, duration = DEFAULT_DURATION }) {
  const slots = [];

  for (const block of blocks) {
    const blockStart = toMin(block.start_time);
    const blockEnd = toMin(block.end_time);

    const inBlock = bookings
      .map((b) => ({ start: toMin(b.start_time), end: toMin(b.start_time) + b.duration_min }))
      .filter((b) => b.start >= blockStart && b.start < blockEnd);

    const valveOpen = localToTs(day, blockStart) - nowTs <= valveHours * 3600000;

    const candidates = new Set();
    for (let t = blockStart; t + duration <= blockEnd; t += SLOT_STEP) candidates.add(t);
    // Časy těsně před a za rezervací drží řetěz spojitý i mimo mřížku.
    for (const b of inBlock) {
      if (b.start - duration >= blockStart) candidates.add(b.start - duration);
      if (b.end + duration <= blockEnd) candidates.add(b.end);
    }

    for (const start of [...candidates].sort((a, z) => a - z)) {
      const end = start + duration;
      if (start < blockStart || end > blockEnd) continue;
      if (localToTs(day, start) <= nowTs) continue;
      if (inBlock.some((b) => start < b.end && end > b.start)) continue;

      const available =
        inBlock.length === 0 ||
        valveOpen ||
        inBlock.some((b) => end === b.start || start === b.end);

      if (available) slots.push({ start: fromMin(start), end: fromMin(end) });
    }
  }

  // Překrývající se okna na jednom dni by jinak nabídla stejný čas dvakrát.
  const unique = new Map(slots.map((s) => [s.start, s]));
  return [...unique.values()].sort((a, z) => a.start.localeCompare(z.start));
}

async function slotsForDay(day, duration = DEFAULT_DURATION) {
  const [blocks, bookings, valve] = await Promise.all([
    db(`availability?day=eq.${day}&order=start_time`),
    db(`bookings?day=eq.${day}&status=eq.confirmed&select=start_time,duration_min`),
    settingValue('valve_hours', DEFAULT_VALVE_HOURS),
  ]);
  return {
    slots: computeDaySlots({ day, blocks, bookings, valveHours: valve, nowTs: Date.now(), duration }),
    occupied: bookings
      .map((b) => ({ start: b.start_time.slice(0, 5), end: fromMin(toMin(b.start_time) + b.duration_min) }))
      .sort((a, z) => a.start.localeCompare(z.start)),
    hasWindow: blocks.length > 0,
  };
}

async function settingValue(key, fallback) {
  const row = await selectOne(`settings?key=eq.${key}&select=value`);
  return row ? row.value : fallback;
}

async function saveSetting(key, value) {
  await db('settings', { method: 'POST', body: { key, value }, prefer: 'resolution=merge-duplicates' });
}

/* ---------- autentizace ---------- */

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');
const newToken = () => randomBytes(24).toString('hex');

async function authClient(token) {
  if (!token) throw httpError(401, 'Nejsi přihlášený.');
  const session = await selectOne(`sessions?token=eq.${token}&select=client_id,is_admin`);
  if (!session || !session.client_id) throw httpError(401, 'Přihlášení vypršelo.');
  const client = await selectOne(`clients?id=eq.${session.client_id}`);
  if (!client || !client.is_active) throw httpError(401, 'Účet je neaktivní.');
  return client;
}

async function authAdmin(token) {
  if (!token) throw httpError(401, 'Nejsi přihlášený.');
  const session = await selectOne(`sessions?token=eq.${token}&select=is_admin`);
  if (!session || !session.is_admin) throw httpError(401, 'Nemáš oprávnění.');
  return true;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/* ---------- balíčky a kredit ---------- */

async function activePackage(clientId, day) {
  const rows = await db(
    `packages?client_id=eq.${clientId}&is_active=is.true&order=created_at.desc`,
  );
  return (
    rows.find((p) => {
      if (p.valid_from && day < p.valid_from) return false;
      if (p.valid_to && day > p.valid_to) return false;
      return p.kind === 'weekly' || p.credits_used < p.credits_total;
    }) || null
  );
}

function describePackage(pkg) {
  if (!pkg) return null;
  return pkg.kind === 'credits'
    ? { kind: 'credits', remaining: pkg.credits_total - pkg.credits_used, total: pkg.credits_total }
    : { kind: 'weekly', weeklyLimit: pkg.weekly_limit, validTo: pkg.valid_to };
}

async function assertCanBook(client, day, pkg) {
  if (!pkg) throw httpError(400, 'Nemáš aktivní balíček. Ozvi se Anince.');

  if (pkg.kind === 'credits' && pkg.credits_used >= pkg.credits_total) {
    throw httpError(400, 'Vyčerpal jsi všechny tréninky z balíčku.');
  }

  if (pkg.kind === 'weekly') {
    const [from, to] = weekRange(day);
    const booked = await db(
      `bookings?client_id=eq.${client.id}&status=eq.confirmed&day=gte.${from}&day=lte.${to}&select=id`,
    );
    if (booked.length >= pkg.weekly_limit) {
      throw httpError(
        400,
        `Tvůj balíček má ${pkg.weekly_limit} tréninky týdně a tenhle týden už je máš. Napiš Anince, pokud chceš přidat.`,
      );
    }
  }
}

/* ---------- Google Kalendář ---------- */

async function googleAccessToken() {
  const refresh = await settingValue('gcal_refresh_token', null);
  if (!refresh || !GOOGLE_CLIENT_ID) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) return null;
  return (await res.json()).access_token;
}

// Událost v Aninině kalendáři s klientem jako hostem — pozvánku do mailu
// rozešle Google sám, takže žádná druhá e-mailová služba není potřeba.
async function createCalendarEvent(booking, client) {
  const token = await googleAccessToken();
  if (!token) return null;

  const startMin = toMin(booking.start_time);
  const pad = (m) => `${booking.day}T${fromMin(m)}:00`;

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: `Trénink — ${client.first_name} ${client.last_name}`,
        description: `Telefon: ${client.phone}\nDélka: ${booking.duration_min} min`,
        start: { dateTime: pad(startMin), timeZone: TZ },
        end: { dateTime: pad(startMin + booking.duration_min), timeZone: TZ },
        attendees: client.email ? [{ email: client.email }] : [],
      }),
    },
  );
  if (!res.ok) return null;
  return (await res.json()).id;
}

async function deleteCalendarEvent(eventId) {
  if (!eventId) return;
  const token = await googleAccessToken();
  if (!token) return;
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  ).catch(() => {});
}

/* ---------- akce klienta ---------- */

const actions = {};

actions.register = async ({ first_name, last_name, phone, email }) => {
  const digits = normalizePhone(phone);
  if (!first_name?.trim() || !last_name?.trim()) throw httpError(400, 'Vyplň jméno i příjmení.');
  if (digits.length < 9) throw httpError(400, 'Zadej platné telefonní číslo.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) throw httpError(400, 'Zadej platný e-mail.');

  const existing = await selectOne(`clients?phone=eq.${digits}`);
  if (existing) throw httpError(400, 'Tohle číslo je už zaregistrované — stačí se přihlásit.');

  const [client] = await db('clients', {
    method: 'POST',
    body: {
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      phone: digits,
      email: email.trim().toLowerCase(),
    },
  });
  return issueSession(client);
};

actions.login = async ({ phone }) => {
  const digits = normalizePhone(phone);
  const client = await selectOne(`clients?phone=eq.${digits}`);
  if (!client) throw httpError(404, 'Tohle číslo neznáme. Zaregistruj se.');
  if (!client.is_active) throw httpError(403, 'Účet je neaktivní. Ozvi se Anince.');
  return issueSession(client);
};

async function issueSession(client) {
  const token = newToken();
  await db('sessions', { method: 'POST', body: { token, client_id: client.id } });
  return { token, client: publicClient(client) };
}

const publicClient = (c) => ({
  id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email,
});

actions.me = async ({ token }) => {
  const client = await authClient(token);
  const today = todayLocal();
  const [pkg, bookings] = await Promise.all([
    activePackage(client.id, today),
    db(
      `bookings?client_id=eq.${client.id}&status=eq.confirmed&day=gte.${today}&order=day,start_time&select=id,day,start_time,duration_min`,
    ),
  ]);

  let weekUsed = null;
  if (pkg?.kind === 'weekly') {
    const [from, to] = weekRange(today);
    const rows = await db(
      `bookings?client_id=eq.${client.id}&status=eq.confirmed&day=gte.${from}&day=lte.${to}&select=id`,
    );
    weekUsed = rows.length;
  }

  return {
    client: publicClient(client),
    package: describePackage(pkg),
    weekUsed,
    bookings: bookings.map((b) => ({
      id: b.id, day: b.day, start: b.start_time.slice(0, 5),
      end: fromMin(toMin(b.start_time) + b.duration_min), duration: b.duration_min,
    })),
  };
};

actions.slots = async ({ token, day }) => {
  await authClient(token);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) throw httpError(400, 'Neplatné datum.');
  return slotsForDay(day);
};

actions.days = async ({ token, from, to }) => {
  await authClient(token);
  const blocks = await db(`availability?day=gte.${from}&day=lte.${to}&select=day`);
  return { days: [...new Set(blocks.map((b) => b.day))].sort() };
};

actions.book = async ({ token, day, start }) => {
  const client = await authClient(token);
  const pkg = await activePackage(client.id, day);
  await assertCanBook(client, day, pkg);

  // Dostupnost se počítá znovu na serveru — klientovi se nevěří.
  const { slots } = await slotsForDay(day);
  if (!slots.some((s) => s.start === start)) {
    throw httpError(409, 'Tenhle čas už není volný. Vyber jiný.');
  }

  const [booking] = await db('bookings', {
    method: 'POST',
    body: {
      client_id: client.id, package_id: pkg.id, day, start_time: start,
      duration_min: DEFAULT_DURATION, created_by: 'client',
    },
  });

  if (pkg.kind === 'credits') {
    await db(`packages?id=eq.${pkg.id}`, {
      method: 'PATCH', body: { credits_used: pkg.credits_used + 1 },
    });
  }

  const eventId = await createCalendarEvent(booking, client).catch(() => null);
  if (eventId) {
    await db(`bookings?id=eq.${booking.id}`, { method: 'PATCH', body: { gcal_event_id: eventId } });
  }

  return { ok: true, booking: { id: booking.id, day, start, end: fromMin(toMin(start) + DEFAULT_DURATION) } };
};

/* ---------- akce administrace ---------- */

actions.admin_login = async ({ pin }) => {
  if (!ADMIN_PIN || String(pin) !== String(ADMIN_PIN)) throw httpError(401, 'Špatný PIN.');
  const token = newToken();
  await db('sessions', { method: 'POST', body: { token, is_admin: true } });
  return { token };
};

actions.admin_clients = async ({ token }) => {
  await authAdmin(token);
  const today = todayLocal();
  const [clients, packages, bookings] = await Promise.all([
    db('clients?order=first_name'),
    db('packages?is_active=is.true'),
    db(`bookings?status=eq.confirmed&day=gte.${today}&select=client_id,day,start_time,duration_min`),
  ]);

  return {
    clients: clients.map((c) => {
      const pkg = packages.find((p) => {
        if (p.client_id !== c.id) return false;
        if (p.valid_from && today < p.valid_from) return false;
        if (p.valid_to && today > p.valid_to) return false;
        return true;
      });
      return {
        ...publicClient(c),
        note: c.note,
        is_active: c.is_active,
        package: describePackage(pkg),
        packageId: pkg?.id || null,
        upcoming: bookings.filter((b) => b.client_id === c.id).length,
      };
    }),
  };
};

actions.admin_client_update = async ({ token, id, ...fields }) => {
  await authAdmin(token);
  const allowed = ['first_name', 'last_name', 'email', 'note', 'is_active'];
  const body = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(body).length) throw httpError(400, 'Nic k uložení.');
  await db(`clients?id=eq.${id}`, { method: 'PATCH', body });
  return { ok: true };
};

actions.admin_package_set = async ({ token, client_id, kind, credits_total, weekly_limit, valid_from, valid_to }) => {
  await authAdmin(token);
  await db(`packages?client_id=eq.${client_id}&is_active=is.true`, {
    method: 'PATCH', body: { is_active: false },
  });
  if (kind === 'none') return { ok: true };

  const [pkg] = await db('packages', {
    method: 'POST',
    body: {
      client_id, kind,
      credits_total: kind === 'credits' ? Number(credits_total) || 0 : 0,
      weekly_limit: kind === 'weekly' ? Number(weekly_limit) || 0 : 0,
      valid_from: valid_from || null,
      valid_to: valid_to || null,
    },
  });
  return { ok: true, package: pkg };
};

actions.admin_credits_adjust = async ({ token, package_id, delta }) => {
  await authAdmin(token);
  const pkg = await selectOne(`packages?id=eq.${package_id}`);
  if (!pkg) throw httpError(404, 'Balíček nenalezen.');
  await db(`packages?id=eq.${package_id}`, {
    method: 'PATCH', body: { credits_total: Math.max(pkg.credits_used, pkg.credits_total + Number(delta)) },
  });
  return { ok: true };
};

actions.admin_availability = async ({ token, from, to }) => {
  await authAdmin(token);
  const [blocks, bookings] = await Promise.all([
    db(`availability?day=gte.${from}&day=lte.${to}&order=day,start_time`),
    db(`bookings?status=eq.confirmed&day=gte.${from}&day=lte.${to}&order=day,start_time&select=id,day,start_time,duration_min,client_id`),
  ]);
  const clients = await db('clients?select=id,first_name,last_name,phone');
  return {
    blocks: blocks.map((b) => ({ id: b.id, day: b.day, start: b.start_time.slice(0, 5), end: b.end_time.slice(0, 5) })),
    bookings: bookings.map((b) => {
      const c = clients.find((x) => x.id === b.client_id);
      return {
        id: b.id, day: b.day, start: b.start_time.slice(0, 5),
        end: fromMin(toMin(b.start_time) + b.duration_min), duration: b.duration_min,
        client: c ? `${c.first_name} ${c.last_name}` : '—', phone: c?.phone || '',
      };
    }),
  };
};

actions.admin_availability_add = async ({ token, days, start, end }) => {
  await authAdmin(token);
  if (toMin(end) - toMin(start) < DEFAULT_DURATION) throw httpError(400, 'Okno musí být aspoň hodinu dlouhé.');
  const rows = days.map((day) => ({ day, start_time: start, end_time: end }));
  await db('availability', { method: 'POST', body: rows });
  return { ok: true, added: rows.length };
};

actions.admin_availability_delete = async ({ token, id }) => {
  await authAdmin(token);
  await db(`availability?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
  return { ok: true };
};

// Ruční rezervace Aniny — obchází řetěz i týdenní limit a umí 90 minut.
actions.admin_book = async ({ token, client_id, day, start, duration }) => {
  await authAdmin(token);
  const client = await selectOne(`clients?id=eq.${client_id}`);
  if (!client) throw httpError(404, 'Klient nenalezen.');

  const dur = Number(duration) === 90 ? 90 : 60;
  const existing = await db(`bookings?day=eq.${day}&status=eq.confirmed&select=start_time,duration_min`);
  const startMin = toMin(start);
  const clash = existing.some((b) => {
    const s = toMin(b.start_time);
    return startMin < s + b.duration_min && startMin + dur > s;
  });
  if (clash) throw httpError(409, 'V tomhle čase už trénink je.');

  const pkg = await activePackage(client_id, day);
  const [booking] = await db('bookings', {
    method: 'POST',
    body: {
      client_id, package_id: pkg?.id || null, day, start_time: start,
      duration_min: dur, created_by: 'admin',
    },
  });

  if (pkg?.kind === 'credits') {
    const cost = dur === 90 ? 2 : 1;
    await db(`packages?id=eq.${pkg.id}`, {
      method: 'PATCH', body: { credits_used: Math.min(pkg.credits_total, pkg.credits_used + cost) },
    });
  }

  const eventId = await createCalendarEvent(booking, client).catch(() => null);
  if (eventId) await db(`bookings?id=eq.${booking.id}`, { method: 'PATCH', body: { gcal_event_id: eventId } });

  return { ok: true };
};

actions.admin_cancel = async ({ token, id, refund }) => {
  await authAdmin(token);
  const booking = await selectOne(`bookings?id=eq.${id}`);
  if (!booking) throw httpError(404, 'Rezervace nenalezena.');

  await db(`bookings?id=eq.${id}`, {
    method: 'PATCH', body: { status: 'cancelled', cancelled_at: new Date().toISOString() },
  });

  if (refund && booking.package_id) {
    const pkg = await selectOne(`packages?id=eq.${booking.package_id}`);
    if (pkg?.kind === 'credits') {
      const cost = booking.duration_min === 90 ? 2 : 1;
      await db(`packages?id=eq.${pkg.id}`, {
        method: 'PATCH', body: { credits_used: Math.max(0, pkg.credits_used - cost) },
      });
    }
  }

  await deleteCalendarEvent(booking.gcal_event_id);
  return { ok: true };
};

actions.admin_status = async ({ token }) => {
  await authAdmin(token);
  const refresh = await settingValue('gcal_refresh_token', null);
  const valve = await settingValue('valve_hours', DEFAULT_VALVE_HOURS);
  return { calendarConnected: Boolean(refresh), valveHours: valve, canConnect: Boolean(GOOGLE_CLIENT_ID) };
};

actions.admin_set_valve = async ({ token, hours }) => {
  await authAdmin(token);
  await saveSetting('valve_hours', Math.max(0, Number(hours) || 0));
  return { ok: true };
};

/* ---------- router ---------- */

export default async function handler(req, res) {
  try {
    if (req.method === 'GET' && req.query.gcal) return googleOAuth(req, res);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action, ...params } = req.body || {};
    const fn = actions[action];
    if (!fn) return res.status(400).json({ error: 'Neznámá akce.' });

    return res.status(200).json(await fn(params));
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    return res.status(status).json({ error: status === 500 ? 'Něco se pokazilo.' : err.message });
  }
}

async function googleOAuth(req, res) {
  const redirectUri = `${PUBLIC_URL}/api?gcal=callback`;

  if (req.query.gcal === 'start') {
    if (String(req.query.pin) !== String(ADMIN_PIN)) return res.status(401).send('Špatný PIN.');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
    });
    return res.redirect(url.toString());
  }

  if (req.query.gcal === 'callback') {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const data = await tokenRes.json();
    if (!data.refresh_token) return res.status(400).send('Google nevrátil refresh token. Zkus to znovu.');
    await saveSetting('gcal_refresh_token', data.refresh_token);
    return res.redirect('/admin.html?gcal=ok');
  }

  return res.status(400).send('Neznámý parametr.');
}

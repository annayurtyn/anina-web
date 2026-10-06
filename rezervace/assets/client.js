const API = '/api';
const TOKEN_KEY = 'aninka_token';

const MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
const DOW = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

const $ = (id) => document.getElementById(id);

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  me: null,
  cursor: null,      // první den zobrazeného měsíce
  openDays: new Set(),
  selected: null,
};

/* ---------- komunikace ---------- */

async function call(action, params = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token: state.token, ...params }),
  });
  const data = await res.json().catch(() => ({ error: 'Server neodpovídá.' }));
  if (!res.ok) throw new Error(data.error || 'Něco se pokazilo.');
  return data;
}

function notify(target, text, kind = 'error') {
  $(target).innerHTML = text ? `<div class="msg msg--${kind}">${escapeHtml(text)}</div>` : '';
  if (text) $(target).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Čeština skloňuje jinak pro 1, pro 2–4 a pro zbytek včetně nuly.
const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

/* ---------- datum ---------- */

const iso = (d) => d.toISOString().slice(0, 10);
const startOfMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonths = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
const daysInMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function prettyDate(dayIso) {
  const [y, m, d] = dayIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DOW[(dt.getUTCDay() + 6) % 7]} ${d}. ${m}. ${y}`;
}

/* ---------- přihlášení ---------- */

$('toRegister').onclick = () => { $('loginBox').hidden = true; $('registerBox').hidden = false; notify('authMsg', ''); };
$('toLogin').onclick = () => { $('registerBox').hidden = true; $('loginBox').hidden = false; notify('authMsg', ''); };

$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    const { token } = await call('login', { phone: $('loginPhone').value });
    localStorage.setItem(TOKEN_KEY, token);
    state.token = token;
    await boot();
  } catch (err) {
    notify('authMsg', err.message);
  } finally {
    btn.disabled = false;
  }
};

$('registerForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    const { token } = await call('register', {
      first_name: $('regFirst').value,
      last_name: $('regLast').value,
      phone: $('regPhone').value,
      email: $('regEmail').value,
    });
    localStorage.setItem(TOKEN_KEY, token);
    state.token = token;
    await boot();
  } catch (err) {
    notify('authMsg', err.message);
  } finally {
    btn.disabled = false;
  }
};

$('logout').onclick = () => {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
};

/* ---------- vykreslení ---------- */

function renderPackage() {
  const pkg = state.me.package;
  if (!pkg) {
    $('pkgBody').innerHTML =
      '<div class="msg msg--info">Zatím nemáš přiřazený balíček. Napiš Anince a ona ti ho nastaví.</div>';
    return;
  }

  if (pkg.kind === 'credits') {
    $('pkgBody').innerHTML = `
      <div class="pkg">
        <span class="pkg-num">${pkg.remaining}</span>
        <span class="pkg-txt">${plural(pkg.remaining, 'zbývající trénink', 'zbývající tréninky', 'zbývajících tréninků')} z ${pkg.total}</span>
      </div>`;
    return;
  }

  const left = Math.max(0, pkg.weeklyLimit - (state.me.weekUsed || 0));
  $('pkgBody').innerHTML = `
    <div class="pkg">
      <span class="pkg-num">${left}</span>
      <span class="pkg-txt">
        ${plural(left, 'volný trénink', 'volné tréninky', 'volných tréninků')} tenhle týden
        <br/>balíček ${pkg.weeklyLimit}× týdně${pkg.validTo ? ` · platí do ${prettyDate(pkg.validTo)}` : ''}
      </span>
    </div>`;
}

function renderMyBookings() {
  const list = state.me.bookings;
  $('myBookings').innerHTML = list.length
    ? list.map((b) => `
        <li>
          <span>
            <span class="list-main">${prettyDate(b.day)}</span><br/>
            <span class="list-sub">${b.start}–${b.end}${b.duration === 90 ? ' · 90 minut' : ''}</span>
          </span>
        </li>`).join('')
    : '<li><span class="empty" style="padding:4px 0">Zatím nemáš žádný naplánovaný trénink.</span></li>';
}

async function renderCalendar() {
  const cursor = state.cursor;
  $('calMonth').textContent = `${MONTHS[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`;

  const total = daysInMonth(cursor);
  const from = iso(cursor);
  const to = iso(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), total)));

  try {
    const { days } = await call('days', { from, to });
    state.openDays = new Set(days);
  } catch {
    state.openDays = new Set();
  }

  const today = todayIso();
  const mine = new Set(state.me.bookings.map((b) => b.day));
  const lead = (cursor.getUTCDay() + 6) % 7;

  const cells = [
    ...DOW.map((d) => `<div class="cal-dow">${d}</div>`),
    ...Array.from({ length: lead }, () => '<div class="cal-empty"></div>'),
  ];

  for (let n = 1; n <= total; n++) {
    const day = iso(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), n)));
    const open = state.openDays.has(day) && day >= today;
    const classes = [
      'cal-day',
      open ? 'has-slots' : '',
      mine.has(day) ? 'is-mine' : '',
      state.selected === day ? 'selected' : '',
    ].filter(Boolean).join(' ');
    cells.push(
      `<button class="${classes}" type="button" data-day="${day}" ${open ? '' : 'disabled'}>${n}</button>`,
    );
  }

  $('calGrid').innerHTML = cells.join('');
  $('calGrid').querySelectorAll('.cal-day:not(:disabled)').forEach((btn) => {
    btn.onclick = () => selectDay(btn.dataset.day);
  });
}

async function selectDay(day) {
  state.selected = day;
  await renderCalendar();

  $('slotsWrap').hidden = false;
  $('slotsDate').textContent = prettyDate(day);
  $('slotsBody').innerHTML = '<div class="empty">Načítám…</div>';

  try {
    const { slots, occupied } = await call('slots', { day });

    if (!slots.length && !occupied.length) {
      $('slotsBody').innerHTML = '<div class="empty">Na tenhle den nejsou volné termíny.</div>';
      return;
    }

    const parts = [];
    if (slots.length) {
      parts.push(`<div class="slots">${slots
        .map((s) => `<button class="slot" type="button" data-start="${s.start}">${s.start}</button>`)
        .join('')}</div>`);
    } else {
      parts.push('<div class="empty">Na tenhle den už je plno.</div>');
    }
    if (occupied.length) {
      parts.push(`<p class="list-sub" style="margin-top:14px">Obsazeno: ${occupied
        .map((o) => `${o.start}–${o.end}`).join(', ')}</p>`);
    }
    $('slotsBody').innerHTML = parts.join('');

    $('slotsBody').querySelectorAll('.slot').forEach((btn) => {
      btn.onclick = () => book(day, btn.dataset.start, btn);
    });
  } catch (err) {
    $('slotsBody').innerHTML = `<div class="msg msg--error">${escapeHtml(err.message)}</div>`;
  }
}

async function book(day, start, btn) {
  const label = `${prettyDate(day)} v ${start}`;
  if (!confirm(`Zarezervovat trénink ${label}?`)) return;

  btn.disabled = true;
  try {
    await call('book', { day, start });
    state.me = await call('me');
    renderPackage();
    renderMyBookings();
    await selectDay(day);
    notify('appMsg', `Hotovo — ${label}. Pozvánku najdeš v e-mailu.`, 'ok');
  } catch (err) {
    notify('appMsg', err.message);
    btn.disabled = false;
    await selectDay(day);
  }
}

/* ---------- start ---------- */

$('prevMonth').onclick = () => { state.cursor = addMonths(state.cursor, -1); renderCalendar(); };
$('nextMonth').onclick = () => { state.cursor = addMonths(state.cursor, 1); renderCalendar(); };

async function boot() {
  if (!state.token) return showAuth();
  try {
    state.me = await call('me');
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    state.token = null;
    return showAuth();
  }

  $('authView').hidden = true;
  $('appView').hidden = false;
  $('whoName').textContent = `${state.me.client.first_name} ${state.me.client.last_name}`;

  const [y, m] = todayIso().split('-').map(Number);
  state.cursor = startOfMonth(new Date(Date.UTC(y, m - 1, 1)));

  renderPackage();
  renderMyBookings();
  await renderCalendar();
}

function showAuth() {
  $('appView').hidden = true;
  $('authView').hidden = false;
}

boot();

const API = '/api';
const TOKEN_KEY = 'aninka_admin_token';
const DOW = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

const $ = (id) => document.getElementById(id);

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  pin: sessionStorage.getItem('aninka_admin_pin') || '',
  weekStart: null,
  clients: [],
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
  if (text) window.scrollTo({ top: 0, behavior: 'smooth' });
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Čeština skloňuje jinak pro 1, pro 2–4 a pro zbytek včetně nuly.
const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

/* ---------- datum ---------- */

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function mondayOf(dayIso) {
  const [y, m, d] = dayIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return addDays(dt, -((dt.getUTCDay() + 6) % 7));
}

function prettyDate(dayIso) {
  const [y, m, d] = dayIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DOW[(dt.getUTCDay() + 6) % 7]} ${d}. ${m}.`;
}

/* ---------- přihlášení ---------- */

$('pinForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    const pin = $('pin').value;
    const { token } = await call('admin_login', { pin });
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem('aninka_admin_pin', pin);
    state.token = token;
    state.pin = pin;
    await boot();
  } catch (err) {
    notify('authMsg', err.message);
  } finally {
    btn.disabled = false;
  }
};

$('logout').onclick = () => {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem('aninka_admin_pin');
  location.reload();
};

/* ---------- záložky ---------- */

document.querySelectorAll('.tab').forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('[data-panel]').forEach((p) => {
      p.hidden = p.dataset.panel !== tab.dataset.tab;
    });
    if (tab.dataset.tab === 'clients') loadClients();
    if (tab.dataset.tab === 'settings') loadSettings();
  };
});

/* ---------- otevírání termínů ---------- */

const PICKED = new Set([0, 1, 2, 3, 4]);

function renderDowPicker() {
  $('avDows').innerHTML = DOW.map((d, i) =>
    `<button class="btn btn--small ${PICKED.has(i) ? '' : 'btn--ghost'}" type="button" data-dow="${i}">${d}</button>`,
  ).join('');
  $('avDows').querySelectorAll('[data-dow]').forEach((btn) => {
    btn.onclick = () => {
      const i = Number(btn.dataset.dow);
      PICKED.has(i) ? PICKED.delete(i) : PICKED.add(i);
      renderDowPicker();
    };
  });
}

$('avAdd').onclick = async () => {
  const from = $('avFrom').value;
  const to = $('avTo').value;
  const start = $('avStart').value;
  const end = $('avEnd').value;

  if (!from || !to || !start || !end) return notify('appMsg', 'Vyplň rozsah dní i časové okno.');
  if (to < from) return notify('appMsg', 'Datum "do" musí být po datu "od".');
  if (!PICKED.size) return notify('appMsg', 'Vyber aspoň jeden den v týdnu.');

  const days = [];
  for (let d = new Date(`${from}T00:00:00Z`); iso(d) <= to; d = addDays(d, 1)) {
    if (PICKED.has((d.getUTCDay() + 6) % 7)) days.push(iso(d));
  }
  if (!days.length) return notify('appMsg', 'V tomhle rozsahu nejsou vybrané dny.');

  $('avAdd').disabled = true;
  try {
    const { added } = await call('admin_availability_add', { days, start, end });
    notify('appMsg', `Otevřeno ${added} ${plural(added, 'den', 'dny', 'dní')}.`, 'ok');
    await loadCalendar();
  } catch (err) {
    notify('appMsg', err.message);
  } finally {
    $('avAdd').disabled = false;
  }
};

/* ---------- kalendář ---------- */

$('calPrev').onclick = () => { state.weekStart = addDays(state.weekStart, -7); loadCalendar(); };
$('calNext').onclick = () => { state.weekStart = addDays(state.weekStart, 7); loadCalendar(); };

async function loadCalendar() {
  const from = iso(state.weekStart);
  const to = iso(addDays(state.weekStart, 13));
  $('calRange').textContent = `${prettyDate(from)} – ${prettyDate(to)}`;
  $('calBody').innerHTML = '<div class="empty">Načítám…</div>';

  try {
    const { blocks, bookings } = await call('admin_availability', { from, to });
    const days = [...new Set([...blocks.map((b) => b.day), ...bookings.map((b) => b.day)])].sort();

    if (!days.length) {
      $('calBody').innerHTML = '<div class="empty">V tomhle období nemáš otevřené žádné termíny.</div>';
      return;
    }

    $('calBody').innerHTML = days.map((day) => {
      const dayBlocks = blocks.filter((b) => b.day === day);
      const dayBookings = bookings.filter((b) => b.day === day);
      return `
        <div class="dayblock">
          <div class="dayblock-head">
            <span class="dayblock-date">${prettyDate(day)}</span>
            <span class="list-sub">${dayBookings.length
              ? `${dayBookings.length} ${plural(dayBookings.length, 'trénink', 'tréninky', 'tréninků')}`
              : 'zatím prázdné'}</span>
          </div>
          <div class="inline" style="margin-bottom:10px">
            ${dayBlocks.map((b) => `
              <span class="chip">${b.start}–${b.end}
                <button class="link" type="button" data-del-block="${b.id}" style="margin-left:6px;font-size:0.8rem">×</button>
              </span>`).join('') || '<span class="list-sub">okno není otevřené</span>'}
          </div>
          ${dayBookings.length ? `<ul class="list">${dayBookings.map((b) => `
            <li>
              <span>
                <span class="list-main">${b.start}–${b.end} · ${escapeHtml(b.client)}</span><br/>
                <span class="list-sub">${escapeHtml(b.phone)}${b.duration === 90 ? ' · 90 minut' : ''}</span>
              </span>
              <button class="btn btn--small btn--danger" type="button" data-cancel="${b.id}">Zrušit</button>
            </li>`).join('')}</ul>` : ''}
          <div style="margin-top:10px">
            <button class="link" type="button" data-add-booking="${day}">+ Přidat trénink ručně</button>
            <div data-form="${day}" hidden style="margin-top:12px"></div>
          </div>
        </div>`;
    }).join('');

    bindCalendarActions();
  } catch (err) {
    $('calBody').innerHTML = `<div class="msg msg--error">${escapeHtml(err.message)}</div>`;
  }
}

function bindCalendarActions() {
  $('calBody').querySelectorAll('[data-del-block]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Zavřít tohle okno? Rezervace, které už v něm jsou, zůstanou.')) return;
      await call('admin_availability_delete', { id: btn.dataset.delBlock });
      await loadCalendar();
    };
  });

  $('calBody').querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Opravdu zrušit tento trénink?')) return;
      const refund = confirm('Vrátit klientovi trénink do balíčku?\n\nOK = vrátit, Zrušit = odečíst.');
      btn.disabled = true;
      try {
        await call('admin_cancel', { id: btn.dataset.cancel, refund });
        notify('appMsg', refund ? 'Zrušeno, trénink vrácen do balíčku.' : 'Zrušeno, trénink odečten.', 'ok');
        await loadCalendar();
      } catch (err) {
        notify('appMsg', err.message);
        btn.disabled = false;
      }
    };
  });

  $('calBody').querySelectorAll('[data-add-booking]').forEach((btn) => {
    btn.onclick = async () => {
      const day = btn.dataset.addBooking;
      const box = $('calBody').querySelector(`[data-form="${day}"]`);
      if (!box.hidden) { box.hidden = true; return; }

      if (!state.clients.length) await loadClients({ silent: true });
      box.hidden = false;
      box.innerHTML = `
        <div class="fieldset" style="margin-bottom:0">
          <h3>Ruční rezervace — obchází limity i návaznost</h3>
          <div class="field">
            <label>Klient</label>
            <select data-field="client">
              ${state.clients.map((c) =>
                `<option value="${c.id}">${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</option>`).join('')}
            </select>
          </div>
          <div class="row">
            <div class="field">
              <label>Začátek</label>
              <input type="time" step="1800" data-field="start" value="16:00" />
            </div>
            <div class="field">
              <label>Délka</label>
              <select data-field="duration">
                <option value="60">60 minut</option>
                <option value="90">90 minut</option>
              </select>
            </div>
          </div>
          <button class="btn btn--small" type="button" data-field="save">Vložit trénink</button>
        </div>`;

      box.querySelector('[data-field="save"]').onclick = async (e) => {
        e.target.disabled = true;
        try {
          await call('admin_book', {
            client_id: box.querySelector('[data-field="client"]').value,
            day,
            start: box.querySelector('[data-field="start"]').value,
            duration: box.querySelector('[data-field="duration"]').value,
          });
          notify('appMsg', 'Trénink vložen.', 'ok');
          await loadCalendar();
        } catch (err) {
          notify('appMsg', err.message);
          e.target.disabled = false;
        }
      };
    };
  });
}

/* ---------- klienti ---------- */

async function loadClients({ silent = false } = {}) {
  if (!silent) $('clientList').innerHTML = '<div class="empty">Načítám…</div>';
  try {
    const { clients } = await call('admin_clients');
    state.clients = clients;
    if (silent) return;

    $('clientCount').textContent = `${clients.length} ${plural(clients.length, 'klient', 'klienti', 'klientů')}`;
    $('clientList').innerHTML = clients.length
      ? clients.map(renderClient).join('')
      : '<div class="empty">Zatím se nikdo nezaregistroval.</div>';
    bindClientActions();
  } catch (err) {
    $('clientList').innerHTML = `<div class="msg msg--error">${escapeHtml(err.message)}</div>`;
  }
}

function packageChip(pkg) {
  if (!pkg) return '<span class="chip chip--warn">bez balíčku</span>';
  return pkg.kind === 'credits'
    ? `<span class="chip chip--ok">${pkg.remaining}/${pkg.total} tréninků</span>`
    : `<span class="chip chip--ok">${pkg.weeklyLimit}× týdně</span>`;
}

function renderClient(c) {
  const pkg = c.package;
  return `
    <details class="client" data-client="${c.id}">
      <summary>
        <span>
          <span class="list-main">${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</span><br/>
          <span class="list-sub">${escapeHtml(c.phone)} · ${escapeHtml(c.email)}</span>
        </span>
        <span class="inline">
          ${packageChip(pkg)}
          ${c.upcoming ? `<span class="chip">${c.upcoming} nadchází</span>` : ''}
          ${c.is_active ? '' : '<span class="chip chip--warn">neaktivní</span>'}
        </span>
      </summary>

      <div class="client-body">
        <div class="fieldset">
          <h3>Balíček</h3>
          <div class="field">
            <label>Typ</label>
            <select data-field="kind">
              <option value="none" ${!pkg ? 'selected' : ''}>Žádný</option>
              <option value="credits" ${pkg?.kind === 'credits' ? 'selected' : ''}>Balíček tréninků (10 / 20)</option>
              <option value="weekly" ${pkg?.kind === 'weekly' ? 'selected' : ''}>Měsíční — X× týdně</option>
            </select>
          </div>
          <div class="row" data-when="credits" ${pkg?.kind === 'credits' ? '' : 'hidden'}>
            <div class="field">
              <label>Počet tréninků</label>
              <input type="number" min="1" max="100" data-field="credits" value="${pkg?.total || 10}" />
            </div>
          </div>
          <div data-when="weekly" ${pkg?.kind === 'weekly' ? '' : 'hidden'}>
            <div class="row">
              <div class="field">
                <label>Tréninků týdně</label>
                <input type="number" min="1" max="7" data-field="weekly" value="${pkg?.weeklyLimit || 2}" />
              </div>
              <div class="field">
                <label>Platí do</label>
                <input type="date" data-field="validTo" value="${pkg?.validTo || ''}" />
              </div>
            </div>
          </div>
          <div class="inline">
            <button class="btn btn--small" type="button" data-field="savePkg">Uložit balíček</button>
            ${pkg?.kind === 'credits' ? `
              <span class="spacer"></span>
              <button class="btn btn--small btn--ghost" type="button" data-field="plus">+1 trénink</button>` : ''}
          </div>
        </div>

        <div class="fieldset">
          <h3>Údaje</h3>
          <div class="row">
            <div class="field">
              <label>Jméno</label>
              <input type="text" data-field="first" value="${escapeHtml(c.first_name)}" />
            </div>
            <div class="field">
              <label>Příjmení</label>
              <input type="text" data-field="last" value="${escapeHtml(c.last_name)}" />
            </div>
          </div>
          <div class="field">
            <label>E-mail</label>
            <input type="email" data-field="email" value="${escapeHtml(c.email)}" />
          </div>
          <div class="field">
            <label>Poznámka — vidíš jen ty</label>
            <textarea rows="2" data-field="note">${escapeHtml(c.note)}</textarea>
          </div>
          <div class="inline">
            <button class="btn btn--small" type="button" data-field="saveClient">Uložit údaje</button>
            <span class="spacer"></span>
            <button class="btn btn--small btn--danger" type="button" data-field="toggleActive">
              ${c.is_active ? 'Deaktivovat' : 'Aktivovat'}
            </button>
          </div>
        </div>
      </div>
    </details>`;
}

function bindClientActions() {
  $('clientList').querySelectorAll('[data-client]').forEach((box) => {
    const id = box.dataset.client;
    const pick = (f) => box.querySelector(`[data-field="${f}"]`);
    const client = state.clients.find((c) => c.id === id);

    pick('kind').onchange = () => {
      const kind = pick('kind').value;
      box.querySelectorAll('[data-when]').forEach((el) => {
        el.hidden = el.dataset.when !== kind;
      });
    };

    pick('savePkg').onclick = async (e) => {
      e.target.disabled = true;
      try {
        await call('admin_package_set', {
          client_id: id,
          kind: pick('kind').value,
          credits_total: pick('credits')?.value,
          weekly_limit: pick('weekly')?.value,
          valid_to: pick('validTo')?.value || null,
        });
        notify('appMsg', 'Balíček uložen.', 'ok');
        await loadClients();
      } catch (err) {
        notify('appMsg', err.message);
        e.target.disabled = false;
      }
    };

    if (pick('plus')) {
      pick('plus').onclick = async (e) => {
        e.target.disabled = true;
        try {
          await call('admin_credits_adjust', { package_id: client.packageId, delta: 1 });
          notify('appMsg', 'Přidán jeden trénink.', 'ok');
          await loadClients();
        } catch (err) {
          notify('appMsg', err.message);
          e.target.disabled = false;
        }
      };
    }

    pick('saveClient').onclick = async (e) => {
      e.target.disabled = true;
      try {
        await call('admin_client_update', {
          id,
          first_name: pick('first').value,
          last_name: pick('last').value,
          email: pick('email').value,
          note: pick('note').value,
        });
        notify('appMsg', 'Údaje uloženy.', 'ok');
        await loadClients();
      } catch (err) {
        notify('appMsg', err.message);
        e.target.disabled = false;
      }
    };

    pick('toggleActive').onclick = async (e) => {
      e.target.disabled = true;
      try {
        await call('admin_client_update', { id, is_active: !client.is_active });
        await loadClients();
      } catch (err) {
        notify('appMsg', err.message);
        e.target.disabled = false;
      }
    };
  });
}

/* ---------- nastavení ---------- */

async function loadSettings() {
  try {
    const { calendarConnected, valveHours, canConnect } = await call('admin_status');
    $('valveHours').value = valveHours;
    $('gcalChip').innerHTML = calendarConnected
      ? '<span class="chip chip--ok">propojeno</span>'
      : '<span class="chip chip--warn">nepropojeno</span>';

    if (!canConnect) {
      $('gcalBody').innerHTML =
        '<div class="msg msg--info">Propojení ještě není nastavené na serveru. Ozvi se Filipovi.</div>';
    } else if (calendarConnected) {
      $('gcalBody').innerHTML = `
        <p class="sub" style="margin-bottom:12px">Tréninky se zapisují do kalendáře automaticky.</p>
        <a class="btn btn--ghost btn--small" href="/api?gcal=start&pin=${encodeURIComponent(state.pin)}">Propojit znovu</a>`;
    } else {
      $('gcalBody').innerHTML =
        `<a class="btn" href="/api?gcal=start&pin=${encodeURIComponent(state.pin)}">Propojit Google Kalendář</a>`;
    }
  } catch (err) {
    $('gcalBody').innerHTML = `<div class="msg msg--error">${escapeHtml(err.message)}</div>`;
  }
}

$('valveSave').onclick = async () => {
  try {
    await call('admin_set_valve', { hours: $('valveHours').value });
    notify('appMsg', 'Uloženo.', 'ok');
  } catch (err) {
    notify('appMsg', err.message);
  }
};

/* ---------- start ---------- */

async function boot() {
  if (!state.token) return showAuth();
  try {
    await call('admin_status');
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    state.token = null;
    return showAuth();
  }

  $('authView').hidden = true;
  $('appView').hidden = false;

  const today = todayIso();
  state.weekStart = mondayOf(today);
  $('avFrom').value = today;
  $('avTo').value = iso(addDays(new Date(`${today}T00:00:00Z`), 27));

  renderDowPicker();
  await loadCalendar();

  if (new URLSearchParams(location.search).get('gcal') === 'ok') {
    notify('appMsg', 'Google Kalendář je propojený.', 'ok');
    history.replaceState({}, '', location.pathname);
  }
}

function showAuth() {
  $('appView').hidden = true;
  $('authView').hidden = false;
}

boot();

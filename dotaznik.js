// =====================
// VSTUPNÍ DOTAZNÍK
// =====================

var dqLang = 'cs';
var dqCurrent = 0;
var dqFormData = {};
var dqSending = false;

var DQ_T = {
  cs: {
    next: 'Další →', back: '← Zpět', send: 'Odeslat ✓',
    select: '— Vyberte —',
    sending: 'Odesílám…',
    doneTitle: 'Odesláno!',
    doneSub: 'Dotazník byl úspěšně odeslán. Ozvu se ti co nejdřív!',
    close: 'Zavřít',
    errorMsg: 'Nepodařilo se odeslat. Zkus to znovu.',
    emailSubjectPrefix: 'Dotazník',
    dateLocale: 'cs-CZ',
  },
  uk: {
    next: 'Далі →', back: '← Назад', send: 'Надіслати ✓',
    select: '— Оберіть —',
    sending: 'Надсилаю…',
    doneTitle: 'Надіслано!',
    doneSub: 'Анкету успішно надіслано. Зв\'яжусь з тобою якнайшвидше!',
    close: 'Закрити',
    errorMsg: 'Не вдалося надіслати. Спробуй ще раз.',
    emailSubjectPrefix: 'Анкета',
    dateLocale: 'uk-UA',
  }
};

var DQ_STEPS = {
  cs: [
    { title: 'Osobní údaje', icon: '👤', fields: [
      { name: 'name',  label: 'Jméno a příjmení', type: 'text',   placeholder: 'Např. Jana Nováková' },
      { name: 'age',   label: 'Věk',              type: 'number', placeholder: '27' },
      { name: 'phone', label: 'Telefon',          type: 'tel',    placeholder: '+420...' },
      { name: 'city',  label: 'Město',            type: 'text',   placeholder: 'Brno, Praha...' },
    ]},
    { title: 'Zdraví', icon: '🩺', fields: [
      { name: 'injuries',    label: 'Máte zranění nebo chronické bolesti?',     type: 'textarea', placeholder: "Bolest zad, natažené koleno... nebo 'žádné'" },
      { name: 'conditions',  label: 'Chronická onemocnění nebo diagnózy',        type: 'textarea', placeholder: "Nebo 'žádné'" },
      { name: 'medications', label: 'Užíváte pravidelně léky?',                 type: 'radio',    options: ['Ano', 'Ne'] },
      { name: 'surgery',     label: 'Měli jste operaci v posledních 2 letech?', type: 'radio',    options: ['Ano', 'Ne'] },
    ]},
    { title: 'Životní styl', icon: '🌿', fields: [
      { name: 'activity',   label: 'Aktuální úroveň fyzické aktivity', type: 'select', options: ['Téměř necvičím', '1–2× týdně', '3–4× týdně', '5× a více týdně'] },
      { name: 'experience', label: 'Zkušenosti s cvičením',            type: 'select', options: ['Úplný začátečník', 'Méně než 1 rok', '1–3 roky', '3+ roky'] },
      { name: 'sleep',      label: 'Průměrný počet hodin spánku',      type: 'select', options: ['Méně než 5 hod', '5–6 hod', '7–8 hod', '9+ hod'] },
      { name: 'stress',     label: 'Úroveň stresu v životě',           type: 'select', options: ['Nízká', 'Střední', 'Vysoká', 'Velmi vysoká'] },
    ]},
    { title: 'Stravování', icon: '🥗', fields: [
      { name: 'diet',         label: 'Jak byste popsali své stravování?', type: 'select',   options: ['Chaotické / nepravidelné', 'Snažím se jíst zdravě', 'Sleduju makra', 'Mám určitá omezení'] },
      { name: 'water',        label: 'Kolik vody denně vypijete?',        type: 'select',   options: ['Méně než 1 l', '1–1,5 l', '1,5–2 l', '2+ l'] },
      { name: 'restrictions', label: 'Potravinová omezení nebo alergie',  type: 'textarea', placeholder: "Nebo 'žádné'" },
    ]},
    { title: 'Cíle', icon: '🎯', fields: [
      { name: 'mainGoal', label: 'Hlavní cíl tréninku (lze více)', type: 'checkbox', options: [
        'Hubnutí / snížení tukové hmoty', 'Nabírání svalové hmoty', 'Zpevnění a tonus',
        'Zlepšení držení těla', 'Rehabilitace / regenerace', 'Zvýšení vytrvalosti',
        'Snížení stresu a zlepšení pohody', 'Příprava na závody nebo sportovní událost'] },
      { name: 'deadline',   label: 'Za jak dlouho chcete výsledky?', type: 'select',   options: ['1–2 měsíce', '3–4 měsíce', '6 měsíců', 'Více než 6 měsíců', 'Bez termínu'] },
      { name: 'sessions',   label: 'Počet tréninků týdně',           type: 'select',   options: ['1–2', '3', '4–5', '6+'] },
      { name: 'motivation', label: 'Co vás motivuje?',               type: 'textarea', placeholder: 'Podělte se...' },
    ]},
    { title: 'Preference', icon: '✨', fields: [
      { name: 'liked',    label: 'Co se vám na cvičení líbí?',   type: 'textarea', placeholder: 'Cviky, formáty, atmosféra...' },
      { name: 'disliked', label: 'Čemu se chcete vyhnout?',       type: 'textarea', placeholder: 'Typ zátěže, vybavení...' },
      { name: 'trainer',  label: 'Jaký styl trenéra očekáváte?',  type: 'select',   options: ['Jemný a podporující', 'Přesný a strukturovaný', 'Motivující a energický', 'Flexibilní, přizpůsobivý'] },
      { name: 'extra',    label: 'Další informace pro trenéra',   type: 'textarea', placeholder: 'Cokoli důležitého...' },
    ]},
  ],
  uk: [
    { title: 'Особисті дані', icon: '👤', fields: [
      { name: 'name',  label: "Ім'я та прізвище", type: 'text',   placeholder: 'Наприклад: Марія Коваль' },
      { name: 'age',   label: 'Вік',              type: 'number', placeholder: '27' },
      { name: 'phone', label: 'Телефон',          type: 'tel',    placeholder: '+380 або +420...' },
      { name: 'city',  label: 'Місто',            type: 'text',   placeholder: 'Брно, Прага...' },
    ]},
    { title: "Здоров'я", icon: '🩺', fields: [
      { name: 'injuries',    label: 'Чи є травми або хронічні болі?',      type: 'textarea', placeholder: "Біль у попереку... або 'відсутні'" },
      { name: 'conditions',  label: 'Хронічні захворювання або діагнози',   type: 'textarea', placeholder: "Або 'відсутні'" },
      { name: 'medications', label: 'Чи приймаєте ліки постійно?',        type: 'radio',    options: ['Так', 'Ні'] },
      { name: 'surgery',     label: 'Чи були операції за останні 2 роки?', type: 'radio',    options: ['Так', 'Ні'] },
    ]},
    { title: 'Спосіб життя', icon: '🌿', fields: [
      { name: 'activity',   label: 'Поточний рівень фізичної активності', type: 'select', options: ['Майже не тренуюсь', '1–2 рази на тиждень', '3–4 рази на тиждень', '5+ разів на тиждень'] },
      { name: 'experience', label: 'Досвід тренувань',                    type: 'select', options: ['Повний початківець', 'Менше 1 року', '1–3 роки', '3+ роки'] },
      { name: 'sleep',      label: 'Середня кількість годин сну',         type: 'select', options: ['Менше 5 год', '5–6 год', '7–8 год', '9+ год'] },
      { name: 'stress',     label: 'Рівень стресу',                       type: 'select', options: ['Низький', 'Середній', 'Високий', 'Дуже високий'] },
    ]},
    { title: 'Харчування', icon: '🥗', fields: [
      { name: 'diet',         label: 'Як би ви описали своє харчування?', type: 'select',   options: ['Хаотичне / нерегулярне', 'Намагаюсь харчуватись правильно', 'Стежу за КБЖУ', 'Є певні обмеження'] },
      { name: 'water',        label: "Скільки води п'єте на день?",       type: 'select',   options: ['Менше 1 л', '1–1.5 л', '1.5–2 л', '2+ л'] },
      { name: 'restrictions', label: 'Харчові обмеження або алергії',     type: 'textarea', placeholder: "Або 'відсутні'" },
    ]},
    { title: 'Цілі', icon: '🎯', fields: [
      { name: 'mainGoal', label: 'Головна мета (можна кілька)', type: 'checkbox', options: [
        'Схуднення / зменшення жирової маси', "Набір м'язової маси", 'Зміцнення та тонус',
        'Покращення постави', 'Реабілітація / відновлення', 'Підвищення витривалості',
        'Зниження стресу та покращення самопочуття', 'Підготовка до змагань або подій'] },
      { name: 'deadline',   label: 'За який термін хочете результату?', type: 'select',   options: ['1–2 місяці', '3–4 місяці', '6 місяців', 'Більше 6 місяців', 'Без термінів'] },
      { name: 'sessions',   label: 'Тренувань на тиждень',              type: 'select',   options: ['1–2', '3', '4–5', '6+'] },
      { name: 'motivation', label: 'Що вас мотивує?',                   type: 'textarea', placeholder: 'Поділіться...' },
    ]},
    { title: 'Побажання', icon: '✨', fields: [
      { name: 'liked',    label: 'Що подобається в тренуваннях?', type: 'textarea', placeholder: 'Вправи, формати, атмосфера...' },
      { name: 'disliked', label: 'Що хочете уникати?',             type: 'textarea', placeholder: 'Якийсь тип навантажень...' },
      { name: 'trainer',  label: 'Очікуваний стиль тренера',       type: 'select',   options: ["М'який та підтримуючий", 'Чіткий та структурований', 'Мотивуючий та енергійний', 'Гнучкий, адаптований до настрою'] },
      { name: 'extra',    label: 'Додаткова інформація до тренера', type: 'textarea', placeholder: 'Все що вважаєте важливим...' },
    ]},
  ]
};

var DQ_LABELS = {
  cs: { name: 'Jméno a příjmení', age: 'Věk', phone: 'Telefon', city: 'Město', injuries: 'Zranění / bolesti', conditions: 'Diagnózy', medications: 'Pravidelné léky', surgery: 'Operace za 2 roky', activity: 'Aktivita', experience: 'Zkušenosti', sleep: 'Spánek', stress: 'Stres', diet: 'Stravování', water: 'Voda', restrictions: 'Omezení / alergie', mainGoal: 'Cíle tréninku', deadline: 'Požadovaný termín', sessions: 'Tréninků/týden', motivation: 'Motivace', liked: 'Co se líbí', disliked: 'Čemu se vyhnout', trainer: 'Styl trenéra', extra: 'Další informace' },
  uk: { name: "Ім'я та прізвище", age: 'Вік', phone: 'Телефон', city: 'Місто', injuries: 'Травми / болі', conditions: 'Діагнози', medications: 'Ліки постійно', surgery: 'Операції за 2 роки', activity: 'Активність', experience: 'Досвід тренувань', sleep: 'Сон', stress: 'Стрес', diet: 'Харчування', water: 'Вода', restrictions: 'Обмеження / алергії', mainGoal: 'Цілі тренувань', deadline: 'Бажаний термін', sessions: 'Тренувань/тиждень', motivation: 'Мотивація', liked: 'Що подобається', disliked: 'Уникати', trainer: 'Стиль тренера', extra: 'Додатково' }
};

// ── OPEN / CLOSE ─────────────────────────────────────────────────────────────
function openDotaznik() {
  // sync language with site
  var siteLang = document.documentElement.lang || 'cs';
  dqLang = (siteLang === 'uk') ? 'uk' : 'cs';
  dqCurrent = 0;
  dqFormData = {};
  document.getElementById('dqOverlay').classList.add('dq-open');
  document.body.style.overflow = 'hidden';
  dqUpdateLangBtns();
  dqRenderDots();
  dqRenderCard();
  document.getElementById('dqSuccess').style.display = 'none';
  document.getElementById('dqCard').style.display = 'block';
  document.getElementById('dqDots').style.display = 'flex';
}

function closeDotaznik() {
  document.getElementById('dqOverlay').classList.remove('dq-open');
  document.body.style.overflow = '';
}

// Close on overlay click
document.getElementById('dqOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeDotaznik();
});

// ── LANGUAGE ─────────────────────────────────────────────────────────────────
function dqSetLang(l) {
  dqLang = l;
  dqCurrent = 0;
  dqFormData = {};
  dqUpdateLangBtns();
  dqRenderDots();
  dqRenderCard();
}

function dqUpdateLangBtns() {
  document.querySelectorAll('.dq-lang-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-dqlang') === dqLang);
  });
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function dqRenderDots() {
  var steps = DQ_STEPS[dqLang];
  var html = steps.map(function(s, i) {
    var cls = 'dq-dot';
    if (i === dqCurrent) cls += ' dq-dot--active';
    if (i < dqCurrent)  cls += ' dq-dot--done';
    return '<div class="' + cls + '" title="' + s.title + '">' + (i < dqCurrent ? '✓' : s.icon) + '</div>';
  }).join('');
  document.getElementById('dqDots').innerHTML = html;
}

function dqEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function dqRenderCard() {
  var steps = DQ_STEPS[dqLang];
  var t = DQ_T[dqLang];
  var step = steps[dqCurrent];
  var total = steps.length;

  var fieldsHtml = step.fields.map(function(f) {
    var inp = '';
    if (f.type === 'text' || f.type === 'tel' || f.type === 'number') {
      inp = '<input type="' + f.type + '" placeholder="' + dqEsc(f.placeholder || '') + '" value="' + dqEsc(dqFormData[f.name] || '') + '" oninput="dqFormData[\'' + f.name + '\']=this.value">';
    } else if (f.type === 'textarea') {
      inp = '<textarea placeholder="' + dqEsc(f.placeholder || '') + '" oninput="dqFormData[\'' + f.name + '\']=this.value">' + dqEsc(dqFormData[f.name] || '') + '</textarea>';
    } else if (f.type === 'select') {
      var opts = f.options.map(function(o) {
        return '<option value="' + dqEsc(o) + '"' + (dqFormData[f.name] === o ? ' selected' : '') + '>' + dqEsc(o) + '</option>';
      }).join('');
      inp = '<select onchange="dqFormData[\'' + f.name + '\']=this.value"><option value="">' + t.select + '</option>' + opts + '</select>';
    } else if (f.type === 'radio') {
      inp = '<div class="dq-radio-row">' + f.options.map(function(o) {
        var sel = dqFormData[f.name] === o;
        return '<div class="dq-chip' + (sel ? ' dq-chip--active' : '') + '" onclick="dqPick(\'' + f.name + '\',\'' + dqEsc(o) + '\')">' + dqEsc(o) + '</div>';
      }).join('') + '</div>';
    } else if (f.type === 'checkbox') {
      var vals = dqFormData[f.name] || [];
      inp = '<div class="dq-check-grid">' + f.options.map(function(o) {
        var sel = vals.indexOf(o) !== -1;
        var safe = o.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return '<div class="dq-check-chip' + (sel ? ' dq-check-chip--active' : '') + '" onclick="dqToggleCheck(\'' + f.name + '\',\'' + safe + '\')">' + (sel ? '✓ ' : '') + dqEsc(o) + '</div>';
      }).join('') + '</div>';
    }
    return '<div class="dq-field-group"><label class="dq-field-label">' + f.label + '</label>' + inp + '</div>';
  }).join('');

  var isLast = dqCurrent === total - 1;
  document.getElementById('dqCard').innerHTML =
    '<div class="dq-step-head"><span class="dq-step-icon">' + step.icon + '</span><span class="dq-step-title">' + step.title + '</span></div>' +
    '<div class="dq-fields">' + fieldsHtml + '</div>' +
    '<div class="dq-nav">' +
      (dqCurrent > 0 ? '<button class="dq-btn-back" onclick="dqGoPrev()">' + t.back + '</button>' : '<div></div>') +
      (isLast ? '<button class="dq-btn-send" id="dqSendBtn" onclick="dqFinish()">' + t.send + '</button>' : '<button class="dq-btn-next" onclick="dqGoNext()">' + t.next + '</button>') +
    '</div>';

  document.getElementById('dqStepCounter').textContent = (dqCurrent + 1) + ' / ' + total;
  document.getElementById('dqProgressFill').style.width = ((dqCurrent + 1) / total * 100) + '%';
}

function dqPick(name, val) { dqFormData[name] = val; dqRenderCard(); }
function dqToggleCheck(name, val) {
  var a = dqFormData[name] || [];
  var idx = a.indexOf(val);
  dqFormData[name] = idx === -1 ? a.concat([val]) : a.filter(function(v) { return v !== val; });
  dqRenderCard();
}

function dqGoNext() {
  if (dqCurrent < DQ_STEPS[dqLang].length - 1) {
    var card = document.getElementById('dqCard');
    card.style.opacity = '0';
    card.style.transform = 'translateY(8px)';
    setTimeout(function() {
      dqCurrent++;
      dqRenderDots();
      dqRenderCard();
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 160);
  }
}

function dqGoPrev() {
  if (dqCurrent > 0) {
    var card = document.getElementById('dqCard');
    card.style.opacity = '0';
    card.style.transform = 'translateY(8px)';
    setTimeout(function() {
      dqCurrent--;
      dqRenderDots();
      dqRenderCard();
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 160);
  }
}

// ── EMAIL SEND ────────────────────────────────────────────────────────────────
function dqBuildEmailBody() {
  var steps = DQ_STEPS[dqLang];
  var labels = DQ_LABELS[dqLang];
  var t = DQ_T[dqLang];
  var date = new Date().toLocaleDateString(t.dateLocale, { day: '2-digit', month: 'long', year: 'numeric' });
  var lines = ['Datum: ' + date, ''];

  steps.forEach(function(step) {
    lines.push('=== ' + step.title.toUpperCase() + ' ===');
    step.fields.forEach(function(f) {
      var val = dqFormData[f.name];
      var display = Array.isArray(val) ? val.join(', ') : (val || '—');
      lines.push((labels[f.name] || f.label) + ': ' + display);
    });
    lines.push('');
  });

  return lines.join('\n');
}

function dqFinish() {
  var t = DQ_T[dqLang];
  var name = dqFormData.name || 'Klient';
  var subject = encodeURIComponent(t.emailSubjectPrefix + ' — ' + name);
  var body = encodeURIComponent(dqBuildEmailBody());
  var mailto = 'mailto:filipnemi1@gmail.com?subject=' + subject + '&body=' + body;
  window.location.href = mailto;
  dqShowSuccess();
}

function dqShowSuccess() {
  document.getElementById('dqCard').style.display = 'none';
  document.getElementById('dqDots').style.display = 'none';
  var succ = document.getElementById('dqSuccess');
  var t = DQ_T[dqLang];
  succ.querySelector('.dq-done-title').textContent = t.doneTitle;
  succ.querySelector('.dq-done-sub').textContent = t.doneSub;
  succ.querySelector('.dq-btn-close-done').textContent = t.close;
  succ.style.display = 'flex';
}

// init
dqRenderDots();
dqRenderCard();

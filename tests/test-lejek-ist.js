/* tests/test-lejek-ist.js — STRAŻNIK: ekran końcowy diagnozy prowadzi do IST, nie do aplikacji
 *
 * LEJEK IST 23.09.2026. Decyzja Kuby: darmowa diagnoza jest lejkiem do planów IST
 * (spotkanie diagnostyczne albo plan), aplikacja jest zapleczem. Ta suita pilnuje:
 *   1. ekran końcowy nie zaprasza już do aplikacji (ani przycisk, ani zdanie),
 *   2. zdanie o wąskim gardle jest prawdziwe dla trzech scenariuszy wyniku,
 *   3. prośba o spotkanie/plan zapisuje zdarzenie i powiadamia Kubę, a telefon
 *      NIE trafia do bazy,
 *   4. gotowy mail do rodzica powstaje tylko, gdy rodzic podał adres,
 *   5. restart ankiety zeruje blok (inaczej zostałoby wąskie gardło z poprzedniego
 *      przebiegu).
 * Funkcje są URUCHAMIANE w vm z atrapą DOM, nie tylko czytane.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let ok = 0, fail = 0; const bledy = []; let biezacy = '';
function scenario(n) { biezacy = n; console.log('\n— ' + n); }
function assert(w, o) {
  if (w) { ok++; console.log('  ok  ' + o); }
  else { fail++; bledy.push(biezacy + ' :: ' + o); console.log('  FAIL ' + o); }
}
function probuj(opis, fn) {
  try { fn(); } catch (e) { fail++; bledy.push(biezacy + ' :: ' + opis + ' — WYJĄTEK: ' + e.message); console.log('  FAIL ' + opis + ' — WYJĄTEK: ' + e.message); }
}

/** Wycina `function nazwa(...) {...}` — funkcje tego pliku są na najwyższym poziomie
 *  i kończą się `}` w pierwszej kolumnie; to pewniejsze niż liczenie klamer przez
 *  komentarze i wyrażenia regularne z cudzysłowami. */
function wytnij(nazwa) {
  const re = new RegExp('^(async )?function ' + nazwa.replace(/\$/g, '\\$') + '\\(', 'm');
  const m = re.exec(HTML);
  if (!m) return '';
  const k = HTML.indexOf('\n}', m.index);
  return HTML.slice(m.index, k + 2);
}
function wytnijConst(nazwa) {
  const m = new RegExp('const ' + nazwa + ' = (\\{[\\s\\S]*?\\n\\});|const ' + nazwa + " = ('[^']*');").exec(HTML);
  return m ? 'const ' + nazwa + ' = ' + (m[1] || m[2]) + ';' : '';
}

/* ── atrapa DOM ─────────────────────────────────────────────────────────── */
function atrapa() {
  const el = {};
  const get = (id) => el[id] || (el[id] = { id, style: { display: '' }, dataset: {}, textContent: '', innerHTML: '', value: '' });
  // `el` samo zakłada brakujący element — test może wpisać wartość, zanim kod o niego zapyta.
  return { el: new Proxy(el, { get: (_, id) => get(id) }), document: { getElementById: get } };
}
function kontekst(extra) {
  const d = atrapa();
  const zapisy = [], powiadomienia = [];
  const c = Object.assign({
    document: d.document, console: { warn() {}, error() {}, log() {} },
    window: { location: { hash: '#r=abc', href: 'https://gamechange-diagnoza.vercel.app/#r=abc' } },
    SEG_NAMES: { moc: 'MOC', regeneracja: 'REGENERACJA', percepcja: 'PERCEPCJA', decyzja: 'SZYBKOŚĆ DECYZJI' },
    getPositionProfile: () => null,
    cachedScores: null, ctx: { pos: null, age: 15 }, playerEmail: null, playerName: null,
    _diagState: {},
    saveToSupabase: (t, r) => zapisy.push({ t, r }),
    buildDiagnosticsRecord: (x) => Object.assign({ scores: '{}' }, x),
    sendEmailNotification: (typ, x) => powiadomienia.push({ typ, x }),
  }, extra || {});
  vm.createContext(c);
  const kod = [
    wytnijConst('GC_IST_CZAS_ODPOWIEDZI'), 'const GC_NASTEPNY_KROK_ENABLED = true;',
    wytnijConst('GC_WASKIE_GARDLO_JEZYK'), wytnij('getRelativeDeficits'), wytnij('opiszWaskieGardlo'),
    wytnij('_pokazNastepnyKrok'), wytnij('wybierzKrokIST'), wytnij('wyslijProsbeIST'),
    wytnij('_escapeHtmlLite'), wytnij('zbudujMailDoRodzica'), wytnij('_powiadomOMailuDoRodzica'),
  ].join('\n');
  vm.runInContext(kod, c);
  return { c, el: d.el, zapisy, powiadomienia };
}

const DEFICYT = { moc: 30, regeneracja: 70, percepcja: 72, decyzja: 71, wytrzymalosc: 70, fizycznosc: 69 };
const ROWNY = { moc: 70, regeneracja: 71, percepcja: 69, decyzja: 70, wytrzymalosc: 70, fizycznosc: 71 };

scenario('1. ekran końcowy NIE zaprasza do aplikacji');
{
  const start = HTML.indexOf('id="next-step-wrap"');
  const blok = start === -1 ? '' : HTML.slice(start, HTML.indexOf('id="pdf-section-wrap"'));
  assert(start !== -1, 'blok „Następny krok" istnieje w HTML');
  assert(!/aplikacj/i.test(blok), '⛔ w bloku nie ma słowa „aplikacja"');
  assert(!/app-bridge|requestAppAccess|_showAppBridge|GC_APP_ACCESS_URL/.test(HTML), '⛔ stary most do aplikacji zniknął z pliku (HTML i JS)');
  assert(/Spotkanie diagnostyczne/.test(blok) && /Plan treningowy/.test(blok), 'dwie propozycje: spotkanie i plan');
  assert(!/\d+\s*zł/.test(blok), '⛔ bez ceny na ekranie (cennik należy do Helicopter View)');
  assert(!/dostanie osobny raport/.test(HTML), '⛔ pole e-maila rodzica nie obiecuje raportu, którego nikt nie wysyła');
}

scenario('2. zdanie o wąskim gardle — trzy scenariusze wyniku');
probuj('opis dla trzech scenariuszy', () => {
  const { c } = kontekst();
  const a = c.opiszWaskieGardlo(DEFICYT, null);
  assert(a.segId === 'moc' && /moc/.test(a.naglowek), 'scenariusz 1: nagłówek nazywa najsłabszy obszar (moc)');
  assert(/szybkość startowa/.test(a.zdanie) && a.zdanie.split('.').filter(x => x.trim()).length === 1, 'scenariusz 1: JEDNO zdanie, w języku zawodnika');
  const b = c.opiszWaskieGardlo(ROWNY, null);
  assert(b.naglowek === 'Profil wyrównany' && b.segId === null, 'scenariusz 3: bez deficytu i bez pozycji — nie wymyśla wąskiego gardła');
  const { c: c2 } = kontekst({ getPositionProfile: () => ({ tiers: { percepcja: 'key', decyzja: 'key', moc: 'support' } }) });
  const d = c2.opiszWaskieGardlo(ROWNY, 4);
  assert(d.segId === 'percepcja' && /dla Twojej pozycji/i.test(d.zdanie), 'scenariusz 2: najniższy KLUCZOWY obszar pozycji (percepcja 69 < decyzja 70)');
  const e = c.opiszWaskieGardlo(null, null);
  assert(e.segId === null && /Twój wynik/.test(e.naglowek), 'brak wyników — nic nie zmyśla');
});

scenario('3. blok się pokazuje, raz, i niesie wąskie gardło');
probuj('_pokazNastepnyKrok', () => {
  const { c, el } = kontekst({ cachedScores: DEFICYT });
  c._pokazNastepnyKrok();
  assert(el['next-step-wrap'].style.display === 'block', 'blok odsłonięty');
  assert(/moc/.test(el['next-step-headline'].textContent), 'nagłówek z wąskim gardłem');
  el['next-step-headline'].textContent = 'X';
  c._pokazNastepnyKrok();
  assert(el['next-step-headline'].textContent === 'X', 'idempotentny — drugie wywołanie nic nie przestawia');
});

scenario('4. prośba o spotkanie / plan');
probuj('wyslijProsbeIST', () => {
  const { c, el, zapisy, powiadomienia } = kontekst({ cachedScores: DEFICYT, playerEmail: 'jan@x.pl', playerName: 'Jan' });
  c._pokazNastepnyKrok();
  c.wybierzKrokIST('plan');
  assert(el['next-step-form'].style.display === 'block' && el['next-step-choice'].style.display === 'none', 'wybór otwiera formularz');
  assert(el['next-step-email'].value === 'jan@x.pl', 'znany e-mail jest wpisany z góry');
  el['next-step-phone'].value = '600100200';
  c.wyslijProsbeIST();
  assert(zapisy.length === 1 && zapisy[0].r.event === 'ist_plan_requested', 'zapis zdarzenia `ist_plan_requested`');
  assert(!JSON.stringify(zapisy).includes('600100200'), '⛔ telefon NIE trafia do bazy');
  assert(powiadomienia.length === 1 && /plan/i.test(powiadomienia[0].typ) && powiadomienia[0].x.contact === '600100200', 'Kuba dostaje powiadomienie z telefonem');
  assert(el['next-step-done'].style.display === 'block' && /48 godzin/.test(el['next-step-done-text'].innerHTML), 'potwierdzenie z obietnicą czasu odpowiedzi');

  const k2 = kontekst({ cachedScores: DEFICYT });
  k2.c._pokazNastepnyKrok(); k2.c.wybierzKrokIST('spotkanie');
  k2.el['next-step-email'].value = 'zly-adres';
  k2.c.wyslijProsbeIST();
  assert(k2.zapisy.length === 0 && k2.el['next-step-error'].style.display === 'block', 'zły e-mail: nic nie wysyła, pokazuje błąd');
  k2.el['next-step-email'].value = 'a@b.pl';
  k2.c.wyslijProsbeIST();
  assert(k2.zapisy[0].r.event === 'ist_meeting_requested', 'spotkanie: zdarzenie `ist_meeting_requested`');
  const k3 = kontekst({ cachedScores: DEFICYT });
  k3.el['next-step-email'].value = '<img>@b.pl';
  k3.c.wybierzKrokIST('plan'); k3.el['next-step-email'].value = 'x"<b>@b.pl'; k3.c.wyslijProsbeIST();
  assert(!/<b>/.test(k3.el['next-step-done-text'].innerHTML), 'adres w potwierdzeniu jest escapowany');
});

scenario('5. mail do rodzica');
probuj('mail do rodzica', () => {
  const bez = kontekst({ cachedScores: DEFICYT, playerEmail: 'jan@x.pl' });
  bez.c.window._parentEmail = undefined;
  bez.c._powiadomOMailuDoRodzica();
  assert(bez.powiadomienia.length === 0, 'bez adresu rodzica — nic nie powstaje');
  const z = kontekst({ cachedScores: DEFICYT, playerEmail: 'jan@x.pl', playerName: 'Jan' });
  z.c.window._parentEmail = 'mama@x.pl';
  z.c._powiadomOMailuDoRodzica();
  const p = z.powiadomienia[0] || { x: {} };
  assert(z.powiadomienia.length === 1 && p.x.contact === 'mama@x.pl', 'Kuba dostaje adres rodzica');
  assert(/szybkość startowa/.test(p.x.note) && /spotkanie/.test(p.x.note) && /plan/.test(p.x.note), 'tekst niesie wąskie gardło i obie propozycje');
  assert(/#r=abc/.test(p.x.note), 'tekst niesie link do wyników');
  assert(!/aplikacj/i.test(p.x.note), '⛔ tekst nie wspomina aplikacji');
  assert(/wynik ankiety/.test(p.x.note), 'uczciwie: to ankieta, nie badanie na żywo');
  assert(!/Twoich|Twojej|Twoje/.test(p.x.note), '⛔ mail do rodzica nie mówi do dziecka (żadnego „Twoich odpowiedzi")');
  assert(/_powiadomOMailuDoRodzica\(\)/.test(wytnij('submitEmail')), 'submitEmail woła przygotowanie maila do rodzica');
});

scenario('6. restart zeruje blok');
{
  const r = wytnij('restart') || '';
  assert(/next-step-wrap/.test(r) && /gcShown\s*=\s*''/.test(r), 'restart chowa blok i zeruje `dataset.gcShown`');
}

console.log('\n════════════════════════════════════════');
console.log('  ok:   ' + ok);
console.log('  FAIL: ' + fail);
if (fail) { console.log('\nCZERWONE:'); bledy.forEach(b => console.log('  · ' + b)); }
console.log('════════════════════════════════════════');
process.exit(fail ? 1 : 0);

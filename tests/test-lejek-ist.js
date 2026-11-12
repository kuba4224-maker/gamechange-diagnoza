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
    // ⚠️ PRZESTAWIONE 12.11.2026 (zgoda rodzica, runda 2): domyślny wiek 15 → 17. Poniżej 16 oferty nie ma
    // (decyzja Kuby), a te scenariusze sprawdzają właśnie ofertę. Wiek 15 ma własne asercje niżej.
    cachedScores: null, ctx: { pos: null, age: 17 }, playerEmail: null, playerName: null,
    _diagState: {},
    saveToSupabase: (t, r) => zapisy.push({ t, r }),
    buildDiagnosticsRecord: (x) => Object.assign({ scores: '{}' }, x),
    sendEmailNotification: (typ, x) => powiadomienia.push({ typ, x }),
  }, extra || {});
  vm.createContext(c);
  const kod = [
    wytnijConst('GC_IST_CZAS_ODPOWIEDZI'), 'const GC_NASTEPNY_KROK_ENABLED = true;',
    (extra && extra.__plany) || wytnijConst('GC_PLANY_6TYG'), wytnijConst('GC_CENA_PLANU_6TYG'), wytnijConst('GC_CENY_IST'),
    // DIAGNOZA PAKIET 0 (12.11.2026), Z3b — nagłówek bloku bierze pełną nazwę obszaru.
    wytnijConst('SEG_PELNE_NAZWY'), wytnij('pelnaNazwaObszaru'),
    wytnijConst('GC_WASKIE_GARDLO_JEZYK'), wytnij('getRelativeDeficits'), wytnij('opiszWaskieGardlo'),
    // ZGODA RODZICA 12.11.2026 (runda 2): `_pokazNastepnyKrok` chowa ofertę poniżej 16 lat — potrzebuje progu i zdania.
    'const GC_ZGODA_MARKETING_ENABLED = true;', ((/^const GC_ZGODA_MIN_WIEK = \d+;$/m.exec(HTML)) || [''])[0], wytnijConst('GC_TEKST_DZIECKO_BEZ_OFERTY'), wytnij('_czyWymaganaZgodaRodzica'),
    wytnij('czyWidokRodzica'), wytnijConst('GC_TEKSTY_RODZIC'), wytnij('_pokazNastepnyKrok'), wytnij('wybierzKrokIST'), wytnij('wyslijProsbeIST'),
    wytnij('_escapeHtmlLite'), wytnij('zbudujMailDoRodzica'), wytnij('_powiadomOMailuDoRodzica'), wytnij('pokazRodzicowi'),
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
  assert(/Zrób to sam/.test(blok) && /Zrób to ze mną/.test(blok) && /Indywidualny System Treningowy/.test(blok), 'dwie propozycje (09.11): „Zrób to sam” (Plan 6 tygodni) i „Zrób to ze mną” (IST)');
  assert(/Pokaż wynik rodzicowi/.test(blok), 'jest przycisk „Pokaż wynik rodzicowi”');
  assert(/szkoła, treningi drużyny, mecze/.test(blok), 'IST opisany jako plan ułożony w cały tydzień zawodnika');
  assert(!/\d+\s*zł/.test(blok), '⛔ w HTML bloku nie ma ceny wpisanej na sztywno — ceny tylko ze stałych GC_CENA_PLANU_6TYG / GC_CENY_IST');
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
  const BEZ_LINKU = "const GC_PLANY_6TYG = { moc: { nazwa: 'Moc', url: null } };"; // plan bez linku płatności → formularz prośby
  const { c, el, zapisy, powiadomienia } = kontekst({ cachedScores: DEFICYT, playerEmail: 'jan@x.pl', playerName: 'Jan', __plany: BEZ_LINKU });
  c._pokazNastepnyKrok();
  c.wybierzKrokIST('plan');
  assert(el['next-step-form'].style.display === 'block' && el['next-step-choice'].style.display === 'none', 'wybór otwiera formularz');
  assert(el['next-step-email'].value === 'jan@x.pl', 'znany e-mail jest wpisany z góry');
  el['next-step-phone'].value = '600100200';
  c.wyslijProsbeIST();
  assert(zapisy.length === 1 && zapisy[0].r.event === 'plan6_requested', 'zapis zdarzenia `plan6_requested` (plan bez linku płatności → prośba)');
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
  const k3 = kontekst({ cachedScores: DEFICYT, __plany: BEZ_LINKU });
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

scenario('7. LEJEK 09.11 — „Zrób to sam / ze mną / pokaż rodzicowi”');
probuj('przycisk planu zależy od obszaru', () => {
  const k = kontekst({ cachedScores: DEFICYT });           // najsłabsza moc → jest plan
  k.c._pokazNastepnyKrok();
  assert(k.el['next-step-btn-plan'].style.display === 'block', 'moc: „Zrób to sam” widoczny');
  assert(/Moc/.test(k.el['next-step-plan-tytul'].textContent) && /49 zł/.test(k.el['next-step-plan-tytul'].textContent), 'tytuł planu z nazwą obszaru i ceną ze stałej');
  assert(/250 zł/.test(k.el['next-step-ist-cena'].textContent) && /500 zł/.test(k.el['next-step-ist-cena'].textContent), 'ceny IST ze stałej');
  const r = kontekst({ cachedScores: { moc: 70, regeneracja: 30, percepcja: 72, decyzja: 71, wytrzymalosc: 70, fizycznosc: 69 },
    __plany: "const GC_PLANY_6TYG = { moc: { nazwa: 'Moc', url: null } };" });
  r.c._pokazNastepnyKrok();
  assert(r.el['next-step-btn-plan'].style.display === 'none', 'obszar bez planu w mapie → „Zrób to sam” schowany');
  const PL = (/const GC_PLANY_6TYG = \{([\s\S]*?)\n\};/.exec(HTML) || ['',''])[1];
  for (const id of ['moc','wytrzymalosc','fizycznosc','techFund','techSpec','tolerancja','regeneracja','odpornosc','odzywianie','koncentracja','mental','percepcja','decyzja'])
    assert(new RegExp('\\b' + id + ':').test(PL), 'plan 6 tygodni przypisany do obszaru `' + id + '`');
});
probuj('przycisk rodzica tylko poniżej 18 lat', () => {
  const a = kontekst({ cachedScores: DEFICYT, ctx: { pos: null, age: 15 } }); a.c._pokazNastepnyKrok();
  assert(a.el['next-step-btn-rodzic'].style.display === 'block', '15 lat: „Pokaż wynik rodzicowi” widoczny');
  // ZGODA RODZICA 12.11.2026 (runda 2, decyzja Kuby): poniżej 16 lat bez oferty z cenami.
  assert(a.el['next-step-btn-plan'].style.display === 'none', '⭐ 15 lat: „Zrób to sam” (cena planu) SCHOWANY');
  assert(a.el['next-step-btn-spotkanie'].style.display === 'none', '⭐ 15 lat: „Zrób to ze mną” (ceny IST) SCHOWANY');
  assert(a.el['next-step-intro'].textContent === 'Jeśli chcesz pójść z tym dalej, pokaż ten wynik rodzicowi. Dostał ode mnie osobną wiadomość.', '15 lat: zdanie „pokaż wynik rodzicowi”');
  const c16 = kontekst({ cachedScores: DEFICYT, ctx: { pos: null, age: 16 } }); c16.c._pokazNastepnyKrok();
  assert(c16.el['next-step-btn-plan'].style.display === 'block' && c16.el['next-step-btn-spotkanie'].style.display !== 'none', '16 lat: oferta widoczna jak dotąd');
  const r15 = kontekst({ cachedScores: DEFICYT, ctx: { pos: null, age: 15 }, window: { location: { search: '?dla=rodzic', hash: '#r=abc', href: 'https://diagnoza.gamechange.pl/?dla=rodzic#r=abc' } } }); r15.c._pokazNastepnyKrok();
  assert(r15.el['next-step-btn-plan'].style.display === 'block', 'widok rodzica (?dla=rodzic) przy wieku 15: oferta widoczna');
  const b = kontekst({ cachedScores: DEFICYT, ctx: { pos: null, age: 22 } }); b.c._pokazNastepnyKrok();
  assert(b.el['next-step-btn-rodzic'].style.display === 'none', '22 lata: przycisk rodzica schowany');
});
probuj('plan z linkiem płatności idzie od razu do płatności', () => {
  const otwarte = [];
  const k = kontekst({ cachedScores: DEFICYT, __plany: "const GC_PLANY_6TYG = { moc: { nazwa: 'Moc', url: 'https://buy.stripe.com/test' } };",
    window: { open: (u) => otwarte.push(u), location: { href: 'https://x/#r=abc' } } });
  k.c._pokazNastepnyKrok(); k.c.wybierzKrokIST('plan');
  assert(otwarte[0] === 'https://buy.stripe.com/test', 'otwiera link płatności');
  assert(k.el['next-step-form'].style.display !== 'block', 'nie otwiera formularza');
  assert(k.zapisy[0].r.event === 'plan6_checkout_clicked', 'zdarzenie `plan6_checkout_clicked`');
});
probuj('link płatności niesie e-mail z diagnozy i kod źródła', () => {
  const otwarte = [];
  const k = kontekst({ cachedScores: DEFICYT, playerEmail: 'a+b@x.pl', affiliateCode: 'YT_F3',
    __plany: "const GC_PLANY_6TYG = { moc: { nazwa: 'Moc', url: 'https://buy.stripe.com/test' } };",
    window: { open: (u) => otwarte.push(u), location: { href: 'https://x/#r=abc' } } });
  k.c._pokazNastepnyKrok(); k.c.wybierzKrokIST('plan');
  assert(otwarte[0] === 'https://buy.stripe.com/test?prefilled_email=a%2Bb%40x.pl&client_reference_id=YT_F3', 'prefilled_email zakodowany, client_reference_id = kod źródła');
});
probuj('produkcyjne linki Stripe dla wszystkich 13 obszarów', () => {
  const blok = wytnijConst('GC_PLANY_6TYG');
  const urls = blok.match(/url: '([^']+)'/g) || [];
  assert(urls.length === 13 && urls.every(u => /https:\/\/buy\.stripe\.com\/\w+'/.test(u)), '13 linków buy.stripe.com, żadnego null');
});
probuj('widok rodzica (?dla=rodzic)', () => {
  const RODZIC_LOC = { search: '?dla=rodzic&ref=YT_F3', hash: '#r=abc', href: 'https://diagnoza.gamechange.pl/?dla=rodzic&ref=YT_F3#r=abc' };
  const k = kontekst({ cachedScores: DEFICYT, ctx: { pos: null, age: 15 }, window: { location: RODZIC_LOC } });
  k.c._pokazNastepnyKrok();
  assert(k.el['next-step-btn-rodzic'].style.display === 'none', 'rodzic nie widzi przycisku „Pokaż wynik rodzicowi”');
  assert(/zawodnik/.test(k.el['next-step-intro'].textContent) && !/Chcesz zrobić to sam/.test(k.el['next-step-intro'].textContent), 'wstęp mówi do rodzica o zawodniku');
  assert(!/Twoj|Twój|Twoją/.test(k.el['next-step-ist-opis'].textContent + k.el['next-step-plan-opis'].textContent + k.el['next-step-sentence'].textContent), '⛔ w bloku rodzica brak zwrotów do zawodnika');
  assert(k.zapisy.some(z => z.r.event === 'parent_view_opened'), 'zdarzenie `parent_view_opened`');
  k.c.wybierzKrokIST('spotkanie');
  k.el['next-step-email'].value = 'mama@x.pl';
  k.c.wyslijProsbeIST();
  assert(k.zapisy.some(z => z.r.event === 'parent_meeting_requested'), 'zdarzenie `parent_meeting_requested`');
  assert(k.powiadomienia.length === 1 && /^RODZIC — /.test(k.powiadomienia[0].typ), 'Kuba dostaje powiadomienie z dopiskiem RODZIC');
  assert(!/mniej niż 18 lat/.test(k.el['next-step-done-text'].innerHTML), 'potwierdzenie bez zdania do niepełnoletniego');
  const z = kontekst({ cachedScores: DEFICYT, ctx: { pos: null, age: 15 } });
  z.c._pokazNastepnyKrok();
  assert(!z.zapisy.some(r => r.r.event === 'parent_view_opened'), 'zwykły widok zawodnika nie zapisuje `parent_view_opened`');
});
probuj('link dla rodzica ma ?dla=rodzic i kod źródła', () => {
  const otwarte = [];
  const k = kontekst({ cachedScores: DEFICYT, affiliateCode: 'YT_F3',
    window: { open: (u) => otwarte.push(u), location: { origin: 'https://diagnoza.gamechange.pl', pathname: '/', search: '', hash: '#r=abc', href: 'https://diagnoza.gamechange.pl/#r=abc' } } });
  k.c._pokazNastepnyKrok();
  const tekst = k.c.pokazRodzicowi();
  assert(tekst.indexOf('https://diagnoza.gamechange.pl/?dla=rodzic&ref=YT_F3#r=abc') !== -1, 'link: adres + ?dla=rodzic + &ref + wynik');
});
probuj('zgoda na wiadomości: flaga, tylko 16+', () => {
  const blok = HTML.slice(HTML.indexOf('id="email-consent-wrap"'), HTML.indexOf('id="email-consent-wrap"') + 400);
  assert(/display:none/.test(blok), 'pole zgody domyślnie schowane');
  assert(!/id="email-consent"[^>]*checked/.test(HTML), '⛔ zgoda domyślnie NIEzaznaczona');
  assert(/const GC_ZGODA_MARKETING_ENABLED = (true|false);/.test(HTML), 'flaga zgody istnieje (włączona 09.11 po SQL i kluczu)');
  assert(/\{ marketing_consent: zgoda \}/.test(HTML) && /zgoda === null \? \{\}/.test(HTML), 'kolumna marketing_consent nie trafia do bazy, gdy pole nieaktywne');
});
probuj('pokaż rodzicowi', () => {
  const otwarte = [];
  const k = kontekst({ cachedScores: DEFICYT, window: { open: (u) => otwarte.push(u), location: { href: 'https://gamechange-diagnoza.vercel.app/#r=abc' } } });
  k.c._pokazNastepnyKrok();
  const t = k.c.pokazRodzicowi();
  assert(/#r=abc/.test(t) && /Gamechange/.test(t), 'wiadomość niesie link do wyniku');
  assert(otwarte.length === 1 && /^https:\/\/wa\.me\/\?text=/.test(otwarte[0]), 'bez systemowego udostępniania: WhatsApp z gotowym tekstem');
  assert(k.zapisy.length === 1 && k.zapisy[0].r.event === 'parent_share_clicked' && !k.zapisy[0].r.email, 'zapis tylko zdarzenia, bez adresu');
});


/* ══════════════════════════════════════════════════════════════════════════
   LEJEK 11.11.2026 (A1) — ADRES RODZICA NA ?dla=rodzic
   Funkcja jest asynchroniczna (czeka na odpowiedź /api/mailerlite, żeby pokazać
   prawdziwy wynik), więc ten blok jest awaitowany przed podsumowaniem.
   ══════════════════════════════════════════════════════════════════════════ */
function kontekstRodzica(opcje) {
  const o = opcje || {};
  const wyslane = [];
  const k = kontekst({
    cachedScores: DEFICYT, ctx: { pos: null, age: 15 },
    affiliateCode: o.kod === undefined ? 'PARASOL_U15' : o.kod,
    window: { location: { search: o.search === undefined ? '?dla=rodzic&ref=PARASOL_U15' : o.search, hash: '#r=abc', href: 'https://diagnoza.gamechange.pl/?dla=rodzic#r=abc' } },
    fetch: async (url, init) => {
      wyslane.push({ url, body: init && init.body ? JSON.parse(init.body) : null });
      if (o.fetchRzuca) throw new Error('offline');
      return { ok: o.status === undefined ? true : (o.status >= 200 && o.status < 300), status: o.status === undefined ? 200 : o.status };
    },
  });
  vm.runInContext(wytnij('zapiszAdresRodzica'), k.c);
  k.c._pokazNastepnyKrok();
  return Object.assign(k, { wyslane });
}

async function scenariuszeRodzica() {
  scenario('10. A1 — adres rodzica: pole tylko w widoku rodzica, zgoda domyślnie niezaznaczona');
  {
    const start = HTML.indexOf('id="rodzic-lista-wrap"');
    const blok = start === -1 ? '' : HTML.slice(start, HTML.indexOf('id="next-step-form"'));
    assert(blok.length > 0, 'blok `rodzic-lista-wrap` istnieje w HTML (wycinek NIE jest pusty)');
    assert(/^id="rodzic-lista-wrap" style="display:none;/.test(blok), 'blok domyślnie schowany');
    assert(/id="rodzic-lista-zgoda" type="checkbox"/.test(blok) && !/id="rodzic-lista-zgoda"[^>]*checked/.test(blok), '⛔ zgoda rodzica domyślnie NIEzaznaczona');
    assert(/id="rodzic-lista-email"/.test(blok), 'jest pole e-mail rodzica');
    const r = kontekstRodzica();
    assert(r.el['rodzic-lista-wrap'].style.display === 'block', 'na ?dla=rodzic blok się odsłania');
    assert(/Zostaw adres/.test(r.el['rodzic-lista-tekst'].textContent), 'tekst przy polu ustawiony');
    const z = kontekst({ cachedScores: DEFICYT, ctx: { pos: null, age: 15 } });
    z.c._pokazNastepnyKrok();
    assert(z.el['rodzic-lista-wrap'].style.display !== 'block', 'w widoku zawodnika blok zostaje schowany');
  }

  scenario('11. A1 — zapis: MailerLite + zdarzenie w bazie, tylko po zgodzie');
  try {
    const r = kontekstRodzica();
    r.el['rodzic-lista-email'].value = ' mama@x.pl ';
    r.el['rodzic-lista-zgoda'].checked = false;
    const s0 = await r.c.zapiszAdresRodzica();
    assert(s0 === 'brak_zgody', 'bez zgody: stan `brak_zgody`');
    assert(r.wyslane.length === 0 && r.zapisy.filter(z => z.r.event === 'parent_email_submitted').length === 0, '⛔ bez zgody nic nie wychodzi (ani MailerLite, ani baza)');
    assert(r.el['rodzic-lista-stan'].style.display === 'block' && /zgod/i.test(r.el['rodzic-lista-stan'].textContent), 'bez zgody: zdanie na ekranie');

    r.el['rodzic-lista-zgoda'].checked = true;
    r.el['rodzic-lista-email'].value = 'zly-adres';
    assert((await r.c.zapiszAdresRodzica()) === 'zly_adres' && r.wyslane.length === 0, 'zły adres: stan `zly_adres`, nic nie wychodzi');

    r.el['rodzic-lista-email'].value = ' mama@x.pl ';
    const s1 = await r.c.zapiszAdresRodzica();
    assert(s1 === 'zapisane', 'z poprawnym adresem i zgodą: stan `zapisane`');
    assert(r.wyslane.length === 1 && r.wyslane[0].url === '/api/mailerlite', 'jedno wywołanie /api/mailerlite');
    const b = r.wyslane[0].body || {};
    assert(b.email === 'mama@x.pl', 'adres przycięty');
    assert(b.ref === 'PARASOL_U15_RODZIC', 'zrodlo = kod ref + `_RODZIC`');
    assert(b.obszar === 'moc', 'obszar = wąskie gardło zawodnika (wyznacza grupę serii)');
    const w = r.zapisy.filter(z => z.r.event === 'parent_email_submitted');
    assert(w.length === 1, 'jedno zdarzenie `parent_email_submitted`');
    assert(w[0] && w[0].t === 'diagnostics' && w[0].r.parent_email === 'mama@x.pl', 'zdarzenie niesie `parent_email`');
    assert(w[0] && w[0].r.marketing_consent === true, 'zdarzenie niesie `marketing_consent = true`');
    assert(w[0] && !w[0].r.email, '⛔ adres rodzica NIE trafia do kolumny `email` (to kolumna zawodnika)');
    assert(w[0] && w[0].r.note === 'lista: zapisane', 'nota: `lista: zapisane`');
    assert(/^Zapisane\./.test(r.el['rodzic-lista-stan'].textContent) && r.el['rodzic-lista-stan'].style.color !== '#E8432D', 'potwierdzenie na ekranie');

    const bez = kontekstRodzica({ kod: null, search: '?dla=rodzic' });
    bez.el['rodzic-lista-email'].value = 'tata@x.pl'; bez.el['rodzic-lista-zgoda'].checked = true;
    await bez.c.zapiszAdresRodzica();
    assert(bez.wyslane[0] && bez.wyslane[0].body.ref === '_RODZIC', 'bez kodu ref: zrodlo `_RODZIC` (rodzic nadal rozpoznawalny)');
  } catch (e) { assert(false, 'scenariusz 11 — WYJĄTEK: ' + e.message); }

  scenario('12. A1 — trzy różne porażki, trzy różne nazwy (R5)');
  try {
    const odm = kontekstRodzica({ status: 502 });
    odm.el['rodzic-lista-email'].value = 'mama@x.pl'; odm.el['rodzic-lista-zgoda'].checked = true;
    const s = await odm.c.zapiszAdresRodzica();
    assert(s === 'blad_listy', 'serwer odmówił: `blad_listy`, nie `zapisane`');
    assert(/Nie udało się/.test(odm.el['rodzic-lista-stan'].textContent) && odm.el['rodzic-lista-stan'].style.color === '#E8432D', 'czytelny komunikat błędu');
    const w = odm.zapisy.filter(z => z.r.event === 'parent_email_submitted');
    assert(w.length === 1 && /^lista: blad_listy \(HTTP 502\)$/.test(w[0].r.note), 'adres nie ginie: wiersz z notą `lista: blad_listy (HTTP 502)`');

    const off = kontekstRodzica({ fetchRzuca: true });
    off.el['rodzic-lista-email'].value = 'mama@x.pl'; off.el['rodzic-lista-zgoda'].checked = true;
    const s2 = await off.c.zapiszAdresRodzica();
    assert(s2 === 'blad_sieci', 'brak sieci: `blad_sieci`, inna nazwa niż odmowa serwera');
    assert(/Nie udało się/.test(off.el['rodzic-lista-stan'].textContent), 'brak sieci: komunikat błędu');

    const zaw = kontekstRodzica({ search: '' });
    zaw.el['rodzic-lista-email'].value = 'mama@x.pl'; zaw.el['rodzic-lista-zgoda'].checked = true;
    assert((await zaw.c.zapiszAdresRodzica()) === 'nie_rodzic' && zaw.wyslane.length === 0, 'poza widokiem rodzica funkcja nic nie robi (`nie_rodzic`)');
  } catch (e) { assert(false, 'scenariusz 12 — WYJĄTEK: ' + e.message); }
}

scenariuszeRodzica().then(() => {
  console.log('\n════════════════════════════════════════');
  console.log('  ok:   ' + ok);
  console.log('  FAIL: ' + fail);
  if (fail) { console.log('\nCZERWONE:'); bledy.forEach(b => console.log('  · ' + b)); }

  console.log('════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
});

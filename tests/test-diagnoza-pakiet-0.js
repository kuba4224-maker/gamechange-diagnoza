/* tests/test-diagnoza-pakiet-0.js — DIAGNOZA PAKIET 0 · 12.11.2026 (przed zajęciami w Parasolu)
 *
 * ⛔ CO TEN STRAŻNIK PILNUJE I DLACZEGO.
 *   Z1  Od 20.07.2026 do 12.11.2026 dwa pytania sformułowane ODWROTNIE liczyły się jak proste
 *       (wytrzymalosc[1], techSpec[1]). Zawodnik, któremu „siły odpadają pod koniec meczu",
 *       dostawał za to WYŻSZĄ wytrzymałość. Błąd był niewidoczny okiem: kształt wyniku poprawny,
 *       13 liczb w 0–100. Stąd ZAMROŻONA tabela kierunków wszystkich 27 pytań i przypadki liczbowe
 *       URUCHAMIANE na prawdziwym `calcScores`.
 *   Z3  Deficyt nie ma prawa stać w grupie „Solidne, drugorzędne", a nagłówek wyniku, grupa
 *       priorytetu i przycisk Planu mają wskazywać TEN SAM obszar.
 *   Z4  `results_generated` niesie surowe odpowiedzi, wersję ankiety i czas — tylko za flagą.
 *   Z5  Zdarzenia początku lejka: każde najwyżej raz na przejście.
 *   Z6/Z7  Teksty niezgodne z prawdą nie wracają; rocznik 2016–2018; pole rodzica < 18 lat;
 *       ucięty opis (max_tokens) = nieudany odczyt.
 * Funkcje są URUCHAMIANE w vm na tekście wyciętym z `index.html` — nie na atrapach.
 * ⭐ `sprawdzTekst(t)` przyjmuje DOWOLNY tekst pliku, więc bateria mutacji (sekcja 9) uruchamia
 *    te same predykaty na zmutowanym napisie — bez dotykania dysku.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const KATALOG = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(KATALOG, 'index.html'), 'utf8');

/* ── wycinanie z dowolnego tekstu ───────────────────────────────────────── */
function wytnijZ(t, nazwa) {
  const re = new RegExp('^(async )?function ' + nazwa.replace(/\$/g, '\\$') + '\\(', 'm');
  const m = re.exec(t);
  if (!m) return '';
  const k = t.indexOf('\n}', m.index);
  return k === -1 ? '' : t.slice(m.index, k + 2);
}
/** Dla funkcji z szablonem tekstu, w którym `}` stoi w pierwszej kolumnie (`generateAIDiagnosis`):
 *  od deklaracji do NASTĘPNEJ deklaracji funkcji na najwyższym poziomie. */
function wytnijDoNastepnejZ(t, nazwa) {
  const re = new RegExp('^(async )?function ' + nazwa + '\\(', 'm');
  const m = re.exec(t);
  if (!m) return '';
  const r2 = /\n(async )?function [A-Za-z_$][\w$]*\(/g; r2.lastIndex = m.index + 10;
  const n = r2.exec(t);
  return t.slice(m.index, n ? n.index : t.length);
}
function nawiasZ(t, kotwica, otw, zam) {
  const i = t.indexOf(kotwica);
  if (i === -1) return '';
  const s = t.indexOf(otw, i);
  let d = 0;
  for (let k = s; k < t.length; k++) {
    if (t[k] === otw) d++;
    else if (t[k] === zam) { d--; if (!d) return t.slice(s, k + 1); }
  }
  return '';
}
function stalaZ(t, nazwa) {
  const m = new RegExp('const ' + nazwa + "\\s*=\\s*([^;\\n]+);").exec(t);
  return m ? 'const ' + nazwa + ' = ' + m[1] + ';' : '';
}

/* ⛔ ZAMROŻONA TABELA KIERUNKÓW (12.11.2026). Zmiana kierunku któregokolwiek pytania musi
   być decyzją z datą — nie przypadkiem przy przepisywaniu treści (tak powstał błąd 20.07.2026). */
const KIERUNKI = {
  moc: [1, 1],
  wytrzymalosc: [1, -1],
  fizycznosc: [1, 1],
  techFund: [1, 1],
  techSpec: [1, -1],
  tolerancja: [-1, -1],
  regeneracja: [1, 1],
  odpornosc: [-1, 1],
  odzywianie: [1, -1, 1],
  koncentracja: [-1, 1],
  mental: [1, 1],
  percepcja: [1, 1],
  decyzja: [1, -1],
};

function sprawdzTekst(t) {
  const W = [];
  const ok = (warunek, nazwa, extra) => W.push({ ok: !!warunek, nazwa, extra });
  const probuj = (nazwa, fn) => { try { fn(); } catch (e) { W.push({ ok: false, nazwa: nazwa + ' — WYJĄTEK', extra: e.message }); } };

  /* ── Z1 ─────────────────────────────────────────────────────────── */
  const segsTxt = nawiasZ(t, 'const SEGS = [', '[', ']');
  ok(segsTxt.length > 10000, 'Z1 strażnik strażnika: wycinek `SEGS` nie jest pusty', 'długość ' + segsTxt.length);
  let SEGS = [];
  probuj('Z1 `SEGS` daje się uruchomić', () => {
    const c = {}; vm.createContext(c); vm.runInContext('var SEGS = ' + segsTxt + ';', c); SEGS = c.SEGS;
  });
  const pytan = SEGS.reduce((a, s) => a + s.qs.length, 0);
  ok(pytan === 27, 'Z1 pytań jest 27', String(pytan));
  ok(SEGS.length === Object.keys(KIERUNKI).length, 'Z1 obszarów w tabeli tyle, ile w `SEGS`', SEGS.length + ' vs ' + Object.keys(KIERUNKI).length);
  SEGS.forEach(s => {
    const dz = s.qs.map(q => q.dir);
    ok(JSON.stringify(dz) === JSON.stringify(KIERUNKI[s.id]), 'Z1 kierunki ' + s.id + ' = ' + JSON.stringify(KIERUNKI[s.id]), 'jest ' + JSON.stringify(dz));
  });
  const odwrocone = [];
  SEGS.forEach(s => s.qs.forEach((q, i) => { if (q.dir === -1) odwrocone.push(s.id + '[' + i + ']'); }));
  ok(odwrocone.length === 8, 'Z1 odwróconych pytań jest 8 (było 6 do 12.11.2026)', odwrocone.join(' '));
  ok(SEGS.every(s => s.qs.every(q => q.dir === 1 || q.dir === -1)), 'Z1 każdy kierunek to 1 albo -1 (nic trzeciego)');

  probuj('Z1 przypadki liczbowe na prawdziwym `calcScores`', () => {
    const calc = wytnijZ(t, 'calcScores');
    ok(calc.length > 100, 'Z1 strażnik strażnika: `calcScores` wycięta');
    const licz = (id, odp) => {
      const ans = {}; SEGS.forEach(s => { ans[s.id] = s.qs.map(() => 3); });
      ans[id] = odp;
      const c = { SEGS, ans, Math }; vm.createContext(c);
      vm.runInContext(calc + '\n;var __w = calcScores();', c);
      return c.__w[id];
    };
    ok(licz('wytrzymalosc', [1, 6]) === 0, 'Z1 wytrzymalosc [1, 6] → 0/100', String(licz('wytrzymalosc', [1, 6])));
    ok(licz('wytrzymalosc', [6, 1]) === 100, 'Z1 wytrzymalosc [6, 1] → 100/100', String(licz('wytrzymalosc', [6, 1])));
    ok(licz('techSpec', [1, 6]) === 0, 'Z1 techSpec [1, 6] → 0/100', String(licz('techSpec', [1, 6])));
    ok(licz('techSpec', [6, 1]) === 100, 'Z1 techSpec [6, 1] → 100/100', String(licz('techSpec', [6, 1])));
  });
  ok(/const GC_WERSJA_WYNIKU_W_LINKU = 3;/.test(t), 'Z1 znacznik wersji wyniku = 3');
  ok(/const GC_WERSJA_WYNIKU_PRZED_POPRAWKA_KIERUNKU = 2;/.test(t), 'Z1 wersja 2 nazwana jako „przed poprawką kierunku"');

  /* ── Z3 ─────────────────────────────────────────────────────────── */
  probuj('Z3 grupowanie i spójność nagłówka/priorytetu/Planu', () => {
    const profileTxt = nawiasZ(t, 'const POSITION_PROFILES = {', '{', '}');
    const mapaTxt = nawiasZ(t, 'const POSITION_MAP_TEMP = {', '{', '}');
    const planyTxt = nawiasZ(t, 'const GC_PLANY_6TYG = {', '{', '}');
    const pelneTxt = nawiasZ(t, 'const SEG_PELNE_NAZWY = {', '{', '}');
    ok(profileTxt && mapaTxt && planyTxt && pelneTxt, 'Z3 strażnik strażnika: stałe wycięte (profile, mapa pozycji, plany, pełne nazwy)');
    const kod = [
      'var POSITION_PROFILES = ' + profileTxt + ';', 'var POSITION_MAP_TEMP = ' + mapaTxt + ';',
      'var GC_PLANY_6TYG = ' + planyTxt + ';', 'var SEG_PELNE_NAZWY = ' + pelneTxt + ';',
      'var SEG_NAMES = {}; SEGS.forEach(s => SEG_NAMES[s.id] = s.name);',
      wytnijZ(t, 'getPositionProfile'), wytnijZ(t, 'getRelativeDeficits'), wytnijZ(t, 'relativeBarWidth'),
      wytnijZ(t, 'groupSegmentsForDisplay'), wytnijZ(t, 'pelnaNazwaObszaru'), wytnijZ(t, 'opiszWaskieGardlo'),
      'var GC_WASKIE_GARDLO_JEZYK = ' + nawiasZ(t, 'const GC_WASKIE_GARDLO_JEZYK = {', '{', '}') + ';',
    ].join('\n');
    const c = { SEGS, Math, Object, Set }; vm.createContext(c); vm.runInContext(kod, c);
    // Skrzydłowy (ctx.pos 6), regeneracja („minor" dla skrzydłowego) jest pierwszym deficytem.
    const wynik = { moc: 70, wytrzymalosc: 68, fizycznosc: 72, techFund: 69, techSpec: 71, tolerancja: 66,
      regeneracja: 20, odpornosc: 70, odzywianie: 67, koncentracja: 73, mental: 70, percepcja: 69, decyzja: 72 };
    const profil = c.getPositionProfile(6);
    ok(profil && profil.tiers && profil.tiers.regeneracja === 'minor', 'Z3 przypadek ma sens: regeneracja jest „drugorzędna" u skrzydłowego');
    const g = c.groupSegmentsForDisplay(wynik, profil, c.SEG_NAMES).groups;
    const def = c.getRelativeDeficits(wynik, 4);
    ok(def.length && def[0][0] === 'regeneracja', 'Z3 pierwszym deficytem jest regeneracja');
    ok(g.g1.length && g.g1[0].id === 'regeneracja', '⭐ Z3a regeneracja stoi NA GÓRZE grupy priorytetu (g1)', JSON.stringify(g.g1.map(e => e.id)));
    ok(!g.g4.some(e => e.cls === 'deficit'), '⛔ Z3a ŻADEN deficyt w g4 „Solidne, drugorzędne"', JSON.stringify(g.g4.filter(e => e.cls === 'deficit').map(e => e.id)));
    ok(!g.g3.some(e => e.cls === 'deficit') && !g.g2.some(e => e.cls === 'deficit'), 'Z3a żaden deficyt w g2/g3');
    ok(g.g1.every(e => e.cls === 'deficit'), 'Z3a w g1 stoją wyłącznie deficyty (asercja odwrotna: nic nie wpadło tam za darmo)');
    const opis = c.opiszWaskieGardlo(wynik, 6);
    ok(opis.segId === 'regeneracja', '⭐ Z3 przycisk Planu (opiszWaskieGardlo → GC_PLANY_6TYG) wskazuje regenerację', String(opis.segId));
    ok(c.GC_PLANY_6TYG[opis.segId] && /Regeneracja/.test(c.GC_PLANY_6TYG[opis.segId].nazwa), 'Z3 plan istnieje i ma nazwę obszaru');
    ok(c.pelnaNazwaObszaru('regeneracja') === 'Regeneracja', 'Z3b pełna nazwa regeneracji');
    // Bez karty pozycyjnej deficyt też ląduje w g1.
    const g0 = c.groupSegmentsForDisplay(wynik, null, c.SEG_NAMES).groups;
    ok(g0.g1.length && g0.g1[0].id === 'regeneracja', 'Z3 bez pozycji: deficyt w g1');
    // Pełne nazwy: komplet, bez skrótów.
    const pelne = c.SEG_PELNE_NAZWY;
    ok(SEGS.every(s => typeof pelne[s.id] === 'string' && pelne[s.id].length > 2), 'Z3b pełna nazwa dla KAŻDEGO z 13 obszarów');
    ok(Object.values(pelne).every(n => n.indexOf('.') === -1), 'Z3b żadna pełna nazwa nie jest skrótem z kropką');
    ok(pelne.techFund === 'Technika fundamentalna' && pelne.techSpec === 'Technika specjalistyczna'
      && pelne.tolerancja === 'Tolerancja obciążeń' && pelne.decyzja === 'Szybkość decyzji', 'Z3b cztery skracane nazwy brzmią dokładnie jak w poleceniu');
    ok(/SEGS\.forEach\(s => SEG_NAMES\[s\.id\] = s\.name\);/.test(t), 'Z3b `SEG_NAMES` nadal z `SEGS` (idzie do bazy — bez zmian)');
  });
  const rr = wytnijZ(t, 'renderResults');
  ok(rr.length > 1000, 'Z3b strażnik strażnika: `renderResults` wycięta');
  ok(/Twoje wąskie gardło:<br><em>\$\{esc\(pelnaNazwaObszaru\(/.test(rr), 'Z3b nagłówek: „Twoje wąskie gardło:" + pełna nazwa');
  ok(!/titleEl\.innerHTML = `Twoja gra ma/.test(rr), 'Z3b stary nagłówek „Twoja gra ma … jako wąskie gardło" zniknął z kodu `renderResults`');
  ok(/idWaskiegoGardla = deficitsForScenario\[0\]\[0\]/.test(rr), 'Z3 nagłówek bierze PIERWSZY deficyt — to samo źródło co Plan');

  /* ── Z4 ─────────────────────────────────────────────────────────── */
  probuj('Z4 pola surowych odpowiedzi', () => {
    const kod = [stalaZ(t, 'GC_ZAPIS_ODPOWIEDZI_ENABLED').replace(/^const /, 'var '), stalaZ(t, 'GC_WERSJA_ANKIETY'),
      'var _gcCzasWejsciaDoAnkiety = null;',
      wytnijZ(t, 'surowaKopiaOdpowiedzi'), wytnijZ(t, 'czasAnkietySekundy'), wytnijZ(t, 'polaSurowychOdpowiedzi')].join('\n');
    ok(/GC_ZAPIS_ODPOWIEDZI_ENABLED/.test(kod) && /function polaSurowychOdpowiedzi/.test(kod), 'Z4 strażnik strażnika: flaga i funkcje wycięte');
    const ans = {}; SEGS.forEach((s, i) => { ans[s.id] = s.qs.map((_, k) => 1 + ((i + k) % 6)); });
    const c = { SEGS, ans, Math, Date: { now: () => 1000000 } }; vm.createContext(c); vm.runInContext(kod, c);
    c._gcCzasWejsciaDoAnkiety = 1000000 - 240000;
    const p = c.polaSurowychOdpowiedzi();
    if (c.GC_ZAPIS_ODPOWIEDZI_ENABLED) {
      ok(p.answers && Object.keys(p.answers).length === 13, 'Z4 `answers` ma 13 obszarów');
      ok(JSON.stringify(p.answers) === JSON.stringify(ans), 'Z4 `answers` to CO DO ZNAKU kliknięte odpowiedzi');
      ok(p.survey_version === '2026-11-12', 'Z4 `survey_version` = 2026-11-12', String(p.survey_version));
      ok(p.duration_s === 240, 'Z4 `duration_s` = 240 s', String(p.duration_s));
      c._gcCzasWejsciaDoAnkiety = null;
      ok(c.polaSurowychOdpowiedzi().duration_s === null, 'Z4 brak zegara → `duration_s` null, NIE zero (pustka nie znaczy dwóch rzeczy)');
      c.ans.moc = [7, 'x'];
      ok(JSON.stringify(c.polaSurowychOdpowiedzi().answers.moc) === '[null,null]', 'Z4 wartość spoza 1–6 → null, nie śmieć do bazy');
    } else {
      ok(Object.keys(p).length === 0, 'Z4 flaga wyłączona → zero nowych pól');
    }
  });
  const gr = wytnijZ(t, 'generateResults');
  ok(/buildDiagnosticsRecord\(Object\.assign\(\{ event: 'results_generated' \}, polaSurowychOdpowiedzi\(\)\)\)/.test(gr),
    'Z4 `results_generated` dostaje pola surowych odpowiedzi');
  ok((t.match(/[^n] polaSurowychOdpowiedzi\(\)|\(polaSurowychOdpowiedzi\(\)|, polaSurowychOdpowiedzi\(\)/g) || []).length === 1, 'Z4 pola idą WYŁĄCZNIE do `results_generated` (jedno wywołanie)');
  ok(/if \(!GC_ZAPIS_ODPOWIEDZI_ENABLED\) return \{\};/.test(wytnijZ(t, 'polaSurowychOdpowiedzi')), 'Z4 flaga naprawdę bramkuje pola');

  /* ── Z5 ─────────────────────────────────────────────────────────── */
  probuj('Z5 zdarzenia początku lejka raz na przejście', () => {
    const zapisy = [];
    const kod = [stalaZ(t, 'GC_PROG_POLOWY_ANKIETY'), 'var _gcZdarzeniaPrzejscia = new Set(); var _gcCzasWejsciaDoAnkiety = null;',
      wytnijZ(t, 'zapiszZdarzenieLejkaRazNaPrzejscie'), wytnijZ(t, 'liczbaOdpowiedzi'), wytnijZ(t, 'wejscieNaEkranPytan'),
      wytnijZ(t, 'pickScroll')].join('\n');
    const btn = { closest: () => ({ querySelectorAll: () => [] }), classList: { add() {} } };
    const ans = {}; SEGS.forEach(s => { ans[s.id] = s.qs.map(() => null); });
    const c = { Set, Object, Date, console: { warn() {} }, ans,
      saveToSupabase: (tab, r) => zapisy.push(tab + ':' + r.event),
      buildDiagnosticsRecord: (x) => Object.assign({ affiliate_code: 'R', team_code: 'T' }, x),
      updateProgressScroll() {}, zapiszPostepAnkiety() {} };
    vm.createContext(c); vm.runInContext(kod, c);
    c.zapiszZdarzenieLejkaRazNaPrzejscie('survey_opened'); c.zapiszZdarzenieLejkaRazNaPrzejscie('survey_opened');
    c.wejscieNaEkranPytan(); c.wejscieNaEkranPytan();
    const lista = []; SEGS.forEach(s => s.qs.forEach((_, i) => lista.push([s.id, i])));
    lista.slice(0, 13).forEach(([id, i]) => c.pickScroll(id, i, 3, btn));
    ok(zapisy.indexOf('diagnostics:survey_half') === -1, 'Z5 przy 13 odpowiedziach NIE MA `survey_half`');
    lista.slice(13).forEach(([id, i]) => c.pickScroll(id, i, 4, btn));
    c.pickScroll(lista[0][0], lista[0][1], 5, btn);
    ok(JSON.stringify(zapisy) === JSON.stringify(['diagnostics:survey_opened', 'diagnostics:survey_started', 'diagnostics:survey_half']),
      '⭐ Z5 trzy zdarzenia, każde DOKŁADNIE raz, w tej kolejności', JSON.stringify(zapisy));
    ok(typeof c._gcCzasWejsciaDoAnkiety === 'number', 'Z5 wejście na pytania uruchamia zegar ankiety (Z4 `duration_s`)');
  });
  ok(/zapiszZdarzenieLejkaRazNaPrzejscie\('survey_opened'\)/.test(wytnijZ(t, 'startSurvey')), 'Z5 `survey_opened` w `startSurvey` (przycisk ekranu startowego)');
  ok(/wejscieNaEkranPytan\(\)/.test(wytnijZ(t, 'startSurveyFromPresurvey')) && /wejscieNaEkranPytan\(\)/.test(wytnijZ(t, 'wrocDoAnkiety')),
    'Z5 `survey_started` przy OBU wejściach na ekran pytań (nowa ankieta i powrót)');
  ok(/_gcZdarzeniaPrzejscia = new Set\(\); _gcCzasWejsciaDoAnkiety = null;/.test(wytnijZ(t, 'restart')), 'Z5 `restart()` zaczyna nowe przejście');
  const bdr = wytnijZ(t, 'buildDiagnosticsRecord');
  ok(/team_code:/.test(bdr) && /affiliate_code:/.test(bdr), 'Z5 każde zdarzenie (przez `buildDiagnosticsRecord`) niesie `team_code` i `affiliate_code`');

  /* ── Z6 ─────────────────────────────────────────────────────────── */
  ['Pytania w ankiecie są dopasowane do poziomu', 'Wyślemy diagnozę na', 'wyślemy Ci diagnozę na podstawie',
    'wyślemy też kopię na Twoją skrzynkę'].forEach(z => ok(t.indexOf(z) === -1, '⛔ Z6 nieprawdziwe zdanie nie wróciło: „' + z + '"'));
  ['Wybierz poziom, który najlepiej opisuje Twoje obecne rozgrywki — pozwoli nam to dopasować opis wyniku do Twojej aktualnej sytuacji.',
    'Podaj email, żeby odblokować opis: co te wyniki znaczą na boisku i od czego zacząć.',
    'Podaj email, żeby pobrać raport'].forEach(z => ok(t.indexOf(z) !== -1, 'Z6 nowe zdanie stoi: „' + z.slice(0, 50) + '…"'));
  const se = wytnijZ(t, 'submitEmail');
  ok((se.match(/Adres zapisany\. Skopiuj link do wyniku — możesz do niego wrócić albo pokazać go trenerowi\./g) || []).length === 2,
    'Z6 oba miejsca w `submitEmail` mówią „Adres zapisany…"');

  /* ── Z7 ─────────────────────────────────────────────────────────── */
  ok(/<title>Darmowa diagnoza piłkarza — Gamechange<\/title>/.test(t), 'Z7 <title>');
  ok(/<meta name="description" content="27 pytań, 4 minuty\./.test(t), 'Z7 meta description');
  ['og:title', 'og:description', 'og:type'].forEach(p => ok(new RegExp('<meta property="' + p + '"').test(t), 'Z7 ' + p));
  ok(/<meta property="og:url" content="https:\/\/diagnoza\.gamechange\.pl\/">/.test(t), 'Z7 og:url');
  ok(/src="Logo_Gamechange\.png"/.test(t), 'Z7 logo wskazuje Logo_Gamechange.png');
  ['2018', '2017', '2016'].forEach(r => ok(t.indexOf('<option value="' + r + '">' + r + '</option>') !== -1, 'Z7 rocznik ' + r + ' na liście'));
  probuj('Z7 pole rodzica tylko poniżej 18 lat', () => {
    const fn = wytnijZ(t, 'updateAgeFromYear');
    ok(fn.length > 100, 'Z7 strażnik strażnika: `updateAgeFromYear` wycięta');
    const el = {};
    const get = (id) => el[id] || (el[id] = { style: {}, textContent: '', value: '' });
    const rok = new Date().getFullYear();
    const c = { document: { getElementById: get }, ctx: {}, setTimeout() {}, ctxProgress() {}, parseInt, Date };
    vm.createContext(c); vm.runInContext(fn, c);
    c.updateAgeFromYear(String(rok - 10));
    ok(get('parent-email-wrap').style.display === 'block', 'Z7 10 lat → pole rodzica widoczne');
    c.updateAgeFromYear('2018');
    ok(c.ctx.age === rok - 2018, 'Z7 rocznik 2018 przyjęty (wiek ' + (rok - 2018) + ')', String(c.ctx.age));
    c.updateAgeFromYear(String(rok - 17));
    ok(get('parent-email-wrap').style.display === 'block', 'Z7 17 lat → widoczne');
    get('parent-email-input').value = 'rodzic@x.pl';
    c.updateAgeFromYear(String(rok - 18));
    ok(get('parent-email-wrap').style.display === 'none', '⭐ Z7 18 lat → pole rodzica SCHOWANE');
    ok(get('parent-email-input').value === '', 'Z7 schowane pole nie niesie wpisanego wcześniej adresu');
    c.updateAgeFromYear('2019');
    ok(c.ctx.age === null, 'Z7 rocznik 2019 nadal odrzucany (granica 2018)');
  });
  const gad = wytnijDoNastepnejZ(t, 'generateAIDiagnosis');
  ok(gad.length > 1000, 'Z7 strażnik strażnika: `generateAIDiagnosis` wycięta');
  const iMax = gad.indexOf("data.stop_reason === 'max_tokens'");
  const iSyt = gad.indexOf("raw.includes('[SYTUACJA]')");
  ok(iMax !== -1 && iSyt !== -1 && iMax < iSyt, '⭐ Z7 `max_tokens` sprawdzane PRZED przyjęciem opisu ze znacznikiem [SYTUACJA]');
  const galaz = iMax === -1 ? '' : gad.slice(iMax, iSyt);
  ok(/_diagState\.odczytDiagnozy = false;/.test(galaz), 'Z7 ucięty opis = nieudany odczyt (ścieżka `renderNieudanyOdczytDiagnozy`)');
  ok(!/renderDiagnosisV2\(/.test(galaz), 'Z7 ucięty tekst NIE jest renderowany');

  /* ── Z2 (CSS — kształt; pomiar w przeglądarce jest w nocie) ─────── */
  const media = (t.match(/@media \(max-width: 480px\) \{\n  \.survey-body[\s\S]*?\n\}/) || [''])[0];
  ok(media.length > 0, 'Z2 strażnik strażnika: blok @media 480px ankiety istnieje');
  ok(/\.scale-btn \{[^}]*min-width: 0/.test(media), 'Z2 przycisk skali może się zwęzić (`min-width: 0`)');
  ok(/\.scale-btn \{[^}]*min-height: 56px/.test(media), 'Z2 przycisk ma co najmniej 56 px wysokości (cel dotyku ≥ 44)');
  ok(/\.gc-liczby > div \{[^}]*min-width: 0/.test(media), 'Z2 rząd liczb na starcie może się zwęzić');
  ok(/class="gc-liczby"/.test(t), 'Z2 rząd liczb ma klasę `gc-liczby`');
  return W;
}

/* ── przebieg na prawdziwym pliku ─────────────────────────────────────── */
let ok = 0, fail = 0; const bledy = [];
console.log('\nDIAGNOZA PAKIET 0 — strażnik (12.11.2026)');
sprawdzTekst(HTML).forEach(w => {
  if (w.ok) { ok++; console.log('  ok  ' + w.nazwa); }
  else { fail++; bledy.push(w.nazwa); console.log('  FAIL ' + w.nazwa + (w.extra ? '  [' + w.extra + ']' : '')); }
});
const logo = path.join(KATALOG, 'Logo_Gamechange.png');
if (fs.existsSync(logo) && fs.statSync(logo).size > 1000) { ok++; console.log('  ok  Z7 plik Logo_Gamechange.png istnieje'); }
else { fail++; bledy.push('Z7 plik Logo_Gamechange.png'); console.log('  FAIL Z7 plik Logo_Gamechange.png nie istnieje'); }

/* ── 9. BATERIA MUTACJI — na TEKŚCIE, nie na pliku ────────────────────── */
console.log('\n9. bateria mutacji (tekst w pamięci, dysk nietknięty)');
const zapalenia = (t) => sprawdzTekst(t).filter(w => !w.ok).map(w => w.nazwa);
const odwrotna = zapalenia(HTML);
if (odwrotna.length === 0) { ok++; console.log('  ok  ⭐ ASERCJA ODWROTNA: prawdziwy plik — zero zapaleń'); }
else { fail++; bledy.push('asercja odwrotna'); console.log('  FAIL asercja odwrotna: ' + odwrotna.join(' | ')); }

const r1 = (t, a, b) => { const i = t.indexOf(a); return i === -1 ? t + '\n/*KOTWICA-BRAK*/' : t.slice(0, i) + b + t.slice(i + a.length); };
const MUTACJE = [
  ['M1 wytrzymalosc[1] wraca do dir: 1 (błąd z 20.07.2026)', t => r1(t, "co powinieneś zrobić?', dir: -1,", "co powinieneś zrobić?', dir: 1,")],
  ['M2 techSpec[1] wraca do dir: 1', t => r1(t, "Jak często tak się dzieje?', dir: -1,", "Jak często tak się dzieje?', dir: 1,")],
  ['M3 ktoś „poprawia" proste pytanie moc[0] na -1', t => r1(t, "Kto częściej dociera do piłki jako pierwszy?', dir: 1,", "Kto częściej dociera do piłki jako pierwszy?', dir: -1,")],
  ['M4 `calcScores` traci odwracanie (7 - v → v)', t => r1(t, 'q.dir === 1 ? v : (7 - v)', 'q.dir === 1 ? v : v')],
  ['M5 deficyt znów zależny od ważności dla pozycji', t => r1(t, "    if (cls === 'deficit') groups.g1.push(entry);\n    else if ((tier", "    if ((tier === 'key' || tier === 'important') && cls === 'deficit') groups.g1.push(entry);\n    else if ((tier")],
  ['M6 stary nagłówek wraca', t => r1(t, 'Twoje wąskie gardło:<br><em>${esc(pelnaNazwaObszaru(idWaskiegoGardla))}</em>', 'Twoja gra ma<br><em>${worstSeg.name.toLowerCase()}</em> jako wąskie gardło')],
  ['M7 pełna nazwa zastąpiona skrótem', t => r1(t, "tolerancja: 'Tolerancja obciążeń',", "tolerancja: 'Tol. obciążeń',")],
  ['M8 flaga Z4 przestaje bramkować', t => r1(t, 'if (!GC_ZAPIS_ODPOWIEDZI_ENABLED) return {};', '')],
  ['M9 `duration_s` 0 zamiast null', t => r1(t, "if (typeof _gcCzasWejsciaDoAnkiety !== 'number') return null;", "if (typeof _gcCzasWejsciaDoAnkiety !== 'number') return 0;")],
  ['M10 zdarzenie lejka bez „raz na przejście"', t => r1(t, 'if (_gcZdarzeniaPrzejscia.has(nazwa)) return false;', '')],
  ['M11 `restart` nie zeruje przejścia', t => r1(t, '_gcZdarzeniaPrzejscia = new Set(); _gcCzasWejsciaDoAnkiety = null;', '')],
  ['M12 `survey_half` przy 13 odpowiedziach', t => r1(t, 'const GC_PROG_POLOWY_ANKIETY = 14;', 'const GC_PROG_POLOWY_ANKIETY = 13;')],
  ['M13 pole rodzica znów dla każdego wieku', t => r1(t, 'const pokaz = age < 18;', 'const pokaz = true;')],
  ['M14 granica rocznika wraca do 2015', t => r1(t, 'year > 2018) {', 'year > 2015) {')],
  ['M15 ucięty opis znów pokazywany (gałąź max_tokens usunięta)', t => r1(t, "} else if (data && data.stop_reason === 'max_tokens') {", "} else if (false) {")],
  ['M16 nieprawdziwe zdanie wraca', t => r1(t, 'Podaj email, żeby pobrać raport', 'Podaj email — wyślemy też kopię na Twoją skrzynkę')],
  ['M17 znacznik wersji zostaje na 2', t => r1(t, 'const GC_WERSJA_WYNIKU_W_LINKU = 3;', 'const GC_WERSJA_WYNIKU_W_LINKU = 2;')],
  ['M18 przycisk skali bez min-width: 0 (powrót przewijania w bok)', t => r1(t, '.scale-btn { min-width: 0; height: auto;', '.scale-btn { height: auto;')],
  ['M19 Z4 pola trafiają do KAŻDEGO zdarzenia', t => r1(t, "    saveToSupabase('diagnostics', buildDiagnosticsRecord({ event: nazwa }));", "    saveToSupabase('diagnostics', buildDiagnosticsRecord(Object.assign({ event: nazwa }, polaSurowychOdpowiedzi())));")],
];
MUTACJE.forEach(([nazwa, psuj]) => {
  const zm = psuj(HTML);
  if (zm === HTML || /KOTWICA-BRAK/.test(zm)) { fail++; bledy.push(nazwa + ' — kotwica mutacji nie pasuje'); console.log('  FAIL ' + nazwa + ' — kotwica nie pasuje (mutacja niczego nie zmieniła)'); return; }
  const z = zapalenia(zm);
  if (z.length) { ok++; console.log('  ok  ' + nazwa + ' → zapala: ' + z.slice(0, 3).join(' | ') + (z.length > 3 ? ' (+' + (z.length - 3) + ')' : '')); }
  else { fail++; bledy.push(nazwa + ' — NIC SIĘ NIE ZAPALIŁO'); console.log('  FAIL ' + nazwa + ' — NIC SIĘ NIE ZAPALIŁO'); }
});

console.log('\n════════════════════════════════════════');
console.log('  ok:   ' + ok);
console.log('  FAIL: ' + fail);
if (fail) bledy.forEach(b => console.log('  · ' + b));
console.log('════════════════════════════════════════');
process.exit(fail ? 1 : 0);

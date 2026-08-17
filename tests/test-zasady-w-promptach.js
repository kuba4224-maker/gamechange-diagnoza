/* tests/test-zasady-w-promptach.js — STRAŻNIK: zasady produktu nie wypadną z promptów lejka
 *
 * PLAN-D-X 08.2026 (14.08.2026). Odpowiednik strażnika S5 z `gamechange-app`,
 * przepisany na HTML: prompty lejka nie są funkcjami w plikach `api/`, tylko
 * literałami wewnątrz jednego pliku `index.html` (412 KB).
 *
 * ⚠️ TO JEST STRAŻNIK NA REGUŁĘ, NIE NA LISTĘ. Nigdzie w tym pliku nie ma spisu
 * pięciu znanych promptów. Prompty są WYKRYWANE:
 *   oś 1 — każdy literał, który zaczyna się od „Jesteś " i ma > 200 znaków;
 *   oś 2 — każde wywołanie fetch('/api/diagnose').
 * Liczby z obu osi muszą się zgadzać. Szósty prompt dopisany za miesiąc zapala
 * ten plik NAWET JEŚLI nikt nigdzie go nie dopisze — a jeśli zostanie napisany
 * inaczej niż „Jesteś …", zapala oś 2 przez rozjazd liczb.
 *
 * Uruchomienie:  node tests/test-zasady-w-promptach.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const KORZEN = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(KORZEN, 'index.html'), 'utf8');
const DIAGNOSE = fs.readFileSync(path.join(KORZEN, 'api', 'diagnose.js'), 'utf8');
const ZRODLO = require(path.join(KORZEN, 'zasady-promptu.js'));
const { ZASADY_PROMPTU, MARKER_ZASAD, ODBIORCY, ZASADY_PROMPTU_META } = ZRODLO;

/* ══════════════════════════════════════════════════════════════════════════
   WYJĄTKI — prompty, które ŚWIADOMIE nie dostają bloku zasad.
   Każdy klucz MUSI mieć niepusty powód. Osobna asercja sprawdza, że wyjątek
   naprawdę bloku NIE wstrzykuje — żeby nikt nie schował działającego promptu
   na tej liście po cichu.
   14.08.2026: lista jest PUSTA. Wszystkie prompty lejka niosą blok.
   ══════════════════════════════════════════════════════════════════════════ */
const WYJATKI = {
  // 'fragment rozpoznawczy promptu': 'powód, dla którego ten prompt nie ma bloku',
};

/* ── mikro-runner ───────────────────────────────────────────────────────── */
let ok = 0, fail = 0;
const bledy = [];
let biezacy = '';
function scenario(nazwa) { biezacy = nazwa; console.log('\n— ' + nazwa); }
function assert(warunek, opis) {
  if (warunek) { ok++; console.log('  ok  ' + opis); }
  else { fail++; bledy.push(biezacy + ' :: ' + opis); console.log('  FAIL ' + opis); }
}
function assertEq(a, b, opis) {
  assert(a === b, opis + '  [' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ']');
}

/* ══════════════════════════════════════════════════════════════════════════
   A. ŹRÓDŁO ZASAD
   ══════════════════════════════════════════════════════════════════════════ */
scenario('A. zasady-promptu.js — jedno źródło, trzy warianty');

assert(!!ZASADY_PROMPTU && typeof ZASADY_PROMPTU === 'object', 'ZASADY_PROMPTU jest obiektem');
assertEq(ODBIORCY.join(','), 'zawodnik,rodzic,trener', 'odbiorcy: zawodnik, rodzic, trener');
assertEq(Object.keys(ZASADY_PROMPTU).sort().join(','), ODBIORCY.slice().sort().join(','),
  'ZASADY_PROMPTU ma dokładnie te warianty, które deklaruje ODBIORCY');

const LINIE = {};
for (const o of ODBIORCY) {
  const blok = ZASADY_PROMPTU[o];
  LINIE[o] = blok.split('\n');
  assertEq(LINIE[o].length, ZASADY_PROMPTU_META.liniiWBloku, 'wariant "' + o + '" ma zadeklarowaną liczbę linii');
  assert(LINIE[o].length <= ZASADY_PROMPTU_META.sufitLinii, 'wariant "' + o + '" mieści się w suficie ' + ZASADY_PROMPTU_META.sufitLinii + ' linii');
  assert(blok.indexOf(MARKER_ZASAD) === 0, 'wariant "' + o + '" zaczyna się markerem');
  assert(blok.indexOf('formatu odpowiedzi ani liczbowych ograniczeń podanych niżej w tym prompcie nie zmieniają') !== -1,
    'wariant "' + o + '" niesie zdanie o nadrzędności kontraktu wyjścia');
  assert(blok.indexOf('\n\n') === -1, 'wariant "' + o + '" nie ma pustych linii w środku');
  for (let n = 1; n <= 13; n++) {
    assert(new RegExp('(^|\\n)' + n + '\\. ').test(blok), 'wariant "' + o + '" ma punkt ' + n);
  }
}

scenario('A2. dwanaście linii bloku jest BAJT W BAJT wspólne — jedno źródło naprawdę jest jedno');
let wspolne = 0;
const rozne = [];
for (let i = 0; i < ZASADY_PROMPTU_META.liniiWBloku; i++) {
  const a = LINIE.zawodnik[i], b = LINIE.rodzic[i], c = LINIE.trener[i];
  if (a === b && b === c) wspolne++; else rozne.push(i);
}
assertEq(wspolne, 12, 'dwanaście linii identycznych we wszystkich trzech wariantach');
assertEq(rozne.join(','), '0,5', 'różnią się dokładnie linia 1 (nagłówek) i linia 6 (punkt 5 — N3)');

scenario('A3. md5 bloku zgadza się z zadeklarowanym — ciche przepisanie zasad zapala ten plik');
const md5Bloku = crypto.createHash('md5')
  .update(ODBIORCY.map(o => ZASADY_PROMPTU[o]).join('\n'), 'utf8').digest('hex');
assertEq(md5Bloku, ZASADY_PROMPTU_META.md5, 'md5 treści bloku === ZASADY_PROMPTU_META.md5');
assert(ZASADY_PROMPTU_META.bajtWBajtZPierwszaKopia === false,
  'plik jawnie deklaruje, że NIE jest bajt w bajt zgodny z gamechange-app/lib/zasady-promptu.js');

scenario('A4. w bloku nie ma miękkości — te frazy pilnował strażnik S5 w drugim repozytorium');
const MIEKKOSC = [
  /złagodź ton/i,
  /nie karzący/i,
  /nigdy oceniający/i,
  /ton ciepły i pomocny/i,
  /zamiast być w pełni asertywnym/i,
  /delikatna sugestia/i,
  /niealarmistyczn/i,
];
for (const o of ODBIORCY) {
  for (const wz of MIEKKOSC) {
    assert(!wz.test(ZASADY_PROMPTU[o]), 'wariant "' + o + '" nie niesie frazy ' + wz);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   B. WYKRYWANIE PROMPTÓW — REGUŁA
   ══════════════════════════════════════════════════════════════════════════ */

// Skaner: od otwierającego cudzysłowu/backticka idzie przez wyrażenie JS
// (śledzi stringi, escape'y, `${}` i nawiasy) aż do `;` na poziomie zerowym.
function wytnijWyrazenie(src, startDelim) {
  const delim = src[startDelim];
  let i = startDelim + 1;
  let wString = delim;      // aktualny delimiter stringa albo null
  let szablonGl = delim === '`' ? [0] : [];  // głębokości ${} dla template literali
  let nawiasy = 0;
  while (i < src.length) {
    const c = src[i];
    if (wString) {
      if (c === '\\') { i += 2; continue; }
      if (wString === '`' && c === '$' && src[i + 1] === '{') { szablonGl.push(-1); wString = null; nawiasy++; i += 2; continue; }
      if (c === wString) { wString = null; i++; continue; }
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { wString = c; i++; continue; }
    if (c === '(' || c === '[' || c === '{') { nawiasy++; i++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      nawiasy--; i++;
      if (nawiasy >= 0 && szablonGl.length && szablonGl[szablonGl.length - 1] === -1 && c === '}') {
        szablonGl.pop(); wString = '`';
      }
      continue;
    }
    if (c === ';' && nawiasy === 0) return src.slice(startDelim, i);
    i++;
  }
  return null;
}

scenario('B. wykrywanie promptów systemowych w index.html — reguła, nie lista');

const wykryte = [];
const RE_START = /['"`]Jesteś /g;
let m;
while ((m = RE_START.exec(HTML)) !== null) {
  const idxDelim = m.index;
  const wyr = wytnijWyrazenie(HTML, idxDelim);
  if (!wyr || wyr.length <= 200) continue;
  const linia = HTML.slice(0, idxDelim).split('\n').length;
  wykryte.push({ linia, wyr, podpis: HTML.slice(idxDelim + 1, idxDelim + 70) });
}

console.log('  wykryte prompty: ' + wykryte.map(w => w.linia).join(', '));

// ⚠️ STRAŻNIK STRAŻNIKA — pusty przebieg nie może wyglądać jak sukces.
// ⚠️ PRZESTAWIONE 16.08.2026 przez PLAN-D-Y4 (D3): 5→3. Dwa prompty — raportu
// dla rodzica i rekomendacji dla trenera — leżały w MARTWYM REGIONIE (`?parent=`
// i `?team=`), do którego nie prowadziła żadna ścieżka wywołania. Nie dało się
// ich wysłać do modelu ANI RAZU. Usunięte razem z funkcjami, które je budowały.
// ⛔ Rola tej asercji jest nietknięta: pusty przebieg nadal nie ma prawa
// wyglądać jak sukces. Zmniejszenie tej liczby PONIŻEJ 3 to znów czerwień.
assert(wykryte.length >= 3, 'wykrywanie znalazło co najmniej 3 prompty (znalazło: ' + wykryte.length + ')');

// ⚠️ ROZSZERZONE 14.08.2026 (sesja naprawcza po odbiorze pasa X).
// ZMIERZONY WYŁOM: regex brzmiał /fetch\(\s*'\/api\/diagnose'/ — dopuszczał
// WYŁĄCZNIE apostrof. Szósty prompt wysłany przez fetch("/api/diagnose")
// w podwójnym cudzysłowie nie był liczony, więc oś 2 dawała tę samą liczbę
// co przedtem i cała ta asercja — jedyna, która łapie prompt napisany
// inaczej niż „Jesteś …" — przechodziła na zielono.
// Teraz: oba rodzaje cudzysłowu, backtick (bo lejek pisze prompty w template
// literalach), spacja po `fetch` i wokół argumentu.
const RE_FETCH_DIAGNOSE = /fetch\s*\(\s*['"`]\/api\/diagnose['"`]/g;
const wywolaniaApi = (HTML.match(RE_FETCH_DIAGNOSE) || []).length;
assertEq(wywolaniaApi, wykryte.length,
  'liczba wywołań /api/diagnose === liczba wykrytych promptów (szósty prompt napisany inaczej niż „Jesteś …" zapala właśnie tę asercję)');

scenario('B2. każdy wykryty prompt niesie blok zasad — albo stoi na liście wyjątków z powodem');
const RE_ODWOLANIE = /ZASADY_PROMPTU\.(\w+)/g;
for (const w of wykryte) {
  const kluczWyjatku = Object.keys(WYJATKI).find(k => w.wyr.indexOf(k) !== -1);
  if (kluczWyjatku) {
    assert(String(WYJATKI[kluczWyjatku] || '').length > 20,
      'wyjątek "' + kluczWyjatku + '" ma zapisany powód');
    assert(w.wyr.indexOf('ZASADY_PROMPTU') === -1,
      'wyjątek "' + kluczWyjatku + '" naprawdę NIE wstrzykuje bloku (linia ' + w.linia + ')');
    continue;
  }
  const odw = w.wyr.match(RE_ODWOLANIE) || [];
  assertEq(odw.length, 1, 'prompt w linii ' + w.linia + ' odwołuje się do bloku dokładnie raz');
  const odbiorca = odw.length ? odw[0].split('.')[1] : null;
  assert(ODBIORCY.indexOf(odbiorca) !== -1,
    'prompt w linii ' + w.linia + ' używa istniejącego wariantu odbiorcy ("' + odbiorca + '")');
  w.odbiorca = odbiorca;
}
assertEq(Object.keys(WYJATKI).length, 0,
  'lista wyjątków jest pusta — każdy prompt lejka niesie zasady produktu');

/* ══════════════════════════════════════════════════════════════════════════
   B2a. KONKRETNY PROMPT → KONKRETNY WARIANT
   ⚠️ DOŁOŻONE 14.08.2026 (sesja naprawcza po odbiorze pasa X).
   ZMIERZONY WYŁOM: B2 sprawdzało tylko, że wariant ISTNIEJE („używa
   istniejącego wariantu odbiorcy"). Podmiana `ZASADY_PROMPTU.rodzic` na
   `ZASADY_PROMPTU.trener` w prompcie rodzica przechodziła na zielono —
   rodzic dostawał blok, w którym punkt 5 zezwala na dane zbiorcze drużyny,
   czyli dokładnie to, czego jego wariant zakazuje bezwzględnie.
   ⚠️ TO JEST JEDYNE MIEJSCE W TYM PLIKU, GDZIE STOI LISTA — i inaczej się nie
   da: „który to prompt" jest faktem o treści, nie regułą do wyprowadzenia.
   Lista nie jest jednak workiem: podpis jest wiązany z promptem jeden do
   jednego w obie strony, a liczba wpisów musi się zgadzać z liczbą wykrytych
   promptów. Szósty prompt zapala tę sekcję tak samo jak oś 2.
   ══════════════════════════════════════════════════════════════════════════ */
scenario('B2a. każdy prompt niesie wariant SWOJEGO odbiorcy, nie dowolny istniejący');
/* ⛔ DWA PODPISY SKREŚLONE 16.08.2026 przez PLAN-D-Y4 (decyzja D3):
     'Piszesz krótki raport dla rodzica zawodnika'            (rodzic)
     'Analizujesz dane drużyny i piszesz rekomendację dla trenera' (trener)
   Oba prompty leżały w martwym regionie: pierwszy w `generateParentReport`
   (dispatch `?parent=` wycięty 08.08.2026), drugi w `generateTeamAIRecommendation`
   (dispatch `?team=` wycięty tym samym P0-2). ŻADEN z nich nie miał ścieżki
   wywołania, więc żaden nie mógł zostać wysłany do modelu.
   ⭐ ZASADY DLA RODZICA NIE ZNIKAJĄ Z PRODUKTU: wariant `ZASADY_PROMPTU.rodzic`
   stoi nietknięty w `zasady-promptu.js`, a raport dla rodzica generuje dziś
   backend (`gamechange-app/lib/parent-reports.js`) — tam ten wariant pracuje.
   ⚠️ Ten plik pilnuje promptów W LEJKU, a w lejku tych dwóch już nie ma.
   ⛔ Lista dalej wiąże podpis z promptem JEDEN DO JEDNEGO w obie strony,
   a `WARIANT_PROMPTU.length === wykryte.length` nadal zapala się na każdym
   prompcie dołożonym bez wpisu. */
const WARIANT_PROMPTU = [
  { podpis: 'generujesz pytania dla jego trenera', odbiorca: 'trener' },
  { podpis: 'Napisz ulepszoną diagnozę która łączy obie perspektywy', odbiorca: 'trener' },
  { podpis: 'piszesz diagnozę bezpośrednio do zawodnika', odbiorca: 'zawodnik' },
];

assertEq(WARIANT_PROMPTU.length, wykryte.length,
  'oczekiwanych par (prompt → wariant) jest tyle, ile wykrytych promptów');

const trafienia = new Map(WARIANT_PROMPTU.map(w => [w.podpis, 0]));
for (const w of wykryte) {
  const pasujace = WARIANT_PROMPTU.filter(v => w.wyr.indexOf(v.podpis) !== -1);
  assertEq(pasujace.length, 1,
    'prompt w linii ' + w.linia + ' pasuje do DOKŁADNIE JEDNEGO podpisu z listy oczekiwań');
  if (pasujace.length !== 1) continue;
  trafienia.set(pasujace[0].podpis, trafienia.get(pasujace[0].podpis) + 1);
  assertEq(w.odbiorca, pasujace[0].odbiorca,
    'prompt w linii ' + w.linia + ' („' + pasujace[0].podpis.slice(0, 40) + '…") wstrzykuje ZASADY_PROMPTU.' + pasujace[0].odbiorca);
}
const nietrafione = Array.from(trafienia.entries()).filter(([, n]) => n !== 1).map(([p, n]) => p + '×' + n);
assertEq(nietrafione.join(' | '), '',
  'każdy podpis z listy oczekiwań trafił w dokładnie jeden prompt (nietrafione: ' + (nietrafione.join(' | ') || 'brak') + ')');

// Rozkład odbiorców jest faktem o lejku, nie ozdobnikiem. Zmiana tego rozkładu
// ma być decyzją, nie skutkiem ubocznym.
// ⚠️ ZMIENIONE 16.08.2026 przez PLAN-D-Y4 — I TO JEST TA DECYZJA (D3).
// Było: 'zawodnik:1, rodzic:1, trener:3'. Jest: 'zawodnik:1, rodzic:0, trener:2'.
// Zniknęły dokładnie dwa prompty z martwego regionu, wyliczone przy `WARIANT_PROMPTU`.
// ⛔ Zapadka zostaje na RÓWNOŚĆ: pierwszy prompt dołożony do lejka bez decyzji
// przestawi ten rozkład i zapali czerwień.
const rozklad = ODBIORCY.map(o => o + ':' + wykryte.filter(w => w.odbiorca === o).length).join(', ');
assertEq(rozklad, 'zawodnik:1, rodzic:0, trener:2',
  'rozkład wariantów w lejku: jeden prompt zawodnika, zero rodzica, dwa trenera');

scenario('B3. blok stoi w prompcie otoczony pustą linią z obu stron');
for (const w of wykryte) {
  if (!w.odbiorca) continue;
  const szablon = w.wyr.indexOf('${ZASADY_PROMPTU.') !== -1;
  const wzor = szablon
    ? new RegExp('\\n\\n\\$\\{ZASADY_PROMPTU\\.' + w.odbiorca + '\\}\\n\\n')
    : new RegExp("\\\\n\\\\n' \\+ ZASADY_PROMPTU\\." + w.odbiorca + " \\+ '\\\\n\\\\n");
  assert(wzor.test(w.wyr), 'prompt w linii ' + w.linia + ' — blok otoczony dokładnie dwiema nowymi liniami');
}

/* ══════════════════════════════════════════════════════════════════════════
   C. STAŁOŚĆ WSTRZYKNIĘCIA (X4) — pomiar na ZBUDOWANYM stringu, nie na źródle
   ══════════════════════════════════════════════════════════════════════════ */
scenario('C. przyrost znaków w każdym prompcie === długość jego wariantu + 2');

// Buduje prompt naprawdę: wykonuje wyrażenie w piaskownicy, w której każda
// nieznana zmienna jest pustym stringiem, a ZASADY_PROMPTU jest prawdziwe.
function zbuduj(wyr) {
  const piaskownica = new Proxy({ ZASADY_PROMPTU: ZASADY_PROMPTU }, {
    has: () => true,
    get: (t, k) => (k in t ? t[k] : ''),
  });
  return vm.runInNewContext('(' + wyr + ')', vm.createContext(piaskownica), { timeout: 5000 });
}

const przyrosty = [];
for (const w of wykryte) {
  if (!w.odbiorca) continue;
  const zBlokiem = zbuduj(w.wyr);
  const bezWyr = w.wyr
    .replace(new RegExp('\\$\\{ZASADY_PROMPTU\\.' + w.odbiorca + '\\}\\n\\n'), '')
    .replace(new RegExp("' \\+ ZASADY_PROMPTU\\." + w.odbiorca + " \\+ '\\\\n\\\\n"), '');
  assert(bezWyr !== w.wyr, 'prompt w linii ' + w.linia + ' — udało się odtworzyć wersję bez bloku');
  const bezBloku = zbuduj(bezWyr);
  const przyrost = zBlokiem.length - bezBloku.length;
  const oczekiwany = ZASADY_PROMPTU[w.odbiorca].length + 2;
  przyrosty.push({ linia: w.linia, odbiorca: w.odbiorca, bez: bezBloku.length, z: zBlokiem.length, przyrost });
  assertEq(przyrost, oczekiwany,
    'prompt ' + w.linia + ' (' + w.odbiorca + '): ' + bezBloku.length + ' → ' + zBlokiem.length);
  assert(zBlokiem.indexOf(MARKER_ZASAD) !== -1, 'prompt ' + w.linia + ' — zbudowany string niesie marker');
  assert(bezBloku.indexOf(MARKER_ZASAD) === -1, 'prompt ' + w.linia + ' — bez wstrzyknięcia markera nie ma');
}

scenario('C2. ten sam odbiorca === ten sam przyrost, co do znaku');
for (const o of ODBIORCY) {
  const grupa = przyrosty.filter(p => p.odbiorca === o);
  if (!grupa.length) continue;
  const unikalne = Array.from(new Set(grupa.map(p => p.przyrost)));
  assertEq(unikalne.length, 1,
    'wariant "' + o + '" (' + grupa.length + ' promptów, linie ' + grupa.map(p => p.linia).join('/') + ') — jeden przyrost: ' + unikalne.join('/'));
}

/* ══════════════════════════════════════════════════════════════════════════
   D. KONTRAKTY WYJŚCIA — blok rządzi treścią, nie formatem
   ══════════════════════════════════════════════════════════════════════════ */
scenario('D. twarde kontrakty wyjścia lejka są nietknięte');
assert(/Format odpowiedzi — tylko JSON, bez żadnego dodatkowego tekstu/.test(HTML),
  'prompt pytań dla trenera nadal żąda czystego JSON');
for (const znacznik of ['[SYTUACJA]', '[MECHANIZM]', '[JAK TO WIDAC]', '[JAK SIE ZMIENI GRA]', '[KIERUNEK]', '[PYTANIE]']) {
  assert(HTML.indexOf(znacznik) !== -1, 'diagnoza zawodnika nadal ma znacznik ' + znacznik);
}
assert(/raw\.includes\('\[SYTUACJA\]'\)/.test(HTML), 'parser diagnozy nadal sprawdza [SYTUACJA]');
assert(/JSON\.parse\(clean\)/.test(HTML), 'parser pytań dla trenera nadal robi JSON.parse');

scenario('D2. api/diagnose.js nadal jest tylko przekaźnikiem');
assert(/messages: \[\{ role: 'user', content: prompt \}\]/.test(DIAGNOSE),
  'diagnose.js wysyła prompt bez modyfikacji, jako jedyną wiadomość użytkownika');
assert(!/system:/.test(DIAGNOSE), 'diagnose.js nie dokleja własnego promptu systemowego');

/* ══════════════════════════════════════════════════════════════════════════
   E. ŁADOWANIE ŹRÓDŁA W HTML
   ══════════════════════════════════════════════════════════════════════════ */
scenario('E. index.html ładuje źródło zasad zanim zbuduje jakikolwiek prompt');
const idxTag = HTML.indexOf('<script src="/zasady-promptu.js"></script>');
assert(idxTag !== -1, 'index.html ma synchroniczny <script src="/zasady-promptu.js">');
const idxPierwszegoPromptu = Math.min.apply(null, wykryte.map(w => HTML.indexOf(w.wyr)));
assert(idxTag !== -1 && idxTag < idxPierwszegoPromptu, 'tag stoi PRZED pierwszym promptem w pliku');
// Zakazane jest PODSTAWIENIE czegokolwiek w miejsce brakującego bloku
// (`ZASADY_PROMPTU.x || ''`, `?? ''`, `?.`). Samo SPRAWDZENIE i zgłoszenie błędu
// — jak w kontroli w <head> — zakazane nie jest: ono nic nie podstawia.
assert(!/ZASADY_PROMPTU(\.\w+)?\s*(\|\||\?\?)\s*['"`]/.test(HTML) && !/ZASADY_PROMPTU\s*\?\./.test(HTML),
  'nie ma cichego obejścia braku bloku (żadnego `|| \'\'`, `?? \'\'` ani `?.`) — brak pliku ma być głośny');
assert(/console\.error\('PLAN-D-X/.test(HTML), 'brak pliku zasad zgłasza się błędem w konsoli');

/* ══════════════════════════════════════════════════════════════════════════ */
console.log('\n════════════════════════════════════════');
console.log('  ok:   ' + ok);
console.log('  FAIL: ' + fail);
if (fail) {
  console.log('\nCZERWONE:');
  bledy.forEach(b => console.log('  · ' + b));
}
console.log('════════════════════════════════════════');
process.exit(fail ? 1 : 0);

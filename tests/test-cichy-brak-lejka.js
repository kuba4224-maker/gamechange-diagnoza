/* tests/test-cichy-brak-lejka.js — STRAŻNIK: lejek diagnozy nie kłamie po padniętym odczycie
 *
 * PLAN-D-Y1 08.2026 (16.08.2026). `index.html` to PIERWSZY ekran, jaki zawodnik
 * widzi w tym produkcie — wchodzi w niego bez konta i bez historii. Odczyt, który
 * padnie po cichu, nie ma jak upomnieć się o siebie drugi raz: zawodnik zamyka kartę.
 *
 * URUCHOMIENIE:   node tests/run-all-tests.js      (runner odkrywa `tests/test-*.js` sam)
 * albo osobno:    node tests/test-cichy-brak-lejka.js
 *
 * ⚠️ To repozytorium MA CI — `.github/workflows/testy.yml` uruchamia
 * `node tests/run-all-tests.js` przy każdym `push`. Ten plik pojedzie tam bez
 * żadnej zmiany konfiguracji. (Polecenie pasa Y1 zakładało, że CI tu nie ma;
 * pomiar z 16.08.2026 to obalił — workflow wszedł commitem `0e2bd49`.)
 *
 * PLAN-D-Y2 08.2026 (16.08.2026) — sekcja 8 i mutacje M10–M16 dokładają DRUGĄ
 * stronę tej samej choroby: cichy brak po stronie WEJŚCIA. Do 16.08.2026
 * `btn-submit` był tylko przygaszony (`opacity:0.4`), `onclick` działał, a
 * `calcScores()` wstawiało za każde pytanie bez odpowiedzi środek skali (3.5).
 * Zmierzone: ten sam zawodnik po pełnej ankiecie czytał „Twoja gra ma odwagę
 * w grze jako wąskie gardło", a po sześciu pytaniach „Twój profil jest wyrównany"
 * przy WYŻSZYM wyniku ogólnym. Krótsza droga dawała lepszą liczbę.
 *
 * ⚠️ TO JEST STRAŻNIK NA REGUŁĘ, NIE NA LISTĘ (O69). Nigdzie tu nie ma spisu
 * ścieżek odczytu. Ścieżki są WYKRYWANE: najpierw wyznaczamy zbiór funkcji
 * CZYTAJĄCYCH (domknięcie przechodnie), potem pytamy o nie w ciałach `try`
 * (O79 — bez tego kroku detektor nie zobaczyłby ANI JEDNEGO odczytu przez
 * `gcRpc`, czyli 12 z 30 wywołań sieciowych tego pliku).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const KORZEN = path.join(__dirname, '..');

/* ── mikro-runner (kształt z `tests/test-zasady-w-promptach.js`) ──────────── */
let ok = 0, fail = 0;
const bledy = [];
let biezacy = '';
function scenario(n) { biezacy = n; console.log('\n— ' + n); }
function assert(w, o) {
  if (w) { ok++; console.log('  ok  ' + o); }
  else { fail++; bledy.push(biezacy + ' :: ' + o); console.log('  FAIL ' + o); }
}
function assertEq(a, b, o) { assert(a === b, o + '  [' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ']'); }
/** ⚠️ STRAŻNIK NIE MA PRAWA UMRZEĆ. Na starym kodzie (kontrola historyczna, O70)
 *  brakuje funkcji, o które pytamy — wyjątek zabiłby przebieg w połowie i nie
 *  zobaczylibyśmy CAŁEJ listy trafień. Wyjątek zamieniamy na FAIL z powodem. */
function probuj(opis, fn) {
  try { fn(); }
  catch (e) { fail++; bledy.push(biezacy + ' :: ' + opis + ' — WYJĄTEK: ' + (e && e.message ? e.message : String(e)));
    console.log('  FAIL ' + opis + ' — WYJĄTEK: ' + (e && e.message ? e.message : String(e))); }
}
/** PLAN-D-Y3 08.2026 — `registerCoach` jest `async`, więc jej pomiar URUCHOMIENIOWY
 *  kończy się w mikrozadaniu. `probuj` by go przegapił: `podsumuj()` woła
 *  `process.exit`, zanim `.then` zdąży się wykonać, i test „przechodziłby" pusty.
 *  Obietnice są zbierane tu i domykane PRZED podsumowaniem. */
const OCZEKUJACE = [];
function probujAsync(opis, fn) {
  const gdzie = biezacy;           // scenariusz z chwili REJESTRACJI, nie odrzucenia
  let p;
  try { p = Promise.resolve(fn()); }
  catch (e) { p = Promise.reject(e); }
  OCZEKUJACE.push(p.catch(e => {
    fail++; bledy.push(gdzie + ' :: ' + opis + ' — WYJĄTEK: ' + (e && e.message ? e.message : String(e)));
    console.log('  FAIL ' + opis + ' — WYJĄTEK: ' + (e && e.message ? e.message : String(e)));
  }));
}
function podsumuj() {
  console.log('\n════════════════════════════════════════');
  console.log('  ok:   ' + ok);
  console.log('  FAIL: ' + fail);
  if (fail) { console.log('\nCZERWONE:'); bledy.forEach(b => console.log('  · ' + b)); }
  console.log('════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
}

/* ⛔ O76 — `POMINIĘTE` NIE JEST PRZEJŚCIEM. Brakujący plik daje FAIL z nazwą. */
function wymagajPliku(wzgledna) {
  const p = path.join(KORZEN, wzgledna);
  if (!fs.existsSync(p)) {
    fail++; bledy.push('BRAK PLIKU :: ' + wzgledna);
    console.log('  FAIL brak wymaganego pliku: ' + wzgledna + ' — suita NIE pomija, tylko czerwieni');
    return null;
  }
  ok++; console.log('  ok  jest wymagany plik: ' + wzgledna);
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); // O35 — normalizacja końców linii
}

/* ══════════════════════════════════════════════════════════════════════════
   PARSER JS OSADZONEGO W HTML
   Trzy rzeczy ZMIERZONE na tym pliku, bez których maska się rozjeżdża:
   1) treść poza <script> to nie JS — apostrof w prozie („Stripe'a", l. 1252)
      otwierał fałszywy literał na 1 500 znaków i połykał definicje funkcji,
      o które ten strażnik pyta;
   2) literał wyrażenia regularnego potrafi ZAWIERAĆ cudzysłów
      (`_escapeHtmlLite` robi `.replace(/'/g, '&#39;')`);
   3) granicę bloku wyznacza dopiero `</script>` — napis „<script" w komentarzu
      JS nie otwiera nowego bloku (i `index.html`, i ten plik taki napis mają).
   Komentarze maskujemy, żeby strażnik nie zapalał się na własnej dokumentacji
   cytującej zepsute zdania.
   ══════════════════════════════════════════════════════════════════════════ */
function blokiSkryptow(src) {
  const bloki = []; let i = 0;
  const reOtw = /<script([^>]*)>/i;
  while (true) {
    const reszta = src.slice(i);
    const m = reOtw.exec(reszta);
    if (!m) break;
    const a = i + m.index + m[0].length;
    const b = src.indexOf('</script>', a);
    const koniec = b === -1 ? src.length : b;
    if (!/\bsrc\s*=/i.test(m[1])) bloki.push({ a, b: koniec });
    i = koniec + 9;
  }
  return bloki;
}
function maskuj(src) {
  const o = src.split('');
  const n = src.length;
  const bloki = blokiSkryptow(src);
  const wyczysc = (a, b) => { for (let k = a; k < b && k < n; k++) if (o[k] !== '\n') o[k] = ' '; };
  let kursor = 0;
  for (const bl of bloki) { wyczysc(kursor, bl.a); kursor = bl.b; }
  wyczysc(kursor, n);
  const POPRZEDZA_REGEX = /[(,=:\[!&|?{};+\-*%^~<>]/;
  const SLOWA_PRZED_REGEX = /\b(return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await)$/;
  for (const bl of bloki) {
    let i = bl.a;
    while (i < bl.b) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '*') { let j = src.indexOf('*/', i + 2); j = (j === -1 || j > bl.b) ? bl.b : j + 2; wyczysc(i, j); i = j; continue; }
      if (c === '/' && d === '/') { let j = src.indexOf('\n', i); j = (j === -1 || j > bl.b) ? bl.b : j; wyczysc(i, j); i = j; continue; }
      if (c === '"' || c === "'" || c === '`') {
        let j = i + 1;
        while (j < bl.b) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; }
        j = Math.min(j + 1, bl.b);
        wyczysc(i + 1, j - 1);
        i = j; continue;
      }
      if (c === '/') {
        let k = i - 1;
        while (k >= bl.a && /\s/.test(src[k])) k--;
        const prev = k >= bl.a ? src[k] : null;
        const prefiks = src.slice(Math.max(bl.a, k - 12), k + 1);
        if (prev === null || POPRZEDZA_REGEX.test(prev) || SLOWA_PRZED_REGEX.test(prefiks)) {
          let j = i + 1, klasa = false;
          while (j < bl.b) {
            const z = src[j];
            if (z === '\\') { j += 2; continue; }
            if (z === '[') klasa = true;
            else if (z === ']') klasa = false;
            else if (z === '/' && !klasa) break;
            else if (z === '\n') { j = i; break; }
            j++;
          }
          if (j > i) { wyczysc(i + 1, j); i = Math.min(j + 1, bl.b); continue; }
        }
      }
      i++;
    }
  }
  return o.join('');
}
function dopasuj(M, od, otw, zam) {
  let d = 0;
  for (let k = od; k < M.length; k++) { if (M[k] === otw) d++; else if (M[k] === zam) { d--; if (d === 0) return k; } }
  return -1;
}
function funkcje(src, M) {
  const F = [];
  const re = /(?:^|[^\w$.])(?:(async)\s+)?function\s*(\*?)\s*([A-Za-z_$][\w$]*)?\s*\(/g;
  let m;
  while ((m = re.exec(M))) {
    const idxFn = m.index + m[0].indexOf('function');
    const nw = re.lastIndex - 1;
    const kp = dopasuj(M, nw, '(', ')'); if (kp === -1) continue;
    const ib = M.indexOf('{', kp); if (ib === -1) continue;
    if (/[^\s]/.test(M.slice(kp + 1, ib))) continue;
    const kb = dopasuj(M, ib, '{', '}'); if (kb === -1) continue;
    F.push({ nazwa: m[3] || '(anonim)', od: idxFn, paramOd: nw, a: ib, b: kb + 1 });
  }
  F.sort((x, y) => x.od - y.od);
  return F;
}
const najwezsza = (F, i) => { let b = null; for (const f of F) if (i >= f.a && i < f.b) { if (!b || f.a > b.a) b = f; } return b; };

/* ══════════════════════════════════════════════════════════════════════════
   1. ODKRYWANIE — lista NIE jest wpisana na sztywno (O69)
   ══════════════════════════════════════════════════════════════════════════ */
scenario('1. odkrywanie — strony, funkcje czytające i ścieżki odczytu wykrywane, nie wypisane');

const STRONY = fs.readdirSync(KORZEN).filter(f => /\.html$/i.test(f)).sort();
assert(STRONY.length >= 1, 'w katalogu głównym jest przynajmniej jedna strona (znaleziono: ' + STRONY.join(', ') + ')');
assert(STRONY.indexOf('index.html') !== -1, 'wśród odkrytych stron jest `index.html`');

const HTML = wymagajPliku('index.html');
wymagajPliku('zasady-promptu.js');
wymagajPliku(path.join('api', 'diagnose.js'));
wymagajPliku(path.join('tests', 'run-all-tests.js'));
if (!HTML) podsumuj();

const M = maskuj(HTML);
const FUN = funkcje(HTML, M);
for (const f of FUN) { f.trescM = M.slice(f.a, f.b); f.linia = HTML.slice(0, f.od).split('\n').length; }
const DEKL = new Set(FUN.map(f => f.paramOd));

function znajdz(nazwa) { return FUN.filter(x => x.nazwa === nazwa).pop() || null; }
function wytnij(nazwa) { const f = znajdz(nazwa); return f ? HTML.slice(f.od, f.b) : ''; }
/** ⚠️ Zamaskowanego źródła NIE wolno liczyć na wyciętym fragmencie — poza <script>
 *  maska kasuje wszystko, więc fragment wyszedłby pusty. Tniemy z gotowej maski. */
function wytnijM(nazwa) { const f = znajdz(nazwa); return f ? M.slice(f.od, f.b) : ''; }
/** Przeparsowanie DOWOLNEGO tekstu (bateria mutacji + sekcja 10 pasa Y3). */
const przeparsuj = (t) => { const Mt = maskuj(t); const F = funkcje(t, Mt); for (const f of F) f.trescM = Mt.slice(f.a, f.b); return { Mt, F, znajdz: (n) => F.filter(x => x.nazwa === n).pop() || null }; };
/** Treści literałów w zakresie [a,b): granice z MASKI (komentarze są w niej puste,
 *  więc zdanie zacytowane w komentarzu nie udaje literału), treść z ORYGINAŁU. */
function literaly(a, b) {
  const out = []; let i = a;
  while (i < b) {
    const c = M[i];
    if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < b && M[j] !== c) j++; out.push(HTML.slice(i + 1, j)); i = j + 1; continue; }
    i++;
  }
  return out;
}
/** Czy literał jest ZDANIEM DO CZŁOWIEKA, a nie CSS-em, znacznikiem ani identyfikatorem? */
function zdanieDoCzlowieka(t) {
  if (!t || t.length < 25) return false;
  if (/style=|font-family|font-size|background|padding|margin|border|letter-spacing|cursor:|color:|display:/.test(t)) return false;
  if (/^[a-z-]+:[^;]*;?$/.test(t)) return false;
  return /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(t) || /[a-zA-Z]{3,}\s+[a-zA-Z]{3,}\s+[a-zA-Z]{3,}/.test(t);
}
/** O71 — warunki pojedynczych instrukcji `if` w danej funkcji, wycinane dopasowaniem nawiasów. */
function warunkiIf(nazwa) {
  const f = znajdz(nazwa); if (!f) return [];
  const w = []; const re = /\bif\s*\(/g; let m;
  while ((m = re.exec(f.trescM))) {
    const nw = f.trescM.indexOf('(', m.index);
    const k = dopasuj(f.trescM, nw, '(', ')');
    if (k !== -1) w.push(f.trescM.slice(nw + 1, k));
  }
  return w;
}
function ileWywolan(nazwa, maska) {
  const zr = maska || M;
  const re = new RegExp('\\b' + nazwa.replace(/\$/g, '\\$') + '\\s*\\(', 'g');
  let n = 0;
  while (re.exec(zr)) { if (!DEKL.has(re.lastIndex - 1)) n++; }
  return n;
}

/* Wywołania sieciowe i ścieżki ODCZYTU — wykrywane, nie wypisane. */
const WYW = [];
{
  const re = /\b(fetch|gcRpc)\s*\(/g; let m;
  while ((m = re.exec(M))) {
    const nw = re.lastIndex - 1;
    if (DEKL.has(nw)) continue;                       // to deklaracja funkcji, nie wywołanie
    const kon = dopasuj(M, nw, '(', ')');
    const arg = HTML.slice(nw + 1, kon).replace(/\s+/g, ' ');
    const f = najwezsza(FUN, m.index);
    WYW.push({ rodzaj: m[1], fn: f ? f.nazwa : '(top)', met: (/method:\s*'(\w+)'/.exec(arg) || [])[1] || 'GET', arg, poz: m.index });
  }
}
const ZAPIS_HTTP = ['POST', 'PATCH', 'PUT', 'DELETE'];
const RPC_ZAPIS = /^'(respond_followup|record_player_insight|record_coach_insight)'/;
const SIECIOWE = WYW.filter(w => w.fn !== 'gcRpc');   // `gcRpc` sam jest pośrednikiem, nie ścieżką
const ODCZYTY = SIECIOWE.filter(w => w.rodzaj === 'gcRpc'
  ? !RPC_ZAPIS.test(w.arg.trim())
  : (ZAPIS_HTTP.indexOf(w.met) === -1 || /\/api\/diagnose/.test(w.arg)));

assertEq(SIECIOWE.length, 30, 'zapadka na RÓWNOŚĆ (O73): wywołań sieciowych poza pośrednikiem');
assertEq(ODCZYTY.length, 17, 'zapadka na RÓWNOŚĆ (O73): ŚCIEŻEK ODCZYTU w lejku');
assertEq(SIECIOWE.length - ODCZYTY.length, 13, 'zapadka na RÓWNOŚĆ (O73): ścieżek zapisu');

/* ══════════════════════════════════════════════════════════════════════════
   2. KANON TRZECH WARTOŚCI — URUCHOMIONY, nie przeczytany
   ══════════════════════════════════════════════════════════════════════════ */
scenario('2. trzy wartości, nie dwie');

const KANON = ['wolnoTwierdzic', 'odczytPadl', 'zglosBladOdczytu'].map(wytnij);
assert(KANON.every(x => x.length > 0), 'wszystkie trzy funkcje kanonu stoją w `index.html`');
probuj('kanon trzech wartości daje się URUCHOMIĆ', () => {
  const piaskownica = { console: { error() {}, warn() {}, info() {}, log() {} } };
  vm.createContext(piaskownica);
  vm.runInContext(KANON.join('\n'), piaskownica);
  const wt = piaskownica.wolnoTwierdzic, op = piaskownica.odczytPadl;
  if (typeof wt !== 'function' || typeof op !== 'function') throw new Error('brak `wolnoTwierdzic` albo `odczytPadl` w tym pliku');
  assertEq(wt(true), true, 'tylko jawne `true` otwiera usta');
  [null, undefined, false, 0, 1, 'true', [], {}].forEach(v => {
    assertEq(wt(v), false, 'ZAMYKA usta dla ' + (v === undefined ? 'undefined' : JSON.stringify(v)));
  });
  assertEq(op(false), true, '`odczytPadl(false)` === true');
  [null, undefined, true, 0, ''].forEach(v => {
    assertEq(op(v), false, '`odczytPadl` nie myli braku pytania z awarią: ' + (v === undefined ? 'undefined' : JSON.stringify(v)));
  });
});

scenario('2a. `console.log` NIE jest głosem (O80)');
const zglosM = wytnijM('zglosBladOdczytu');
assert(/console\.error\(/.test(zglosM), '`zglosBladOdczytu` mówi przez `console.error`');
assert(!/console\.log\(/.test(zglosM), '`zglosBladOdczytu` NIE używa `console.log`');

/* ══════════════════════════════════════════════════════════════════════════
   3. REGUŁA 1 — cicha gałąź błędu PRZY ODCZYCIE, zapadka na RÓWNOŚĆ (O73)
   ══════════════════════════════════════════════════════════════════════════ */
scenario('3. reguła 1 — gałąź błędu przy odczycie musi mieć głos');

/** Dług zastany: ścieżki, które ŚWIADOMIE zostają nienaprawione. Powód przy każdej,
 *  inaczej to jest lista wymówek. Zapadka na RÓWNOŚĆ: kto naprawi którąkolwiek
 *  i nie skreśli — czerwień. Kto dołoży kolejną — też. */
const DLUG_ZASTANY = {
  /* ⛔ SKREŚLONE 16.08.2026 przez PLAN-D-Y3 (decyzja D6). `registerCoach` miał
     pusty `catch` wokół odczytu „czy ten trener ma już kod" — awaria sieci szła
     dalej do generatora i drużyna dostawała DRUGI kod. Dziś to trzeci stan (R5):
     nie wiemy → nie wydajemy niczego i mówimy to wprost. Pomiar: sekcja 10f. */
  'triggerFeedbackDigest': 'MARTWY REGION (LEJEK R8, 08.08.2026) — jedyny wyzwalacz wykomentowany; `catch` mówi do przycisku, nie do konsoli',
  'loadFeedbackAnalysis': 'MARTWY REGION — po zdjęciu polityki anon SELECT (P0-2) odczyt zawsze pusty, wyzwalacz wycięty',
  'loadParentView': 'MARTWY REGION — dispatch `?parent=` pokazuje dziś uczciwy komunikat zamiast wołać tę funkcję',
  'loadTeamView': 'MARTWY REGION — dispatch `?team=` wycięty (P0-2); panel przeniesiony do `gamechange-app/coach.html`',
  'loadCoachNote': 'MARTWY REGION — osiągalna wyłącznie z panelu trenera, który nie ma już wejścia',
  'showPreviousCoachInsight': 'MARTWY REGION — jw. Rozróżnia stany po stronie bazy, ale `catch` czyści bez słowa',
  'generateParentReport': 'MARTWY REGION — raport rodzica generuje dziś backend (`gamechange-app/lib/parent-reports.js`), nie ta funkcja',
  'generateCoachQuestions': 'MARTWY REGION — pytania dla trenera osiągalne tylko z panelu drużyny, który nie ma już wejścia',
  'submitCoachAnswers': 'MARTWY REGION — jak wyżej; jego `catch` pisze „Błąd połączenia." do DOM-u, ale nie do konsoli',
  'generateTeamAIRecommendation': 'MARTWY REGION — rekomendacja drużynowa osiągalna tylko z panelu drużyny',
  'scheduleDelayedContact': 'odczyt bramkujący ZAPIS, nie treść dla zawodnika: „lepiej zaplanować duplikat niż nic" (decyzja z 08.08.2026). Nic z tego nie trafia na ekran',
  'submitObservationResponse': 'wewnętrzny `catch` wokół zapisu obserwacji — świadomie nie blokuje podziękowania; nie rysuje niczego',
};
const GLOSY = /(zglosBladOdczytu\s*\(|console\.(error|warn)\s*\(|throw\s)/;

/** Funkcje CZYTAJĄCE: start z tych, w których ciele leży PRAWDZIWA ścieżka odczytu
 *  (nie zapis), potem domknięcie przechodnie (O79). Dzięki temu `saveToSupabase`
 *  i `saveCoachNote` nie potrzebują ANI JEDNEGO wpisu na liście wyjątków —
 *  zakres reguły wyznacza sam kod. */
const CZYTAJACE = new Set();
for (const w of ODCZYTY) { const f = najwezsza(FUN, w.poz); if (f) CZYTAJACE.add(f.nazwa); }
for (let runda = 0; runda < 10; runda++) {
  let zmiana = false;
  for (const f of FUN) {
    if (f.nazwa === '(anonim)' || CZYTAJACE.has(f.nazwa)) continue;
    for (const c of CZYTAJACE) {
      if (new RegExp('\\b' + c.replace(/\$/g, '\\$') + '\\s*\\(').test(f.trescM)) { CZYTAJACE.add(f.nazwa); zmiana = true; break; }
    }
  }
  if (!zmiana) break;
}
assert(CZYTAJACE.has('loadObservationResponseView'),
  '⭐ O79 — detektor widzi odczyt PRZEZ POŚREDNIKA: `loadObservationResponseView` nie woła `fetch` ani razu, czyta przez `gcRpc`');
assert(!CZYTAJACE.has('saveToSupabase'),
  '⭐ zbiór czytających NIE obejmuje czystego zapisu — inaczej reguła 1 zapalałaby się na `saveToSupabase` i lista wyjątków puchłaby o zapisy');

function paryTryCatch() {
  const pary = []; const re = /\btry\s*\{/g; let m;
  while ((m = re.exec(M))) {
    const tOtw = M.indexOf('{', m.index);
    const tKon = dopasuj(M, tOtw, '{', '}');
    if (tKon === -1) continue;
    const mc = /^\s*catch\s*(\([^)]*\))?\s*\{/.exec(M.slice(tKon + 1, tKon + 60));
    if (!mc) continue;
    const cOtw = M.indexOf('{', tKon + mc[0].length);
    const cKon = dopasuj(M, cOtw, '{', '}');
    if (cKon === -1) continue;
    pary.push({ tryA: tOtw, tryB: tKon, catchA: cOtw, catchB: cKon });
  }
  return pary;
}
const czytaWZakresie = (a, b) => {
  if (ODCZYTY.some(w => w.poz > a && w.poz < b)) return true;
  const tekst = M.slice(a, b);
  for (const c of CZYTAJACE) if (new RegExp('\\b' + c.replace(/\$/g, '\\$') + '\\s*\\(').test(tekst)) return true;
  return false;
};
const CICHE = [];
for (const para of paryTryCatch()) {
  if (!czytaWZakresie(para.tryA, para.tryB)) continue;
  if (GLOSY.test(M.slice(para.catchA, para.catchB + 1))) continue;
  const f = najwezsza(FUN, para.tryA);
  const nazwa = f ? f.nazwa : '(top-level)';
  if (CICHE.indexOf(nazwa) === -1) CICHE.push(nazwa);
}
const NIESPODZIEWANE = CICHE.filter(n => !(n in DLUG_ZASTANY));
const NAPRAWIONE = Object.keys(DLUG_ZASTANY).filter(n => CICHE.indexOf(n) === -1);
assertEq(NIESPODZIEWANE.length, 0, 'ŻADNA nowa cicha gałąź błędu przy odczycie' + (NIESPODZIEWANE.length ? ' — DOSZŁO: ' + NIESPODZIEWANE.join(', ') : ''));
assertEq(NAPRAWIONE.length, 0, 'zapadka na RÓWNOŚĆ (O73): nic nie naprawiono bez skreślenia z `DLUG_ZASTANY`' + (NAPRAWIONE.length ? ' — USUŃ Z LISTY: ' + NAPRAWIONE.join(', ') : ''));
assertEq(CICHE.length, Object.keys(DLUG_ZASTANY).length, 'zapadka na RÓWNOŚĆ (O73): liczba cichych ścieżek === długość listy długu');
Object.keys(DLUG_ZASTANY).forEach(n => assert(String(DLUG_ZASTANY[n]).length > 30, 'pozycja długu `' + n + '` ma NIEPUSTY powód'));

scenario('3a. ścieżki lejka ZAWODNIKA mają głos — imiennie');
['generateAIDiagnosis', 'loadPlayerHistory', 'loadObservationResponseView'].forEach(n => {
  assert(CICHE.indexOf(n) === -1, '`' + n + '` NIE jest cicha po padniętym odczycie');
});

/* ══════════════════════════════════════════════════════════════════════════
   4. REGUŁA 2 (O75) — asercja czyta MIEJSCE, KTÓRE REALNIE RYSUJE WYNIK
   ══════════════════════════════════════════════════════════════════════════ */
scenario('4. D3 — wynik diagnozy NIE WYCHODZI z padniętego odczytu');

const genM = wytnijM('generateAIDiagnosis');
assert(genM.length > 0, 'jest funkcja `generateAIDiagnosis`');
assert(/renderNieudanyOdczytDiagnozy\s*\(/.test(genM),
  '⭐ O75 — `generateAIDiagnosis` NAPRAWDĘ WOŁA `renderNieudanyOdczytDiagnozy`; funkcja naprawiona i niewołana szłaby na zielono');
assert(/response\.ok/.test(genM),
  '⭐ O83 — `generateAIDiagnosis` sprawdza `response.ok`: HTTP 500 nie rzuca wyjątku, wraca WARTOŚCIĄ');
assert(/_diagState\.odczytDiagnozy\s*=\s*false/.test(genM), 'gałąź awarii ustawia trzecią wartość na `false`');
assert(warunkiIf('generateAIDiagnosis').some(w => /!\s*wolnoTwierdzic\s*\(\s*_diagState\.odczytDiagnozy\s*\)/.test(w)),
  '⭐ O71 — WARUNEK tej JEDNEJ instrukcji `if` pyta o `!wolnoTwierdzic(_diagState.odczytDiagnozy)`');

scenario('4a. lokalnie sklejona diagnoza NIE MA JAK trafić na ekran');
assertEq(ileWywolan('buildFallbackDiagnosis'), 0, '⛔ `buildFallbackDiagnosis` nie jest wołana ANI RAZU — zostaje jako zapis, nie jako ścieżka');
assertEq(ileWywolan('renderFallback'), 0, '`renderFallback` nie istnieje już jako wywołanie');
assert(!/function\s+renderFallback\s*\(/.test(M), '`renderFallback` nie istnieje już jako definicja');
assertEq(ileWywolan('renderNieudanyOdczytDiagnozy'), 1, 'zapadka na RÓWNOŚĆ: `renderNieudanyOdczytDiagnozy` wołana dokładnie raz');

scenario('4b. PDF — plik, który zawodnik zostawia sobie na dysku');
const pdfM = wytnijM('downloadPDF');
assert(pdfM.length > 0, 'jest funkcja `downloadPDF`');
assert(/odczytPadl\s*\(\s*_diagState\.odczytDiagnozy\s*\)/.test(pdfM),
  '⭐ sekcja „TWOJA DIAGNOZA" w PDF-ie jest bramkowana stanem odczytu — inaczej lokalna sklejka wychodziła do PLIKU');
assert(/ZDANIE_NIEUDANA_DIAGNOZA/.test(pdfM), 'PDF bierze zdanie o awarii z tej samej stałej co ekran — kanały się nie rozjadą');

scenario('4c. historia zawodnika — trzecia wartość dociera do OBU konsumentów');
const lphM = wytnijM('loadPlayerHistory');
assert(/odczyt:\s*false/.test(lphM) && /odczyt:\s*true/.test(lphM), '`loadPlayerHistory` oddaje stan odczytu, nie samą tablicę');
assert(!/catch\s*\([^)]*\)\s*\{\s*return\s*\[\s*\]\s*;?\s*\}/.test(lphM), '⛔ klasa PUSTKA zniknęła: `catch { return []; }` już tam nie stoi');
assert(warunkiIf('submitEmail').some(w => /wolnoTwierdzic\s*\(\s*odp\.odczyt\s*\)/.test(w)),
  '⭐ O71 — WARUNEK `if` przy zdaniu „Witaj z powrotem" pyta o stan odczytu');
assert(/wolnoTwierdzic\s*\(\s*odpHistorii\.odczyt\s*\)/.test(wytnijM('_buildDiagData')),
  '`_buildDiagData` nie wpuszcza do promptu historii z padniętego odczytu');

scenario('4d. ekran follow-upu — „odczyt padł" ROZKLEJONE od „nie znaleziono"');
const lorvM = wytnijM('loadObservationResponseView');
assert(/row\s*===\s*null/.test(lorvM),
  '⭐ osobna gałąź `row === null` — zawodnik nie czyta już, że jego link jest nieprawidłowy, kiedy padł odczyt');
assert(lorvM.indexOf('row === null') !== -1 && lorvM.indexOf('row === null') < lorvM.indexOf('row.ok !== true'),
  'gałąź „odczyt padł" stoi PRZED gałęzią sklejoną — inaczej nigdy by się nie wykonała');

/* ══════════════════════════════════════════════════════════════════════════
   5. ZERO NOWYCH BRZMIEŃ (D4)
   ══════════════════════════════════════════════════════════════════════════ */
scenario('5. skąd pochodzi każde zdanie widoczne dla zawodnika');
const STALE = {};
['ZDANIE_NIEUDANA_DIAGNOZA', 'ZDANIE_BLAD_LADOWANIA_PYTANIA', 'ETYKIETA_SPROBUJ_PONOWNIE', 'ZDANIE_ODPOWIEDZI_ZOSTAJA'].forEach(n => {
  const m = new RegExp('const\\s+' + n + "\\s*=\\s*'([^']*)'").exec(HTML);
  STALE[n] = m ? m[1] : null;
  assert(!!m, 'stała `' + n + '` istnieje');
});
assert(wytnij('submitCoachAnswers').indexOf(STALE.ZDANIE_NIEUDANA_DIAGNOZA) !== -1,
  '⭐ „' + STALE.ZDANIE_NIEUDANA_DIAGNOZA + '" stoi w `submitCoachAnswers` OD PRZED tym pasem — zdanie nie jest nowe');
assert(wytnij('generateCoachQuestions').indexOf(STALE.ETYKIETA_SPROBUJ_PONOWNIE) !== -1,
  '⭐ etykieta „' + STALE.ETYKIETA_SPROBUJ_PONOWNIE + '" stoi w `generateCoachQuestions` od przed tym pasem');
assertEq(STALE.ZDANIE_BLAD_LADOWANIA_PYTANIA, 'Błąd ładowania pytania.',
  'zdanie o nieudanym wczytaniu pytania ma wartość z gałęzi `catch` `loadObservationResponseView` (sprzed pasa)');

scenario('5a. asercja ODWROTNA — ekran awarii nie ma ANI JEDNEGO własnego zdania');
const fRnod = znajdz('renderNieudanyOdczytDiagnozy');
assert(!!fRnod, 'jest funkcja `renderNieudanyOdczytDiagnozy`');
const WLASNE = fRnod ? literaly(fRnod.od, fRnod.b).filter(zdanieDoCzlowieka) : ['(BRAK FUNKCJI)'];
assertEq(WLASNE.length, 0,
  '⭐ `renderNieudanyOdczytDiagnozy` bierze KAŻDE zdanie ze stałej, żadnego nie pisze u siebie' + (WLASNE.length ? ' — ZNALEZIONO: ' + WLASNE.join(' | ') : ''));

/* ══════════════════════════════════════════════════════════════════════════
   6. ZACHOWANIE — funkcja URUCHOMIONA, nie przeczytana (O75)
   ══════════════════════════════════════════════════════════════════════════ */
scenario('6. ekran awarii zbudowany naprawdę — czytamy, co w nim stoi');
const DEF_STALYCH = ['ZDANIE_NIEUDANA_DIAGNOZA', 'ZDANIE_BLAD_LADOWANIA_PYTANIA', 'ETYKIETA_SPROBUJ_PONOWNIE', 'ZDANIE_ODPOWIEDZI_ZOSTAJA']
  .map(n => (new RegExp("const\\s+" + n + "\\s*=\\s*'[^']*';").exec(HTML) || [''])[0]).join('\n');
let EKRAN = { html: '', nota: '', most: [] };
probuj('ekran awarii daje się ZBUDOWAĆ', () => { EKRAN = (() => {
  const el = { innerHTML: '' };
  const nota = { style: { display: 'block' } };
  const most = [];
  const c = {
    document: { getElementById: (id) => id === 'ai-diagnosis-text' ? el : (id === 'diagnosis-unlocked-note' ? nota : null) },
    _showProductSection: (s, m) => most.push(m),
    console: { error() {}, warn() {} },
  };
  vm.createContext(c);
  vm.runInContext(DEF_STALYCH + '\n' + wytnij('renderNieudanyOdczytDiagnozy'), c);
  c.renderNieudanyOdczytDiagnozy({ moc: 40 }, 'HTTP 500');
  return { html: el.innerHTML, nota: nota.style.display, most };
})(); });
assert(EKRAN.html.indexOf(STALE.ZDANIE_NIEUDANA_DIAGNOZA) !== -1, '⭐ zbudowany ekran MÓWI, że diagnozy nie udało się wygenerować');
assert(EKRAN.html.indexOf(STALE.ZDANIE_ODPOWIEDZI_ZOSTAJA) !== -1, '⭐ zbudowany ekran mówi, że odpowiedzi NIE PRZEPADŁY (D1)');
assert(EKRAN.html.indexOf(STALE.ETYKIETA_SPROBUJ_PONOWNIE) !== -1, '⭐ zbudowany ekran daje RZECZ DO ZROBIENIA (D5)');
assertEq(EKRAN.nota, 'none', '„✓ Diagnoza odblokowana" znika — po padniętym odczycie to zdanie jest nieprawdziwe');
assertEq(JSON.stringify(EKRAN.most), '[false]', 'most do aplikacji NIE jest pokazywany — mówiłby „ta diagnoza jest już w środku"');
assert(!/Nad czym powinieneś pracować/.test(EKRAN.html), '⛔ nie ma listy „Nad czym powinieneś pracować" — to była lokalna sklejka');
assert(!/przysiady|martwy ciąg|8 godzin/.test(EKRAN.html), '⛔ nie ma METOD treningowych, których prompt diagnozy zakazuje modelowi (zasada 5)');

/* ══════════════════════════════════════════════════════════════════════════
   7. D2 — odpowiedzi przeżywają odświeżenie, ale wolny tekst NIE jest zapisywany
   ══════════════════════════════════════════════════════════════════════════ */
scenario('7. trwałość odpowiedzi — i granica tego, co wolno zapisać');
const STALA_KLUCZA = (/const\s+GC_KLUCZ_POSTEPU\s*=\s*'[^']*';/.exec(HTML) || [''])[0];
assert(!!STALA_KLUCZA, 'jest stała `GC_KLUCZ_POSTEPU`');
const zapiszZrodlo = wytnij('zapiszPostepAnkiety');
assert(zapiszZrodlo.length > 0, 'jest funkcja `zapiszPostepAnkiety`');
probuj('zapis postępu daje się URUCHOMIĆ', () => {
  const magazyn = {};
  const c = {
    localStorage: { setItem: (k, v) => { magazyn[k] = v; }, getItem: (k) => magazyn[k] || null, removeItem: (k) => { delete magazyn[k]; } },
    ans: { moc: [3, 4], mental: [null, 2] },
    ctx: { level: 1, pos: 4, age: 17 },
    presurvey: { goal: 0, ownTypes: new Set(['silownia']), selfDesc: 'Jestem beznadziejny i wszyscy to widzą' },
    JSON, Date, Object,
  };
  vm.createContext(c);
  vm.runInContext(STALA_KLUCZA + '\n' + zapiszZrodlo, c);
  c.zapiszPostepAnkiety();
  const zapisane = String(magazyn[JSON.parse(STALA_KLUCZA.replace(/^.*=\s*/, '').replace(/;$/, '').replace(/'/g, '"'))] || '');
  assert(zapisane.indexOf('"moc":[3,4]') !== -1, '⭐ odpowiedzi z ankiety NAPRAWDĘ lądują w magazynie przeglądarki');
  assert(zapisane.indexOf('beznadziejny') === -1,
    '⛔ SAMOOPIS NIE JEST ZAPISYWANY — przechodzi przez `gcMozeKryzys`, a ekran pomocy obiecuje wprost, że nic z napisanego tekstu nie zostaje');
  assert(zapisane.indexOf('selfDesc') === -1, 'w zapisie nie ma nawet klucza `selfDesc`');
});
assert(/zapiszPostepAnkiety\s*\(/.test(wytnijM('pickScroll')),
  '⭐ O75 — `pickScroll`, czyli miejsce, gdzie zawodnik NAPRAWDĘ odpowiada, woła zapis postępu');
assert(/zapomnijPostepAnkiety\s*\(/.test(wytnijM('restart')),
  '`restart()` kasuje zapisany postęp — świadomy start od nowa nie zostawia śmieci');
assert(/zaproponujPowrotDoAnkiety\s*\(/.test(M), 'ekran wejścia proponuje powrót do niedokończonej ankiety');
assert(/id="gc-powrot-do-ankiety"/.test(HTML), 'w `screen-intro` jest miejsce, w którym ta propozycja się rysuje');

/* ══════════════════════════════════════════════════════════════════════════
   8. PLAN-D-Y2 08.2026 — WYNIK NIE POWSTAJE Z ANKIETY NIEPEŁNEJ
   Cichy brak po stronie WEJŚCIA: nie „nie wiem, bo odczyt padł", tylko
   „nie wiem, bo nikt nie odpowiedział" — a produkt w obu wypadkach podawał
   liczbę, jakby wiedział.
   ══════════════════════════════════════════════════════════════════════════ */
scenario('8. odkrywanie ankiety — pytania i segmenty liczone Z KODU (O69)');

/** SEGS wycinane dopasowaniem nawiasów i URUCHAMIANE — nie ma tu spisu segmentów. */
let SEGS_Z_PLIKU = null;
probuj('definicja `SEGS` daje się wyciąć i uruchomić', () => {
  const iS = M.indexOf('const SEGS = [');
  if (iS === -1) throw new Error('nie ma `const SEGS = [` w tym pliku');
  const aS = M.indexOf('[', iS);
  const bS = dopasuj(M, aS, '[', ']');
  if (bS === -1) throw new Error('nie da się domknąć tablicy `SEGS`');
  const c = { console: { log() {} } };
  vm.createContext(c);
  vm.runInContext('var SEGS = ' + HTML.slice(aS, bS + 1) + ';', c);
  SEGS_Z_PLIKU = c.SEGS;
  assert(Array.isArray(SEGS_Z_PLIKU), '`SEGS` jest tablicą');
});
const LICZBA_SEGMENTOW = SEGS_Z_PLIKU ? SEGS_Z_PLIKU.length : -1;
const LICZBA_PYTAN = SEGS_Z_PLIKU ? SEGS_Z_PLIKU.reduce((s, x) => s + (x.qs || []).length, 0) : -1;
assertEq(LICZBA_SEGMENTOW, 13, 'zapadka na RÓWNOŚĆ (O73): segmentów w ankiecie');
assertEq(LICZBA_PYTAN, 27, 'zapadka na RÓWNOŚĆ (O73): PYTAŃ w ankiecie — od tej liczby zależy każda bramka niżej');
assert(SEGS_Z_PLIKU ? SEGS_Z_PLIKU.every(s => (s.qs || []).length > 0) : false, 'każdy segment ma przynajmniej jedno pytanie');

scenario('8a. wejścia do `generateResults()` i `calcScores()` — wykryte, nie wypisane');
/** Wywołania z atrybutów zdarzeń HTML. Maska kasuje wszystko poza <script>,
 *  więc atrybutów NIE widać w `M` — trzeba ich szukać osobno, w atrybutach,
 *  a nie w całym HTML-u (inaczej liczy się też własne komentarze tego pliku). */
function wywolaniaZAtrybutow(nazwa) {
  let n = 0;
  const re = /\son[a-z]+\s*=\s*"([^"]*)"/g; let m;
  while ((m = re.exec(HTML))) {
    const r2 = new RegExp('\\b' + nazwa + '\\s*\\(', 'g');
    while (r2.exec(m[1])) n++;
  }
  return n;
}
assertEq(wywolaniaZAtrybutow('generateResults'), 1, 'zapadka na RÓWNOŚĆ (O73): `generateResults()` ma DOKŁADNIE JEDNO wejście z ekranu — `onclick` przycisku');
assertEq(ileWywolan('generateResults'), 0, '`generateResults()` nie jest wołana z JavaScriptu ani razu');
assertEq(ileWywolan('calcScores'), 1, '⭐ zapadka na RÓWNOŚĆ (O73): `calcScores()` ma DOKŁADNIE JEDNEGO konsumenta — kto dołoży drugiego, musi go zabramkować tak samo');
assert(/calcScores\s*\(/.test(wytnijM('generateResults')), 'tym jedynym konsumentem jest `generateResults`');

scenario('8b. D2 POZIOM PIERWSZY — przycisk jest NIEKLIKALNY, nie tylko przygaszony');
const TAG_SUBMIT = (/<button[^>]*id="btn-submit"[^>]*>/.exec(HTML) || [''])[0];
assert(TAG_SUBMIT.length > 0, 'w źródle strony stoi przycisk `#btn-submit`');
assert(/\bdisabled\b/.test(TAG_SUBMIT),
  '⭐ `#btn-submit` ma `disabled` JUŻ W ŹRÓDLE STRONY — stan startowy ankiety to zero odpowiedzi, więc nie ma chwili, w której da się go kliknąć');
const upsM = wytnijM('updateProgressScroll');
assert(upsM.length > 0, 'jest funkcja `updateProgressScroll`');
assert(/\.disabled\s*=/.test(upsM),
  '⛔ `updateProgressScroll` ustawia `disabled`, a nie samo `opacity` — `opacity` to WYGLĄD, przygaszony przycisk klikał się tak samo dobrze');
assert(/updateProgressScroll\s*\(/.test(wytnijM('restart')),
  '⭐ `restart()` odświeża stan przycisku — po świadomym starcie od nowa nie ma odpowiedzi, więc nie ma prawa zostać klikalny z poprzedniego przebiegu');

scenario('8c. D2 POZIOM DRUGI — bramka w samej funkcji, PRZED ekranem ładowania (O71, O75)');
const genResM = wytnijM('generateResults');
const genResRaw = wytnij('generateResults');
assert(/brakiWAnkiecie\s*\(/.test(genResM), '⭐ O75 — `generateResults` NAPRAWDĘ pyta `brakiWAnkiecie()`; bramka niewołana szłaby na zielono');
{
  // ⚠️ Pozycji szukamy w ŹRÓDLE ZAMASKOWANYM. Komentarz nad tą bramką CYTUJE
  //    `showScreen('screen-loading')`, więc szukanie w surowym tekście trafiłoby
  //    w cytat i asercja przechodziłaby (albo padała) z powodu dokumentacji.
  const iBramka = genResM.indexOf('brakiWAnkiecie');
  const iLadowanie = genResM.indexOf('showScreen(');
  const iReturn = genResM.indexOf('return;');
  assert(genResRaw.indexOf("showScreen('screen-loading')") !== -1, '`generateResults` w ogóle pokazuje ekran ładowania');
  assert(iBramka !== -1 && iLadowanie !== -1 && iBramka < iLadowanie,
    '⭐ bramka stoi PRZED pierwszym `showScreen(` — zawodnik nie ląduje na ekranie ładowania, z którego nic nie wyjdzie');
  assert(iReturn !== -1 && iReturn < iLadowanie, 'między bramką a ekranem ładowania stoi `return;`');
}
const IFY_GEN = warunkiIf('generateResults');
assert(IFY_GEN.some(w => /!\s*braki\.kompletna/.test(w)),
  '⭐ O71 — WARUNEK tej JEDNEJ instrukcji `if` pyta o `!braki.kompletna`');
assert(IFY_GEN.some(w => /segmentyBezWyniku\.length/.test(w)),
  '⭐ O71 — druga bramka pyta o to, co NAPRAWDĘ wyszło z `calcScores()`, a nie o to, co powinno było wyjść');
assert(/kompletna:\s*razem\s*>\s*0\s*&&\s*brakuje\s*===\s*0/.test(wytnijM('brakiWAnkiecie')),
  '⛔ ankieta BEZ ANI JEDNEGO pytania nie jest „kompletna" — inaczej bramka przepuszczałaby pusty `activeSegs`');

scenario('8d. D3 — zawodnik WIE, ile zostało, i ma jak tam wrócić');
assert(/id="btn-do-pierwszego-braku"/.test(HTML), 'na ekranie ankiety jest wyjście do pierwszego pytania bez odpowiedzi');
assertEq(wywolaniaZAtrybutow('przejdzDoPierwszegoBezOdpowiedzi'), 1, 'zapadka na RÓWNOŚĆ: to wyjście jest podpięte dokładnie raz');
const rawRender = wytnij('renderAllQuestions');   // ⚠️ atrybuty są w literale szablonowym — maska by je wyczyściła
assert(/data-seg="\$\{esc\(seg\.id\)\}"/.test(rawRender) && /data-qi="\$\{qi\}"/.test(rawRender),
  '⭐ każde pytanie ma kotwicę `data-seg`/`data-qi` — bez niej wyjście nie ma czego znaleźć');
assert(/\[data-seg=/.test(wytnij('przejdzDoPierwszegoBezOdpowiedzi')), '`przejdzDoPierwszegoBezOdpowiedzi` szuka pytania po tej samej kotwicy');
assert(/wyjscie\.style\.display/.test(upsM), '`updateProgressScroll` decyduje, czy wyjście jest widoczne');

scenario('8e. ⭐ D4 URUCHOMIONE — `calcScores()` z NIEPEŁNYM wejściem nie oddaje LICZBY');
const zrodloCalc = wytnij('calcScores');
assert(zrodloCalc.length > 0, 'jest funkcja `calcScores`');
function policzZ(ans, segs) {
  const c = { SEGS: segs, ans: ans, Math, Object, console: { warn() {}, error() {} } };
  vm.createContext(c);
  vm.runInContext(zrodloCalc, c);
  return c.calcScores();
}
function pustaAnkieta(segs) { const a = {}; segs.forEach(s => a[s.id] = s.qs.map(() => null)); return a; }
function pierwszeN(segs, n, w) {
  const a = pustaAnkieta(segs); let i = 0;
  segs.forEach(s => s.qs.forEach((q, qi) => { if (i < n) a[s.id][qi] = w; i++; }));
  return a;
}
probuj('`calcScores` daje się URUCHOMIĆ na trzech stanach ankiety', () => {
  if (!SEGS_Z_PLIKU) throw new Error('brak `SEGS` — nie ma na czym uruchomić');
  const S = SEGS_Z_PLIKU;

  /* ankieta PUSTA — do 16.08.2026 dawała 13 × 50/100, czyli wynik ogólny 50 */
  const pusta = policzZ(pustaAnkieta(S), S);
  const liczbyZPustej = Object.keys(pusta).filter(k => typeof pusta[k] === 'number');
  assertEq(liczbyZPustej.length, 0,
    '⛔ z ankiety PUSTEJ nie wychodzi ANI JEDNA liczba' + (liczbyZPustej.length ? ' — WYSZŁY: ' + liczbyZPustej.join(', ') : ''));
  assert(Object.keys(pusta).every(k => pusta[k] === null), 'każdy segment pustej ankiety mówi jawne „nie wiem" (`null`)');

  /* ankieta NIEPEŁNA — 6 z 27, czyli trzy pierwsze segmenty w komplecie */
  const niepelna = policzZ(pierwszeN(S, 6, 4), S);
  const odpowiedziane = new Set(); { let i = 0; S.forEach(s => s.qs.forEach(() => { if (i < 6) odpowiedziane.add(s.id); i++; })); }
  const zmyslone = Object.keys(niepelna).filter(k => !odpowiedziane.has(k) && typeof niepelna[k] === 'number');
  assertEq(zmyslone.length, 0,
    '⭐ SEGMENT, KTÓREGO ZAWODNIK NIE OCENIŁ, NIE DOSTAJE LICZBY' + (zmyslone.length ? ' — DOSTAŁY: ' + zmyslone.map(k => k + '=' + niepelna[k]).join(', ') : ''));
  assertEq(Object.keys(niepelna).filter(k => typeof niepelna[k] === 'number').length, odpowiedziane.size,
    'liczbę dostają DOKŁADNIE te segmenty, które zawodnik ocenił w komplecie');

  /* segment odpowiedziany W POŁOWIE — druga dziura, nie ta od 3.5 */
  const polowa = pustaAnkieta(S);
  S.forEach(s => s.qs.forEach((q, qi) => { polowa[s.id][qi] = 4; }));
  const segWielopytaniowy = S.filter(s => s.qs.length > 1)[0];
  polowa[segWielopytaniowy.id][segWielopytaniowy.qs.length - 1] = null;
  const wynikPolowa = policzZ(polowa, S);
  assertEq(wynikPolowa[segWielopytaniowy.id], null,
    '⭐ segment odpowiedziany W POŁOWIE też mówi „nie wiem" — średnia z połowy pytań wyglądała jak pomiar');

  /* ASERCJA ODWROTNA — naprawa nie zepsuła liczenia PEŁNEJ ankiety */
  const pelna = pustaAnkieta(S);
  S.forEach(s => s.qs.forEach((q, qi) => { pelna[s.id][qi] = 4; }));
  const wynikPelny = policzZ(pelna, S);
  assertEq(Object.keys(wynikPelny).filter(k => typeof wynikPelny[k] === 'number').length, S.length,
    '⭐ ASERCJA ODWROTNA: ankieta PEŁNA nadal daje liczbę dla KAŻDEGO segmentu');
  assert(Object.values(wynikPelny).every(v => v >= 0 && v <= 100), 'wszystkie liczby z pełnej ankiety mieszczą się w 0–100');
});

scenario('8f. ⛔ wypełniacz 3.5 — nie wraca po cichu');
{
  const TRAFIENIA = [];
  const re = /3\.5/g; let m;
  while ((m = re.exec(HTML))) {
    TRAFIENIA.push({
      linia: HTML.slice(0, m.index).split('\n').length,
      zywe: M.slice(m.index, m.index + 3) === '3.5',
      ctx: HTML.slice(Math.max(0, m.index - 40), m.index + 20).replace(/\s+/g, ' '),
    });
  }
  const ZYWE = TRAFIENIA.filter(t => t.zywe);
  assertEq(ZYWE.length, 0,
    '⛔ wartości 3.5 NIE MA W WYKONYWANYM KODZIE' + (ZYWE.length ? ' — STOI w l. ' + ZYWE.map(t => t.linia + ' (' + t.ctx + ')').join(' | ') : ''));
  assertEq(TRAFIENIA.length, 4,
    'zapadka na RÓWNOŚĆ (O73): wystąpień „3.5" w całym pliku (3 z pasa Y2 + 1 z komentarza pasa Y3) — wszystkie poza żywym kodem, każde wypisane niżej');
  TRAFIENIA.forEach(t => console.log('      · l. ' + t.linia + (t.zywe ? '  ⛔ ŻYWY KOD  ' : '  (poza kodem: literał albo komentarz)  ') + t.ctx));
  const calcM = wytnijM('calcScores');
  assert(!/3\.5/.test(calcM), '⛔ w ciele `calcScores` nie ma już wypełniacza');
  assert(/sc\[seg\.id\]\s*=\s*null/.test(calcM), '`calcScores` stawia jawne `null` zamiast liczby');
  assert(/cnt\s*!==\s*seg\.qs\.length/.test(calcM), 'warunek pyta o KOMPLET odpowiedzi, nie o „choć jedną"');
}

scenario('8g. D5 — żadna z tych ścieżek NIE KASUJE pracy zawodnika');
assert(!/zapomnijPostepAnkiety\s*\(/.test(genResM), '`generateResults` nie kasuje zapisanego postępu ankiety');
assert(!/\bans\s*=\s*\{\s*\}/.test(genResM), '`generateResults` nie zeruje odpowiedzi');
assert(!/localStorage\s*\.\s*removeItem/.test(genResM), '`generateResults` nie rusza magazynu przeglądarki');
assert(!/zapomnijPostepAnkiety\s*\(|\bans\s*=\s*\{\s*\}/.test(wytnijM('brakiWAnkiecie') + wytnijM('przejdzDoPierwszegoBezOdpowiedzi') + upsM),
  'ani bramka, ani wyjście, ani pasek postępu niczego nie kasują');

scenario('8h. ⭐ ZACHOWANIE — pasek, przycisk i podpowiedź ZBUDOWANE NAPRAWDĘ');
const ZRODLO_EKRANU = [
  (/const\s+ETYKIETA_WROC_TAM_GDZIE_SKONCZYLES\s*=\s*'[^']*';/.exec(HTML) || [''])[0],
  wytnij('zdanieZostalo'), wytnij('brakiWAnkiecie'),
  wytnij('przejdzDoPierwszegoBezOdpowiedzi'), wytnij('updateProgressScroll'),
].join('\n');
function zbudujEkran(ileOdpowiedzi) {
  const S = SEGS_Z_PLIKU;
  const ans = {}; S.forEach(s => ans[s.id] = s.qs.map(() => null));
  let i = 0; S.forEach(s => s.qs.forEach((q, qi) => { if (i < ileOdpowiedzi) ans[s.id][qi] = 4; i++; }));
  const el = (id) => ({ id, style: {}, textContent: '', disabled: undefined });
  const wezly = { 'prog-fill': el('prog-fill'), 'prog-info': el('prog-info'), 'btn-submit': el('btn-submit'), 'submit-hint': el('submit-hint'), 'btn-do-pierwszego-braku': el('btn-do-pierwszego-braku') };
  let pytany = null;
  const c = {
    document: { getElementById: (id) => wezly[id] || null, querySelector: (s) => { pytany = s; return null; } },
    activeSegs: S, ans: ans, Math, Object, console: { warn() {}, error() {} },
  };
  vm.createContext(c);
  vm.runInContext(ZRODLO_EKRANU, c);
  c.updateProgressScroll();
  c.przejdzDoPierwszegoBezOdpowiedzi();
  return { w: wezly, pytany: pytany };
}
probuj('ekran ankiety daje się ZBUDOWAĆ w trzech stanach', () => {
  if (!SEGS_Z_PLIKU) throw new Error('brak `SEGS`');

  const pusty = zbudujEkran(0);
  assertEq(pusty.w['btn-submit'].disabled, true, '⭐ ankieta PUSTA: przycisk jest NIEKLIKALNY (`disabled === true`)');
  assertEq(pusty.w['prog-info'].textContent, '0%', 'ankieta pusta: pasek postępu pokazuje 0%');
  assert(pusty.w['submit-hint'].textContent.indexOf('Zostało 27.') !== -1,
    '⭐ ankieta pusta MÓWI, ILE ZOSTAŁO: „' + pusty.w['submit-hint'].textContent + '"');
  assertEq(pusty.w['btn-do-pierwszego-braku'].style.display, 'inline-block', 'ankieta pusta: wyjście do pierwszego pytania jest WIDOCZNE');

  const polowa = zbudujEkran(6);
  assertEq(polowa.w['btn-submit'].disabled, true, '⭐ ankieta 6/27: przycisk WCIĄŻ nieklikalny');
  assertEq(polowa.w['submit-hint'].textContent, 'Odpowiedziano na 6 z 27 pytań. Zostało 21.',
    '⭐ ankieta 6/27 mówi obie liczby — zawodnik nie musi odejmować w pamięci (P0)');
  assert(!/nie odpowiedziałeś|musisz|niestety|błąd/i.test(polowa.w['submit-hint'].textContent),
    'D7 — zdanie nie brzmi jak wina zawodnika ani jak wyrzut');
  assertEq(polowa.w['btn-do-pierwszego-braku'].textContent, 'Wróć tam, gdzie skończyłeś',
    '⭐ etykieta wyjścia jest wzięta ze stałej, nie wpisana w HTML');
  assert(polowa.pytany && polowa.pytany.indexOf('data-qi="0"') !== -1 && polowa.pytany.indexOf('data-seg="techFund"') !== -1,
    '⭐ wyjście prowadzi do SIÓDMEGO pytania, czyli pierwszego bez odpowiedzi — pytało o: ' + polowa.pytany);

  const pelny = zbudujEkran(27);
  assertEq(pelny.w['btn-submit'].disabled, false, '⭐ ASERCJA ODWROTNA: po komplecie odpowiedzi przycisk jest KLIKALNY');
  assertEq(pelny.w['prog-info'].textContent, '100%', 'komplet: pasek postępu pokazuje 100%');
  assertEq(pelny.w['submit-hint'].textContent, 'Gotowe — możesz wygenerować diagnozę.', 'komplet: podpowiedź jest ta sama co przed pasem');
  assertEq(pelny.w['btn-do-pierwszego-braku'].style.display, 'none', 'komplet: wyjście do pierwszego braku znika');
  assertEq(pelny.pytany, null, 'komplet: nie ma o co pytać — `przejdzDoPierwszegoBezOdpowiedzi` nie szuka niczego');
});

scenario('8i. D6 — skąd pochodzi etykieta wyjścia');
{
  const wart = (/const\s+ETYKIETA_WROC_TAM_GDZIE_SKONCZYLES\s*=\s*'([^']*)'/.exec(HTML) || [])[1];
  assert(!!wart, 'stała `ETYKIETA_WROC_TAM_GDZIE_SKONCZYLES` istnieje');
  assert(wytnij('zaproponujPowrotDoAnkiety').indexOf(wart) !== -1,
    '⭐ „' + wart + '" stoi w `zaproponujPowrotDoAnkiety` OD PASA Y1 — porównanie z ŻYWYM źródłem, nie z kopią w teście');
  probuj('`zdanieZostalo` daje się uruchomić i mówi liczbę', () => {
    const c = {}; vm.createContext(c); vm.runInContext(wytnij('zdanieZostalo'), c);
    assertEq(c.zdanieZostalo(21), 'Zostało 21.', 'jedyne nowe brzmienie pasa Y2 — oznaczone `⚠️ DO PRZEJRZENIA — Y2`');
    assert(/DO PRZEJRZENIA — Y2/.test(HTML.slice(Math.max(0, znajdz('zdanieZostalo').od - 600), znajdz('zdanieZostalo').od)),
      'to brzmienie jest oznaczone do przejrzenia — nikt go nie przemyci jako uzgodnione');
  });
}

scenario('8j. `activeSegs` a `SEGS` — dwa zbiory, jedna bramka');
{
  const PRZYPISANIA = [];
  const re = /\bactiveSegs\s*=\s*([^;]+);/g; let m;
  while ((m = re.exec(M))) PRZYPISANIA.push(m[1].trim());
  // ZMIERZONE: `let activeSegs = []` (deklaracja) · `= SEGS` w `startSurvey`
  // · `= SEGS` w `wrocDoAnkiety` · `= []` w `restart`.
  assertEq(PRZYPISANIA.length, 4, 'zapadka na RÓWNOŚĆ (O73): przypisań do `activeSegs` w całym pliku');
  assert(PRZYPISANIA.every(x => x === 'SEGS' || x === '[]'),
    '`activeSegs` bierze dziś wyłącznie `SEGS` albo pustkę — gdyby stał się PODZBIOREM, bramka po `null` w `generateResults` i tak by go złapała (znaleziono: ' + PRZYPISANIA.join(' | ') + ')');
  assert(/SEGS\.forEach/.test(wytnijM('calcScores')), '`calcScores` liczy po `SEGS`');
  assert(/activeSegs/.test(wytnijM('brakiWAnkiecie')), '`brakiWAnkiecie` liczy po `activeSegs` — dlatego druga bramka jest konieczna, nie ozdobna');
}


/* ══════════════════════════════════════════════════════════════════════════
   10. PLAN-D-Y3 08.2026 — LINK, KTÓRY NIESIE STARY WYNIK

   Pas Y2 zamknął drzwi frontowe: z niepełnej ankiety nie wychodzi już wynik.
   `loadResultsFromURL` był drzwiami bocznymi — brał liczby z ADRESU STRONY
   i renderował je bez jednej kontroli, a `catch(e) { return false; }` sklejał
   trzy różne rzeczy w jedno milczenie (R5 złamane w jednej linii).

   ⚠️ CAŁA TA SEKCJA PYTA O WYNIK URUCHOMIENIA, nie o obecność słowa
   „walidacja" w tekście funkcji (O90). Asercja tekstowa przepuściłaby pustą
   kontrolę, która nic nie odrzuca.
   ══════════════════════════════════════════════════════════════════════════ */
scenario('10. Y3 — wejścia na ekran wyników i miejsca, w których POWSTAJE hash (O69)');

/** ⭐ Wejścia na `screen-results` wykrywane po TREŚCI (O88), nie po nazwie funkcji.
 *  Dwa kroki, bo sam spis wywołań `showScreen` byłby ślepy na drugi mechanizm:
 *  1. czy `showScreen` JEST jedynym sposobem pokazania ekranu (nikt nie dopisuje
 *     klasy `active` do `.screen` z palca),
 *  2. które funkcje wołają je z argumentem `'screen-results'`. */
{
  /** ⚠️ `maskuj` CZYŚCI TREŚĆ LITERAŁÓW (`'screen-results'` → `'              '`),
   *  więc szukanie po masce nie znalazłoby ani jednego wejścia. Szukamy w ORYGINALE,
   *  a o ŻYWOTNOŚĆ pytamy maski: w komentarzu maska wyczyściła też `showScreen(`,
   *  więc prefiks by się nie zgodził. */
  const zywe = (i, prefiks) => M.slice(i, i + prefiks.length) === prefiks;

  const WEJSCIA = [], MARTWE = [];
  const re = /\bshowScreen\s*\(\s*'screen-results'\s*\)/g; let m;
  while ((m = re.exec(HTML))) {
    const f = najwezsza(FUN, m.index);
    (zywe(m.index, 'showScreen(') ? WEJSCIA : MARTWE).push(f ? f.nazwa : '(top-level)');
  }
  assertEq(WEJSCIA.length, 2,
    '⭐ zapadka na RÓWNOŚĆ (O73): wejść na ekran wyników w ŻYWYM kodzie — kto dołoży trzecie, musi je zabramkować tak samo (znaleziono: ' + WEJSCIA.join(', ') + ')');
  assert(WEJSCIA.indexOf('generateResults') !== -1, 'pierwszym wejściem jest `generateResults` — bramkowane przez pas Y2');
  assert(WEJSCIA.indexOf('loadResultsFromURL') !== -1, '⭐ drugim wejściem jest `loadResultsFromURL` — to ono omijało `calcScores`');

  /* 2. czy ktoś nie pokazuje ekranu OBOK `showScreen` */
  const DOPISKI = [];
  const re2 = /classList\.add\(\s*'active'\s*\)/g; let m2;
  while ((m2 = re2.exec(HTML))) {
    if (!zywe(m2.index, 'classList.add(')) continue;
    const f = najwezsza(FUN, m2.index); DOPISKI.push(f ? f.nazwa : '(top-level)');
  }
  const POZA = DOPISKI.filter(n => n !== 'showScreen');
  assertEq(POZA.length, 2,
    'zapadka na RÓWNOŚĆ (O73): dopisań klasy `active` POZA `showScreen` — obie w `ctxProgress` (kroki kontekstu, nie ekrany): ' + POZA.join(', '));
  assert(POZA.every(n => n === 'ctxProgress'), 'i obie siedzą w `ctxProgress`, nie w lejku wyniku');
  assert(/getElementById\(id\)\.classList\.add\('active'\)/.test(wytnij('showScreen')),
    '`showScreen` jest jedynym miejscem, które przełącza WIDOCZNY EKRAN');
  assertEq(ileWywolan('showScreen', wytnijM('renderResults')), 0,
    '`renderResults` samo NIE pokazuje ekranu — rysowanie i pokazywanie to dwie różne czynności');
}

/** ⭐ Miejsca, w których POWSTAJE hash z wynikiem (Y3.1 pkt 5) — tam i tylko tam
 *  ma prawo stanąć znacznik wersji. Zapadka na RÓWNOŚĆ: gdyby hash zaczął powstawać
 *  w dwóch miejscach, znacznik w jednym z nich byłby fikcją. */
{
  const zywe = (i, prefiks) => M.slice(i, i + prefiks.length) === prefiks;
  const BUDUJACE = [], CZYSZCZACE = [];
  const re = /\bhistory\.(replaceState|pushState)\s*\(/g; let m;
  while ((m = re.exec(HTML))) {
    if (!zywe(m.index, 'history.')) continue;
    const k = dopasuj(M, M.indexOf('(', m.index), '(', ')');
    const arg = HTML.slice(m.index, k + 1);          // ⚠️ granice z MASKI, treść z ORYGINAŁU
    const f = najwezsza(FUN, m.index);
    (/'#'|`#|"#"/.test(arg) ? BUDUJACE : CZYSZCZACE).push((f ? f.nazwa : '(top-level)') + ': ' + arg.replace(/\s+/g, ' '));
  }
  const PRZYPISANIA_HASHA = [];
  const re2 = /\blocation\.hash\s*=[^=]/g; let m2;
  while ((m2 = re2.exec(HTML))) {
    if (!zywe(m2.index, 'location.hash')) continue;
    const f = najwezsza(FUN, m2.index); PRZYPISANIA_HASHA.push(f ? f.nazwa : '(top-level)');
  }
  assertEq(BUDUJACE.length + PRZYPISANIA_HASHA.length, 1,
    '⭐ zapadka na RÓWNOŚĆ (O73): miejsc, w których POWSTAJE hash z wynikiem — dokładnie jedno (' + BUDUJACE.concat(PRZYPISANIA_HASHA).join(' | ') + ')');
  assert(/saveResultsToURL/.test(BUDUJACE[0] || ''), 'tym jedynym miejscem jest `saveResultsToURL`');
  assertEq(CZYSZCZACE.length, 1, 'zapadka na RÓWNOŚĆ (O73): miejsc, które hash KASUJĄ (`restart`) — jedno: ' + CZYSZCZACE.join(' | '));
  assert(/GC_WERSJA_WYNIKU_W_LINKU/.test(wytnijM('saveResultsToURL')),
    '⭐ D4 — znacznik wersji stawiany jest DOKŁADNIE tam, gdzie hash powstaje');
}

scenario('10a. O76 — funkcje pasa Y3 ISTNIEJĄ (brak = FAIL z nazwą, nigdy „POMINIĘTE")');
['loadResultsFromURL', 'saveResultsToURL', 'ocenWynikZLinku', 'renderLinkOdrzucony',
 'oznaczLinkSprzedPoprawki', 'registerCoach', 'showScreen', 'esc'].forEach(n => {
  assert(wytnij(n).length > 0, 'funkcja `' + n + '` istnieje w `index.html`');
});
['gc-link-odrzucony', 'gc-link-sprzed-poprawki'].forEach(id => {
  assert(new RegExp('id="' + id + '"').test(HTML), 'w źródle strony stoi gniazdo `#' + id + '`');
});
const STALE_Y3 = ['GC_WERSJA_WYNIKU_W_LINKU', 'ZDANIE_LINK_NIE_DO_ODCZYTANIA', 'ZDANIE_LINK_NIEPELNY_WYNIK',
                  'ZDANIE_LINK_SPRZED_POPRAWKI', 'ZDANIE_NIE_UDALO_SIE_SPRAWDZIC_KODU', 'ETYKIETA_SPRAWDZ_WASKIE_GARDLO'];
STALE_Y3.forEach(n => assert(new RegExp('const\\s+' + n + '\\s*=').test(M), 'stała `' + n + '` jest zadeklarowana — brzmienie ma JEDNO źródło'));
{
  const wart = (/const\s+ETYKIETA_SPRAWDZ_WASKIE_GARDLO\s*=\s*'([^']*)'/.exec(HTML) || [])[1];
  assert(!!wart, 'stała `ETYKIETA_SPRAWDZ_WASKIE_GARDLO` ma wartość');
  const PRZYCISK_INTRO = (/<button onclick="startSurvey\(\)"[\s\S]{0,600}?<\/button>/.exec(HTML) || [''])[0];
  assert(PRZYCISK_INTRO.indexOf(wart) !== -1,
    '⭐ D7 — „' + wart + '" jest WZIĘTE z żywego przycisku `screen-intro`, nie wymyślone (porównanie ze źródłem, nie z kopią w teście)');
  ['ZDANIE_LINK_NIE_DO_ODCZYTANIA', 'ZDANIE_LINK_NIEPELNY_WYNIK', 'ZDANIE_LINK_SPRZED_POPRAWKI', 'ZDANIE_NIE_UDALO_SIE_SPRAWDZIC_KODU'].forEach(n => {
    const i = M.indexOf('const ' + n + ' =');
    assert(i !== -1 && /DO PRZEJRZENIA — Y3/.test(HTML.slice(Math.max(0, i - 1400), i)),
      '`' + n + '` jest oznaczone `⚠️ DO PRZEJRZENIA — Y3` — nikt go nie przemyci jako uzgodnione');
  });
}

scenario('10b. O71 — ciało `loadResultsFromURL` pytane OSOBNO, instrukcja po instrukcji');
{
  const lrM = wytnijM('loadResultsFromURL');
  assert(lrM.length > 0, 'jest funkcja `loadResultsFromURL`');
  assert(!/catch\s*\([^)]*\)\s*\{\s*return\s+false\s*;?\s*\}/.test(lrM),
    '⛔ zniknął `catch(e) { return false; }` — jedna linia, która sklejała trzy różne stany w jedno milczenie (R5)');
  const IFY = warunkiIf('loadResultsFromURL');
  assert(IFY.some(x => /!hash/.test(x)), 'stan BRAK (adres bez hasha) jest pytany osobno — i tylko on ma prawo milczeć');
  assert(IFY.some(x => /!\s*ocena\.pelny/.test(x)), '⭐ stan NIEPEŁNY jest pytany osobno, po orzeczeniu `ocenWynikZLinku`');
  assert(/zglosBladOdczytu\s*\(/.test(lrM), 'awaria odczytu hasha ma GŁOS (O80)');
  assert(ileWywolan('renderLinkOdrzucony', lrM) >= 2, 'obie odrzucone drogi kończą się ekranem, który coś MÓWI');
  assert(/ocenWynikZLinku\s*\(/.test(lrM), 'kontrola kompletności jest naprawdę wołana, nie tylko zdefiniowana');
}

const WERSJA_Z_PLIKU = Number((/const\s+GC_WERSJA_WYNIKU_W_LINKU\s*=\s*(\d+)/.exec(HTML) || [])[1]);
scenario('10c. ⭐ D2 URUCHOMIONE — `ocenWynikZLinku` bierze prawdę z `SEGS`, nie z wpisanej liczby');
/** ⭐ Źródło budowane Z DOWOLNEGO TEKSTU, nie tylko z prawdziwego pliku — dzięki
 *  temu bateria mutacji (sekcja 9) URUCHAMIA zmutowaną kontrolę zamiast pytać
 *  o jej wygląd. Detektor tekstowy przepuściłby kontrolę, która nic nie odrzuca. */
function zrodloLinkuZ(t) {
  const P = przeparsuj(t);
  const tnij = (n) => { const f = P.znajdz(n); return f ? t.slice(f.od, f.b) : ''; };
  return [
    (/const\s+GC_WERSJA_WYNIKU_W_LINKU\s*=\s*\d+\s*;/.exec(t) || [''])[0],
    ...['ZDANIE_LINK_NIE_DO_ODCZYTANIA', 'ZDANIE_LINK_NIEPELNY_WYNIK', 'ZDANIE_LINK_SPRZED_POPRAWKI', 'ETYKIETA_SPRAWDZ_WASKIE_GARDLO']
        .map(n => (new RegExp('const\\s+' + n + "\\s*=\\s*'[^']*';").exec(t) || [''])[0]),
    tnij('esc'), tnij('showScreen'),
    tnij('ocenWynikZLinku'), tnij('renderLinkOdrzucony'), tnij('oznaczLinkSprzedPoprawki'),
    tnij('loadResultsFromURL'),
  ].join('\n');
}
const ZRODLO_LINKU = zrodloLinkuZ(HTML);

/** Atrapa DOM-u: tyle, ile trzeba, żeby `showScreen` NAPRAWDĘ przełączał ekran
 *  i żeby dało się przeczytać, CO STOI w gnieździe — nie żeby udawać przeglądarkę. */
const EKRANY_ATRAPY = ['screen-intro', 'screen-results', 'screen-survey', 'screen-loading', 'screen-context'];
function atrapaDomu() {
  const wezly = {};
  const nowy = (id, klasa) => {
    const el = { id: id, innerHTML: '', textContent: '', style: {}, _k: new Set(klasa ? [klasa] : []) };
    el.classList = { add: (c) => el._k.add(c), remove: (c) => el._k.delete(c), contains: (c) => el._k.has(c) };
    return el;
  };
  EKRANY_ATRAPY.forEach(id => wezly[id] = nowy(id, 'screen'));
  ['gc-link-odrzucony', 'gc-link-sprzed-poprawki', 'scores-table', 'overall-num',
   'diagnosis-blur-wrap', 'diagnosis-unlocked-note', 'email-gate-box'].forEach(id => wezly[id] = nowy(id));
  return {
    wezly: wezly,
    document: {
      getElementById: (id) => wezly[id] || null,
      querySelectorAll: (s) => (s === '.screen' ? EKRANY_ATRAPY.map(i => wezly[i]) : []),
      querySelector: () => null,
    },
  };
}
function odpalLinkZ(zrodlo, hash, kod) {
  const dom = atrapaDomu();
  const zapis = { render: [], glosy: [], ostrzezenia: [] };
  const c = {
    document: dom.document,
    window: { location: { hash: hash }, scrollTo() {} },
    JSON: JSON, Math: Math, Object: Object, isFinite: isFinite, Array: Array,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    escape: escape, unescape: unescape,
    decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
    setTimeout: () => 0,
    console: { warn: (...a) => zapis.ostrzezenia.push(a.join(' ')), error: () => {}, log: () => {} },
    zglosBladOdczytu: (gdzie) => zapis.glosy.push(gdzie),
    renderResults: (s) => { zapis.render.push(s); dom.wezly['scores-table'].innerHTML = '<wiersze>' + Object.keys(s || {}).length + '</wiersze>'; },
    renderDiagnosisV2Readonly: () => {}, _showProductSection: () => {},
    _diagState: {}, cachedScores: null, isJunior: false, ctx: {},
    SEGS: (kod && kod.SEGS) || SEGS_Z_PLIKU,
  };
  vm.createContext(c);
  vm.runInContext('var cachedScores = null, isJunior = false, ctx = {}, _diagState = {};\n' + zrodlo, c);
  const zwrot = c.loadResultsFromURL();
  const widoczny = EKRANY_ATRAPY.filter(id => dom.wezly[id]._k.has('active'));
  return {
    zwrot: zwrot,
    ekran: widoczny.length === 1 ? widoczny[0] : '(' + widoczny.length + ' EKRANÓW)',
    skrzynka: dom.wezly['gc-link-odrzucony'].innerHTML,
    ostrzezenieD4: dom.wezly['gc-link-sprzed-poprawki'].innerHTML,
    tabela: dom.wezly['scores-table'].innerHTML,
    cached: c.cachedScores,
    render: zapis.render.length,
    glosy: zapis.glosy, ostrzezenia: zapis.ostrzezenia,
    dom: EKRANY_ATRAPY.concat(['gc-link-odrzucony', 'gc-link-sprzed-poprawki', 'scores-table'])
           .map(id => id + '|' + dom.wezly[id].innerHTML + '|' + [...dom.wezly[id]._k].sort().join(',')).join('\n'),
  };
}
const odpalLink = (hash, kod) => odpalLinkZ(ZRODLO_LINKU, hash, kod);
const doHasha = (o) => '#' + Buffer.from(JSON.stringify(o), 'utf8').toString('base64');

probuj('`ocenWynikZLinku` daje się URUCHOMIĆ i liczy po `SEGS`', () => {
  if (!SEGS_Z_PLIKU) throw new Error('brak `SEGS` — nie ma na czym uruchomić');
  const c = { Object: Object, Array: Array, isFinite: isFinite, SEGS: SEGS_Z_PLIKU };
  vm.createContext(c); vm.runInContext(wytnij('ocenWynikZLinku'), c);
  const ID = SEGS_Z_PLIKU.map(s => s.id);
  const pelny = {}; ID.forEach((id, i) => pelny[id] = 30 + i);

  assertEq(c.ocenWynikZLinku(pelny).pelny, true, '⭐ ASERCJA ODWROTNA: wynik ze WSZYSTKIMI ' + ID.length + ' obszarami przechodzi');

  /* ⭐ liczba obszarów NIE JEST wpisana — dowodzi tego uruchomienie na PODMIENIONYM `SEGS` */
  const c2 = { Object: Object, Array: Array, isFinite: isFinite, SEGS: SEGS_Z_PLIKU.concat([{ id: 'obszarKtoregoNieMa', qs: [{}] }]) };
  vm.createContext(c2); vm.runInContext(wytnij('ocenWynikZLinku'), c2);
  assertEq(c2.ocenWynikZLinku(pelny).pelny, false,
    '⭐ D2 — po dołożeniu CZTERNASTEGO obszaru do `SEGS` ten sam wynik przestaje być pełny; gdyby w kontroli stało wpisane „13", nic by się nie zmieniło');
  const pelny14 = Object.assign({ obszarKtoregoNieMa: 50 }, pelny);
  assertEq(c2.ocenWynikZLinku(pelny14).pelny, true, 'a wynik z czternastoma obszarami — przechodzi. Prawda idzie za `SEGS`');

  /* DWANAŚCIE z trzynastu */
  const dwanascie = {}; ID.slice(0, ID.length - 1).forEach((id, i) => dwanascie[id] = 30 + i);
  const o12 = c.ocenWynikZLinku(dwanascie);
  assertEq(o12.pelny, false, '⭐ D2 — wynik z ' + (ID.length - 1) + ' obszarami zamiast ' + ID.length + ' jest ODRZUCONY');
  assertEq(o12.brakujace.join(','), ID[ID.length - 1], 'orzeczenie MÓWI, którego obszaru brakuje — do konsoli, nie do zgadywania');

  /* TRZYNAŚCIE, ale jeden `null` */
  const zNullem = Object.assign({}, pelny); zNullem[ID[10]] = null;
  const oN = c.ocenWynikZLinku(zNullem);
  assertEq(oN.pelny, false, '⭐ D2 — wynik z ' + ID.length + ' obszarami, ale jednym `null`, też jest ODRZUCONY');
  assertEq(oN.nieliczby.join(','), ID[10], 'orzeczenie mówi, KTÓRY obszar nie ma liczby');

  /* liczby spoza 0–100 i kształty, które nie są wynikiem */
  [[-1, 'ujemna'], [101, 'powyżej 100'], [NaN, 'NaN'], [Infinity, 'nieskończoność'], ['55', 'napis'], [undefined, 'undefined']].forEach(([w, opis]) => {
    const z = Object.assign({}, pelny); z[ID[0]] = w;
    assertEq(c.ocenWynikZLinku(z).pelny, false, 'wartość odrzucona: ' + opis);
  });
  [null, undefined, 42, 'wynik', [30, 40], []].forEach(w => {
    assertEq(c.ocenWynikZLinku(w).pelny, false, 'kształt odrzucony: ' + JSON.stringify(w));
  });
  const zNadmiarem = Object.assign({ obszarZPrzyszlosci: 50 }, pelny);
  assertEq(c.ocenWynikZLinku(zNadmiarem).pelny, false, 'wynik z NIEZNANYM obszarem jest odrzucony — nie wiemy, czym jest, więc go nie renderujemy');
});

scenario('10d. ⭐ D1 + D3 URUCHOMIONE — cztery hashe przez PRAWDZIWĄ `loadResultsFromURL`');
probuj('`loadResultsFromURL` daje się odpalić z atrapą DOM-u na czterech hashach', () => {
  if (!SEGS_Z_PLIKU) throw new Error('brak `SEGS`');
  const ID = SEGS_Z_PLIKU.map(s => s.id);
  const pelny = {}; ID.forEach((id, i) => pelny[id] = 30 + (i * 3) % 60);
  const trzy = {}; ID.slice(0, 3).forEach((id, i) => trzy[id] = 50 + i);

  /* (a) BRAK hasha — milczenie jest tu POPRAWNE */
  const a = odpalLink('');
  assertEq(a.zwrot, false, '(a) adres BEZ hasha: `loadResultsFromURL` oddaje `false` — wołający pokazuje ekran startowy sam');
  assertEq(a.ekran, '(0 EKRANÓW)', '(a) nic nie zostało pokazane przez tę funkcję');
  assertEq(a.skrzynka, '', '(a) ⭐ zawodnik NIE czyta zdania o linku — bo żadnego linku nie było (Z0)');
  assertEq(a.cached, null, '(a) `cachedScores` zostaje puste');

  /* (b) hash USZKODZONY */
  const b = odpalLink('#to-nie-jest-base64!!!###');
  assertEq(b.ekran, 'screen-intro', '(b) uszkodzony hash: ⛔ zawodnik NIE ląduje na ekranie wyników (D3)');
  assertEq(b.render, 0, '(b) `renderResults` nie zostało wołane ANI RAZU');
  assertEq(b.cached, null, '(b) ⭐ `cachedScores` zostaje `null` — nic z uszkodzonego linku nie weszło do stanu');
  assert(b.skrzynka.length > 0, '(b) ⭐ zawodnik CZYTA zdanie o tym, co się stało z linkiem');
  assert(b.glosy.length > 0, '(b) awaria ma GŁOS w konsoli (O80): ' + b.glosy.join(' | '));

  /* (c) hash POPRAWNY, ale TRZY obszary z trzynastu */
  const c3 = odpalLink(doHasha({ s: trzy, j: 0, v: 2 }));
  assertEq(c3.ekran, 'screen-intro', '(c) trzy obszary z ' + ID.length + ': ⛔ ekran wyników NIE JEST pokazany (D3)');
  assertEq(c3.render, 0, '(c) `renderResults` nie zostało wołane — do 16.08.2026 rysowało tabelę z trzech liczb');
  assertEq(c3.tabela, '', '(c) ⭐ w DOM-ie NIE MA tabeli wyników');
  assertEq(c3.cached, null, '(c) ⭐ `cachedScores` zostaje `null` — trzy liczby nie stają się profilem zawodnika');
  assert(c3.skrzynka.length > 0, '(c) zawodnik CZYTA zdanie o niepełnym linku');
  assert(c3.ostrzezenia.some(o => /LINK ODRZUCONY/.test(o) && ID.slice(3).every(id => o.indexOf(id) !== -1)),
    '(c) konsola dostaje LISTĘ brakujących obszarów, nie samo „coś nie tak"');

  /* (c2) trzynaście obszarów, jeden `null` — druga twarz tej samej dziury */
  const zNullem = Object.assign({}, pelny); zNullem[ID[10]] = null;
  const cN = odpalLink(doHasha({ s: zNullem, j: 0, v: 2 }));
  assertEq(cN.ekran, 'screen-intro', '(c2) ' + ID.length + ' obszarów z jednym `null`: ⛔ ekran wyników NIE JEST pokazany');
  assertEq(cN.cached, null, '(c2) ⭐ `null` NIE wchodzi do `cachedScores` — inaczej `getRelativeDeficits` ogłasza NIEOCENIONY obszar wąskim gardłem zawodnika');

  /* ⭐ D1 — trzy stany, TRZY RÓŻNE odpowiedzi */
  assert(b.skrzynka !== c3.skrzynka,
    '⭐ D1 — zdanie przy „uszkodzony hash" RÓŻNI SIĘ od zdania przy „niekompletny wynik" (R5: trzy wartości, nie dwie)');
  assert(a.skrzynka !== b.skrzynka && a.skrzynka !== c3.skrzynka,
    '⭐ D1 — stan BRAK nie wygląda jak żaden z dwóch pozostałych');
  assertEq(b.zwrot, true, '(b) funkcja oddaje `true` — ekran jest już obsłużony, wołający nie nadpisze go ekranem startowym');
  assertEq(c3.zwrot, true, '(c) jw.');

  /* ⭐ P0 — wyjście stoi W TEJ SAMEJ skrzynce, nie trzeba go szukać */
  const ETY = (/const\s+ETYKIETA_SPRAWDZ_WASKIE_GARDLO\s*=\s*'([^']*)'/.exec(HTML) || [])[1];
  [b, c3].forEach((w, i) => {
    assert(w.skrzynka.indexOf('startSurvey()') !== -1, 'P0 — skrzynka ' + (i ? '(c)' : '(b)') + ' niesie WYJŚCIE: `startSurvey()`');
    assert(w.skrzynka.indexOf(ETY) !== -1, 'P0 — wyjście ma etykietę „' + ETY + '"');
    assert(!/nie odpowiedziałeś|nie wypełniłeś|musisz|Twoja wina|oszuk/i.test(w.skrzynka),
      'N1 — zdanie mówi o LINKU, nie obwinia zawodnika: „' + w.skrzynka.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() + '"');
  });

  /* (d) hash POPRAWNY i PEŁNY, BEZ znacznika wersji → renderuje się I niesie ostrzeżenie */
  const d = odpalLink(doHasha({ s: pelny, j: 0 }));
  assertEq(d.ekran, 'screen-results', '⭐ D4 (d) link BEZ znacznika wersji RENDERUJE SIĘ — nie unieważniamy cudzego linku');
  assertEq(d.render, 1, '(d) `renderResults` zostało wołane dokładnie raz');
  assertEq(Object.keys(d.cached).length, ID.length, '(d) `cachedScores` ma komplet ' + ID.length + ' obszarów');
  assert(d.ostrzezenieD4.length > 0, '⭐ D4 (d) nad wynikiem STOI zdanie o tym, że link powstał przed poprawką');
  const ZD_STARY = (/const\s+ZDANIE_LINK_SPRZED_POPRAWKI\s*=\s*'([^']*)'/.exec(HTML) || [])[1];
  assert(d.ostrzezenieD4.indexOf(ZD_STARY) !== -1, '(d) to jest DOKŁADNIE zdanie ze stałej, nie kopia w teście');
  assert(!/oszuk|na pewno|z pewnością|pewnie nie oceniłeś/i.test(d.ostrzezenieD4),
    'Z0 + N1 — zdanie mówi „nie mamy jak sprawdzić", a nie „ten wynik jest fałszywy"');

  /* (e) hash POPRAWNY, PEŁNY i ZE znacznikiem → ⭐ ASERCJA ODWROTNA D5 */
  const e = odpalLink(doHasha({ s: pelny, j: 0, v: WERSJA_Z_PLIKU }));
  assertEq(e.ekran, 'screen-results', '⭐ ASERCJA ODWROTNA D5: pełny link ZE znacznikiem renderuje się jak przed pasem');
  assertEq(e.render, 1, '(e) `renderResults` wołane raz');
  assertEq(e.ostrzezenieD4, '', '⭐ D4 (e) link ZE znacznikiem NIE NIESIE ani jednego dodatkowego zdania');
  assertEq(e.skrzynka, '', '(e) skrzynka odrzucenia zostaje pusta');
  assertEq(JSON.stringify(e.cached), JSON.stringify(pelny), '(e) `cachedScores` to CO DO ZNAKU liczby z linku');
  assertEq(e.glosy.length, 0, '(e) nic nie trafia do konsoli — ścieżka, która działa, jest CICHA i to jest poprawne');

  /* ⭐ D5 CO DO ZNAKU: jedyna różnica w całym DOM-ie między (d) a (e) to gniazdo ostrzeżenia */
  const roznice = d.dom.split('\n').filter((w, i) => w !== e.dom.split('\n')[i]);
  assertEq(roznice.length, 1, '⭐ D5 — DOM po (d) i po (e) różni się DOKŁADNIE JEDNYM węzłem (' + roznice.map(r => r.split('|')[0]).join(', ') + ')');
  assertEq((roznice[0] || '').split('|')[0], 'gc-link-sprzed-poprawki', '⭐ D5 — a tym węzłem jest gniazdo ostrzeżenia, nic więcej');
});

scenario('10e. ⭐ D4 — znacznik wersji NAPRAWDĘ ląduje w hashu (`saveResultsToURL` uruchomione)');
probuj('`saveResultsToURL` daje się uruchomić, a z hasha da się odzyskać znacznik', () => {
  assert(Number.isFinite(WERSJA_Z_PLIKU), 'stała `GC_WERSJA_WYNIKU_W_LINKU` jest liczbą: ' + WERSJA_Z_PLIKU);
  const ID = SEGS_Z_PLIKU.map(s => s.id);
  const pelny = {}; ID.forEach((id, i) => pelny[id] = 30 + i);
  let zapisany = null;
  const c = {
    JSON: JSON, Object: Object,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    unescape: unescape, encodeURIComponent: encodeURIComponent,
    history: { replaceState: (a, b, h) => { zapisany = h; } },
    isJunior: false, ctx: { pos: 3 }, _diagState: { diagnosisText: '', topDeficitIds: [], usedInsights: false },
    zglosBladOdczytu: () => {},
  };
  vm.createContext(c);
  vm.runInContext('var isJunior = false, ctx = { pos: 3 }, _diagState = { diagnosisText: "", topDeficitIds: [], usedInsights: false };\n'
    + (/const\s+GC_WERSJA_WYNIKU_W_LINKU\s*=\s*\d+\s*;/.exec(HTML) || [''])[0] + '\n' + wytnij('saveResultsToURL'), c);
  c.saveResultsToURL(pelny);
  assert(typeof zapisany === 'string' && zapisany[0] === '#', 'hash NAPRAWDĘ powstał: ' + String(zapisany).slice(0, 24) + '…');
  const odczytany = JSON.parse(Buffer.from(zapisany.slice(1), 'base64').toString('utf8'));
  assertEq(odczytany.v, WERSJA_Z_PLIKU, '⭐ D4 — każdy NOWY link niesie znacznik wersji ' + WERSJA_Z_PLIKU);
  assertEq(JSON.stringify(odczytany.s), JSON.stringify(pelny), 'ASERCJA ODWROTNA: liczby w linku są nietknięte');
  /* ⭐ pętla domknięta: to, co zapisał `saveResultsToURL`, przechodzi kontrolę `loadResultsFromURL` */
  const zpetli = odpalLink(zapisany);
  assertEq(zpetli.ekran, 'screen-results', '⭐ PĘTLA DOMKNIĘTA: link zbudowany przez `saveResultsToURL` przechodzi kontrolę i renderuje wynik');
  assertEq(zpetli.ostrzezenieD4, '', '⭐ …i NIE dostaje ostrzeżenia o starym linku — bo stary nie jest');
});

/** ⚠️ `wytnij` tnie od słowa `function`, więc gubi przedrostek `async` —
 *  a bez niego ciała `registerCoach` NIE DA SIĘ uruchomić (`await` poza `async`).
 *  Przedrostek czytamy ze źródła, nie dopisujemy go w ciemno. */
function wytnijZAsync(nazwa) {
  const f = znajdz(nazwa); if (!f) return '';
  const przed = HTML.slice(Math.max(0, f.od - 10), f.od);
  return (/\basync\s*$/.test(przed) ? 'async ' : '') + HTML.slice(f.od, f.b);
}
scenario('10f. ⭐ D6 URUCHOMIONE — `registerCoach` po AWARII ODCZYTU nie wydaje kodu');
{
  const rcM = wytnijM('registerCoach');
  assert(rcM.length > 0, 'jest funkcja `registerCoach`');
  assert(!/catch\s*\([^)]*\)\s*\{\s*\}/.test(rcM), '⛔ zniknął pusty `catch` wokół odczytu „czy ten trener ma już kod"');
  assert(/zglosBladOdczytu\s*\(/.test(rcM), 'awaria tego odczytu ma GŁOS (O80)');
  /** ⚠️ `warunkiIf` czyta MASKĘ, a maska czyści treść literałów — `'nieudane'`
   *  wychodzi z niej jako `'        '`. Warunki tej jednej funkcji tniemy z ORYGINAŁU
   *  (granice nawiasów z maski, treść z pliku), inaczej pytalibyśmy o puste napisy. */
  const IFY = (() => {
    const f = znajdz('registerCoach'); if (!f) return [];
    const w = []; const re = /\bif\s*\(/g; let mi;
    const cialoM = M.slice(f.od, f.b);
    while ((mi = re.exec(cialoM))) {
      const nw = cialoM.indexOf('(', mi.index);
      const k = dopasuj(cialoM, nw, '(', ')');
      if (k !== -1) w.push(HTML.slice(f.od + nw + 1, f.od + k));
    }
    return w;
  })();
  assert(IFY.some(x => /stanSprawdzenia\s*===\s*'nieudane'/.test(x)), 'stan „nie udało się sprawdzić" jest pytany OSOBNO (R5)');
  assert(IFY.some(x => /stanSprawdzenia\s*===\s*'jest'/.test(x)), 'stan „kod istnieje" jest pytany osobno');
  assert(IFY.length >= 5, 'ciało `registerCoach` rozgałęzia się na tyle stanów, ile ich naprawdę jest (warunków: ' + IFY.length + ')');
  assert(/!dup\.ok|dup\.ok\s*===\s*false/.test(rcM), '⛔ HTTP 500 z ciałem `[]` nie udaje już „nie ma takiego trenera"');
}
probujAsync('`registerCoach` odpalona z PADNIĘTYM odczytem nie woła niczego, co wydaje kod', () => {
  const wezly = {};
  const el = (id, v) => (wezly[id] = { id: id, value: v || '', style: {}, textContent: '', innerHTML: '' });
  el('coach-name-input', 'Jan Trener'); el('coach-email-input', 'jan@klub.pl'); el('coach-club-input', 'KS Testowy');
  el('coach-register-error'); el('coach-code-display'); el('coach-panel-link'); el('coach-register-success');
  const slady = { fetch: [], mail: 0, losowania: 0 };
  const c = {
    document: { getElementById: (id) => wezly[id] || null, querySelector: () => ({ style: {} }) },
    window: { location: { origin: 'https://x', pathname: '/' } },
    SUPABASE_URL: 'https://baza', SUPABASE_KEY: 'klucz',
    JSON: JSON, Date: Date, Array: Array, Error: Error,
    encodeURIComponent: encodeURIComponent,
    Math: Object.assign(Object.create(Math), { random: () => { slady.losowania++; return 0.5; }, floor: Math.floor }),
    // ⛔ ODCZYT PADA. Dokładnie ten stan, który do 16.08.2026 wydawał DRUGI kod.
    fetch: (u, o) => { slady.fetch.push({ u: String(u), m: (o && o.method) || 'GET' }); return Promise.reject(new Error('sieć padła')); },
    emailjs: { send: () => { slady.mail++; return Promise.resolve(); } },
    zglosBladOdczytu: () => {},
    console: { error: () => {}, warn: () => {}, log: () => {} },
  };
  vm.createContext(c);
  vm.runInContext((new RegExp("const\\s+ZDANIE_NIE_UDALO_SIE_SPRAWDZIC_KODU\\s*=\\s*'[^']*';").exec(HTML) || [''])[0] + '\n'
    + (/const\s+ETYKIETA_SPROBUJ_PONOWNIE\s*=\s*'[^']*';/.exec(HTML) || [''])[0] + '\n'
    + wytnijZAsync('registerCoach'), c);
  return c.registerCoach().then(() => {
    const zapisy = slady.fetch.filter(f => f.m !== 'GET');
    assertEq(zapisy.length, 0, '⭐ D6 — po padniętym odczycie NIE POWSTAJE nowy rekord drużyny (zapisów HTTP: ' + zapisy.length + ')');
    assertEq(slady.mail, 0, '⭐ D6 — i nie wychodzi mail z nowym kodem');
    assertEq(slady.losowania, 0, '⭐ D6 — generator kodu (`Math.random`) nie został nawet uruchomiony');
    assertEq(wezly['coach-code-display'].textContent, '', 'na ekranie NIE pojawia się żaden kod');
    assert(wezly['coach-register-success'].style.display !== 'block', 'ekran sukcesu NIE jest pokazany');
    const ZD = (/const\s+ZDANIE_NIE_UDALO_SIE_SPRAWDZIC_KODU\s*=\s*'([^']*)'/.exec(HTML) || [])[1];
    assert(wezly['coach-register-error'].textContent.indexOf(ZD) !== -1,
      '⭐ D6 — trener CZYTA, że nie udało się sprawdzić: „' + wezly['coach-register-error'].textContent + '"');
    assert(wezly['coach-register-error'].style.display === 'block', 'to zdanie jest WIDOCZNE, nie tylko wpisane');
  });
});
probujAsync('⭐ ASERCJA ODWROTNA D6 — przy DZIAŁAJĄCYM odczycie i pustej bazie kod NADAL powstaje', () => {
  const wezly = {};
  const el = (id, v) => (wezly[id] = { id: id, value: v || '', style: {}, textContent: '', innerHTML: '' });
  el('coach-name-input', 'Jan Trener'); el('coach-email-input', 'jan@klub.pl'); el('coach-club-input', 'KS Testowy');
  el('coach-register-error'); el('coach-code-display'); el('coach-panel-link'); el('coach-register-success');
  const slady = { zapisy: 0, mail: 0 };
  const c = {
    document: { getElementById: (id) => wezly[id] || null, querySelector: () => ({ style: {} }) },
    window: { location: { origin: 'https://x', pathname: '/' } },
    SUPABASE_URL: 'https://baza', SUPABASE_KEY: 'klucz',
    JSON: JSON, Date: Date, Array: Array, Error: Error, Math: Math, encodeURIComponent: encodeURIComponent,
    fetch: (u, o) => {
      if (o && o.method === 'POST') { slady.zapisy++; return Promise.resolve({ ok: true, status: 201 }); }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });   // baza pusta
    },
    emailjs: { send: () => { slady.mail++; return Promise.resolve(); } },
    zglosBladOdczytu: () => {}, console: { error: () => {}, warn: () => {}, log: () => {} },
  };
  vm.createContext(c);
  vm.runInContext((new RegExp("const\\s+ZDANIE_NIE_UDALO_SIE_SPRAWDZIC_KODU\\s*=\\s*'[^']*';").exec(HTML) || [''])[0] + '\n'
    + (/const\s+ETYKIETA_SPROBUJ_PONOWNIE\s*=\s*'[^']*';/.exec(HTML) || [''])[0] + '\n'
    + wytnijZAsync('registerCoach'), c);
  return c.registerCoach().then(() => {
    assertEq(slady.zapisy, 1, '⭐ ASERCJA ODWROTNA: gdy odczyt DZIAŁA i trenera nie ma w bazie, kod powstaje jak przed pasem');
    assertEq(slady.mail, 1, 'i mail z kodem wychodzi');
    assert(wezly['coach-code-display'].textContent.length > 0, 'kod jest pokazany na ekranie: ' + wezly['coach-code-display'].textContent);
    assertEq(wezly['coach-register-success'].style.display, 'block', 'ekran sukcesu jest pokazany');
  });
});
probujAsync('⭐ ASERCJA ODWROTNA D6 — gdy trener MA już kod, dostaje TEN SAM, nie nowy', () => {
  const wezly = {};
  const el = (id, v) => (wezly[id] = { id: id, value: v || '', style: {}, textContent: '', innerHTML: '' });
  el('coach-name-input', 'Jan Trener'); el('coach-email-input', 'jan@klub.pl'); el('coach-club-input', 'KS Testowy');
  el('coach-register-error'); el('coach-code-display'); el('coach-panel-link'); el('coach-register-success');
  const slady = { zapisy: 0, mail: 0 };
  const c = {
    document: { getElementById: (id) => wezly[id] || null, querySelector: () => ({ style: {} }) },
    window: { location: { origin: 'https://x', pathname: '/' } },
    SUPABASE_URL: 'https://baza', SUPABASE_KEY: 'klucz',
    JSON: JSON, Date: Date, Array: Array, Error: Error, Math: Math, encodeURIComponent: encodeURIComponent,
    fetch: (u, o) => {
      if (o && o.method === 'POST') { slady.zapisy++; return Promise.resolve({ ok: true, status: 201 }); }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ code: 'KSTESTOWY1234' }]) });
    },
    emailjs: { send: () => { slady.mail++; return Promise.resolve(); } },
    zglosBladOdczytu: () => {}, console: { error: () => {}, warn: () => {}, log: () => {} },
  };
  vm.createContext(c);
  vm.runInContext((new RegExp("const\\s+ZDANIE_NIE_UDALO_SIE_SPRAWDZIC_KODU\\s*=\\s*'[^']*';").exec(HTML) || [''])[0] + '\n'
    + (/const\s+ETYKIETA_SPROBUJ_PONOWNIE\s*=\s*'[^']*';/.exec(HTML) || [''])[0] + '\n'
    + wytnijZAsync('registerCoach'), c);
  return c.registerCoach().then(() => {
    assertEq(slady.zapisy, 0, '⭐ ASERCJA ODWROTNA: trener z kodem NIE dostaje drugiego rekordu');
    assertEq(wezly['coach-code-display'].textContent, 'KSTESTOWY1234', 'i widzi swój ISTNIEJĄCY kod');
  });
}); 

/* ══════════════════════════════════════════════════════════════════════════
   9. BATERIA MUTACJI — każda zapala, każda ma asercję ODWROTNĄ.
   ⚠️ Cofnięcie jest STRUKTURALNE, nie deklaratywne: każda mutacja to podmiana
   w łańcuchu znaków W PAMIĘCI. Nic nie dotyka dysku, więc nie ma czego cofać —
   a pilnuje tego `md5` liczone przed baterią i po niej.
   ══════════════════════════════════════════════════════════════════════════ */
scenario('9. bateria mutacji — czy ten strażnik w ogóle potrafi się zapalić');

const MD5_PRZED = crypto.createHash('md5').update(HTML).digest('hex');

const MUTACJE = [
  {
    nazwa: 'M1 — lokalnie sklejona diagnoza wraca na ekran',
    psuj: t => t.replace('renderNieudanyOdczytDiagnozy(scores, powodNieudanejDiagnozy);',
                         'renderNieudanyOdczytDiagnozy(scores, powodNieudanejDiagnozy); buildFallbackDiagnosis(scores, []);'),
    wykryj: t => {
      const { Mt, F } = przeparsuj(t);
      const dekl = new Set(F.map(f => f.paramOd));
      const re = /\bbuildFallbackDiagnosis\s*\(/g; let n = 0;
      while (re.exec(Mt)) { if (!dekl.has(re.lastIndex - 1)) n++; }
      return n !== 0;
    },
  },
  {
    nazwa: 'M2 — bramka `wolnoTwierdzic` rozluźniona na „prawdziwość" (O71)',
    psuj: t => t.replace('if (!wolnoTwierdzic(_diagState.odczytDiagnozy)) {', 'if (!_diagState.odczytDiagnozy) {'),
    wykryj: t => {
      // ⚠️ słowo `wolnoTwierdzic` po tej mutacji NADAL stoi w pliku kilkanaście razy —
      // asercja na całym pliku by jej NIE zobaczyła. Pytamy o WARUNEK tej jednej instrukcji.
      const { Mt, znajdz } = przeparsuj(t);
      const f = znajdz('generateAIDiagnosis'); if (!f) return true;
      const w = []; const re = /\bif\s*\(/g; let m;
      while ((m = re.exec(f.trescM))) { const nw = f.trescM.indexOf('(', m.index); const k = dopasuj(f.trescM, nw, '(', ')'); if (k !== -1) w.push(f.trescM.slice(nw + 1, k)); }
      return !w.some(x => /!\s*wolnoTwierdzic\s*\(\s*_diagState\.odczytDiagnozy\s*\)/.test(x));
    },
  },
  {
    nazwa: 'M3 — `response.ok` przestaje być sprawdzane (HTTP 500 znów udaje sukces)',
    psuj: t => t.replace('    if (!response.ok) {\n      _diagState.odczytDiagnozy = false;', '    if (false) {\n      _diagState.odczytDiagnozy = false;'),
    wykryj: t => { const { znajdz } = przeparsuj(t); const f = znajdz('generateAIDiagnosis'); return !f || !/response\.ok/.test(f.trescM); },
  },
  {
    nazwa: 'M4 — `loadPlayerHistory` wraca do klasy PUSTKA (`return []`)',
    psuj: t => t.replace("  } catch(e) {\n    zglosBladOdczytu('loadPlayerHistory :: diagnostics', e);\n    return { wpisy: [], odczyt: false };\n  }", '  } catch(e) { return []; }'),
    wykryj: t => { const { znajdz } = przeparsuj(t); const f = znajdz('loadPlayerHistory'); return !!f && /catch\s*\([^)]*\)\s*\{\s*return\s*\[\s*\]\s*;?\s*\}/.test(f.trescM); },
  },
  {
    nazwa: 'M5 — ekran awarii dostaje NOWE brzmienie wpisane z palca',
    psuj: t => t.replace('      ZDANIE_NIEUDANA_DIAGNOZA +', "      'Coś poszło nie tak, ale poradzisz sobie bez tej diagnozy' +"),
    wykryj: t => {
      const { Mt, znajdz } = przeparsuj(t);
      const f = znajdz('renderNieudanyOdczytDiagnozy'); if (!f) return true;
      const out = []; let i = f.od;
      while (i < f.b) {
        const c = Mt[i];
        if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < f.b && Mt[j] !== c) j++; out.push(t.slice(i + 1, j)); i = j + 1; continue; }
        i++;
      }
      return out.filter(zdanieDoCzlowieka).length !== 0;
    },
  },
  {
    nazwa: 'M6 — samoopis zawodnika zaczyna lądować w magazynie przeglądarki',
    psuj: t => t.replace('      goal: presurvey.goal,', '      goal: presurvey.goal,\n      selfDesc: presurvey.selfDesc,'),
    wykryj: t => {
      const { znajdz } = przeparsuj(t);
      const f = znajdz('zapiszPostepAnkiety'); if (!f) return true;
      const magazyn = {};
      const c = {
        localStorage: { setItem: (k, v) => { magazyn[k] = v; }, getItem: () => null, removeItem() {} },
        ans: { moc: [3] }, ctx: {}, presurvey: { goal: 0, ownTypes: new Set(), selfDesc: 'ZDANIE-ZNACZNIK' },
        JSON, Date, Object,
      };
      vm.createContext(c);
      vm.runInContext(STALA_KLUCZA + '\n' + t.slice(f.od, f.b), c);
      c.zapiszPostepAnkiety();
      return Object.keys(magazyn).some(k => String(magazyn[k]).indexOf('ZDANIE-ZNACZNIK') !== -1);
    },
  },
  {
    nazwa: 'M7 — gałąź „odczyt padł" na ekranie follow-upu znów zlepiona z „nie znaleziono"',
    psuj: t => t.replace('    if (row === null) {', '    if (false) {'),
    wykryj: t => { const { znajdz } = przeparsuj(t); const f = znajdz('loadObservationResponseView'); return !f || !/row\s*===\s*null/.test(f.trescM); },
  },
  {
    nazwa: 'M8 — PDF znów drukuje treść `#ai-diagnosis-text` bez bramki',
    psuj: t => t.replace('  if (odczytPadl(_diagState.odczytDiagnozy)) {', '  if (false) {'),
    wykryj: t => { const { znajdz } = przeparsuj(t); const f = znajdz('downloadPDF'); return !f || !/odczytPadl\s*\(\s*_diagState\.odczytDiagnozy\s*\)/.test(f.trescM); },
  },
  {
    nazwa: 'M9 — `zglosBladOdczytu` schodzi z `console.error` na `console.log` (O80)',
    psuj: t => t.replace("try { console.error('CICHY BRAK — ' + gdzie,", "try { console.log('CICHY BRAK — ' + gdzie,"),
    wykryj: t => { const { znajdz } = przeparsuj(t); const f = znajdz('zglosBladOdczytu'); return !f || !/console\.error\(/.test(f.trescM); },
  },
  /* ── PLAN-D-Y2 08.2026 — siedem mutacji na cichy brak po stronie WEJŚCIA ── */
  {
    nazwa: 'M10 — `disabled` znika z przycisku w źródle strony (zostaje samo `opacity`)',
    psuj: t => t.replace('id="btn-submit" onclick="generateResults()" disabled', 'id="btn-submit" onclick="generateResults()"'),
    wykryj: t => {
      const tag = (/<button[^>]*id="btn-submit"[^>]*>/.exec(t) || [''])[0];
      return !/\bdisabled\b/.test(tag);
    },
  },
  {
    nazwa: 'M11 — `updateProgressScroll` przestaje ustawiać `disabled`',
    psuj: t => t.replace('    btn.disabled = !b.kompletna;', "    btn.title = '';"),
    wykryj: t => { const { znajdz } = przeparsuj(t); const f = znajdz('updateProgressScroll'); return !f || !/\.disabled\s*=/.test(f.trescM); },
  },
  {
    nazwa: 'M12 — bramka na niepełną ankietę w `generateResults` rozluźniona (O71)',
    psuj: t => t.replace('  if (!braki.kompletna) {', '  if (false) {'),
    wykryj: t => {
      const { znajdz } = przeparsuj(t);
      const f = znajdz('generateResults'); if (!f) return true;
      const w = []; const re = /\bif\s*\(/g; let m;
      while ((m = re.exec(f.trescM))) { const nw = f.trescM.indexOf('(', m.index); const k = dopasuj(f.trescM, nw, '(', ')'); if (k !== -1) w.push(f.trescM.slice(nw + 1, k)); }
      return !w.some(x => /!\s*braki\.kompletna/.test(x));
    },
  },
  {
    nazwa: 'M13 — ⛔ WYPEŁNIACZ 3.5 WRACA DO `calcScores`',
    psuj: t => t.replace('    if (cnt !== seg.qs.length) { sc[seg.id] = null; return; }\n    const raw = sum / cnt;',
                         '    const raw = cnt > 0 ? sum / cnt : 3.5;'),
    wykryj: t => {
      // ⭐ detektor URUCHAMIA zmutowaną funkcję na ankiecie 6 z 27 i pyta,
      //    czy segment BEZ ANI JEDNEJ ODPOWIEDZI dostał liczbę.
      const { znajdz } = przeparsuj(t);
      const f = znajdz('calcScores'); if (!f) return true;
      if (!SEGS_Z_PLIKU) return true;
      const S = SEGS_Z_PLIKU;
      const ans = {}; S.forEach(s => ans[s.id] = s.qs.map(() => null));
      let i = 0; S.forEach(s => s.qs.forEach((q, qi) => { if (i < 6) ans[s.id][qi] = 4; i++; }));
      const odp = new Set(); { let j = 0; S.forEach(s => s.qs.forEach(() => { if (j < 6) odp.add(s.id); j++; })); }
      const c = { SEGS: S, ans: ans, Math, Object, console: { warn() {}, error() {} } };
      vm.createContext(c);
      vm.runInContext(t.slice(f.od, f.b), c);
      const sc = c.calcScores();
      return Object.keys(sc).some(k => !odp.has(k) && typeof sc[k] === 'number');
    },
  },
  {
    nazwa: 'M14 — warunek kompletu rozluźniony do „choć jedna odpowiedź"',
    psuj: t => t.replace('    if (cnt !== seg.qs.length) { sc[seg.id] = null; return; }', '    if (cnt === 0) { sc[seg.id] = null; return; }'),
    wykryj: t => {
      // ⭐ URUCHAMIA na segmencie odpowiedzianym W POŁOWIE.
      const { znajdz } = przeparsuj(t);
      const f = znajdz('calcScores'); if (!f) return true;
      if (!SEGS_Z_PLIKU) return true;
      const S = SEGS_Z_PLIKU;
      const ans = {}; S.forEach(s => ans[s.id] = s.qs.map(() => 4));
      const wielo = S.filter(s => s.qs.length > 1)[0];
      ans[wielo.id][wielo.qs.length - 1] = null;
      const c = { SEGS: S, ans: ans, Math, Object, console: { warn() {}, error() {} } };
      vm.createContext(c);
      vm.runInContext(t.slice(f.od, f.b), c);
      return typeof c.calcScores()[wielo.id] === 'number';
    },
  },
  {
    nazwa: 'M15 — kotwice `data-seg`/`data-qi` znikają z pytania (wyjście traci cel)',
    psuj: t => t.replace('<div class="question-block" data-seg="${esc(seg.id)}" data-qi="${qi}" style=', '<div class="question-block" style='),
    wykryj: t => {
      const { znajdz } = przeparsuj(t);
      const f = znajdz('renderAllQuestions'); if (!f) return true;
      return !/data-seg="\$\{esc\(seg\.id\)\}"/.test(t.slice(f.od, f.b));   // ⚠️ RAW, nie maska — atrybuty siedzą w literale szablonowym
    },
  },
  {
    nazwa: 'M17 — `restart()` przestaje odświeżać stan przycisku',
    psuj: t => t.replace('  updateProgressScroll();\n  ctx = { level: null', '  ctx = { level: null'),
    wykryj: t => { const { znajdz } = przeparsuj(t); const f = znajdz('restart'); return !f || !/updateProgressScroll\s*\(/.test(f.trescM); },
  },
  {
    nazwa: 'M16 — ostatnia bramka (`null` po policzeniu) przestaje pytać',
    psuj: t => t.replace('  if (segmentyBezWyniku.length) {', '  if (false) {'),
    wykryj: t => {
      const { znajdz } = przeparsuj(t);
      const f = znajdz('generateResults'); if (!f) return true;
      const w = []; const re = /\bif\s*\(/g; let m;
      while ((m = re.exec(f.trescM))) { const nw = f.trescM.indexOf('(', m.index); const k = dopasuj(f.trescM, nw, '(', ')'); if (k !== -1) w.push(f.trescM.slice(nw + 1, k)); }
      return !w.some(x => /segmentyBezWyniku\.length/.test(x));
    },
  },
  /* ── PLAN-D-Y3 08.2026 — SIEDEM MUTACJI NA LINK, KTÓRY NIESIE WYNIK ──
     ⚠️ Detektory M18–M23 URUCHAMIAJĄ zmutowany kod na prawdziwych hashach.
     Detektor tekstowy („czy stoi słowo `walidacja`") przepuściłby kontrolę,
     która się wykonuje i nic nie odrzuca. */
  {
    nazwa: 'M18 — kontrola kompletności ZNIKA (`ocenWynikZLinku` zawsze mówi „pełny")',
    psuj: t => t.replace('  const brakujace  = oczekiwane.filter(id => !Object.prototype.hasOwnProperty.call(wynik, id));',
                         '  const brakujace  = [];'),
    wykryj: t => {
      // ⭐ URUCHAMIA na hashu z TRZEMA obszarami z trzynastu i pyta o EKRAN.
      if (!SEGS_Z_PLIKU) return true;
      const trzy = {}; SEGS_Z_PLIKU.slice(0, 3).forEach((sg, i) => trzy[sg.id] = 50 + i);
      const w = odpalLinkZ(zrodloLinkuZ(t), doHasha({ s: trzy, j: 0, v: 2 }));
      return w.ekran === 'screen-results' || w.render > 0 || w.cached !== null;
    },
  },
  {
    nazwa: 'M19 — kontrola bierze WPISANĄ liczbę obszarów zamiast `SEGS`',
    psuj: t => t.replace("  const oczekiwane = (typeof SEGS !== 'undefined' && Array.isArray(SEGS)) ? SEGS.map(s => s.id) : [];",
                         "  const oczekiwane = ['moc','wytrzymalosc','fizycznosc','techFund','techSpec','tolerancja','regeneracja','odpornosc','odzywianie','koncentracja','mental','percepcja','decyzja'];"),
    wykryj: t => {
      // ⭐ URUCHAMIA z PODMIENIONYM `SEGS` (czternasty obszar). Prawdziwa kontrola
      //    pojedzie za `SEGS` i odrzuci wynik trzynastoobszarowy; wpisana lista — nie.
      if (!SEGS_Z_PLIKU) return true;
      const S14 = SEGS_Z_PLIKU.concat([{ id: 'obszarKtoregoNieMa', name: 'X', qs: [{}] }]);
      const p13 = {}; SEGS_Z_PLIKU.forEach((sg, i) => p13[sg.id] = 30 + i);
      const w = odpalLinkZ(zrodloLinkuZ(t), doHasha({ s: p13, j: 0, v: 2 }), { SEGS: S14 });
      return w.ekran === 'screen-results';   // zmutowana kontrola przepuszcza — prawdziwa nie
    },
  },
  {
    nazwa: 'M20 — odrzucony link i tak ląduje na EKRANIE WYNIKÓW',
    psuj: t => t.replace("    renderLinkOdrzucony(ZDANIE_LINK_NIEPELNY_WYNIK);\n    return true;",
                         "    renderLinkOdrzucony(ZDANIE_LINK_NIEPELNY_WYNIK);\n    cachedScores = data.s; renderResults(cachedScores); showScreen('screen-results');\n    return true;"),
    wykryj: t => {
      if (!SEGS_Z_PLIKU) return true;
      const trzy = {}; SEGS_Z_PLIKU.slice(0, 3).forEach((sg, i) => trzy[sg.id] = 50 + i);
      const w = odpalLinkZ(zrodloLinkuZ(t), doHasha({ s: trzy, j: 0, v: 2 }));
      return w.ekran === 'screen-results' || w.render > 0;   // D3 złamane
    },
  },
  {
    nazwa: 'M21 — uszkodzony hash i niekompletny wynik dostają TO SAMO zdanie (R5 z powrotem na dwie wartości)',
    psuj: t => t.replace('    renderLinkOdrzucony(ZDANIE_LINK_NIEPELNY_WYNIK);',
                         '    renderLinkOdrzucony(ZDANIE_LINK_NIE_DO_ODCZYTANIA);'),
    wykryj: t => {
      if (!SEGS_Z_PLIKU) return true;
      const zr = zrodloLinkuZ(t);
      const trzy = {}; SEGS_Z_PLIKU.slice(0, 3).forEach((sg, i) => trzy[sg.id] = 50 + i);
      const uszk = odpalLinkZ(zr, '#to-nie-jest-base64!!!###');
      const niep = odpalLinkZ(zr, doHasha({ s: trzy, j: 0, v: 2 }));
      return uszk.skrzynka === niep.skrzynka;   // ⛔ dwa różne stany, jedno zdanie
    },
  },
  {
    nazwa: 'M22 — znacznik wersji PRZESTAJE BYĆ STAWIANY przy budowie hasha',
    psuj: t => t.replace('      v: GC_WERSJA_WYNIKU_W_LINKU,\n', ''),
    wykryj: t => {
      // ⭐ URUCHAMIA `saveResultsToURL` i CZYTA hash, który z niej wyszedł.
      const P = przeparsuj(t); const f = P.znajdz('saveResultsToURL'); if (!f) return true;
      if (!SEGS_Z_PLIKU) return true;
      const pelny = {}; SEGS_Z_PLIKU.forEach((sg, i) => pelny[sg.id] = 30 + i);
      let h = null;
      const c = {
        JSON, Object,
        btoa: (x) => Buffer.from(x, 'binary').toString('base64'),
        unescape, encodeURIComponent,
        history: { replaceState: (a, b, hh) => { h = hh; } },
        zglosBladOdczytu: () => {},
      };
      vm.createContext(c);
      vm.runInContext('var isJunior = false, ctx = {}, _diagState = { diagnosisText: "", topDeficitIds: [], usedInsights: false };\n'
        + (/const\s+GC_WERSJA_WYNIKU_W_LINKU\s*=\s*\d+\s*;/.exec(t) || [''])[0] + '\n' + t.slice(f.od, f.b), c);
      try { c.saveResultsToURL(pelny); } catch (e) { return true; }
      if (typeof h !== 'string') return true;
      let d; try { d = JSON.parse(Buffer.from(h.slice(1), 'base64').toString('utf8')); } catch (e) { return true; }
      return d.v === undefined;   // ⛔ nowy link bez znacznika = nie do odróżnienia od starego
    },
  },
  {
    nazwa: 'M23 — ⛔ `registerCoach` ZNÓW WYDAJE KOD po awarii odczytu (Y1-6 wraca)',
    psuj: t => t.replace("  if (stanSprawdzenia === 'nieudane') {", '  if (false) {'),
    wykryj: t => {
      const P = przeparsuj(t); const f = P.znajdz('registerCoach'); if (!f) return true;
      const przed = t.slice(Math.max(0, f.od - 10), f.od);
      const zrodlo = (/\basync\s*$/.test(przed) ? 'async ' : '') + t.slice(f.od, f.b);
      const wezly = {};
      const el = (id, v) => (wezly[id] = { id, value: v || '', style: {}, textContent: '', innerHTML: '' });
      el('coach-name-input', 'Jan'); el('coach-email-input', 'jan@klub.pl'); el('coach-club-input', 'KS');
      el('coach-register-error'); el('coach-code-display'); el('coach-panel-link'); el('coach-register-success');
      let zapisy = 0;
      const c = {
        document: { getElementById: (id) => wezly[id] || null, querySelector: () => ({ style: {} }) },
        window: { location: { origin: 'https://x', pathname: '/' } },
        SUPABASE_URL: 'https://baza', SUPABASE_KEY: 'k',
        JSON, Date, Array, Error, Math, encodeURIComponent,
        fetch: (u, o) => { if (o && o.method === 'POST') { zapisy++; return Promise.resolve({ ok: true, status: 201 }); }
                           return Promise.reject(new Error('sieć padła')); },
        emailjs: { send: () => Promise.resolve() },
        zglosBladOdczytu: () => {}, console: { error() {}, warn() {}, log() {} },
      };
      vm.createContext(c);
      try {
        vm.runInContext((new RegExp("const\\s+ZDANIE_NIE_UDALO_SIE_SPRAWDZIC_KODU\\s*=\\s*'[^']*';").exec(t) || [''])[0] + '\n'
          + (/const\s+ETYKIETA_SPROBUJ_PONOWNIE\s*=\s*'[^']*';/.exec(t) || [''])[0] + '\n' + zrodlo, c);
      } catch (e) { return true; }
      // ⚠️ `registerCoach` jest `async`, więc detektor oddaje OBIETNICĘ.
      //    Bateria niżej umie ją domknąć (`mut.async`), zamiast pytać o wygląd kodu.
      return c.registerCoach().then(() => zapisy > 0, () => true);
    },
    async: true,
  },
  {
    nazwa: 'M24 — `null` znów przechodzi kontrolę (kontrola pyta tylko o OBECNOŚĆ klucza)',
    psuj: t => t.replace("    !(typeof wynik[id] === 'number' && isFinite(wynik[id]) && wynik[id] >= 0 && wynik[id] <= 100));",
                         '    false);'),
    wykryj: t => {
      if (!SEGS_Z_PLIKU) return true;
      const zNullem = {}; SEGS_Z_PLIKU.forEach((sg, i) => zNullem[sg.id] = 30 + i);
      zNullem[SEGS_Z_PLIKU[10].id] = null;
      const w = odpalLinkZ(zrodloLinkuZ(t), doHasha({ s: zNullem, j: 0, v: 2 }));
      // ⛔ `null` w `cachedScores` → `getRelativeDeficits` ogłasza NIEOCENIONY obszar
      //    wąskim gardłem zawodnika. Zmierzone w Chromium 16.08.2026 na `13ffc41`.
      return w.ekran === 'screen-results' || !!(w.cached && w.cached[SEGS_Z_PLIKU[10].id] === null);
    },
  },
];

MUTACJE.forEach(mut => {
  const sprawdz = (zepsuty) => {
    assert(zepsuty !== HTML, mut.nazwa + ' — mutacja NAPRAWDĘ zmienia plik (inaczej „złapana" byłaby fikcją)');
  };
  if (mut.async) {
    // ⭐ detektor URUCHAMIA funkcję `async` — obietnica jest domykana przed podsumowaniem
    probujAsync(mut.nazwa, () => {
      const zepsuty = mut.psuj(HTML);
      sprawdz(zepsuty);
      return Promise.all([mut.wykryj(zepsuty), mut.wykryj(HTML)]).then(([naZepsutym, naPrawdziwym]) => {
        assertEq(naZepsutym, true, mut.nazwa + ' — detektor ZAPALA SIĘ na zmutowanym kodzie');
        assertEq(naPrawdziwym, false, mut.nazwa + ' — ASERCJA ODWROTNA: na prawdziwym kodzie detektor milczy');
      });
    });
    return;
  }
  probuj(mut.nazwa, () => {
    const zepsuty = mut.psuj(HTML);
    sprawdz(zepsuty);
    assertEq(mut.wykryj(zepsuty), true, mut.nazwa + ' — detektor ZAPALA SIĘ na zmutowanym kodzie');
    assertEq(mut.wykryj(HTML), false, mut.nazwa + ' — ASERCJA ODWROTNA: na prawdziwym kodzie detektor milczy');
  });
});

const MD5_PO = crypto.createHash('md5').update(HTML).digest('hex');
assertEq(MD5_PO, MD5_PRZED, '⭐ cofnięcie STRUKTURALNE: `md5` pliku przed baterią i po niej — co do znaku');

/* ⭐ pomiary URUCHOMIENIOWE `registerCoach` są asynchroniczne — domykamy je,
   ZANIM `podsumuj()` woła `process.exit`. Bez tej linii ich asercje nigdy by nie padły. */
Promise.all(OCZEKUJACE).then(podsumuj, podsumuj);

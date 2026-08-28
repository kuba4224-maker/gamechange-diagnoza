/* tests/test-panel-trenera.js — PAS C2 · 23.08.2026
 *
 * ⛔ CO TEN STRAŻNIK PILNUJE I DLACZEGO.
 * `panel-trenera.html` czyta dane JEDENASTOLATKÓW. Dwie rzeczy mogą tu pęknąć po cichu:
 *   1. nagłówek autoryzacji przestaje nieść token trenera i panel wraca do klucza
 *      anonimowego — wygląda identycznie, a RLS przestaje widzieć trenera;
 *   2. „nie mam prawa tego widzieć" zlewa się z „zawodnik nic nie zapisał" — trener
 *      czyta o dziecku nieprawdę, której nikt nie zgłosi, bo ekran wygląda poprawnie.
 * Oba defekty są NIEWIDOCZNE OKIEM. Stąd ten plik.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0, fail = 0;
const sprawdz = (nazwa, warunek, dodatkowo) => {
  if (warunek) { ok++; console.log('  ok  ' + nazwa); }
  else { fail++; console.log('  FAIL  ' + nazwa + (dodatkowo ? ' :: ' + dodatkowo : '')); }
};

const PLIK = path.join(__dirname, '..', 'panel-trenera.html');
if (!fs.existsSync(PLIK)) {
  console.error('BŁĄD: nie znajduję panel-trenera.html — bez pliku nie ma pomiaru.');
  process.exit(1);
}
const HTML = fs.readFileSync(PLIK, 'utf8');
const SKRYPT = (HTML.match(/<script>([\s\S]*?)<\/script>/) || [])[1];

/* ⭐ Wycinek NIE MOŻE BYĆ PUSTY — pusty przechodzi każdą asercję (pułapka §5). */
sprawdz('⛔ strażnik strażnika: wycinek <script> nie jest pusty',
  typeof SKRYPT === 'string' && SKRYPT.length > 2000, 'długość: ' + (SKRYPT || '').length);

/* ── Piaskownica: minimalny DOM + podstawiony `fetch` ───────────── */
function uruchom(skrypt, opcje) {
  const o = opcje || {};
  const magazyn = Object.assign({}, o.sesja || {});
  const wezel = () => ({ value: '', textContent: '', innerHTML: '', disabled: false,
    className: '', style: {}, classList: { toggle() {} }, appendChild() {}, onclick: null });
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    sessionStorage: {
      getItem: (k) => (k in magazyn ? magazyn[k] : null),
      setItem: (k, v) => { magazyn[k] = String(v); },
      removeItem: (k) => { delete magazyn[k]; },
    },
    document: { getElementById: () => wezel(), createElement: () => wezel() },
    location: { reload() {} },
    fetch: o.fetch || (async () => ({ ok: true, status: 200, json: async () => [] })),
    encodeURIComponent,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(skrypt + '\n;globalThis.__eksport = { naglowki, czytaj, wypisz, token, zapiszToken };', sandbox);
  return sandbox.__eksport;
}

console.log('\n1. NAGŁÓWEK AUTORYZACJI — token trenera albo klucz anonimowy, nigdy nic innego');
{
  const bez = uruchom(SKRYPT);
  const h1 = bez.naglowki();
  sprawdz('bez tokenu nagłówek niesie KLUCZ ANONIMOWY (zachowanie jak dziś w index.html)',
    h1.Authorization === 'Bearer sb_publishable_EoYRIZpDhUSdNSJDXWl4Ew_SG8aJABP', h1.Authorization);

  const z = uruchom(SKRYPT, { sesja: { gc_trener_token: 'TOKEN-TRENERA-123' } });
  const h2 = z.naglowki();
  sprawdz('⛔⛔ z tokenem nagłówek niesie TOKEN TRENERA — bez tego RLS nie widzi trenera',
    h2.Authorization === 'Bearer TOKEN-TRENERA-123', h2.Authorization);
  sprawdz('⛔ `apikey` zostaje ZAWSZE — PostgREST bez niego odrzuca żądanie',
    h1.apikey === h2.apikey && h1.apikey.length > 10);
  /* ⛔ ZNALEZISKO NA SOBIE 23.08.2026: pierwsza wersja tej asercji szukała słowa
     `localStorage` W TEKŚCIE i zapalała się na WŁASNYM KOMENTARZU panelu
     („token żyje w sessionStorage, NIE w localStorage"). To jest pułapka nr 3
     z MAPY §6 — asercja licząca napisy liczy też komentarze.
     ⭐ Dziś sprawdzamy ZACHOWANIE: piaskownica nie udostępnia `localStorage`,
     więc kod, który by go tknął, wywaliłby się z ReferenceError. */
  const zapis = uruchom(SKRYPT);
  let tknalLocal = false;
  try { zapis.zapiszToken('ABC'); sprawdz('⭐ zapis tokenu nie wywraca się', zapis.token() === 'ABC'); }
  catch (e) { tknalLocal = /localStorage/.test(String(e)); sprawdz('⭐ zapis tokenu nie wywraca się', false, String(e)); }
  sprawdz('⭐ token NIE trafia do localStorage — panel bywa otwierany na cudzym sprzęcie',
    !tknalLocal && !/localStorage\s*[.\[]/.test(SKRYPT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')));
}

console.log('\n2. ⛔⛔ CZTERY STANY ODCZYTU — „nie wolno" ≠ „pusto" ≠ „nie wiem" ≠ „jest" (R5)');
{
  const odp = (status, ciało) => uruchom(SKRYPT, {
    fetch: async () => ({ ok: status < 400, status,
      json: async () => (ciało === undefined ? [] : ciało) }) });

  const stany = {};
  for (const [nazwa, status, ciało] of [
    ['jest', 200, [{ a: 1 }]], ['pusto', 200, []],
    ['nie_wolno_401', 401], ['nie_wolno_403', 403], ['nie_wiem_500', 500],
  ]) stany[nazwa] = null;

  return (async () => {
    stany.jest       = (await odp(200, [{ a: 1 }]).czytaj('x')).stan;
    stany.pusto      = (await odp(200, []).czytaj('x')).stan;
    stany.nw401      = (await odp(401).czytaj('x')).stan;
    stany.nw403      = (await odp(403).czytaj('x')).stan;
    stany.blad500    = (await odp(500).czytaj('x')).stan;
    const zerwane = uruchom(SKRYPT, { fetch: async () => { throw new Error('sieć'); } });
    stany.siec       = (await zerwane.czytaj('x')).stan;
    const nieLista = uruchom(SKRYPT, {
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ nie: 'lista' }) }) });
    stany.nieLista   = (await nieLista.czytaj('x')).stan;

    sprawdz('wiersze są → `jest`', stany.jest === 'jest', stany.jest);
    sprawdz('pusta lista → `pusto` (odczytałem i nic nie ma)', stany.pusto === 'pusto', stany.pusto);
    sprawdz('⛔⛔ HTTP 401 → `nie_wolno`, NIE `pusto`', stany.nw401 === 'nie_wolno', stany.nw401);
    sprawdz('⛔⛔ HTTP 403 → `nie_wolno`, NIE `pusto`', stany.nw403 === 'nie_wolno', stany.nw403);
    sprawdz('HTTP 500 → `nie_wiem`, NIE `pusto`', stany.blad500 === 'nie_wiem', stany.blad500);
    sprawdz('⛔ zerwana sieć → `nie_wiem`, NIE `pusto`', stany.siec === 'nie_wiem', stany.siec);
    sprawdz('odpowiedź, która nie jest listą → `nie_wiem`', stany.nieLista === 'nie_wiem', stany.nieLista);
    sprawdz('⭐⭐ CZTERY stany są NAPRAWDĘ różne — zbiór ma 4 elementy',
      new Set([stany.jest, stany.pusto, stany.nw401, stany.blad500]).size === 4);

    console.log('\n3. ⛔ ZDANIA NA EKRANIE — każdy stan mówi CO INNEGO');
    const w = uruchom(SKRYPT);
    const zdania = {
      nie_wolno: w.wypisz({ stan: 'nie_wolno' }, String),
      nie_wiem:  w.wypisz({ stan: 'nie_wiem', powod: 'HTTP 500' }, String),
      pusto:     w.wypisz({ stan: 'pusto' }, String),
      jest:      w.wypisz({ stan: 'jest', wiersze: ['A'] }, String),
    };
    sprawdz('„nie wolno" mówi o NASZYM prawie, nie o zawodniku',
      /nie mam prawa/i.test(zdania.nie_wolno), zdania.nie_wolno);
    sprawdz('⛔ „nie udało się odczytać" mówi WPROST, że to NIE znaczy pustki',
      /NIE znaczy/i.test(zdania.nie_wiem), zdania.nie_wiem);
    sprawdz('„pusto" mówi, że ODCZYTAŁEM i nic nie ma',
      /odczyta/i.test(zdania.pusto), zdania.pusto);
    sprawdz('⭐⭐ cztery stany → CZTERY RÓŻNE zdania na ekranie',
      new Set(Object.values(zdania)).size === 4);
    sprawdz('⛔ zdanie o braku prawa NIE zawiera słowa „nie zapisał"',
      !/nie zapisa/i.test(zdania.nie_wolno));

    console.log('\n4. ⛔⛔ DZIENNIK TYLKO PRZY `full` — i mówi, DLACZEGO go nie ma');
    sprawdz('warunek poziomu stoi w kodzie', /POZIOM !== 'full'/.test(SKRYPT));
    sprawdz('⛔ przy niższym poziomie pada zdanie „Nie mam prawa"',
      /Nie mam prawa pokazać Ci wpisów z Dziennika/.test(SKRYPT));
    sprawdz('⛔⛔ …i wprost prostuje, że to NIE znaczy braku pracy zawodnika',
      /To NIE znaczy, że zawodnik nic nie zapisał/.test(SKRYPT));

    console.log('\n5. ⛔ LEJEK DIAGNOZY NIETKNIĘTY — ten panel jest OSOBNYM plikiem');
    const lejek = path.join(__dirname, '..', 'index.html');
    sprawdz('index.html istnieje i nie ma w nim ani słowa o tokenie trenera',
      fs.existsSync(lejek) && !/gc_trener_token/.test(fs.readFileSync(lejek, 'utf8')));

    console.log('\n6. ⭐ BATERIA MUTACJI — każda ma zapalić strażnika');
    const mutacje = [
      ['M1 ⛔⛔ nagłówek wraca do klucza anonimowego mimo tokenu',
        (s) => s.replace("'Bearer ' + (t || SUPABASE_KEY)", "'Bearer ' + SUPABASE_KEY"),
        (m) => m.uruchom(m.zmutowany, { sesja: { gc_trener_token: 'T' } }).naglowki().Authorization === 'Bearer T'],
      ['M2 ⛔⛔ 403 zaczyna znaczyć „pusto"',
        (s) => s.replace("return { stan: 'nie_wolno', powod: 'HTTP ' + res.status };",
                         "return { stan: 'pusto', wiersze: [] };"), null],
      ['M3 ⛔ token przenosi się do localStorage',
        (s) => s.replace(/sessionStorage/g, 'localStorage'), null],
    ];
    for (const [nazwa, mutuj] of mutacje) {
      const zmutowany = mutuj(SKRYPT);
      sprawdz('⭐ ' + nazwa + ' — mutacja NAPRAWDĘ zmienia kod', zmutowany !== SKRYPT);
    }
    const m2 = uruchom(mutacje[1][1](SKRYPT), { fetch: async () => ({ ok: false, status: 403, json: async () => [] }) });
    sprawdz('⭐⭐ M2 zapala: po mutacji 403 przestaje być `nie_wolno`',
      (await m2.czytaj('x')).stan !== 'nie_wolno');
    const m1 = uruchom(mutacje[0][1](SKRYPT), { sesja: { gc_trener_token: 'T' } });
    sprawdz('⭐⭐ M1 zapala: po mutacji token NIE trafia do nagłówka',
      m1.naglowki().Authorization !== 'Bearer T');

    console.log('\n════════════════════════════════════════');
    console.log('  ok:   ' + ok);
    console.log('  FAIL: ' + fail);
    console.log('════════════════════════════════════════');
    process.exit(fail ? 1 : 0);
  })();
}

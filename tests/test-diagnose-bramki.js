/* tests/test-diagnose-bramki.js — STRAŻNIK: /api/diagnose nie jest otwartym kranem do konta API
 *
 * LEJEK 11.11.2026 (A2, polecenie LEJEK-APLIKACJA-DOMKNIECIE-11-11). Pilnuje czterech bramek:
 *   403 obce źródło (Origin/Referer) · 413 za długi prompt · 429 seria z jednego IP ·
 *   maxTokens przycięty do tego, czego dziś używa frontend.
 * Handler jest URUCHAMIANY (import ESM z kopii pliku), z podstawionym `fetch` — więc ta suita
 * dowodzi decyzji bramek, NIE tego, że produkcja odpowiada tak samo (to dowodzi nota pasa).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const KORZEN = path.join(__dirname, '..');
const ZRODLO = fs.readFileSync(path.join(KORZEN, 'api', 'diagnose.js'), 'utf8');
const HTML = fs.readFileSync(path.join(KORZEN, 'index.html'), 'utf8');

let ok = 0, fail = 0; const bledy = []; let biezacy = '';
function scenario(n) { biezacy = n; console.log('\n— ' + n); }
function assert(w, o) {
  if (w) { ok++; console.log('  ok  ' + o); }
  else { fail++; bledy.push(biezacy + ' :: ' + o); console.log('  FAIL ' + o); }
}

function odp() {
  const r = { kod: null, cialo: null };
  r.status = (k) => { r.kod = k; return r; };
  r.json = (c) => { r.cialo = c; return r; };
  return r;
}
function zadanie(o) {
  const x = o || {};
  const headers = Object.assign({ 'x-forwarded-for': x.ip || '1.1.1.1' },
    x.origin === undefined ? { origin: 'https://diagnoza.gamechange.pl' } : (x.origin === null ? {} : { origin: x.origin }),
    x.referer ? { referer: x.referer } : {});
  return { method: 'POST', headers, body: { prompt: x.prompt === undefined ? 'Jesteś trenerem. Diagnoza.' : x.prompt, maxTokens: x.maxTokens } };
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-diag-'));
  const plik = path.join(tmp, 'diagnose.mjs');
  fs.writeFileSync(plik, ZRODLO);
  let M;
  try { M = await import('file://' + plik); }
  catch (e) { assert(false, 'api/diagnose.js daje się zaimportować — WYJĄTEK: ' + e.message); return koniec(); }

  const wyslane = [];
  global.fetch = async (url, init) => {
    wyslane.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }) };
  };
  process.env.ANTHROPIC_API_KEY = 'test';
  const wolaj = async (o) => { M._wyczyscLicznik(); const r = odp(); await M.default(zadanie(o), r); return r; };

  scenario('0. asercja odwrotna — prawdziwa diagnoza przechodzi');
  {
    wyslane.length = 0;
    const r = await wolaj({ maxTokens: 2400 });
    assert(r.kod === 200, 'zwykłe wywołanie z diagnoza.gamechange.pl → 200');
    assert(wyslane.length === 1 && wyslane[0].url === 'https://api.anthropic.com/v1/messages', 'jedno wywołanie Anthropic');
    assert(wyslane[0] && wyslane[0].body.max_tokens === 2400, 'max_tokens 2400 bez zmian');
    assert(wyslane[0] && wyslane[0].body.messages[0].content === 'Jesteś trenerem. Diagnoza.', 'prompt bez modyfikacji');
    const r2 = await wolaj({ origin: null, referer: 'https://diagnoza.gamechange.pl/?ref=X#abc' });
    assert(r2.kod === 200, 'bez Origin, z Referer diagnozy → 200');
  }

  scenario('1. obce źródło → 403, nic nie idzie do Anthropic');
  for (const [opis, o] of [
    ['Origin obcej strony', { origin: 'https://zla-strona.pl' }],
    ['Origin podszywający się sufiksem', { origin: 'https://diagnoza.gamechange.pl.zla.pl' }],
    ['Origin http zamiast https', { origin: 'http://diagnoza.gamechange.pl' }],
    ['bez Origin, Referer obcej strony', { origin: null, referer: 'https://zla-strona.pl/diagnoza.gamechange.pl' }],
    ['bez Origin i bez Referer', { origin: null }],
    ['Referer nie do odczytania', { origin: null, referer: 'nie-adres' }],
  ]) {
    wyslane.length = 0;
    const r = await wolaj(o);
    assert(r.kod === 403 && wyslane.length === 0, opis + ' → 403, zero wywołań Anthropic');
  }

  scenario('2. za długi prompt → 413');
  {
    wyslane.length = 0;
    const r = await wolaj({ prompt: 'x'.repeat(M.MAX_PROMPT_ZNAKOW + 1) });
    assert(r.kod === 413 && wyslane.length === 0, 'prompt o 1 znak za długi → 413, zero wywołań');
    const r2 = await wolaj({ prompt: 'x'.repeat(M.MAX_PROMPT_ZNAKOW) });
    assert(r2.kod === 200, 'prompt równo na progu → 200 (granica włącznie)');
    assert(M.MAX_PROMPT_ZNAKOW >= 2 * M.ZMIERZONY_PROMPT_ZNAKOW, 'próg (' + M.MAX_PROMPT_ZNAKOW + ') ≥ 2 × zmierzony prawdziwy prompt (' + M.ZMIERZONY_PROMPT_ZNAKOW + ') — prawdziwa diagnoza nie dostaje 413');
    const r4 = await wolaj({ prompt: 'x'.repeat(M.ZMIERZONY_PROMPT_ZNAKOW) });
    assert(r4.kod === 200, 'prompt długości prawdziwej diagnozy → 200');
    const r3 = await wolaj({ prompt: '' });
    assert(r3.kod === 400, 'pusty prompt → 400 (inna nazwa niż „za długi”)');
  }

  scenario('3. seria z jednego IP → 429, inne IP nietknięte');
  {
    M._wyczyscLicznik();
    const kody = [];
    for (let i = 0; i < M.LIMIT_IP + 1; i++) { const r = odp(); await M.default(zadanie({ ip: '9.9.9.9' }), r); kody.push(r.kod); }
    assert(kody.slice(0, M.LIMIT_IP).every(k => k === 200), M.LIMIT_IP + ' wywołań w oknie → wszystkie 200');
    assert(kody[M.LIMIT_IP] === 429, 'wywołanie nr ' + (M.LIMIT_IP + 1) + ' → 429');
    const inne = odp(); await M.default(zadanie({ ip: '8.8.8.8' }), inne);
    assert(inne.kod === 200, 'inny adres IP w tym samym czasie → 200');
    const t0 = 1e12;
    M._wyczyscLicznik();
    for (let i = 0; i < M.LIMIT_IP; i++) M.wpuscIP('7.7.7.7', t0);
    assert(M.wpuscIP('7.7.7.7', t0 + 1) === false, 'pełne okno → odmowa');
    assert(M.wpuscIP('7.7.7.7', t0 + M.OKNO_MS) === true, 'po upływie okna → znów wolno');
    const ip = M.adresIP({ headers: { 'x-forwarded-for': '5.5.5.5, 10.0.0.1' } });
    assert(ip === '5.5.5.5', 'IP z pierwszej pozycji x-forwarded-for');
  }

  scenario('4. maxTokens przycięty do limitu frontendu');
  {
    const z = [...HTML.matchAll(/maxTokens:\s*(\d+)/g)].map(m => Number(m[1]));
    assert(z.length >= 3, 'frontend wysyła maxTokens w ' + z.length + ' miejscach (wycinek NIE jest pusty)');
    assert(M.MAX_TOKENS === Math.max(...z), 'MAX_TOKENS (' + M.MAX_TOKENS + ') === najwyższe maxTokens frontendu (' + Math.max(...z) + ')');
    for (const [we, wy] of [[100000, M.MAX_TOKENS], [400, 400], [undefined, M.MAX_TOKENS], ['abc', M.MAX_TOKENS], [-5, M.MAX_TOKENS], [0, M.MAX_TOKENS]]) {
      assert(M.przytnijMaxTokens(we) === wy, 'maxTokens ' + JSON.stringify(we) + ' → ' + wy);
    }
    wyslane.length = 0;
    await wolaj({ maxTokens: 64000 });
    assert(wyslane[0] && wyslane[0].body.max_tokens === M.MAX_TOKENS, 'handler: maxTokens 64000 wysłane jako ' + M.MAX_TOKENS);
  }

  scenario('5. kolejność bramek: odrzucone nie zjada limitu IP');
  {
    M._wyczyscLicznik();
    for (let i = 0; i < M.LIMIT_IP + 5; i++) { const r = odp(); await M.default(zadanie({ ip: '6.6.6.6', prompt: 'x'.repeat(M.MAX_PROMPT_ZNAKOW + 1) }), r); }
    const r = odp(); await M.default(zadanie({ ip: '6.6.6.6' }), r);
    assert(r.kod === 200, 'po serii 413 zwykła diagnoza z tego IP nadal przechodzi');
  }

  scenario('6. wybór modelu tylko z listy, domyślnie bez zmian');
  {
    assert(M.DOZWOLONE_MODELE.includes(M.MODEL_DOMYSLNY), 'model domyślny jest na liście dozwolonych');
    assert(M.DOZWOLONE_MODELE.every(m => /^claude-(opus-4-8|sonnet-5-5)$/.test(m)), '⛔ na liście nie ma modelu droższego niż Opus 4.8 (tylko opus-4-8 i sonnet-5-5)');
    for (const [we, wy] of [[undefined, M.MODEL_DOMYSLNY], ['claude-sonnet-5-5', 'claude-sonnet-5-5'], ['claude-opus-5', M.MODEL_DOMYSLNY], ['gpt-x', M.MODEL_DOMYSLNY], [null, M.MODEL_DOMYSLNY]]) {
      assert(M.wybierzModel(we) === wy, 'model ' + JSON.stringify(we) + ' → ' + wy);
    }
    wyslane.length = 0;
    M._wyczyscLicznik(); let r = odp(); await M.default(zadanie({}), r);
    assert(wyslane[0] && wyslane[0].body.model === M.MODEL_DOMYSLNY, 'bez pola model: wysłany model domyślny');
    wyslane.length = 0;
    const z = zadanie({}); z.body.model = 'claude-sonnet-5-5'; r = odp(); await M.default(z, r);
    assert(wyslane[0] && wyslane[0].body.model === 'claude-sonnet-5-5', 'model z listy: wysłany ten model');
    wyslane.length = 0;
    const z2 = zadanie({}); z2.body.model = 'claude-opus-4-1-drozszy'; r = odp(); await M.default(z2, r);
    assert(wyslane[0] && wyslane[0].body.model === M.MODEL_DOMYSLNY, 'model spoza listy: wysłany domyślny, nie podany');
    const wywolania = [...HTML.matchAll(/fetch\(\s*['"`]\/api\/diagnose['"`][\s\S]{0,900}?\}\s*\)/g)].map(m => m[0]);
    assert(wywolania.length >= 3, 'znaleziono wywołania /api/diagnose we froncie (' + wywolania.length + ', wycinek NIE jest pusty)');
    assert(wywolania.every(w => !/\bmodel\s*:/.test(w)), 'frontend nie wysyła pola model w żadnym wywołaniu (zawodnik dostaje domyślny)');
  }

  koniec();
})();

function koniec() {
  console.log('\n════════════════════════════════════════');
  console.log('  ok:   ' + ok);
  console.log('  FAIL: ' + fail);
  if (fail) { console.log('\nCZERWONE:'); bledy.forEach(b => console.log('  · ' + b)); }
  console.log('════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
}

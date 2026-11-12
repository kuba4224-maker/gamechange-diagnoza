/* tests/test-zgoda-rodzica.js — STRAŻNIK: poniżej 16 lat nikt nie trafia na listę bez kliknięcia rodzica.
 *
 * ZGODA RODZICA 12.11.2026 (polecenie DIAGNOZA-ZGODA-RODZICA-KOD-12-11, K1 + K2).
 *   A. api/zgoda-rodzica.js — URUCHAMIANY (import ESM z kopii w katalogu tymczasowym) z podstawionym
 *      `fetch`, który udaje MailerLite (stan subskrybentów i grup) i Supabase (wiersze `diagnostics`).
 *   B. index.html — bramka e-mail (`submitEmail` i pomocnicze) uruchamiana w piaskownicy `vm`.
 *   C. teksty T1 · T3 · T4 bajt w bajt.
 *   D. BATERIA MUTACJI na TEKŚCIE źródeł (nic nie jest zapisywane w repozytorium):
 *      asercja odwrotna najpierw, potem każda mutacja z imienną listą zapaleń.
 * ⚠️ Podstawiony `fetch` dowodzi KSZTAŁTU żądań i kolejności, NIE tego, że MailerLite i Supabase
 *    przyjmują je tak samo. To dowodzi próba na produkcji (K3, nota pasa).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const KORZEN = path.join(__dirname, '..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const ZRODLA = {
  zgoda: czytaj('api/zgoda-rodzica.js'),
  diagnose: czytaj('api/diagnose.js'),
  mailerlite: czytaj('api/mailerlite.js'),
  html: czytaj('index.html'),
};

const T1 = 'Masz mniej niż 16 lat, więc o wiadomościach ode mnie decyduje rodzic. Wyślę mu jeden mail z prośbą o potwierdzenie.';
const T3 = 'Dziękuję, zgoda zapisana. Wiadomości będą przychodzić na oba adresy. Z każdej można zrezygnować jednym kliknięciem.';
const T4 = 'Ten link wygasł albo jest niepełny. Wystarczy, że zawodnik wyśle wynik jeszcze raz.';
const SEKRET = 'x'.repeat(40);
const DZIECKO = 'dziecko@test.pl', RODZIC = 'rodzic@test.pl';

let licznikImportu = 0;
async function zaimportuj(z) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-zgoda-' + (licznikImportu++) + '-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(tmp, 'zgoda-rodzica.js'), z.zgoda);
  fs.writeFileSync(path.join(tmp, 'diagnose.js'), z.diagnose);
  fs.writeFileSync(path.join(tmp, 'mailerlite.js'), z.mailerlite);
  return import(pathToFileURL(path.join(tmp, 'zgoda-rodzica.js')).href);
}

/* ── podstawiony świat: MailerLite + Supabase ────────────────────────────── */
function swiat(opcje) {
  const o = opcje || {};
  const s = { grupy: {}, nastepneId: 100, sub: {}, wiersze: [], log: [] };
  const idGrupy = (n) => { for (const [id, x] of Object.entries(s.grupy)) if (x === n) return id; return null; };
  s.idGrupy = idGrupy;
  s.wGrupie = (email, nazwa) => { const x = s.sub[email]; const id = idGrupy(nazwa); return !!(x && id && x.groups.has(id)); };
  const json = (ok, status, dane) => ({ ok, status, json: async () => dane });
  global.fetch = async (url, init) => {
    const m = (init && init.method) || 'GET';
    const body = init && init.body ? JSON.parse(init.body) : null;
    s.log.push({ url, m, body });
    if (/supabase\.co\/rest\/v1\/diagnostics/.test(url)) {
      if (o.dowodPada) return json(false, 500, {});
      s.wiersze.push(body); return json(true, 201, null);
    }
    const sciezka = url.replace('https://connect.mailerlite.com/api', '');
    if (sciezka.startsWith('/fields')) return json(true, 200, { data: [] });
    if (sciezka.startsWith('/groups') && m === 'GET') {
      const n = decodeURIComponent((/filter\[name\]=([^&]*)/.exec(sciezka) || [])[1] || '');
      const id = idGrupy(n); return json(true, 200, { data: id ? [{ id, name: n }] : [] });
    }
    if (sciezka === '/groups' && m === 'POST') { const id = String(s.nastepneId++); s.grupy[id] = body.name; return json(true, 201, { data: { id, name: body.name } }); }
    if (sciezka === '/subscribers' && m === 'POST') {
      if (o.mlPada) return json(false, 422, {});
      const x = s.sub[body.email] || (s.sub[body.email] = { id: 'S' + (s.nastepneId++), fields: {}, groups: new Set(), zapisow: 0 });
      x.zapisow++;
      Object.assign(x.fields, body.fields || {});
      (body.groups || []).forEach(g => x.groups.add(String(g)));
      return json(true, 200, { data: { id: x.id } });
    }
    let mm = /^\/subscribers\/([^/]+)\/groups\/([^/]+)$/.exec(sciezka);
    if (mm && m === 'DELETE') { const x = Object.values(s.sub).find(y => y.id === mm[1]); if (x) x.groups.delete(mm[2]); return json(true, 204, null); }
    mm = /^\/subscribers\/([^/]+)$/.exec(sciezka);
    if (mm && m === 'GET') {
      const x = s.sub[decodeURIComponent(mm[1])];
      return x ? json(true, 200, { data: { id: x.id, groups: [...x.groups].map(id => ({ id })) } }) : json(false, 404, {});
    }
    return json(false, 404, {});
  };
  return s;
}
function odp() {
  const r = { kod: null, cialo: null, naglowki: {}, koniec: false };
  r.status = (k) => { r.kod = k; return r; };
  r.json = (c) => { r.cialo = c; return r; };
  r.setHeader = (k, v) => { r.naglowki[k.toLowerCase()] = v; };
  r.end = (c) => { r.koniec = true; if (r.kod === null && r.statusCode) r.kod = r.statusCode; if (c) r.cialo = c; };
  return r;
}
const kodOdp = (r) => r.kod !== null ? r.kod : r.statusCode;
function post(body, o) {
  const x = o || {};
  return { method: 'POST', headers: Object.assign({ 'x-forwarded-for': x.ip || '2.2.2.2' },
    x.origin === null ? {} : { origin: x.origin || 'https://diagnoza.gamechange.pl' }), body };
}
const PROSBA = { email: DZIECKO, parent_email: RODZIC, obszar: 'wytrzymalosc', ref: 'TEST_ZGODA', imie: 'Janek' };

/* ── A. serwer ─────────────────────────────────────────────────────────── */
async function sprawdzSerwer(z) {
  const W = [];
  const ok = (w, n) => W.push({ ok: !!w, nazwa: n });
  let M;
  try { M = await zaimportuj(z); } catch (e) { ok(false, 'A0 api/zgoda-rodzica.js daje się zaimportować — ' + e.message); return W; }
  const wolaj = async (req, env) => {
    M._wyczyscPamiec(); if (M._wyczyscLicznik) M._wyczyscLicznik();
    process.env.ZGODA_SECRET = env && 'sekret' in env ? env.sekret : SEKRET;
    if (process.env.ZGODA_SECRET === undefined || process.env.ZGODA_SECRET === 'undefined') delete process.env.ZGODA_SECRET;
    process.env.MAILERLITE_API_KEY = env && 'ml' in env ? env.ml : 'ml-test';
    if (process.env.MAILERLITE_API_KEY === 'undefined') delete process.env.MAILERLITE_API_KEY;
    const r = odp(); await M.default(req, r); return r;
  };

  // A1 brak sekretu
  {
    const s = swiat();
    const r = await wolaj(post(PROSBA), { sekret: undefined });
    ok(kodOdp(r) === 500, 'A1 brak ZGODA_SECRET → 500');
    ok(r.cialo && /ZGODA_SECRET/.test(r.cialo.error || ''), 'A1 komunikat nazywa brakującą zmienną');
    ok(s.log.length === 0, 'A1 brak sekretu → zero wywołań sieciowych (żaden żeton bez podpisu nie wychodzi)');
    let rzucil = false; try { M.zbudujZeton({ email: DZIECKO, parent_email: RODZIC, obszar: 'moc' }, ''); } catch (e) { rzucil = true; }
    ok(rzucil, 'A1 zbudujZeton bez sekretu RZUCA, nie oddaje żetonu');
    const g = await wolaj({ method: 'GET', query: { t: 'a.b' }, headers: {} }, { sekret: undefined });
    ok(kodOdp(g) === 500, 'A1 GET bez sekretu → 500');
  }
  // A2 bramki POST
  {
    swiat();
    ok(kodOdp(await wolaj({ method: 'PUT', headers: {} })) === 405, 'A2 PUT → 405');
    ok(kodOdp(await wolaj(post(PROSBA, { origin: 'https://zla.pl' }))) === 403, 'A2 obce źródło → 403');
    ok(kodOdp(await wolaj(post(PROSBA), { ml: 'undefined' })) === 500, 'A2 brak klucza MailerLite → 500');
    ok(kodOdp(await wolaj(post(Object.assign({}, PROSBA, { parent_email: 'zly' })))) === 400, 'A2 zły adres rodzica → 400');
    ok(kodOdp(await wolaj(post(Object.assign({}, PROSBA, { email: '' })))) === 400, 'A2 brak adresu zawodnika → 400');
    const s = swiat();
    const r = await wolaj(post(Object.assign({}, PROSBA, { parent_email: ' Dziecko@Test.pl ' })));
    ok(kodOdp(r) === 400 && r.cialo && r.cialo.stan === 'te_same_adresy', '⭐ A2 identyczne adresy (inna wielkość liter) → 400 te_same_adresy');
    ok(s.log.length === 0, 'A2 identyczne adresy → zero wywołań sieciowych');
    M._wyczyscLicznik && M._wyczyscLicznik();
  }
  // A3 POST: tylko rodzic, tylko „do potwierdzenia"
  let zeton = null;
  const s3 = swiat();
  {
    const r = await wolaj(post(PROSBA));
    ok(kodOdp(r) === 200 && r.cialo && r.cialo.stan === 'wyslano_prosbe', 'A3 POST → 200 wyslano_prosbe');
    const p = s3.sub[RODZIC];
    ok(!!p && s3.wGrupie(RODZIC, 'Diagnoza: rodzic do potwierdzenia'), 'A3 rodzic w grupie „Diagnoza: rodzic do potwierdzenia"');
    ok(!!p && p.groups.size === 1, 'A3 rodzic TYLKO w jednej grupie');
    ok(!s3.sub[DZIECKO], '⭐ A3 zawodnik NIE jest subskrybentem przed kliknięciem rodzica');
    ok(!s3.wGrupie(RODZIC, 'Diagnoza: zgoda na wiadomości') && !s3.wGrupie(DZIECKO, 'Diagnoza: zgoda na wiadomości'), '⭐ A3 nikt w grupie zgody przed kliknięciem');
    ok(!Object.keys(s3.sub).some(e => [...s3.sub[e].groups].some(g => /^Seria:/.test(s3.grupy[g]))), '⭐ A3 nikt w grupie serii przed kliknięciem');
    ok(s3.wiersze.length === 0, 'A3 POST nie pisze wiersza dowodu');
    const f = p ? p.fields : {};
    const m = /^https:\/\/diagnoza\.gamechange\.pl\/api\/zgoda-rodzica\?t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(f.link_potwierdzenia || '');
    ok(!!m, 'A3 pole link_potwierdzenia = https://diagnoza.gamechange.pl/api/zgoda-rodzica?t=<żeton>');
    zeton = m ? m[1] : null;
    ok(f.imie_zawodnika === 'Janek', 'A3 pole imie_zawodnika');
    ok(f.obszar_nazwa === 'Wytrzymałość', 'A3 pole obszar_nazwa');
    ok(f.email_dziecka === DZIECKO, 'A3 pole email_dziecka');
    ok(!('plan_link' in f) && !('odbiorca' in f), 'A3 rodzic przed kliknięciem bez plan_link i bez odbiorca');
  }
  // A4 żeton
  {
    const t0 = Date.UTC(2026, 10, 12);
    const z = M.zbudujZeton({ email: DZIECKO, parent_email: RODZIC, obszar: 'moc', ref: 'R' }, SEKRET, t0);
    ok(M.sprawdzZeton(z, SEKRET, t0 + 1000).stan === 'ok', 'A4 świeży żeton → ok');
    ok(M.sprawdzZeton(z, SEKRET, t0 + 29 * 864e5).stan === 'ok', 'A4 żeton 29 dni → ok');
    ok(M.sprawdzZeton(z, SEKRET, t0 + 31 * 864e5).stan === 'stary_zeton', '⭐ A4 żeton po 31 dniach → stary_zeton');
    ok(M.sprawdzZeton(z, 'y'.repeat(40), t0).stan === 'zly_zeton', 'A4 inny sekret → zly_zeton');
    const [lad, pod] = z.split('.');
    const podrobiony = lad + '.' + (pod[0] === 'A' ? 'B' : 'A') + pod.slice(1);
    ok(M.sprawdzZeton(podrobiony, SEKRET, t0).stan === 'zly_zeton', '⭐ A4 podrobiony podpis → zly_zeton');
    const obcy = Buffer.from(JSON.stringify({ e: 'obcy@x.pl', p: RODZIC, o: 'moc', r: '', t: t0 })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    ok(M.sprawdzZeton(obcy + '.' + pod, SEKRET, t0).stan === 'zly_zeton', 'A4 podmieniony ładunek ze starym podpisem → zly_zeton');
    ok(M.sprawdzZeton(lad, SEKRET, t0).stan === 'zly_zeton', 'A4 żeton bez podpisu → zly_zeton');
    ok(M.sprawdzZeton('', SEKRET, t0).stan === 'zly_zeton', 'A4 pusty → zly_zeton');
  }
  // A5 GET poprawny
  {
    const r = await wolaj({ method: 'GET', query: { t: zeton || '' }, headers: {} });
    ok(kodOdp(r) === 302 && r.naglowki.location === 'https://diagnoza.gamechange.pl/?zgoda=ok', 'A5 kliknięcie → 302 na /?zgoda=ok');
    const p = s3.sub[RODZIC] || { fields: {}, groups: new Set() }, d = s3.sub[DZIECKO] || { fields: {}, groups: new Set() };
    ok(s3.wGrupie(RODZIC, 'Diagnoza: zgoda na wiadomości') && s3.wGrupie(RODZIC, 'Seria: wytrzymałość'), 'A5 rodzic w grupie zgody i serii obszaru');
    ok(s3.wGrupie(DZIECKO, 'Diagnoza: zgoda na wiadomości') && s3.wGrupie(DZIECKO, 'Seria: wytrzymałość'), 'A5 zawodnik w grupie zgody i serii obszaru');
    ok(!s3.wGrupie(RODZIC, 'Diagnoza: rodzic do potwierdzenia'), 'A5 rodzic usunięty z „do potwierdzenia"');
    const iDel = s3.log.findIndex(x => x.m === 'DELETE');
    const iSerRodz = s3.log.findIndex(x => x.m === 'POST' && /\/subscribers$/.test(x.url) && x.body && x.body.email === RODZIC && x.body.groups && x.body.groups.length === 2);
    ok(iDel !== -1 && iSerRodz !== -1 && iDel < iSerRodz, '⭐ A5 rodzic wychodzi z „do potwierdzenia" ZANIM dołączy do serii (inaczej automatyzacja wyśle T2 drugi raz)');
    ok(p.fields.zrodlo === 'TEST_ZGODA_RODZIC', '⭐ A5 rodzic: zrodlo = ref + _RODZIC');
    ok(p.fields.odbiorca === 'rodzic', 'A5 rodzic: odbiorca = rodzic');
    ok(typeof p.fields.plan_link === 'string' && /buy\.stripe\.com/.test(p.fields.plan_link), 'A5 rodzic: plan_link z ofertą');
    ok(d.fields.zrodlo === 'TEST_ZGODA', 'A5 zawodnik: zrodlo = ref');
    ok(d.fields.odbiorca === 'dziecko', '⭐ A5 zawodnik: odbiorca = dziecko');
    ok(d.fields.plan_link === null || d.fields.plan_link === '' || d.fields.plan_link === undefined, '⭐ A5 zawodnik: plan_link PUSTY');
    ok(typeof d.fields.zgoda_rodzica === 'string' && d.fields.zgoda_rodzica.indexOf(RODZIC) === 0 && /\d{4}-\d\d-\d\dT/.test(d.fields.zgoda_rodzica), 'A5 zawodnik: zgoda_rodzica = adres rodzica + data');
    const w = s3.wiersze.filter(x => x.event === 'parent_consent_confirmed');
    ok(w.length === 1, '⭐ A5 dokładnie jeden wiersz dowodu parent_consent_confirmed');
    const w0 = w[0] || {};
    ok(w0.email === DZIECKO && w0.parent_email === RODZIC && w0.marketing_consent === true, 'A5 wiersz dowodu: email, parent_email, marketing_consent: true');
    ok(/^zgoda-rodzica-v1 · \d{4}-\d\d-\d\dT/.test(w0.note || '') && !/ponowne/.test(w0.note || ''), 'A5 note = wersja tekstu zgody + znacznik czasu');
    const iDow = s3.log.findIndex(x => /supabase/.test(x.url) && x.body && x.body.event === 'parent_consent_confirmed');
    const iSub = s3.log.findIndex((x, i) => i > 0 && x.m === 'POST' && /\/subscribers$/.test(x.url) && x.body && x.body.groups && x.body.groups.length === 2);
    ok(iDow !== -1 && iSub !== -1 && iDow < iSub, 'A5 wiersz dowodu zapisany ZANIM ktokolwiek trafia do grupy zgody');
  }
  // A6 drugie kliknięcie
  {
    const przed = Object.keys(s3.sub).length;
    const r = await wolaj({ method: 'GET', query: { t: zeton || '' }, headers: {} });
    ok(kodOdp(r) === 302 && /zgoda=ok$/.test(r.naglowki.location || ''), 'A6 drugie kliknięcie → nadal ?zgoda=ok');
    ok(Object.keys(s3.sub).length === przed, 'A6 drugie kliknięcie nie dubluje subskrybentów');
    const w = s3.wiersze.filter(x => x.event === 'parent_consent_confirmed');
    ok(w.length === 2 && / · ponowne$/.test(w[1].note || ''), 'A6 drugi wiersz dowodu oznaczony „ponowne"');
  }
  // A7 zły i stary żeton: nic nie zapisuje
  for (const [nazwa, t] of [['podrobiony', (zeton || 'a.b').slice(0, -2) + 'zz'], ['pusty', ''], ['po terminie', M.zbudujZeton({ email: DZIECKO, parent_email: RODZIC, obszar: 'moc', ref: '' }, SEKRET, Date.now() - 31 * 864e5)]]) {
    const s = swiat();
    const r = await wolaj({ method: 'GET', query: { t }, headers: {} });
    ok(kodOdp(r) === 302 && r.naglowki.location === 'https://diagnoza.gamechange.pl/?zgoda=blad', 'A7 żeton ' + nazwa + ' → 302 na /?zgoda=blad');
    ok(s.wiersze.length === 0 && !s.log.some(x => x.m !== 'GET'), '⭐ A7 żeton ' + nazwa + ' → zero zapisów (MailerLite i diagnostics)');
  }
  // A8 dowód pada → nikt nie trafia na listę
  {
    const s = swiat({ dowodPada: true });
    const r = await wolaj({ method: 'GET', query: { t: zeton || '' }, headers: {} });
    ok(kodOdp(r) === 502, 'A8 zapis dowodu pada → 502');
    ok(!s.log.some(x => x.m === 'POST' && /\/subscribers$/.test(x.url)), '⭐ A8 bez wiersza dowodu nikt nie trafia do MailerLite');
  }
  // A9 MailerLite pada przy POST → stan blad_listy
  {
    swiat({ mlPada: true });
    const r = await wolaj(post(PROSBA));
    ok(kodOdp(r) === 502 && r.cialo && r.cialo.stan === 'blad_listy', 'A9 MailerLite odmawia → 502 blad_listy (nie 200)');
  }
  return W;
}

/* ── B. przeglądarka ───────────────────────────────────────────────────── */
function wytnij(t, nazwa) {
  const m = new RegExp('^(async )?function ' + nazwa + '\\(', 'm').exec(t);
  if (!m) return '';
  const k = t.indexOf('\n}', m.index);
  return k === -1 ? '' : t.slice(m.index, k + 2);
}
async function sprawdzPrzegladarke(html) {
  const W = [];
  const ok = (w, n) => W.push({ ok: !!w, nazwa: n });
  const nazwy = ['_czyPokazacZgode', '_zgodaMarketingowa', '_pokazPoleZgody', '_czyWymaganaZgodaRodzica', '_wyslijProsbeRodzica', '_zapiszDoListy', 'submitEmail', 'pokazZgodeRodzica'];
  const kod = nazwy.map(n => { const f = wytnij(html, n); ok(f.length > 40, 'B0 strażnik strażnika: `' + n + '` wycięta'); return f; }).join('\n');
  const stale = ['GC_ZGODA_MARKETING_ENABLED', 'GC_ZGODA_MIN_WIEK', 'ZGODA_RODZICA_T3', 'ZGODA_RODZICA_T4']
    .map(n => { const m = new RegExp('^const ' + n + ' = [^\\n]+;$', 'm').exec(html); ok(!!m, 'B0 stała ' + n + ' w pliku'); return m ? m[0] : ''; }).join('\n');

  async function uruchom(wiek, adres, rodzic, o) {
    const opc = o || {};
    const el = {};
    const get = (id) => el[id] || (el[id] = { style: {}, textContent: '', value: '', checked: false });
    get('email-input').value = adres; get('parent-gate-email').value = rodzic;
    if (opc.zgoda) get('email-consent').checked = true;
    const sieci = [], zapisy = [];
    const c = {
      document: { getElementById: get }, console: { log() {}, warn() {}, error() {} },
      ctx: { age: wiek, pos: 0 }, cachedScores: null, affiliateCode: 'REF1', playerName: 'Janek', playerEmail: null, isJunior: true,
      opiszWaskieGardlo: () => ({ segId: 'wytrzymalosc' }),
      saveToSupabase: (t, d) => { zapisy.push(d); },
      buildDiagnosticsRecord: (x) => Object.assign({}, x),
      sendEmailNotification() {}, loadPlayerHistory: () => new Promise(() => {}), inlineLoaderHTML: () => '', generateAIDiagnosis() {},
      fetch: async (url, init) => { sieci.push({ url, body: JSON.parse(init.body) }); if (opc.siec) throw new Error('offline'); return { ok: !opc.odmowa, status: opc.odmowa ? 502 : 200 }; },
      Object, String, JSON, Promise,
    };
    c.window = c;
    vm.createContext(c);
    vm.runInContext(stale + '\n' + kod, c);
    c._pokazPoleZgody();
    c.submitEmail();
    await new Promise(r => setTimeout(r, 5));
    return { sieci, zapisy, el, get, c };
  }
  // B1 12 lat, poprawne adresy
  {
    const r = await uruchom(12, DZIECKO, RODZIC);
    ok(r.get('parent-gate-wrap').style.display === 'block', 'B1 12 lat → pole rodzica w bramce widoczne');
    ok(r.get('email-consent-wrap').style.display === 'none', 'B1 12 lat → pole zgody zawodnika NIE widoczne');
    ok(r.sieci.length === 1 && r.sieci[0].url === '/api/zgoda-rodzica', '⭐ B1 12 lat → jedno wywołanie, /api/zgoda-rodzica');
    ok(!r.sieci.some(x => /mailerlite/.test(x.url)), '⭐ B1 12 lat → ZERO /api/mailerlite');
    const b = (r.sieci[0] || {}).body || {};
    ok(b.email === DZIECKO && b.parent_email === RODZIC && b.obszar === 'wytrzymalosc' && b.ref === 'REF1' && b.imie === 'Janek', 'B1 ciało: email, parent_email, obszar, ref, imie');
    const z = r.zapisy.filter(x => x.event === 'email_submitted');
    ok(z.length === 1, 'B1 jedno zdarzenie email_submitted');
    const z0 = z[0] || {};
    ok(z0.email === DZIECKO && z0.parent_email === RODZIC && z0.marketing_consent === false, 'B1 email_submitted: email, parent_email, marketing_consent: false');
    ok(z0.note === 'zgoda rodzica: wyslano prosbe', 'B1 note = „zgoda rodzica: wyslano prosbe"');
  }
  // B2 stany błędu mają własne nazwy (R5)
  {
    const a = await uruchom(12, DZIECKO, RODZIC, { odmowa: true });
    ok(/^zgoda rodzica: blad_listy/.test(((a.zapisy[0] || {}).note) || ''), '⭐ B2 serwer odmówił → note „zgoda rodzica: blad_listy…"');
    const b = await uruchom(12, DZIECKO, RODZIC, { siec: true });
    ok(/^zgoda rodzica: blad_sieci/.test(((b.zapisy[0] || {}).note) || ''), '⭐ B2 sieć padła → note „zgoda rodzica: blad_sieci…"');
  }
  // B3 walidacja
  {
    const a = await uruchom(12, DZIECKO, '');
    ok(a.sieci.length === 0 && a.zapisy.length === 0, 'B3 brak adresu rodzica → nic nie wychodzi');
    ok(a.get('parent-gate-error').style.display === 'block', 'B3 brak adresu rodzica → komunikat błędu widoczny');
    const b = await uruchom(12, DZIECKO, 'DZIECKO@test.pl');
    ok(b.sieci.length === 0 && b.zapisy.length === 0, '⭐ B3 identyczne adresy → nic nie wychodzi');
    ok(b.get('parent-gate-error').style.display === 'block', 'B3 identyczne adresy → komunikat błędu widoczny');
  }
  // B4 15 lat: wciąż bramka rodzica, nawet gdy ktoś zaznaczy ukryte pole zgody
  {
    const r = await uruchom(15, DZIECKO, RODZIC, { zgoda: true });
    ok(!r.sieci.some(x => /mailerlite/.test(x.url)), '⭐ B4 15 lat z zaznaczonym ukrytym polem → ZERO /api/mailerlite');
  }
  // B5 16 lat: bez zmian
  {
    const r = await uruchom(16, DZIECKO, '', { zgoda: true });
    ok(r.get('parent-gate-wrap').style.display === 'none', 'B5 16 lat → pola rodzica w bramce nie ma');
    ok(r.get('email-consent-wrap').style.display === 'flex', 'B5 16 lat → pole zgody zawodnika widoczne');
    ok(r.sieci.length === 1 && r.sieci[0].url === '/api/mailerlite', 'B5 16 lat ze zgodą → /api/mailerlite jak dotąd');
    ok(!r.sieci.some(x => /zgoda-rodzica/.test(x.url)), 'B5 16 lat → zero /api/zgoda-rodzica');
    const z0 = r.zapisy[0] || {};
    ok(z0.event === 'email_submitted' && z0.marketing_consent === true && !('parent_email' in z0), 'B5 16 lat → zdarzenie jak dotąd');
  }
  // B6 komunikat po kliknięciu rodzica
  {
    const r = await uruchom(16, DZIECKO, '');
    ok(r.c.pokazZgodeRodzica('ok') === true && r.get('zgoda-rodzica-tekst').textContent === T3, 'B6 ?zgoda=ok → T3');
    ok(r.c.pokazZgodeRodzica('blad') === true && r.get('zgoda-rodzica-tekst').textContent === T4, 'B6 ?zgoda=blad → T4');
    ok(r.c.pokazZgodeRodzica(null) === false, 'B6 bez parametru → nic');
  }
  ok(/pokazZgodeRodzica\(urlParams\.get\('zgoda'\)\)/.test(html), 'B6 load czyta ?zgoda=');
  return W;
}

/* ── C. teksty ─────────────────────────────────────────────────────────── */
function sprawdzTeksty(html) {
  const W = [];
  const ok = (w, n) => W.push({ ok: !!w, nazwa: n });
  const i = html.indexOf('id="parent-gate-wrap"');
  const wyc = i === -1 ? '' : html.slice(i, html.indexOf('</div>\n        <button onclick="submitEmail()"', i));
  ok(wyc.length > 100, 'C0 strażnik strażnika: wycinek pola rodzica w bramce nie jest pusty');
  ok(wyc.indexOf('>' + T1 + '<') !== -1, '⭐ C1 T1 bajt w bajt pod polem rodzica');
  ok(/id="parent-gate-email"/.test(wyc), 'C1 pole e-mail rodzica w bramce');
  ok(html.indexOf("const ZGODA_RODZICA_T3 = '" + T3 + "';") !== -1, 'C2 T3 bajt w bajt');
  ok(html.indexOf("const ZGODA_RODZICA_T4 = '" + T4 + "';") !== -1, 'C3 T4 bajt w bajt');
  return W;
}

async function zapalenia(z) {
  const w = [].concat(await sprawdzSerwer(z), await sprawdzPrzegladarke(z.html), sprawdzTeksty(z.html));
  return w;
}

(async () => {
  let ok = 0, fail = 0; const bledy = [];
  const wynik = await zapalenia(ZRODLA);
  console.log('\n— A/B/C. prawdziwe pliki');
  wynik.forEach(w => { if (w.ok) { ok++; console.log('  ok  ' + w.nazwa); } else { fail++; bledy.push(w.nazwa); console.log('  FAIL ' + w.nazwa); } });

  console.log('\n— D. BATERIA MUTACJI (na tekście, nic nie trafia na dysk repozytorium)');
  const odwrotna = wynik.filter(w => !w.ok).map(w => w.nazwa);
  if (odwrotna.length === 0) { ok++; console.log('  ok  ⭐ ASERCJA ODWROTNA: prawdziwe pliki — zero zapaleń'); }
  else { fail++; bledy.push('asercja odwrotna'); console.log('  FAIL asercja odwrotna: ' + odwrotna.join(' | ')); }

  const r1 = (t, a, b) => { const i = t.indexOf(a); return i === -1 ? t + '\n/*KOTWICA-BRAK*/' : t.slice(0, i) + b + t.slice(i + a.length); };
  const Z = (klucz, a, b) => (z) => Object.assign({}, z, { [klucz]: r1(z[klucz], a, b) });
  const MUTACJE = [
    ['M1 brak sekretu nie zatrzymuje (żeton bez podpisu)', (z) => Z('zgoda', "if (!sekret) throw new Error('brak_sekretu');", '')(Z('zgoda', "  if (!sekret) {\n    res.status(500)", "  if (false) {\n    res.status(500)")(z))],
    ['M2 podpis nie jest sprawdzany (podrobiony przechodzi)', Z('zgoda', "if (oczekiwany.length !== podany.length || !crypto.timingSafeEqual(oczekiwany, podany)) return { stan: 'zly_zeton' };", '')],
    ['M3 żeton po terminie przechodzi', Z('zgoda', "if (t - d.t > WAZNOSC_MS) return { stan: 'stary_zeton' };", '')],
    ['M4 zawodnik trafia na listę PRZED kliknięciem rodzica (serwer)', Z('zgoda', "    res.status(r.ok ? 200 : 502).json(r.ok", "    await ml('/subscribers', 'POST', klucz, { email: dane.email, groups: [await zapewnijGrupeIPola(klucz)] });\n    res.status(r.ok ? 200 : 502).json(r.ok")],
    ['M4b zawodnik poniżej 16 trafia na listę PRZED kliknięciem rodzica (przeglądarka)', Z('html', "    _wyslijProsbeRodzica(email, parentEmail); // zapis", "    _zapiszDoListy(email); _wyslijProsbeRodzica(email, parentEmail); // zapis")],
    ['M4c rodzic od razu w grupie zgody przy POST', Z('zgoda', '      groups: [grupa],\n    });\n    res.status', "      groups: [grupa, await zapewnijGrupeIPola(klucz)],\n    });\n    res.status")],
    ['M5 rodzic bez _RODZIC', Z('zgoda', "zrodlo: d.ref + '_RODZIC'", 'zrodlo: d.ref')],
    ['M6 dziecko bez odbiorca = dziecko', Z('zgoda', "        odbiorca: 'dziecko', zgoda_rodzica", '        zgoda_rodzica')],
    ['M7 dziecko z wypełnionym plan_link', Z('zgoda', 'obszar_nazwa: pola.obszar_nazwa, plan_link: null,', 'obszar_nazwa: pola.obszar_nazwa, plan_link: pola.plan_link,')],
    ['M8 brak wiersza dowodu', Z('zgoda', '    const dowod = await zapiszDowod({', '    const dowod = true || await zapiszDowod({')],
    ['M8b nieudany zapis dowodu nie zatrzymuje dodania do listy', Z('zgoda', '    if (!dowod) { blad502(res); return; }\n', '')],
    ['M8c dowód zapisany PO dodaniu do listy (kolejność)', (z) => {
      const t = z.zgoda; const i = t.indexOf('    const dowod = await zapiszDowod({'); const j = t.indexOf('    // 3. Rodzic: grupa zgody'); const k = t.indexOf('    // 4. Dziecko');
      if (i < 0 || j < 0 || k < 0) return Object.assign({}, z, { zgoda: t + '/*KOTWICA-BRAK*/' });
      return Object.assign({}, z, { zgoda: t.slice(0, i) + t.slice(j, k) + t.slice(i, j) + t.slice(k) });
    }],
    ['M9 identyczne adresy przechodzą (serwer)', Z('zgoda', "if (email.toLowerCase() === parent.toLowerCase()) return { blad: 'te_same_adresy' };", '')],
    ['M9b identyczne adresy przechodzą (przeglądarka)', Z('html', "    else if (parentEmail.toLowerCase() === email.toLowerCase()) blad = 'E-mail rodzica musi być inny niż Twój.';", '')],
    ['M10 rodzic zostaje w „do potwierdzenia"', Z('zgoda', "      await ml('/subscribers/' + idRodzica + '/groups/' + grupaCzeka, 'DELETE', klucz);", '')],
    ['M10b rodzic dołącza do serii, zanim wyjdzie z „do potwierdzenia"', (z) => {
      const t = z.zgoda; const i = t.indexOf('    // 2. Rodzic wychodzi'); const j = t.indexOf('    // 3. Rodzic: grupa zgody'); const k = t.indexOf('    // 4. Dziecko');
      if (i < 0 || j < 0 || k < 0) return Object.assign({}, z, { zgoda: t + '/*KOTWICA-BRAK*/' });
      return Object.assign({}, z, { zgoda: t.slice(0, i) + t.slice(j, k) + t.slice(i, j) + t.slice(k) });
    }],
    ['M11 zły żeton i tak zapisuje', Z('zgoda', "  if (spr.stan !== 'ok') { przekieruj(res, 'blad'); return; } // ⛔ nic nie zapisuje", "  if (spr.stan !== 'ok') { await zapiszDowod({ event: 'x' }); przekieruj(res, 'blad'); return; }")],
    ['M12 R5 zlane: błąd listy zapisany jak sukces', Z('html', "    stan = (r && r.ok) ? 'wyslano_prosbe' : 'blad_listy';\n    powod = r ? 'HTTP ' + r.status : '';\n  } catch (e) {\n    stan = 'blad_sieci';", "    stan = 'wyslano_prosbe';\n    powod = r ? 'HTTP ' + r.status : '';\n  } catch (e) {\n    stan = 'wyslano_prosbe';")],
    ['M13 pole zgody zawodnika pokazane poniżej 16', Z('html', "!!ctx && ctx.age !== null && ctx.age !== undefined && ctx.age >= GC_ZGODA_MIN_WIEK;", '!!ctx;')],
    ['M14 T1 przepisane', Z('html', '>' + T1 + '<', '>Podaj e-mail rodzica.<')],
    ['M15 T4 przepisane', Z('html', "const ZGODA_RODZICA_T4 = '" + T4, "const ZGODA_RODZICA_T4 = 'Błąd linku.")],
    ['M16 następna osoba: próg 16 → 13 (polska granica RODO)', Z('html', 'const GC_ZGODA_MIN_WIEK = 16;', 'const GC_ZGODA_MIN_WIEK = 13;')],
    ['M17 marketing_consent: true przed kliknięciem rodzica', Z('html', '    marketing_consent: false,\n    note: stan', '    marketing_consent: true,\n    note: stan')],
  ];
  for (const [nazwa, psuj] of MUTACJE) {
    const zm = psuj(ZRODLA);
    const zmienione = Object.keys(ZRODLA).some(k => zm[k] !== ZRODLA[k]);
    if (!zmienione || Object.keys(zm).some(k => /KOTWICA-BRAK/.test(zm[k]))) {
      fail++; bledy.push(nazwa + ' — kotwica nie pasuje'); console.log('  FAIL ' + nazwa + ' — kotwica nie pasuje (mutacja niczego nie zmieniła)'); continue;
    }
    let z;
    try { z = (await zapalenia(zm)).filter(w => !w.ok).map(w => w.nazwa); }
    catch (e) { z = ['WYJĄTEK: ' + e.message]; }
    if (z.length) { ok++; console.log('  ok  ' + nazwa + ' → zapala: ' + z.slice(0, 3).join(' | ') + (z.length > 3 ? ' (+' + (z.length - 3) + ')' : '')); }
    else { fail++; bledy.push(nazwa + ' — NIC SIĘ NIE ZAPALIŁO'); console.log('  FAIL ' + nazwa + ' — NIC SIĘ NIE ZAPALIŁO'); }
  }

  console.log('\n════════════════════════════════════════');
  console.log('  ok:   ' + ok);
  console.log('  FAIL: ' + fail);
  if (fail) bledy.forEach(b => console.log('  · ' + b));
  console.log('════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})();

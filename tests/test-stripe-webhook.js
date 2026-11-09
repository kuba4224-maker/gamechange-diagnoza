// Testy /api/stripe-webhook.js: podpis Stripe, rozpoznanie planu, zapis do MailerLite, odpowiedzi HTTP.
// Plik CJS (runner bierze tests/test-*.js); funkcja jest ESM, więc kopiujemy ją do .mjs i importujemy.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
(async () => {
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gcwh-')), 'stripe-webhook.mjs');
fs.copyFileSync(path.join(__dirname, '..', 'api', 'stripe-webhook.js'), tmp);
const m = await import(pathToFileURL(tmp).href);
let ok = 0, fail = 0;
const assert = (w, opis) => { if (w) { ok++; console.log('  ✓ ' + opis); } else { fail++; console.log('  ✗ ' + opis); } };
const SEKRET = 'whsec_test';
const podpisz = (body, t) => 't=' + t + ',v1=' + crypto.createHmac('sha256', SEKRET).update(t + '.' + body).digest('hex');
const teraz = Date.now(), t = Math.floor(teraz / 1000);
const zdarzenie = (o) => ({ type: 'checkout.session.completed', data: { object: Object.assign({ payment_status: 'paid', payment_link: 'plink_1UZrsfGlycmcMUCOhkL4c2n6', customer_details: { email: 'jan@x.pl', name: 'Jan Kowalski' }, client_reference_id: 'YT_F3' }, o) } });

console.log('podpis');
const b = JSON.stringify(zdarzenie({}));
assert(m.sprawdzPodpis(b, podpisz(b, t), SEKRET, teraz), 'poprawny podpis przechodzi');
assert(!m.sprawdzPodpis(b + ' ', podpisz(b, t), SEKRET, teraz), 'zmienione body odrzucone');
assert(!m.sprawdzPodpis(b, podpisz(b, t - 600), SEKRET, teraz), 'podpis starszy niż 5 min odrzucony');
assert(!m.sprawdzPodpis(b, podpisz(b, t).replace(/v1=\w/, 'v1=0'), SEKRET, teraz) || podpisz(b, t).includes('v1=0'), 'zły v1 odrzucony');
assert(!m.sprawdzPodpis(b, undefined, SEKRET, teraz), 'brak nagłówka odrzucony');

console.log('zakup');
const z = m.zakupZeZdarzenia(zdarzenie({}));
assert(z && z.plan === 'Regeneracja' && z.email === 'jan@x.pl' && z.imie === 'Jan' && z.ref === 'YT_F3', 'plan, e-mail, imię i źródło');
assert(z && z.link === 'https://drive.google.com/file/d/1mke9isVqSGuHlA3nP7MuwWuOQ2ZmRaXc/view', 'link do właściwego PDF');
assert(m.zakupZeZdarzenia(zdarzenie({ payment_status: 'unpaid' })) === null, 'nieopłacona sesja pominięta');
assert(m.zakupZeZdarzenia(zdarzenie({ payment_link: 'plink_ksiazka' })) === null, 'inny produkt (np. książka) pominięty');
assert(m.zakupZeZdarzenia(Object.assign(zdarzenie({}), { type: 'charge.refunded' })) === null, 'inne zdarzenie pominięte');
assert(Object.keys(m.PLANY).length === 11 && new Set(Object.values(m.PLANY).map(p => p[1])).size === 11, '11 planów, każdy z innym plikiem');

console.log('MailerLite i handler');
const wywolania = [];
globalThis.fetch = async (url, o) => { wywolania.push({ url, metoda: o.method, body: o.body && JSON.parse(o.body), auth: o.headers.Authorization });
  const dane = /subscribers$/.test(url) ? { data: { id: 'S1' } } : {}; return { ok: true, status: 200, text: async () => JSON.stringify(dane) }; };
process.env.STRIPE_WEBHOOK_SECRET = SEKRET; process.env.MAILERLITE_API_KEY = 'ml_key'; process.env.MAILERLITE_GROUP_PLANY = 'G9';
const wywolaj = async (body, naglowek) => {
  const req = { method: 'POST', headers: { 'stripe-signature': naglowek }, on(ev, fn) { if (ev === 'data') setImmediate(() => fn(Buffer.from(body))); if (ev === 'end') setImmediate(() => setImmediate(fn)); } };
  const res = { kod: 0, json: null, status(k) { this.kod = k; return this; }, json(j) { this.dane = j; return this; } };
  await m.default(req, res); return res;
};
const r1 = await wywolaj(b, podpisz(b, Math.floor(Date.now() / 1000)));
assert(r1.kod === 200 && r1.dane.plan === 'Regeneracja', 'opłacony plan → 200');
const sub = wywolania.find(w => /subscribers$/.test(w.url));
assert(sub && sub.body.email === 'jan@x.pl' && sub.body.fields.plan_6tyg === 'Regeneracja' && /drive\.google\.com/.test(sub.body.fields.plan_link), 'MailerLite dostaje e-mail, plan i link');
assert(sub && sub.auth === 'Bearer ml_key', 'klucz tylko w nagłówku, z zmiennej środowiskowej');
const g = wywolania.filter(w => /groups\/G9$/.test(w.url)).map(w => w.metoda);
assert(g.join(',') === 'DELETE,POST', 'wypięcie i ponowne przypięcie do grupy (drugi zakup też uruchamia mail)');
wywolania.length = 0;
const r2 = await wywolaj(b, 't=1,v1=00');
assert(r2.kod === 400 && wywolania.length === 0, 'zły podpis → 400, nic nie idzie do MailerLite');
const b3 = JSON.stringify(zdarzenie({ payment_link: 'plink_ksiazka' }));
const r3 = await wywolaj(b3, podpisz(b3, Math.floor(Date.now() / 1000)));
assert(r3.kod === 200 && r3.dane.pominiete && wywolania.length === 0, 'książka → 200 bez zapisu');
globalThis.fetch = async () => ({ ok: false, status: 422, text: async () => '{}' });
const r4 = await wywolaj(b, podpisz(b, Math.floor(Date.now() / 1000)));
assert(r4.kod === 500, 'błąd MailerLite → 500 (Stripe ponowi)');
delete process.env.MAILERLITE_API_KEY;
const r5 = await wywolaj(b, podpisz(b, Math.floor(Date.now() / 1000)));
assert(r5.kod === 500 && /MAILERLITE_API_KEY/.test(r5.dane.error), 'brak klucza → czytelny błąd');

console.log('\n  ok: ' + ok + '\n  FAIL: ' + fail);
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); console.log('\n  FAIL: 1'); process.exit(1); });

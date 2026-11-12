// /api/zgoda-rodzica.js
//
// ZGODA RODZICA 12.11.2026 (K2, polecenie DIAGNOZA-ZGODA-RODZICA-KOD-12-11, zleca Helicopter View).
// Decyzja Kuby 12.11: poniżej 16 lat na listę wiadomości nie trafia NIKT, dopóki rodzic nie
// potwierdzi. Po potwierdzeniu trafiają OBA adresy. Na adres dziecka nie idzie żadna oferta
// (pole `odbiorca = dziecko`; po nim sesja Maile wyłącza maile z ofertą).
//
//   POST (z przeglądarki, index.html → _wyslijProsbeRodzica)
//     przyjmuje email, parent_email, obszar, ref, imie. Buduje podpisany żeton i dodaje RODZICA
//     do grupy „Diagnoza: rodzic do potwierdzenia" z polami link_potwierdzenia, imie_zawodnika,
//     obszar_nazwa, email_dziecka. Automatyzacja tej grupy (MailerLite) wysyła mail T2.
//     ⛔ Adres dziecka NIE trafia do MailerLite jako subskrybent — tylko jako pole rodzica.
//     ⛔ Ani rodzic, ani dziecko nie trafiają tu do grupy zgody ani do grupy serii.
//   GET ?t=<żeton> (kliknięcie rodzica w mailu)
//     podpis + wiek żetonu (najwyżej 30 dni) → wiersz dowodu w `diagnostics` → rodzic i dziecko
//     do grupy zgody i grupy serii → rodzic znika z „do potwierdzenia" → 302 na /?zgoda=ok (T3).
//     Żeton zły albo przeterminowany: NIC nie zapisuje, 302 na /?zgoda=blad (T4).
//
// Zmienne środowiskowe na Vercelu (wpisuje Kuba):
//   ZGODA_SECRET        — losowy ciąg ≥ 32 znaki; podpis HMAC-SHA256 żetonu. Brak = 500, nigdy żeton bez podpisu.
//   MAILERLITE_API_KEY  — ten sam co w api/mailerlite.js.
// Supabase: adres i klucz PUBLICZNY (ten sam, który stoi jawnie w index.html); zapis przechodzi
// przez politykę `allow_insert`. Zmienne SUPABASE_URL / SUPABASE_ANON_KEY mogą je nadpisać.
//
// Stany odpowiedzi (R5), każdy z własnym kodem:
//   405 zła metoda · 403 obce źródło · 500 brak_sekretu · 500 brak_klucza_ml · 400 zle_dane ·
//   400 te_same_adresy · 429 limit_ip · 502 blad_listy · 502 blad_dowodu · 200 wyslano_prosbe ·
//   302 → ?zgoda=ok · 302 → ?zgoda=blad (zly_zeton / stary_zeton)

import crypto from 'node:crypto';
import { zrodloDozwolone, adresIP, wpuscIP } from './diagnose.js';
import { OBSZARY, polaObszaru, GRUPY_SERII, zapewnijGrupeIPola, grupaPoNazwie } from './mailerlite.js';

export const NAZWA_GRUPY_DO_POTWIERDZENIA = 'Diagnoza: rodzic do potwierdzenia';
export const WERSJA_ZGODY = 'zgoda-rodzica-v1'; // zmiana treści T2 = nowa wersja
export const WAZNOSC_MS = 30 * 24 * 60 * 60 * 1000;
export const ADRES_STRONY = 'https://diagnoza.gamechange.pl';
export const POLA = ['obszar', 'zrodlo', 'obszar_nazwa', 'plan_link',
  'link_potwierdzenia', 'imie_zawodnika', 'email_dziecka', 'odbiorca', 'zgoda_rodzica'];
const SUPABASE_URL_DOMYSLNY = 'https://kqrbztsvepjtggjmmcdx.supabase.co';
const SUPABASE_KEY_DOMYSLNY = 'sb_publishable_EoYRIZpDhUSdNSJDXWl4Ew_SG8aJABP';
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── żeton ──────────────────────────────────────────────────────────────────
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const zB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
function podpis(ladunek, sekret) {
  return b64u(crypto.createHmac('sha256', sekret).update(ladunek).digest());
}
export function zbudujZeton(dane, sekret, teraz) {
  if (!sekret) throw new Error('brak_sekretu');
  const ladunek = b64u(JSON.stringify({ e: dane.email, p: dane.parent_email, o: dane.obszar, r: dane.ref || '',
    t: typeof teraz === 'number' ? teraz : Date.now() }));
  return ladunek + '.' + podpis(ladunek, sekret);
}
// Zwraca { stan: 'ok', dane } albo { stan: 'zly_zeton' | 'stary_zeton' }.
export function sprawdzZeton(zeton, sekret, teraz) {
  if (!sekret || typeof zeton !== 'string') return { stan: 'zly_zeton' };
  const czesci = zeton.split('.');
  if (czesci.length !== 2 || !czesci[0] || !czesci[1]) return { stan: 'zly_zeton' };
  const oczekiwany = Buffer.from(podpis(czesci[0], sekret));
  const podany = Buffer.from(czesci[1]);
  if (oczekiwany.length !== podany.length || !crypto.timingSafeEqual(oczekiwany, podany)) return { stan: 'zly_zeton' };
  let d;
  try { d = JSON.parse(zB64u(czesci[0]).toString('utf8')); } catch (e) { return { stan: 'zly_zeton' }; }
  if (!d || !RE_EMAIL.test(d.e || '') || !RE_EMAIL.test(d.p || '') || typeof d.t !== 'number') return { stan: 'zly_zeton' };
  const t = typeof teraz === 'number' ? teraz : Date.now();
  if (d.t > t + 5 * 60 * 1000) return { stan: 'zly_zeton' };
  if (t - d.t > WAZNOSC_MS) return { stan: 'stary_zeton' };
  return { stan: 'ok', dane: { email: d.e, parent_email: d.p, obszar: OBSZARY.includes(d.o) ? d.o : 'ogolna', ref: d.r || '', t: d.t } };
}

// ── wejście z przeglądarki ─────────────────────────────────────────────────
// null = złe dane; { blad: 'te_same_adresy' } = adresy identyczne.
export function przygotujProsbe(body) {
  const b = body || {};
  const email = typeof b.email === 'string' ? b.email.trim().slice(0, 254) : '';
  const parent = typeof b.parent_email === 'string' ? b.parent_email.trim().slice(0, 254) : '';
  if (!RE_EMAIL.test(email) || !RE_EMAIL.test(parent)) return null;
  if (email.toLowerCase() === parent.toLowerCase()) return { blad: 'te_same_adresy' };
  const obszar = OBSZARY.includes(b.obszar) ? b.obszar : 'ogolna';
  // 53 znaki: po dopisaniu `_RODZIC` zrodlo mieści się w 60 (jak w api/mailerlite.js).
  const ref = typeof b.ref === 'string' ? b.ref.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 53) : '';
  const imie = typeof b.imie === 'string' ? b.imie.replace(/[<>"\u0000-\u001f]/g, '').trim().slice(0, 40) : '';
  return { email, parent_email: parent, obszar, ref, imie };
}

// ── MailerLite ─────────────────────────────────────────────────────────────
async function ml(sciezka, metoda, klucz, body) {
  const r = await fetch('https://connect.mailerlite.com/api' + sciezka, {
    method: metoda,
    headers: { Authorization: 'Bearer ' + klucz, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let dane = null; try { dane = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, dane };
}
let _pola = false;
export function _wyczyscPamiec() { _pola = false; }
async function zapewnijPola(klucz) {
  if (_pola) return;
  const f = await ml('/fields?limit=100', 'GET', klucz);
  const istniejace = ((f.dane && f.dane.data) || []).map(x => x.key);
  for (const nazwa of POLA) {
    if (!istniejace.includes(nazwa)) await ml('/fields', 'POST', klucz, { name: nazwa, type: 'text' });
  }
  _pola = true;
}

// ── dowód zgody w `diagnostics` ────────────────────────────────────────────
async function zapiszDowod(wiersz) {
  const url = (process.env.SUPABASE_URL || SUPABASE_URL_DOMYSLNY) + '/rest/v1/diagnostics';
  const klucz = process.env.SUPABASE_ANON_KEY || SUPABASE_KEY_DOMYSLNY;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: klucz, Prefer: 'return=minimal' },
      body: JSON.stringify(wiersz),
    });
    return !!(r && r.ok);
  } catch (e) { return false; }
}

const STRONA_BLEDU = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Gamechange</title><body style="font-family:sans-serif;max-width:480px;margin:64px auto;padding:0 16px;line-height:1.6;color:#0e0d0b">' +
  '<p>Nie udało się zapisać zgody. Spróbuj kliknąć link jeszcze raz za kilka minut.</p></body>';

function przekieruj(res, stan) {
  res.statusCode = 302;
  res.setHeader('Location', ADRES_STRONY + '/?zgoda=' + stan);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}
function blad502(res) {
  res.statusCode = 502;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(STRONA_BLEDU);
}

async function obsluzPost(req, res, sekret, klucz) {
  if (!zrodloDozwolone(req.headers)) { res.status(403).json({ error: 'Niedozwolone źródło wywołania.', stan: 'obce_zrodlo' }); return; }
  const dane = przygotujProsbe(req.body);
  if (!dane) { res.status(400).json({ error: 'Zły adres e-mail.', stan: 'zle_dane' }); return; }
  if (dane.blad) { res.status(400).json({ error: 'Adres rodzica musi być inny niż adres zawodnika.', stan: dane.blad }); return; }
  if (!wpuscIP(adresIP(req))) { res.status(429).json({ error: 'Za dużo wywołań. Spróbuj za kilka minut.', stan: 'limit_ip' }); return; }
  try {
    await zapewnijPola(klucz);
    const grupa = await grupaPoNazwie(klucz, NAZWA_GRUPY_DO_POTWIERDZENIA);
    if (!grupa) { res.status(502).json({ error: 'Nie udało się ustalić grupy MailerLite.', stan: 'blad_listy' }); return; }
    const zeton = zbudujZeton(dane, sekret);
    const pola = polaObszaru(dane.obszar);
    // ⛔ Tylko RODZIC i tylko grupa „do potwierdzenia". Adres dziecka jest polem, nie subskrybentem.
    const r = await ml('/subscribers', 'POST', klucz, {
      email: dane.parent_email,
      fields: {
        link_potwierdzenia: ADRES_STRONY + '/api/zgoda-rodzica?t=' + zeton,
        imie_zawodnika: dane.imie || null,
        obszar_nazwa: pola.obszar_nazwa,
        email_dziecka: dane.email,
      },
      groups: [grupa],
    });
    res.status(r.ok ? 200 : 502).json(r.ok ? { ok: true, stan: 'wyslano_prosbe' } : { ok: false, stan: 'blad_listy', status: r.status });
  } catch (e) {
    res.status(502).json({ ok: false, stan: 'blad_listy', error: String(e && e.message ? e.message : e) });
  }
}

async function obsluzGet(req, res, sekret, klucz) {
  const q = req.query || {};
  let zeton = typeof q.t === 'string' ? q.t : '';
  if (!zeton && typeof req.url === 'string') {
    try { zeton = new URL(req.url, ADRES_STRONY).searchParams.get('t') || ''; } catch (e) {}
  }
  const spr = sprawdzZeton(zeton, sekret);
  if (spr.stan !== 'ok') { przekieruj(res, 'blad'); return; } // ⛔ nic nie zapisuje
  const d = spr.dane;
  const pola = polaObszaru(d.obszar);
  try {
    await zapewnijPola(klucz);
    const grupaZgody = await zapewnijGrupeIPola(klucz, process.env.MAILERLITE_GROUP_DIAGNOZA);
    const grupaSerii = await grupaPoNazwie(klucz, GRUPY_SERII[pola.seria]);
    const grupaCzeka = await grupaPoNazwie(klucz, NAZWA_GRUPY_DO_POTWIERDZENIA);
    if (!grupaZgody || !grupaSerii) { blad502(res); return; }

    // Drugie kliknięcie: rodzic już stoi w grupie zgody → wiersz dowodu z dopiskiem „ponowne".
    const juz = await ml('/subscribers/' + encodeURIComponent(d.parent_email), 'GET', klucz);
    const grupyJuz = (juz.ok && juz.dane && juz.dane.data && juz.dane.data.groups) || [];
    const idRodzica = juz.ok && juz.dane && juz.dane.data ? juz.dane.data.id : null;
    const ponowne = grupyJuz.some(g => g && String(g.id) === String(grupaZgody));

    const teraz = new Date().toISOString();
    // 1. DOWÓD najpierw: bez wiersza dowodu nikt nie trafia na listę.
    const dowod = await zapiszDowod({
      created_at: teraz,
      event: 'parent_consent_confirmed',
      email: d.email,
      parent_email: d.parent_email,
      marketing_consent: true,
      affiliate_code: d.ref || null,
      note: WERSJA_ZGODY + ' · ' + teraz + ' · link z ' + new Date(d.t).toISOString() + (ponowne ? ' · ponowne' : ''),
    });
    if (!dowod) { blad502(res); return; }

    // 2. Rodzic wychodzi z „do potwierdzenia" ZANIM dołączy do grupy serii. Automatyzacja serii w MailerLite
    //    sprawdza na starcie „czy jest w grupie do potwierdzenia" (gałąź z mailem T2, plan free = limit
    //    aktywnych automatyzacji). Odwrotna kolejność wysłałaby rodzicowi T2 drugi raz zamiast serii.
    //    Błąd tutaj nie cofa zgody — zgoda już jest; brak id = rodzic nie był w MailerLite (nic do usunięcia).
    if (idRodzica && grupaCzeka) {
      await ml('/subscribers/' + idRodzica + '/groups/' + grupaCzeka, 'DELETE', klucz);
    }

    // 3. Rodzic: grupa zgody + seria, zrodlo = ref + _RODZIC, odbiorca = rodzic.
    const rr = await ml('/subscribers', 'POST', klucz, {
      email: d.parent_email,
      fields: { obszar: d.obszar, zrodlo: d.ref + '_RODZIC', obszar_nazwa: pola.obszar_nazwa, plan_link: pola.plan_link, odbiorca: 'rodzic' },
      groups: [grupaZgody, grupaSerii],
    });
    if (!rr.ok) { blad502(res); return; }

    // 4. Dziecko: te same dwie grupy, zrodlo = ref, odbiorca = dziecko, zgoda_rodzica = adres + data.
    //    ⛔ plan_link PUSTY (null czyści pole) — na adres dziecka nie idzie link do płatności.
    const rd = await ml('/subscribers', 'POST', klucz, {
      email: d.email,
      fields: { obszar: d.obszar, zrodlo: d.ref || null, obszar_nazwa: pola.obszar_nazwa, plan_link: null,
        odbiorca: 'dziecko', zgoda_rodzica: d.parent_email + ' ' + teraz },
      groups: [grupaZgody, grupaSerii],
    });
    if (!rd.ok) { blad502(res); return; }
    przekieruj(res, 'ok');
  } catch (e) {
    blad502(res);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') { res.status(405).json({ error: 'Use POST or GET' }); return; }
  const sekret = process.env.ZGODA_SECRET;
  if (!sekret) {
    res.status(500).json({ error: 'Brak ZGODA_SECRET na serwerze. Dodaj zmienną środowiskową w Vercel → Project Settings → Environment Variables.', stan: 'brak_sekretu' });
    return;
  }
  const klucz = process.env.MAILERLITE_API_KEY;
  if (!klucz) { res.status(500).json({ error: 'Brak MAILERLITE_API_KEY na Vercelu.', stan: 'brak_klucza_ml' }); return; }
  if (req.method === 'POST') return obsluzPost(req, res, sekret, klucz);
  return obsluzGet(req, res, sekret, klucz);
}

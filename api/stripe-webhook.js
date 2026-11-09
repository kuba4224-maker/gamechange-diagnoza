// /api/stripe-webhook.js
//
// Vercel Serverless Function — po zakupie Planu 6 tygodni wysyła kupującemu mail z linkiem do planu.
//
// Przebieg: Stripe (zdarzenie checkout.session.completed) → ta funkcja sprawdza podpis Stripe,
// rozpoznaje plan po identyfikatorze linku płatności → zapisuje kupującego w MailerLite
// (pola plan_6tyg i plan_link, grupa kupujących) → automatyzacja MailerLite „dołącza do grupy”
// wysyła mail z linkiem.
//
// Zmienne środowiskowe na Vercelu (wpisuje Kuba, nigdy w kodzie):
//   STRIPE_WEBHOOK_SECRET      — „Signing secret” endpointu w Stripe (whsec_…)
//   MAILERLITE_API_KEY         — token API z MailerLite (Integrations → API)
//   MAILERLITE_GROUP_PLANY     — ID grupy „Kupujący: Plan 6 tygodni” w MailerLite
//
// Bez zależności npm: podpis liczony przez node:crypto, API przez fetch.

import crypto from 'node:crypto';

export const config = { api: { bodyParser: false } };

// Identyfikator linku płatności Stripe → nazwa planu i link do PDF (Google Drive, tylko odczyt).
export const PLANY = {
  plink_1UZrbTGlycmcMUCOyZzKVSKI: ['Wytrzymałość', '1PYcU-Mzz3_Pt4o597calXx9xdErY_kgB'],
  plink_1UZrmqGlycmcMUCO0MvdR6lK: ['Technika', '18Eutdp8dPYaCFQ8ItBk-HnXuQcjxLc0A'],
  plink_1UZroBGlycmcMUCOIi12s4Z8: ['Fizyczność', '1_V74v0o69vnWD1M9Ic1TUApF6wTXML5s'],
  plink_1UZrpOGlycmcMUCOm6ch501J: ['Moc', '1sOkEg2huOst5VAhkFA-IQrJ7MXo37RUm'],
  plink_1UZrrbGlycmcMUCOFNqkW5rK: ['Tolerancja obciążeń', '1biUbc37PZkIvNw7_MYxgt-pF1t2DcUWO'],
  plink_1UZrsfGlycmcMUCOhkL4c2n6: ['Regeneracja', '1mke9isVqSGuHlA3nP7MuwWuOQ2ZmRaXc'],
  plink_1UZrtjGlycmcMUCO6CcWfD7e: ['Odporność', '1iosK90SGUsJ7Ixyo3JV3gGKOwFj4CiQh'],
  plink_1UZrumGlycmcMUCOhAgFr6iT: ['Odżywienie', '17Qh8K4W33S3vaoc8Ys9kRiKq4E60eY-t'],
  plink_1UZrvpGlycmcMUCO3v858uj5: ['Koncentracja', '1TI6F3vMMvvYC_8U1gKK_2SoSDDsxUa_o'],
  plink_1UZrwtGlycmcMUCOrmt2mwyJ: ['Odwaga w grze', '1l8VKXXF_nuSaEmCBvC3wxOFu2Bv36f-T'],
  plink_1UZryGGlycmcMUCOWvtORmrz: ['Percepcja i szybkość decyzji', '13BA4Ljz3nBVLmkYv0IvIrN0IpaTrFVpE'],
};

export function linkDoPlanu(idPliku) {
  return 'https://drive.google.com/file/d/' + idPliku + '/view';
}

// Podpis Stripe: nagłówek „t=…,v1=…”, HMAC-SHA256 z „t.surowe_body”, okno 5 minut.
export function sprawdzPodpis(surowe, naglowek, sekret, teraz) {
  if (!naglowek || !sekret) return false;
  const czesci = {};
  const v1 = [];
  for (const kawalek of String(naglowek).split(',')) {
    const [k, v] = kawalek.split('=');
    if (k === 'v1') v1.push(v); else czesci[k] = v;
  }
  const t = Number(czesci.t);
  if (!t || !v1.length) return false;
  const sekundy = Math.floor((teraz || Date.now()) / 1000);
  if (Math.abs(sekundy - t) > 300) return false;
  const oczekiwany = crypto.createHmac('sha256', sekret).update(t + '.' + surowe, 'utf8').digest('hex');
  return v1.some((s) => s && s.length === oczekiwany.length &&
    crypto.timingSafeEqual(Buffer.from(s, 'hex'), Buffer.from(oczekiwany, 'hex')));
}

// Ze zdarzenia Stripe wyciąga to, czego potrzebuje mail; null, gdy to nie jest opłacony Plan 6 tygodni.
export function zakupZeZdarzenia(zdarzenie) {
  if (!zdarzenie || zdarzenie.type !== 'checkout.session.completed') return null;
  const s = (zdarzenie.data && zdarzenie.data.object) || {};
  if (s.payment_status !== 'paid') return null;
  const plan = PLANY[s.payment_link];
  if (!plan) return null;
  const d = s.customer_details || {};
  const email = d.email || s.customer_email;
  if (!email) return null;
  return { email, imie: (d.name || '').trim().split(/\s+/)[0] || '', plan: plan[0], link: linkDoPlanu(plan[1]), ref: s.client_reference_id || '' };
}

async function mailerlite(sciezka, metoda, klucz, body) {
  const r = await fetch('https://connect.mailerlite.com/api' + sciezka, {
    method: metoda,
    headers: { Authorization: 'Bearer ' + klucz, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const tekst = await r.text();
  let dane = null; try { dane = tekst ? JSON.parse(tekst) : null; } catch (e) { dane = tekst; }
  return { ok: r.ok, status: r.status, dane };
}

// Zapis do MailerLite. Wypięcie z grupy i ponowne przypięcie, żeby automatyzacja ruszyła
// także przy drugim zakupie tej samej osoby (inny plan → inne pola).
export async function zapiszKupujacego(zakup, klucz, grupa) {
  const sub = await mailerlite('/subscribers', 'POST', klucz, {
    email: zakup.email,
    fields: { name: zakup.imie || undefined, plan_6tyg: zakup.plan, plan_link: zakup.link, zrodlo: zakup.ref || undefined },
  });
  if (!sub.ok || !sub.dane || !sub.dane.data) return { ok: false, krok: 'subscriber', status: sub.status, dane: sub.dane };
  const id = sub.dane.data.id;
  await mailerlite('/subscribers/' + id + '/groups/' + grupa, 'DELETE', klucz);
  const g = await mailerlite('/subscribers/' + id + '/groups/' + grupa, 'POST', klucz);
  return { ok: g.ok, krok: 'group', status: g.status };
}

function czytajBody(req) {
  return new Promise((resolve, reject) => {
    const kawalki = [];
    req.on('data', (c) => kawalki.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(kawalki).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }
  const sekret = process.env.STRIPE_WEBHOOK_SECRET;
  const klucz = process.env.MAILERLITE_API_KEY;
  const grupa = process.env.MAILERLITE_GROUP_PLANY;
  if (!sekret || !klucz || !grupa) { res.status(500).json({ error: 'Brak STRIPE_WEBHOOK_SECRET, MAILERLITE_API_KEY lub MAILERLITE_GROUP_PLANY na Vercelu.' }); return; }

  const surowe = await czytajBody(req);
  if (!sprawdzPodpis(surowe, req.headers['stripe-signature'], sekret)) { res.status(400).json({ error: 'Zły podpis Stripe' }); return; }

  let zdarzenie;
  try { zdarzenie = JSON.parse(surowe); } catch (e) { res.status(400).json({ error: 'Zły JSON' }); return; }

  const zakup = zakupZeZdarzenia(zdarzenie);
  if (!zakup) { res.status(200).json({ pominiete: true }); return; }

  try {
    const wynik = await zapiszKupujacego(zakup, klucz, grupa);
    // 500 przy błędzie MailerLite → Stripe ponowi zdarzenie (do 3 dni).
    if (!wynik.ok) { res.status(500).json({ error: 'MailerLite', wynik }); return; }
    res.status(200).json({ ok: true, plan: zakup.plan });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}

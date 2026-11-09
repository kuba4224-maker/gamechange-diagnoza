// /api/mailerlite.js
//
// Vercel Serverless Function — zapis adresu z diagnozy do MailerLite, TYLKO gdy zawodnik (16+)
// zaznaczył zgodę na wiadomości (index.html: _zgodaMarketingowa / _zapiszDoListy).
// Klucz nigdy nie trafia do przeglądarki.
//
// Zmienne środowiskowe na Vercelu (wpisuje Kuba):
//   MAILERLITE_API_KEY        — token API z MailerLite (Integrations → API)
//   MAILERLITE_GROUP_DIAGNOZA — ID grupy „Diagnoza: zgoda na wiadomości”
// Pola subskrybenta (MailerLite → Subscribers → Fields, typ Text): obszar, zrodlo.
// Automatyzacje: wyzwalacz „dołącza do grupy”, warunek na polu `obszar` (wytrzymalosc,
// techSpec/techFund, fizycznosc, pozostałe → seria ogólna). Treść: SERIE-MAILI-PO-DIAGNOZIE-v2.md.

export const OBSZARY = ['moc','fizycznosc','wytrzymalosc','techFund','techSpec','tolerancja','regeneracja',
  'odpornosc','odzywianie','koncentracja','mental','percepcja','decyzja','ogolna'];

export function przygotuj(body) {
  const b = body || {};
  const email = typeof b.email === 'string' ? b.email.trim().slice(0, 254) : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const obszar = OBSZARY.includes(b.obszar) ? b.obszar : 'ogolna';
  const zrodlo = typeof b.ref === 'string' ? b.ref.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) : '';
  return { email, obszar, zrodlo };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }
  const klucz = process.env.MAILERLITE_API_KEY;
  const grupa = process.env.MAILERLITE_GROUP_DIAGNOZA;
  if (!klucz || !grupa) { res.status(500).json({ error: 'Brak MAILERLITE_API_KEY lub MAILERLITE_GROUP_DIAGNOZA na Vercelu.' }); return; }
  const dane = przygotuj(req.body);
  if (!dane) { res.status(400).json({ error: 'Zły adres e-mail.' }); return; }
  try {
    const r = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + klucz, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: dane.email, fields: { obszar: dane.obszar, zrodlo: dane.zrodlo || undefined }, groups: [grupa] }),
    });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message ? e.message : e) });
  }
}

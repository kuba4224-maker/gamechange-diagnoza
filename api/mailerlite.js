// /api/mailerlite.js
//
// Vercel Serverless Function — zapis adresu z diagnozy do MailerLite, TYLKO gdy zawodnik (16+)
// zaznaczył zgodę na wiadomości (index.html: _zgodaMarketingowa / _zapiszDoListy).
// Klucz nigdy nie trafia do przeglądarki.
//
// Zmienne środowiskowe na Vercelu (wpisuje Kuba):
//   MAILERLITE_API_KEY        — token API z MailerLite (Integrations → API)
// Grupę „Diagnoza: zgoda na wiadomości” i pola tekstowe `obszar`, `zrodlo` funkcja zakłada sama
// przy pierwszym zapisie (opcjonalnie MAILERLITE_GROUP_DIAGNOZA wymusza konkretną grupę).
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

export const NAZWA_GRUPY = 'Diagnoza: zgoda na wiadomości';
let _grupa = null, _pola = false;

async function ml(sciezka, metoda, klucz, body) {
  const r = await fetch('https://connect.mailerlite.com/api' + sciezka, {
    method: metoda,
    headers: { Authorization: 'Bearer ' + klucz, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let dane = null; try { dane = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, dane };
}

// Zakłada (raz na zimny start) grupę i pola, jeśli ich nie ma. Zwraca ID grupy.
export async function zapewnijGrupeIPola(klucz, wymuszonaGrupa) {
  if (!_pola) {
    const f = await ml('/fields?limit=100', 'GET', klucz);
    const istniejace = ((f.dane && f.dane.data) || []).map(x => x.key);
    for (const nazwa of ['obszar', 'zrodlo']) {
      if (!istniejace.includes(nazwa)) await ml('/fields', 'POST', klucz, { name: nazwa, type: 'text' });
    }
    _pola = true;
  }
  if (wymuszonaGrupa) return wymuszonaGrupa;
  if (_grupa) return _grupa;
  const g = await ml('/groups?filter[name]=' + encodeURIComponent(NAZWA_GRUPY), 'GET', klucz);
  const znaleziona = ((g.dane && g.dane.data) || []).find(x => x.name === NAZWA_GRUPY);
  if (znaleziona) { _grupa = znaleziona.id; return _grupa; }
  const nowa = await ml('/groups', 'POST', klucz, { name: NAZWA_GRUPY });
  _grupa = nowa.dane && nowa.dane.data ? nowa.dane.data.id : null;
  return _grupa;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }
  const klucz = process.env.MAILERLITE_API_KEY;
  if (!klucz) { res.status(500).json({ error: 'Brak MAILERLITE_API_KEY na Vercelu.' }); return; }
  const dane = przygotuj(req.body);
  if (!dane) { res.status(400).json({ error: 'Zły adres e-mail.' }); return; }
  try {
    const grupa = await zapewnijGrupeIPola(klucz, process.env.MAILERLITE_GROUP_DIAGNOZA);
    if (!grupa) { res.status(502).json({ error: 'Nie udało się ustalić grupy MailerLite.' }); return; }
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

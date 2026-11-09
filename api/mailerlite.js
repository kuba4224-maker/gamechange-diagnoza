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
// Seria maili: osoba trafia też do jednej z czterech grup serii (wytrzymałość / technika /
// fizyczność / pozostałe). Każda grupa ma w MailerLite swoją automatyzację „dołącza do grupy”.
// Pola `obszar_nazwa` i `plan_link` wypełniają mail z Planem 6 tygodni. Treść: SERIE-MAILI-PO-DIAGNOZIE-v2.md.

export const OBSZARY = ['moc','fizycznosc','wytrzymalosc','techFund','techSpec','tolerancja','regeneracja',
  'odpornosc','odzywianie','koncentracja','mental','percepcja','decyzja','ogolna'];

const S = 'https://buy.stripe.com/';
// obszar → [nazwa w mailu, link do Planu 6 tygodni (kod źródła MAIL), seria]
export const PLAN_OBSZARU = {
  wytrzymalosc: ['Wytrzymałość', S + '4gMdR91HU6gS0Isdk1dby0h', 'wytrzymalosc'],
  techSpec: ['Technika', S + '5kQcN54U68p0ezi0xfdby0i', 'technika'],
  techFund: ['Technika', S + '5kQcN54U68p0ezi0xfdby0i', 'technika'],
  fizycznosc: ['Fizyczność', S + '4gMfZhcmydJkdve7ZHdby0j', 'fizycznosc'],
  moc: ['Moc', S + '9B6bJ10DQfRs4YIeo5dby0k', 'ogolna'],
  tolerancja: ['Tolerancja obciążeń', S + 'fZueVdaeq48Kbn6fs9dby0l', 'ogolna'],
  regeneracja: ['Regeneracja', S + 'cNi3cv9ameNo8aUfs9dby0m', 'ogolna'],
  odpornosc: ['Odporność', S + 'aFa3cv0DQax81Mw0xfdby0n', 'ogolna'],
  odzywianie: ['Odżywienie', S + '14A00jgCO34G1Mwa7Pdby0o', 'ogolna'],
  koncentracja: ['Koncentracja', S + '7sY4gzgCOcFgcrabbTdby0p', 'ogolna'],
  mental: ['Odwaga w grze', S + '4gM4gzdqC7kWcra2Fndby0q', 'ogolna'],
  percepcja: ['Percepcja i szybkość decyzji', S + '00w3cvgCOax81Mwdk1dby0r', 'ogolna'],
  decyzja: ['Percepcja i szybkość decyzji', S + '00w3cvgCOax81Mwdk1dby0r', 'ogolna'],
};
export const GRUPY_SERII = {
  wytrzymalosc: 'Seria: wytrzymałość', technika: 'Seria: technika',
  fizycznosc: 'Seria: fizyczność', ogolna: 'Seria: pozostałe obszary',
};
export function polaObszaru(obszar) {
  const p = PLAN_OBSZARU[obszar];
  if (!p) return { obszar_nazwa: 'Twój obszar', plan_link: 'https://diagnoza.gamechange.pl/?ref=MAIL', seria: 'ogolna' };
  return { obszar_nazwa: p[0], plan_link: p[1] + '?client_reference_id=MAIL', seria: p[2] };
}

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
const _grupySerii = {};

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
    for (const nazwa of ['obszar', 'zrodlo', 'obszar_nazwa', 'plan_link']) {
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

// ID grupy po nazwie; zakłada grupę, gdy jej nie ma. Pamięć na zimny start.
export async function grupaPoNazwie(klucz, nazwa) {
  if (_grupySerii[nazwa]) return _grupySerii[nazwa];
  const g = await ml('/groups?limit=100&filter[name]=' + encodeURIComponent(nazwa), 'GET', klucz);
  const z = ((g.dane && g.dane.data) || []).find(x => x.name === nazwa);
  if (z) return (_grupySerii[nazwa] = z.id);
  const n = await ml('/groups', 'POST', klucz, { name: nazwa });
  return (_grupySerii[nazwa] = n.dane && n.dane.data ? n.dane.data.id : null);
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
    const pola = polaObszaru(dane.obszar);
    const seria = await grupaPoNazwie(klucz, GRUPY_SERII[pola.seria]);
    const r = await ml('/subscribers', 'POST', klucz, {
      email: dane.email,
      fields: { obszar: dane.obszar, zrodlo: dane.zrodlo || undefined, obszar_nazwa: pola.obszar_nazwa, plan_link: pola.plan_link },
      groups: seria ? [grupa, seria] : [grupa],
    });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message ? e.message : e) });
  }
}

// /api/diagnose.js
//
// Vercel Serverless Function — bezpieczny pośrednik między frontendem (index.html)
// a Anthropic API. Klucz API (ANTHROPIC_API_KEY) jest przechowywany jako zmienna
// środowiskowa na Vercelu i NIGDY nie trafia do kodu widocznego w przeglądarce.
//
// Model: claude-opus-4-8 — najwyższa jakość dostępna publicznie (czerwiec 2026).
// Opus 4.8 ma znacząco lepsze rozumowanie i precyzję niż Sonnet przy koszcie
// ~$0.04 za diagnozę (0.2% ceny za diagnozę 19 zł) — różnica kosztów pomijalnie mała,
// różnica jakości diagnozy wyraźna. Zmienić na claude-sonnet-4-6 tylko jeśli koszty
// staną się problemem przy bardzo dużej liczbie diagnoz.
//
// Frontend wysyła tu tylko sam tekst promptu (to, co wcześniej wysyłał bezpośrednio
// do api.anthropic.com). Ta funkcja dokleja klucz API i przekazuje żądanie dalej,
// a potem zwraca odpowiedź Anthropic w niezmienionej postaci — żeby kod w index.html
// (parsowanie [DIAGNOZA]/[KROKI]) nie musiał się zmieniać, tylko sam adres URL.
//
// Wymagana konfiguracja po stronie Kuby (nie da się zrobić bez dashboardu Vercel):
// Vercel → Project Settings → Environment Variables → dodać ANTHROPIC_API_KEY
// z wartością prawdziwego klucza API z console.anthropic.com.

// ──────────────────────────────────────────────────────────────────────────────
// LEJEK 11.11.2026 (A2, polecenie LEJEK-APLIKACJA-DOMKNIECIE-11-11) — ZABEZPIECZENIE.
// Do tego dnia funkcja przyjmowała dowolne zapytanie od każdego, bez limitu: przy ruchu
// z reklamy obcy skrypt mógł wypalić saldo konta API i opis wyniku gasł wszystkim.
// Cztery bramki, w tej kolejności, każda z własnym kodem odpowiedzi:
//   403 obce źródło · 413 za długie zapytanie · 429 za dużo wywołań z jednego adresu IP.
//   maxTokens nie jest odrzucane, tylko przycinane do górnego limitu.
// ⚠️ Nagłówek Origin da się podrobić poza przeglądarką. Bramka 403 zatrzymuje cudze STRONY,
//    nie skrypty — przed skryptem chronią limit długości, limit tokenów i licznik IP.
// ──────────────────────────────────────────────────────────────────────────────
export const DOZWOLONE_ZRODLA = ['https://diagnoza.gamechange.pl'];
// Najwięcej, ile wysyła dziś frontend (index.html: 400 i 2400). Wyżej nie wolno.
export const MAX_TOKENS = 2400;
// Próg długości promptu w znakach. Zmierzone 11.11.2026 na prawdziwej diagnozie na produkcji
// (ścieżka z pytaniem otwartym, krótka odpowiedź): 12 968 znaków. Próg ~2,3× z zapasem na długi
// opis sytuacji i historię powracającego zawodnika.
export const ZMIERZONY_PROMPT_ZNAKOW = 12968;
export const MAX_PROMPT_ZNAKOW = 30000;
// Licznik w pamięci funkcji: najwyżej LIMIT_IP wywołań z jednego adresu w oknie OKNO_MS.
// 30 / 10 min: drużyna na jednym klubowym Wi-Fi mieści się (jedna diagnoza = jedno wywołanie).
export const LIMIT_IP = 30;
export const OKNO_MS = 10 * 60 * 1000;
const _licznik = new Map();

export function zrodloDozwolone(headers) {
  const h = headers || {};
  const origin = typeof h.origin === 'string' ? h.origin : '';
  if (origin) return DOZWOLONE_ZRODLA.includes(origin);
  const referer = typeof h.referer === 'string' ? h.referer : '';
  if (!referer) return false;
  try { return DOZWOLONE_ZRODLA.includes(new URL(referer).origin); } catch (e) { return false; }
}

export function adresIP(req) {
  const h = (req && req.headers) || {};
  const xff = typeof h['x-forwarded-for'] === 'string' ? h['x-forwarded-for'].split(',')[0].trim() : '';
  return xff || (typeof h['x-real-ip'] === 'string' ? h['x-real-ip'] : '') ||
    (req && req.socket && req.socket.remoteAddress) || 'nieznany';
}

// true = wolno; false = przekroczony limit. `teraz` podawane w testach.
export function wpuscIP(ip, teraz) {
  const t = typeof teraz === 'number' ? teraz : Date.now();
  const wpisy = (_licznik.get(ip) || []).filter(x => t - x < OKNO_MS);
  if (wpisy.length >= LIMIT_IP) { _licznik.set(ip, wpisy); return false; }
  wpisy.push(t);
  _licznik.set(ip, wpisy);
  if (_licznik.size > 5000) { for (const k of _licznik.keys()) { _licznik.delete(k); if (_licznik.size <= 4000) break; } }
  return true;
}
export function _wyczyscLicznik() { _licznik.clear(); }

export function przytnijMaxTokens(wartosc) {
  const n = Math.floor(Number(wartosc));
  if (!Number.isFinite(n) || n < 1) return MAX_TOKENS;
  return Math.min(n, MAX_TOKENS);
}

export default async function handler(req, res) {
  // Tylko POST — to jest jedyna metoda jakiej używa frontend.
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  if (!zrodloDozwolone(req.headers)) {
    res.status(403).json({ error: 'Niedozwolone źródło wywołania.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // To się zdarzy, jeśli Kuba jeszcze nie dodał zmiennej środowiskowej w Vercelu.
    // Zwracamy jasny komunikat błędu, żeby łatwo było to zdiagnozować w devtools.
    res.status(500).json({
      error: 'Brak skonfigurowanego ANTHROPIC_API_KEY na serwerze. Dodaj zmienną środowiskową w Vercel → Project Settings → Environment Variables.',
    });
    return;
  }

  const { prompt, maxTokens } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Brak pola "prompt" w treści żądania.' });
    return;
  }
  if (prompt.length > MAX_PROMPT_ZNAKOW) {
    res.status(413).json({ error: 'Zapytanie za długie.' });
    return;
  }
  if (!wpuscIP(adresIP(req))) {
    res.status(429).json({ error: 'Za dużo wywołań. Spróbuj za kilka minut.' });
    return;
  }

  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: przytnijMaxTokens(maxTokens),
        // thinking: adaptive — jedyny obsługiwany tryb dla Opus 4.8.
        // Model sam decyduje kiedy i ile myśleć w zależności od złożoności zadania.
        // Przy diagnozie piłkarskiej z wieloma zależnościami przyczynowymi,
        // model niemal zawsze uruchamia rozumowanie (domyślny effort: high).
        // Uwaga: thinking.type: "enabled" z budget_tokens zwraca błąd 400 na Opus 4.8.
        thinking: { type: 'adaptive' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      // Przekazujemy kod i treść błędu Anthropic dalej — przydatne do debugowania
      // (np. nieprawidłowy klucz, przekroczony limit, model niedostępny).
      res.status(anthropicResponse.status).json({
        error: 'Błąd odpowiedzi z Anthropic API.',
        details: data,
      });
      return;
    }

    // Zwracamy odpowiedź Anthropic w niezmienionej postaci — frontend parsuje
    // data.content tak samo jak wcześniej przy bezpośrednim wywołaniu.
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({
      error: 'Nie udało się połączyć z Anthropic API.',
      details: String(err && err.message ? err.message : err),
    });
  }
}

// /api/diagnose.js
//
// Vercel Serverless Function — bezpieczny pośrednik między frontendem (index.html)
// a Anthropic API. Klucz API (ANTHROPIC_API_KEY) jest przechowywany jako zmienna
// środowiskowa na Vercelu i NIGDY nie trafia do kodu widocznego w przeglądarce.
//
// Frontend wysyła tu tylko sam tekst promptu (to, co wcześniej wysyłał bezpośrednio
// do api.anthropic.com). Ta funkcja dokleja klucz API i przekazuje żądanie dalej,
// a potem zwraca odpowiedź Anthropic w niezmienionej postaci — żeby kod w index.html
// (parsowanie [DIAGNOZA]/[KROKI]) nie musiał się zmieniać, tylko sam adres URL.
//
// Wymagana konfiguracja po stronie Kuby (nie da się zrobić bez dashboardu Vercel):
// Vercel → Project Settings → Environment Variables → dodać ANTHROPIC_API_KEY
// z wartością prawdziwego klucza API z console.anthropic.com.

export default async function handler(req, res) {
  // Tylko POST — to jest jedyna metoda jakiej używa frontend.
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
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

  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens || 1200,
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

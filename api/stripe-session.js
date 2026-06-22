// /api/stripe-session.js
//
// Vercel Serverless Function — bezpieczny odczyt danych sesji płatności Stripe
// (głównie email klienta) po powrocie na stronę z return URL.
//
// Dlaczego to wymaga backendu: Stripe Payment Links nie przekazuje samego adresu
// email w parametrach URL po przekierowaniu. Przekazuje tylko identyfikator sesji
// (przez placeholder {CHECKOUT_SESSION_ID} w return URL skonfigurowanym w dashboardzie
// Stripe). Żeby zamienić ten identyfikator na rzeczywisty email klienta, trzeba
// wywołać Stripe API z tajnym kluczem (Secret Key) — a tego klucza NIGDY nie można
// umieścić w kodzie front-end, bo dałoby to każdemu pełny dostęp do konta Stripe Kuby.
//
// Frontend wysyła tu tylko session_id z URL (?session_id={CHECKOUT_SESSION_ID}).
// Ta funkcja bezpiecznie pyta Stripe o szczegóły tej sesji i zwraca tylko to,
// co frontend potrzebuje (email, status płatności, opcjonalnie ID produktu z metadata).
//
// Wymagana konfiguracja po stronie Kuby (nie da się zrobić bez dashboardu Vercel/Stripe):
// 1) Vercel → Project Settings → Environment Variables → dodać STRIPE_SECRET_KEY
//    z wartością tajnego klucza z dashboard.stripe.com → Developers → API keys
//    (UWAGA: to klucz "Secret key", zaczynający się od sk_, NIE "Publishable key" pk_).
// 2) W ustawieniach return URL każdego linku Stripe dopisać parametr
//    &session_id={CHECKOUT_SESSION_ID} (Stripe automatycznie wypełni ten placeholder
//    prawdziwym ID sesji przed przekierowaniem klienta).

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    res.status(500).json({
      error: 'Brak skonfigurowanego STRIPE_SECRET_KEY na serwerze. Dodaj zmienną środowiskową w Vercel → Project Settings → Environment Variables.',
    });
    return;
  }

  const sessionId = req.query.session_id;
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'Brak parametru "session_id" w żądaniu.' });
    return;
  }

  try {
    // Wywołanie REST API Stripe bez instalowania osobnej biblioteki npm —
    // wystarczy fetch z nagłówkiem Authorization (Stripe akceptuje Basic Auth
    // z samym kluczem jako "login", bez hasła).
    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
        },
      }
    );

    const data = await stripeResponse.json();

    if (!stripeResponse.ok) {
      res.status(stripeResponse.status).json({
        error: 'Błąd odpowiedzi z Stripe API.',
        details: data,
      });
      return;
    }

    // Zwracamy frontendowi tylko to, co realnie potrzebuje — nie całą sesję
    // (która mogłaby zawierać więcej danych niż chcemy ujawnić w przeglądarce).
    res.status(200).json({
      email: (data.customer_details && data.customer_details.email) || data.customer_email || null,
      paymentStatus: data.payment_status || null,
      clientReferenceId: data.client_reference_id || null,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Nie udało się połączyć ze Stripe API.',
      details: String(err && err.message ? err.message : err),
    });
  }
}

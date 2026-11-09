-- LEJEK 09.11.2026 — zgoda na wiadomości przy bramce e-mail (index.html, GC_ZGODA_MARKETING_ENABLED).
-- Uruchamia Kuba w Supabase → SQL Editor (projekt kqrbztsvepjtggjmmcdx). Bezpieczne: dodaje kolumnę, nic nie kasuje.
alter table public.diagnostics add column if not exists marketing_consent boolean;

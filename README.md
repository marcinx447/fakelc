# FakeLC.lol na Next.js + Supabase (Vercel)

## 1. Supabase
1. Supabase -> SQL Editor -> wklej `supabase/schema.sql` -> Run.
2. Project Settings -> API Keys: skopiuj klucz **secret** (sb_secret_...). Klucz publishable nie wystarczy i nie powinien mieć dostępu do tych tabel.

## 2. Vercel
1. Wrzuć ten folder na GitHub i zaimportuj go w Vercel (Framework: Next.js).
2. Settings -> Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = https://ckfrhanyentjfpvttjxa.supabase.co
   - `SUPABASE_SECRET_KEY` = klucz secret
   - `OWNER_EMAIL` = ogprzecin3k@gmail.com
   - `OWNER_PASSWORD` = twoje hasło właściciela
   - opcjonalnie: `BUY_PRICE`, `SELL_PAYOUT`, `MIN_PAYOUT`, `DISCORD_HANDLE`
3. Deploy. Wejdź na stronę i zaloguj się jako właściciel.

## Lokalnie
`npm install`, skopiuj `.env.example` do `.env.local`, uzupełnij, `npm run dev`.
Bez Supabase (tylko test): `STORE_MOCK=1 npm run dev` (dane w pamięci).

## Jak to działa
- `public/index.html` to ten sam interfejs co wcześniej; sam łączy się z `/api/*`.
- `app/api/[[...path]]/route.js` to API (logika w `lib/core.js`, ta sama co w wersji z serwerem).
- Dane: tabela `app_state` (jeden wiersz JSON z blokadą wersji), zrzuty ekranu w tabeli `proofs`.
- Logowanie: limit tylko dla błędnych prób (10 / 10 min dla pary IP+e-mail), udane logowanie zeruje licznik.
- Rangi: pole `role` w bazie; `OWNER_EMAIL` zawsze ma `owner`.

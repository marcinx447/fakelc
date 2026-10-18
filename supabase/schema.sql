-- Uruchom raz w Supabase: SQL Editor -> New query -> wklej -> Run.
create table if not exists app_state (
  id int primary key,
  data jsonb not null,
  version bigint not null default 1
);
create table if not exists proofs (
  id text primary key,
  image text not null
);
-- Włączamy RLS bez żadnych polityk: klucz publiczny (publishable) nie ma wtedy dostępu do tych tabel.
-- Aplikacja korzysta z nich wyłącznie po stronie serwera, kluczem SECRET.
alter table app_state enable row level security;
alter table proofs enable row level security;

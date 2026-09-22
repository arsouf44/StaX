-- =============================================================================
--  StaX — 0025 · Durcissement releve a l'installation
-- =============================================================================
--
--  Trois constats de l'analyseur Supabase, verifies sur la base reelle :
--
--   1. Supabase applique `alter default privileges ... grant all on functions
--      to anon, authenticated`. Un `revoke ... from public` ne retire donc PAS
--      le droit d'execution du role `anon` : il faut le nommer. Deux fonctions
--      du parcours « facture » etaient concernees. Elles refusent deja un
--      appelant anonyme (`app.current_user_id()` vaut null), mais une fonction
--      reservee aux comptes connectes ne doit pas etre atteignable sans compte.
--
--   2. Trois fonctions de declencheur n'avaient pas de `search_path` fige.
--      Une fonction sans search_path resout ses appels dans le chemin de
--      l'appelant : `now()` pouvait etre detourne par un schema place en tete.
--
--   3. `rate_limit_counters` n'est alimentee que par app.bump_rate_limit()
--      (SECURITY DEFINER, reservee au role de service). Le RLS sans policy
--      ferme deja la table ; on retire en plus le privilege lui-meme, pour que
--      l'intention soit lisible et ne depende pas d'une seule barriere.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Parcours « facture » : reserve aux comptes connectes
-- -----------------------------------------------------------------------------
revoke all on function public.claim_sales_invoice(text, uuid, text, text) from anon;
revoke all on function public.peek_sales_invoice(text) from anon;
grant execute on function public.claim_sales_invoice(text, uuid, text, text) to authenticated;
grant execute on function public.peek_sales_invoice(text) to authenticated;

comment on function public.peek_sales_invoice(text) is
  'Lecture d''une facture avant rattachement. Exige un compte connecte ET la '
  'correspondance exacte entre l''adresse du compte et celle de la facture : '
  'le numero seul n''authentifie jamais personne.';

-- -----------------------------------------------------------------------------
--  2. search_path fige sur les fonctions de declencheur
-- -----------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app.freeze_published_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.published_at is not null then
    raise exception 'Une version publiee est immuable (site_versions.%)', old.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function app.forbid_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Table append-only : % interdit sur %', tg_op, tg_table_name
    using errcode = '42501';
end;
$$;

-- -----------------------------------------------------------------------------
--  3. Compteurs de limitation de debit : aucun acces direct
-- -----------------------------------------------------------------------------
revoke all on table public.rate_limit_counters from anon, authenticated;

comment on table public.rate_limit_counters is
  'Compteurs a fenetre fixe. Ecrits uniquement par app.bump_rate_limit(), '
  'reservee au role de service. Aucun privilege direct n''est accorde : le RLS '
  'sans policy et l''absence de privilege ferment la table deux fois.';

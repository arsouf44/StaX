-- =============================================================================
--  StaX — 0026 · Le nom affiche d'un compte cree par le formulaire public
-- =============================================================================
--
--  `app.handle_new_auth_user` ne remplissait `full_name` qu'a partir d'une
--  cle `full_name` des metadonnees. Or le formulaire d'inscription envoie
--  `first_name` et `last_name` — jamais `full_name`. Resultat : TOUT compte
--  cree par le formulaire public avait `full_name` a NULL.
--
--  Constate sur l'installation : l'historique des publications de l'editeur
--  n'affichait aucun auteur, et la liste des collaborateurs se trie et se
--  cherche sur `full_name` — donc sur une colonne vide pour tout le monde.
--
--  Le nom affiche est desormais DERIVE en base, par declencheur. Le faire
--  dans la fonction d'inscription seule n'aurait rien regle : modifier son
--  prenom depuis l'espace client aurait laisse l'ancien nom derriere.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Le nom affiche suit toujours le prenom et le nom
-- -----------------------------------------------------------------------------
create or replace function app.derive_full_name()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_composed text;
begin
  v_composed := nullif(
    btrim(concat_ws(' ', nullif(btrim(coalesce(new.first_name, '')), ''),
                         nullif(btrim(coalesce(new.last_name, '')), ''))),
    '');

  if v_composed is not null then
    -- Prenom ou nom renseigne : il fait foi.
    new.full_name := v_composed;
  else
    -- Ni l'un ni l'autre : on garde ce qui a ete fourni explicitement
    -- (comptes d'exploitation, imports) plutot que d'effacer.
    new.full_name := nullif(btrim(coalesce(new.full_name, '')), '');
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_derive_full_name on public.profiles;
create trigger profiles_derive_full_name
  before insert or update of first_name, last_name, full_name on public.profiles
  for each row execute function app.derive_full_name();

comment on column public.profiles.full_name is
  'Nom affiche. DERIVE du prenom et du nom par app.derive_full_name() : il ne '
  'peut pas diverger de ce que la personne a saisi. Renseigne directement '
  'seulement pour les comptes sans prenom ni nom.';

-- -----------------------------------------------------------------------------
--  2. L'inscription transmet les deux formes
-- -----------------------------------------------------------------------------
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_first text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), '');
  v_last  text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '');
  v_full  text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
begin
  insert into public.profiles (id, email, full_name, first_name, last_name, locale)
  values (
    new.id,
    new.email,
    -- Le declencheur ci-dessus recomposera a partir du prenom et du nom des
    -- qu'ils existent ; cette valeur ne sert que lorsqu'ils sont absents.
    coalesce(v_full, nullif(btrim(concat_ws(' ', v_first, v_last)), '')),
    v_first,
    v_last,
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'fr')
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
--  3. Rattrapage des comptes deja crees
-- -----------------------------------------------------------------------------
update public.profiles
   set full_name = btrim(concat_ws(' ', nullif(btrim(coalesce(first_name, '')), ''),
                                        nullif(btrim(coalesce(last_name, '')), '')))
 where nullif(btrim(coalesce(full_name, '')), '') is null
   and (nullif(btrim(coalesce(first_name, '')), '') is not null
        or nullif(btrim(coalesce(last_name, '')), '') is not null);

-- =============================================================================
--  Creation d'une organisation par son futur proprietaire
-- =============================================================================
--  Sans ce declencheur, creer une organisation serait impossible : la policy
--  `members_write` exige la capacite `members.manage` sur l'organisation, que
--  personne ne possede tant qu'aucun membre n'existe. L'appartenance de
--  proprietaire doit donc naitre EN MEME TEMPS que l'organisation, dans la
--  meme transaction.
--
--  Ce n'est pas une elevation de privilege : la ligne creee designe exactement
--  la personne qui a cree l'organisation (`created_by`, lui-meme contraint par
--  la policy d'insertion a valoir `app.current_user_id()`).
-- =============================================================================

create or replace function app.grant_creator_ownership()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_owner uuid := coalesce(new.created_by, app.current_user_id());
begin
  if v_owner is null then
    -- Organisation creee par un script d'exploitation : aucun proprietaire a
    -- rattacher, l'equipe StaX en attribuera un explicitement.
    return new;
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (new.id, v_owner, 'owner')
  on conflict (organization_id, user_id) do nothing;

  return new;
end;
$$;

create trigger organizations_grant_creator_ownership
  after insert on public.organizations
  for each row execute function app.grant_creator_ownership();

comment on function app.grant_creator_ownership() is
  'Rattache le createur comme proprietaire, dans la meme transaction que la '
  'creation. Sans cela, aucune organisation ne pourrait etre creee par un '
  'client : la policy d''ecriture des membres exigerait un droit que personne '
  'ne detiendrait encore.';

-- -----------------------------------------------------------------------------
--  Slug d'organisation unique
-- -----------------------------------------------------------------------------
create or replace function app.unique_organization_slug(p_source text)
returns text
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_base    text;
  v_slug    text;
  v_counter int := 0;
begin
  -- La mise en minuscules precede le nettoyage : sinon chaque majuscule,
  -- absente de la classe [a-z0-9], serait remplacee par un tiret.
  v_base := trim(both '-' from regexp_replace(
              translate(lower(coalesce(p_source, '')),
                        'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
                        'aaaaaaceeeeiiiinooooouuuuyy'),
              '[^a-z0-9]+', '-', 'g'));
  if v_base is null or length(v_base) < 2 then
    v_base := 'entreprise';
  end if;
  v_base := left(v_base, 40);
  v_slug := v_base;

  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_counter := v_counter + 1;
    v_slug := left(v_base, 36) || '-' || v_counter::text;
  end loop;

  return v_slug;
end;
$$;

create or replace function public.unique_organization_slug(p_source text)
returns text language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.unique_organization_slug(p_source);
$$;

revoke all on function public.unique_organization_slug(text) from public, anon;
grant execute on function public.unique_organization_slug(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
--  Lecture par le createur
-- -----------------------------------------------------------------------------
--  `INSERT ... RETURNING` applique AUSSI la policy de lecture, et ce avant que
--  l'appartenance creee par le declencheur ci-dessus ne soit visible pour la
--  projection. Sans cette clause, creer une organisation echouerait pour la
--  personne qui la cree — ce que le client Supabase fait systematiquement,
--  puisqu'il ajoute `returning` a toute insertion suivie de `.select()`.
--
--  L'elargissement est etroit et sur : il ne donne acces qu'aux organisations
--  dont on est SOI-MEME le createur.
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (
    app.is_org_member(id)
    or created_by = app.current_user_id()
    or app.is_platform_staff()
  );

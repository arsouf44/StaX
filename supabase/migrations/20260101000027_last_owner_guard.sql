-- =============================================================================
--  StaX — 0027 · Le garde du dernier proprietaire empechait toute suppression
-- =============================================================================
--
--  `app.guard_last_owner` refuse de retirer le dernier proprietaire d'une
--  organisation. La regle est juste. Son declenchement ne l'etait pas : il
--  s'appliquait aussi quand l'organisation ELLE-MEME etait supprimee.
--
--  PostgreSQL supprime les lignes filles avant la ligne parente. Le garde
--  voyait donc partir le dernier proprietaire d'une organisation encore
--  presente, et levait. Consequences constatees :
--
--   * `delete from public.organizations ...` echouait TOUJOURS, alors que la
--     policy `organizations_delete` annonce ce droit ;
--   * supprimer un compte echouait des lors que la personne etait seule
--     proprietaire — ce qui rendait inexecutable une demande d'effacement au
--     titre de l'article 17 du RGPD.
--
--  Le garde devient un declencheur de CONTRAINTE, evalue a la fin de
--  l'instruction plutot qu'au fil des lignes. Quand une organisation est
--  supprimee, la ligne parente est partie au moment ou le controle s'execute :
--  il n'y a plus rien a proteger, et la suppression passe. Quand seuls des
--  membres sont retires, l'organisation est toujours la et doit garder un
--  proprietaire.
--
--  La regle est au passage plus stricte qu'avant : elle juge l'etat final de
--  l'instruction, donc elle resiste aux suppressions multi-lignes qui
--  passaient entre les mailles du controle ligne a ligne.
--
--  `initially immediate` est volontaire : l'erreur reste rattachee a
--  l'instruction fautive, comme avant, au lieu de ne surgir qu'a la
--  validation de la transaction.
--
-- =============================================================================

drop trigger if exists organization_members_guard_last_owner on public.organization_members;

create or replace function app.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_org uuid := coalesce(old.organization_id, new.organization_id);
begin
  -- L'organisation a disparu : plus rien a proteger.
  if not exists (select 1 from public.organizations o where o.id = v_org) then
    return null;
  end if;

  -- Differe : on lit l'etat final, pas l'etat de la ligne en cours.
  if not exists (
    select 1 from public.organization_members m
     where m.organization_id = v_org and m.role = 'owner'
  ) then
    raise exception 'Une organisation doit conserver au moins un proprietaire'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger organization_members_guard_last_owner
  after update or delete on public.organization_members
  deferrable initially immediate
  for each row execute function app.guard_last_owner();

comment on function app.guard_last_owner() is
  'Une organisation vivante garde toujours un proprietaire. Declencheur de '
  'contrainte evalue en fin d''instruction : il laisse passer la suppression '
  'de l''organisation entiere — sans quoi aucune organisation ne pouvait etre '
  'supprimee — tout en refusant le retrait du dernier proprietaire d''une '
  'organisation qui reste.';

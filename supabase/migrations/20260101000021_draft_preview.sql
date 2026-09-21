-- =============================================================================
--  Apercu du brouillon
--
--  L'editeur doit montrer le site TEL QU'IL SERA, pas une approximation. Le
--  moteur de rendu ne sait lire qu'une chose : un snapshot. On expose donc le
--  snapshot du BROUILLON, construit par la meme fonction que la publication —
--  ce qui garantit que l'apercu et la mise en ligne ne peuvent pas diverger.
--
--  Trois garde-fous :
--
--   1. Le snapshot du brouillon revele l'integralite du contenu non publie d'un
--      site. Il est donc reserve a qui peut deja le modifier : `content.edit`.
--      Une lecture seule ne suffit pas, et un identifiant de site appartenant a
--      quelqu'un d'autre ne renvoie rien.
--   2. La fonction est STABLE et n'ecrit rien. Un apercu n'a jamais d'effet de
--      bord : il ne publie pas, ne date pas, ne journalise pas une mise en
--      ligne qui n'a pas eu lieu.
--   3. Le droit d'execution est retire a `anon`. Un visiteur non connecte ne
--      peut pas deviner un uuid de site pour lire un brouillon.
-- =============================================================================

create or replace function app.draft_site_snapshot(p_site uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, extensions, pg_catalog
as $$
begin
  if not (app.site_can(p_site, 'content.edit') or app.is_platform_staff()) then
    -- Meme reponse qu'un site inexistant : l'absence de droit ne doit pas
    -- confirmer l'existence d'un site qu'on ne peut pas voir.
    raise exception 'Site introuvable' using errcode = 'P0002';
  end if;

  return app.build_site_snapshot(p_site);
end;
$$;

create or replace function public.draft_site_snapshot(p_site uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select app.draft_site_snapshot(p_site);
$$;

revoke all on function public.draft_site_snapshot(uuid) from public, anon;
grant execute on function public.draft_site_snapshot(uuid) to authenticated, service_role;

comment on function public.draft_site_snapshot(uuid) is
  'Snapshot du brouillon, pour l''apercu dans l''editeur. Reserve aux personnes '
  'ayant la capacite content.edit sur ce site. N''ecrit rien et ne publie rien.';

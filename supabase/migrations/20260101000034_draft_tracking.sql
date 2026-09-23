-- =============================================================================
--  StaX — 0034 · « Modifications non publiees », quel que soit l'ecran
--
--  L'editeur tient `sites.draft_updated_at` a jour. Mais le brouillon change
--  aussi depuis « Apparence », « Mon entreprise », « Navigation » ou
--  « Pages ». Sans ce declencheur, le client modifierait ses couleurs et lirait
--  « à jour en ligne » : il ne publierait jamais, et ne comprendrait pas
--  pourquoi son site ne change pas.
-- =============================================================================

create or replace function app.mark_draft_changed()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_site uuid := case when tg_op = 'DELETE' then old.site_id else new.site_id end;
begin
  update public.sites set draft_updated_at = now() where id = v_site;
  return null;
end;
$$;

drop trigger if exists site_settings_mark_draft on public.site_settings;
create trigger site_settings_mark_draft
  after insert or update on public.site_settings
  for each row execute function app.mark_draft_changed();

drop trigger if exists site_themes_mark_draft on public.site_themes;
create trigger site_themes_mark_draft
  after insert or update on public.site_themes
  for each row execute function app.mark_draft_changed();

drop trigger if exists site_pages_mark_draft on public.site_pages;
create trigger site_pages_mark_draft
  after insert or update or delete on public.site_pages
  for each row execute function app.mark_draft_changed();

revoke all on function app.mark_draft_changed() from public, anon, authenticated;

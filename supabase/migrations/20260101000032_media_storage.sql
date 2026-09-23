-- =============================================================================
--  StaX — 0032 · Stockage des photos et fichiers des sites
--
--  L'espace client envoie les fichiers AVEC LE JETON DE LA PERSONNE. Sans
--  policy sur `storage.objects`, Supabase refuse tout envoi : « Changer la
--  photo » ne pouvait donc jamais aboutir sur une installation neuve.
--
--  Regle unique, identique pour l'envoi, le remplacement et la suppression :
--  le premier segment du chemin est l'organisation (le chemin est construit
--  cote serveur par `tenantStoragePath`), et il faut y detenir `media.manage`.
--  Un client ne peut donc ni ecrire ni effacer un fichier chez un autre.
--
--  Le bucket est public en lecture : les photos d'un site publie sont, par
--  nature, vues par tout le monde. Un fichier prive n'y est jamais depose.
--
--  Le schema `storage` n'existe que sur Supabase : sur un PostgreSQL nu (tests
--  SQL, integration continue), ce bloc ne fait rien.
-- =============================================================================

create or replace function app.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'storage' and table_name = 'objects') then
    raise notice 'Schema storage absent : policies de stockage non posees (PostgreSQL nu).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('site-media', 'site-media', true, 12582912,
          array['image/jpeg','image/png','image/webp','image/avif','image/gif','image/svg+xml',
                'application/pdf','video/mp4','video/webm'])
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists stax_site_media_insert on storage.objects';
  execute 'drop policy if exists stax_site_media_update on storage.objects';
  execute 'drop policy if exists stax_site_media_delete on storage.objects';
  execute 'drop policy if exists stax_site_media_select on storage.objects';

  execute $p$
    create policy stax_site_media_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'site-media'
        and app.org_can(app.try_uuid((storage.foldername(name))[1]), 'media.manage')
      )
  $p$;

  execute $p$
    create policy stax_site_media_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'site-media'
        and app.org_can(app.try_uuid((storage.foldername(name))[1]), 'media.manage')
      )
      with check (
        bucket_id = 'site-media'
        and app.org_can(app.try_uuid((storage.foldername(name))[1]), 'media.manage')
      )
  $p$;

  execute $p$
    create policy stax_site_media_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'site-media'
        and app.org_can(app.try_uuid((storage.foldername(name))[1]), 'media.manage')
      )
  $p$;

  execute $p$
    create policy stax_site_media_select on storage.objects
      for select to authenticated
      using (
        bucket_id = 'site-media'
        and (app.is_org_member(app.try_uuid((storage.foldername(name))[1]))
             or app.is_platform_staff())
      )
  $p$;
end;
$$;

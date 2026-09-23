-- =============================================================================
--  StaX — 0037 · Le commercant gere les comptes clients de son site
--
--  Le commercant est responsable du traitement des comptes ouverts sur son
--  site (RGPD) : il doit pouvoir repondre a une demande d'effacement sans
--  passer par StaX. La table n'a volontairement aucune policy DELETE : la
--  suppression passe par cette fonction, qui verifie le droit, efface le
--  compte et ses liens de connexion, et laisse une trace sans donnee
--  personnelle.
--
--  Les commandes et reservations passees ne sont PAS effacees : ce sont des
--  pieces commerciales et comptables, conservees au titre d'une obligation
--  legale (article L123-22 du Code de commerce).
-- =============================================================================

create or replace function app.delete_site_customer(p_customer uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_customer public.site_customers%rowtype;
begin
  select * into v_customer from public.site_customers where id = p_customer;
  if not found then
    return false;
  end if;

  if not (app.org_can(v_customer.organization_id, 'commerce.manage') or app.is_platform_admin()) then
    raise exception 'Droit de gestion des clients requis' using errcode = '42501';
  end if;

  delete from public.site_customers where id = p_customer;

  perform app.write_audit(
    'site_customer.erased', v_customer.organization_id, v_customer.site_id,
    'site_customer', p_customer::text, '{}'::jsonb);
  return true;
end;
$$;

create or replace function public.delete_site_customer(p_customer uuid)
returns boolean language sql security definer set search_path = public, app, pg_catalog as $$
  select app.delete_site_customer(p_customer);
$$;

revoke all on function app.delete_site_customer(uuid) from public;
revoke all on function public.delete_site_customer(uuid) from public, anon;
grant execute on function public.delete_site_customer(uuid) to authenticated;

comment on function public.delete_site_customer(uuid) is
  'Efface un compte client d''un site (droit a l''effacement). Reserve a commerce.manage. '
  'Les commandes et reservations passees sont conservees (obligation comptable).';

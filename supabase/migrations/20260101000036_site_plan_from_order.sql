-- =============================================================================
--  StaX — 0036 · Un site paye porte l'offre achetee
--
--  `app.apply_order_paid` cree le site avec `plan_slug` mais sans `plan_id`.
--  Or TOUS les droits d'offre se lisent via `app.organization_plan_id`, qui
--  regarde `sites.plan_id` : un client qui venait de payer une offre Premium
--  n'avait donc AUCUNE fonctionnalite (0 Mo pour ses photos, pas de
--  reservations...). Seules les commandes internes (0030) posaient l'offre.
--
--  Correction au plus pres de la cause : a la creation d'un site, l'offre est
--  celle EXACTEMENT achetee — la version du catalogue figee dans la commande
--  payee, pas la version courante du catalogue. A defaut de commande (site
--  cree par l'equipe), la version active de l'offre nommee.
--
--  Le verrou `app.guard_site_commercials` reste entier : il ne porte que sur
--  les MODIFICATIONS ; un client ne peut toujours pas changer son offre.
-- =============================================================================

create or replace function app.fill_site_plan()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if new.plan_id is null and new.plan_slug is not null then
    select o.plan_id into new.plan_id
      from public.orders o
     where o.organization_id = new.organization_id
       and o.plan_slug = new.plan_slug
       and o.status in ('paid', 'internal')
       and o.site_id is null
     order by o.paid_at desc nulls last, o.created_at desc
     limit 1;

    if new.plan_id is null then
      select p.id into new.plan_id
        from public.plans p
       where p.slug = new.plan_slug
       order by (p.is_active and p.valid_until is null) desc, p.version desc
       limit 1;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sites_fill_plan on public.sites;
create trigger sites_fill_plan
  before insert on public.sites
  for each row execute function app.fill_site_plan();

comment on function app.fill_site_plan() is
  'A la creation d''un site : l''offre est la version achetee (commande payee ou interne), '
  'a defaut la version active de l''offre nommee. Sans elle, aucun droit d''offre ne s''applique.';

-- -----------------------------------------------------------------------------
--  Rattrapage des sites deja crees sans offre
--
--  Le verrou des offres refuse toute modification hors cle de service ; la
--  migration s'execute sans jeton, il est donc suspendu le temps de cette
--  seule mise a jour, dans la transaction de la migration.
-- -----------------------------------------------------------------------------
alter table public.sites disable trigger sites_guard_commercials;

update public.sites s
   set plan_id = coalesce(
     (select o.plan_id
        from public.orders o
       where o.site_id = s.id
         and o.status in ('paid', 'partially_refunded', 'internal')
       order by o.paid_at desc nulls last, o.created_at desc
       limit 1),
     (select p.id
        from public.plans p
       where p.slug = s.plan_slug
       order by (p.is_active and p.valid_until is null) desc, p.version desc
       limit 1))
 where s.plan_id is null
   and s.plan_slug is not null;

alter table public.sites enable trigger sites_guard_commercials;

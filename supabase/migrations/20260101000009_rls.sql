-- =============================================================================
--  StaX — 0009 · Row Level Security
--
--  Regle absolue : l'isolation des tenants est garantie par la base, pas par
--  l'interface. Chaque table multi-tenant active RLS, et chaque policy
--  d'UPDATE porte a la fois USING et WITH CHECK afin qu'une ligne ne puisse
--  jamais etre deplacee d'une organisation vers une autre.
--
--  Le role `service_role` de Supabase contourne la RLS par conception : il est
--  reserve au serveur (webhooks, runtime des sites, scripts) et n'est JAMAIS
--  expose au navigateur.
-- =============================================================================

-- Helper anti-recursion : deux utilisateurs partagent-ils une organisation ?
create or replace function app.shares_org_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select exists (
    select 1
      from public.organization_members mine
      join public.organization_members theirs
        on theirs.organization_id = mine.organization_id
     where mine.user_id = app.current_user_id()
       and theirs.user_id = p_user
  );
$$;

-- -----------------------------------------------------------------------------
--  Activation globale de la RLS
-- -----------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- =============================================================================
--  1. Catalogue public — lecture ouverte, ecriture reservee a l'equipe StaX
-- =============================================================================
create policy catalog_read_sectors on public.business_sectors
  for select to anon, authenticated using (is_active or app.is_platform_staff());
create policy catalog_write_sectors on public.business_sectors
  for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy catalog_read_types on public.business_types
  for select to anon, authenticated using (is_active or app.is_platform_staff());
create policy catalog_write_types on public.business_types
  for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy catalog_read_modules on public.business_modules
  for select to anon, authenticated using (is_active or app.is_platform_staff());
create policy catalog_write_modules on public.business_modules
  for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy catalog_read_type_modules on public.business_type_modules
  for select to anon, authenticated using (true);
create policy catalog_write_type_modules on public.business_type_modules
  for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy catalog_read_features on public.features
  for select to anon, authenticated using (true);
create policy catalog_write_features on public.features
  for all to authenticated using (app.is_platform_owner()) with check (app.is_platform_owner());

create policy catalog_read_plans on public.plans
  for select to anon, authenticated
  using ((is_active and is_public) or app.is_platform_staff());
create policy catalog_write_plans on public.plans
  for all to authenticated using (app.is_platform_owner()) with check (app.is_platform_owner());

create policy catalog_read_plan_features on public.plan_features
  for select to anon, authenticated using (true);
create policy catalog_write_plan_features on public.plan_features
  for all to authenticated using (app.is_platform_owner()) with check (app.is_platform_owner());

create policy catalog_read_templates on public.site_templates
  for select to anon, authenticated using (is_active or app.is_platform_staff());
create policy catalog_write_templates on public.site_templates
  for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy catalog_read_subprocessors on public.subprocessors
  for select to anon, authenticated using (is_active or app.is_platform_staff());
create policy catalog_write_subprocessors on public.subprocessors
  for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());

-- Les feature flags ne sont lisibles que par l'equipe : leur contenu revele
-- la feuille de route et les regles de ciblage.
create policy flags_read on public.feature_flags
  for select to authenticated using (app.is_platform_staff());
create policy flags_write on public.feature_flags
  for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());

-- Les coupons ne sont jamais enumerables par un client.
create policy coupons_staff_only on public.coupons
  for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());

-- =============================================================================
--  2. Identite
-- =============================================================================
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = app.current_user_id()
    or app.shares_org_with(id)
    or app.is_platform_staff()
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = app.current_user_id())
  with check (id = app.current_user_id());

create policy profiles_update_staff on public.profiles
  for update to authenticated
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- Aucune policy INSERT/DELETE : les profils suivent strictement auth.users
-- via le trigger on_auth_user_created.

create policy organizations_select on public.organizations
  for select to authenticated
  using (app.is_org_member(id) or app.is_platform_staff());

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (created_by = app.current_user_id() or app.is_platform_admin());

create policy organizations_update on public.organizations
  for update to authenticated
  using (app.org_can(id, 'org.manage') or app.is_platform_admin())
  with check (app.org_can(id, 'org.manage') or app.is_platform_admin());

create policy organizations_delete on public.organizations
  for delete to authenticated
  using (app.org_can(id, 'org.delete') or app.is_platform_owner());

create policy members_select on public.organization_members
  for select to authenticated
  using (
    user_id = app.current_user_id()
    or app.is_org_member(organization_id)
    or app.is_platform_staff()
  );

create policy members_write on public.organization_members
  for all to authenticated
  using (app.org_can(organization_id, 'members.manage') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'members.manage') or app.is_platform_admin());

create policy invitations_select on public.organization_invitations
  for select to authenticated
  using (app.org_can(organization_id, 'members.manage') or app.is_platform_staff());

create policy invitations_write on public.organization_invitations
  for all to authenticated
  using (app.org_can(organization_id, 'members.manage') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'members.manage') or app.is_platform_admin());

create policy overrides_select on public.organization_feature_overrides
  for select to authenticated
  using (app.is_org_member(organization_id) or app.is_platform_staff());

-- Une derogation d'offre ne peut etre accordee que par l'equipe StaX :
-- un client ne doit jamais pouvoir s'octroyer une fonctionnalite.
create policy overrides_write on public.organization_feature_overrides
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- =============================================================================
--  3. Sites et contenu
-- =============================================================================
create policy sites_select on public.sites
  for select to authenticated
  using (app.is_org_member(organization_id) or app.is_platform_staff());

create policy sites_insert on public.sites
  for insert to authenticated
  with check (app.org_can(organization_id, 'org.manage') or app.is_platform_admin());

create policy sites_update on public.sites
  for update to authenticated
  using (app.org_can(organization_id, 'content.edit') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'content.edit') or app.is_platform_admin());

create policy sites_delete on public.sites
  for delete to authenticated
  using (app.is_platform_owner());

create policy site_domains_select on public.site_domains
  for select to authenticated
  using (app.is_org_member(organization_id) or app.is_platform_staff());

create policy site_domains_write on public.site_domains
  for all to authenticated
  using (app.org_can(organization_id, 'domain.manage') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'domain.manage') or app.is_platform_admin());

create policy site_themes_select on public.site_themes
  for select to authenticated
  using (app.is_site_member(site_id) or app.is_platform_staff());
create policy site_themes_write on public.site_themes
  for all to authenticated
  using (app.site_can(site_id, 'content.edit') or app.is_platform_admin())
  with check (app.site_can(site_id, 'content.edit') or app.is_platform_admin());

create policy site_settings_select on public.site_settings
  for select to authenticated
  using (app.is_site_member(site_id) or app.is_platform_staff());
create policy site_settings_write on public.site_settings
  for all to authenticated
  using (app.site_can(site_id, 'content.edit') or app.is_platform_admin())
  with check (app.site_can(site_id, 'content.edit') or app.is_platform_admin());

create policy site_pages_select on public.site_pages
  for select to authenticated
  using (app.is_site_member(site_id) or app.is_platform_staff());
create policy site_pages_write on public.site_pages
  for all to authenticated
  using (app.site_can(site_id, 'content.edit') or app.is_platform_admin())
  with check (app.site_can(site_id, 'content.edit') or app.is_platform_admin());

create policy page_blocks_select on public.page_blocks
  for select to authenticated
  using (app.is_site_member(site_id) or app.is_platform_staff());
create policy page_blocks_write on public.page_blocks
  for all to authenticated
  using (app.site_can(site_id, 'content.edit') or app.is_platform_admin())
  with check (app.site_can(site_id, 'content.edit') or app.is_platform_admin());

create policy site_versions_select on public.site_versions
  for select to authenticated
  using (app.is_site_member(site_id) or app.is_platform_staff());
-- Les versions ne sont creees que par app.publish_site() / app.rollback_site().
create policy site_versions_insert on public.site_versions
  for insert to authenticated
  with check (app.site_can(site_id, 'content.publish') or app.is_platform_admin());

create policy page_versions_select on public.page_versions
  for select to authenticated
  using (app.is_site_member(site_id) or app.is_platform_staff());
create policy page_versions_insert on public.page_versions
  for insert to authenticated
  with check (app.site_can(site_id, 'content.edit') or app.is_platform_admin());

create policy site_redirects_select on public.site_redirects
  for select to authenticated
  using (app.is_site_member(site_id) or app.is_platform_staff());
create policy site_redirects_write on public.site_redirects
  for all to authenticated
  using (app.site_can(site_id, 'content.edit') or app.is_platform_admin())
  with check (app.site_can(site_id, 'content.edit') or app.is_platform_admin());

create policy media_select on public.media
  for select to authenticated
  using (app.is_org_member(organization_id) or app.is_platform_staff());
create policy media_write on public.media
  for all to authenticated
  using (app.org_can(organization_id, 'media.manage') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'media.manage') or app.is_platform_admin());

-- =============================================================================
--  4. Commerce plateforme
-- =============================================================================
create policy orders_select on public.orders
  for select to authenticated
  using (
    app.is_platform_staff()
    or (organization_id is not null and app.org_can(organization_id, 'billing.view'))
    or created_by = app.current_user_id()
  );

-- Aucune policy INSERT pour un client : une commande ne peut naitre que par
-- app.create_order(), qui lit le prix dans le catalogue serveur. Un navigateur
-- ne peut donc jamais choisir son propre montant.
create policy orders_insert_staff on public.orders
  for insert to authenticated
  with check (app.is_platform_admin());

create policy orders_update on public.orders
  for update to authenticated
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

create policy order_items_select on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_id
       and (app.is_platform_staff()
            or (o.organization_id is not null and app.org_can(o.organization_id, 'billing.view'))
            or o.created_by = app.current_user_id())
  ));
create policy order_items_write on public.order_items
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy projects_select on public.projects
  for select to authenticated
  using (app.is_org_member(organization_id) or app.is_platform_staff());
create policy projects_update_client on public.projects
  for update to authenticated
  using (app.org_can(organization_id, 'org.manage'))
  with check (app.org_can(organization_id, 'org.manage'));
create policy projects_write_staff on public.projects
  for all to authenticated
  using (app.is_platform_staff()) with check (app.is_platform_staff());

-- Les evenements internes (is_public = false) restent invisibles du client.
create policy project_events_select on public.project_events
  for select to authenticated
  using (
    app.is_platform_staff()
    or (is_public and exists (
      select 1 from public.projects p
       where p.id = project_id and app.is_org_member(p.organization_id)))
  );
create policy project_events_insert on public.project_events
  for insert to authenticated with check (app.is_platform_staff());

create policy project_files_select on public.project_files
  for select to authenticated
  using (app.is_org_member(organization_id) or app.is_platform_staff());
create policy project_files_write on public.project_files
  for all to authenticated
  using (app.org_can(organization_id, 'content.edit') or app.is_platform_staff())
  with check (app.org_can(organization_id, 'content.edit') or app.is_platform_staff());

create policy project_messages_select on public.project_messages
  for select to authenticated
  using (exists (
    select 1 from public.projects p
     where p.id = project_id
       and (app.is_org_member(p.organization_id) or app.is_platform_staff())
  ));
create policy project_messages_insert on public.project_messages
  for insert to authenticated
  with check (
    author_id = app.current_user_id()
    and exists (
      select 1 from public.projects p
       where p.id = project_id
         and (app.is_org_member(p.organization_id) or app.is_platform_staff()))
  );

create policy quotes_select on public.quotes
  for select to authenticated
  using (
    app.is_platform_staff()
    or (organization_id is not null and app.org_can(organization_id, 'billing.view'))
  );
create policy quotes_write on public.quotes
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy quote_items_select on public.quote_items
  for select to authenticated
  using (exists (
    select 1 from public.quotes q
     where q.id = quote_id
       and (app.is_platform_staff()
            or (q.organization_id is not null and app.org_can(q.organization_id, 'billing.view')))
  ));
create policy quote_items_write on public.quote_items
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (app.org_can(organization_id, 'billing.view') or app.is_platform_staff());
-- Le statut d'abonnement provient exclusivement des webhooks Stripe.
create policy subscriptions_write on public.subscriptions
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy payments_select on public.payments
  for select to authenticated
  using (
    app.is_platform_staff()
    or (organization_id is not null and app.org_can(organization_id, 'billing.view'))
  );
create policy payments_write on public.payments
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy refunds_select on public.refunds
  for select to authenticated
  using (
    app.is_platform_staff()
    or (organization_id is not null and app.org_can(organization_id, 'billing.view'))
  );
create policy refunds_write on public.refunds
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy refund_requests_select on public.refund_requests
  for select to authenticated
  using (app.org_can(organization_id, 'billing.view') or app.is_platform_staff());

-- Le client depose sa demande via app.request_refund() : eligibilite, montant
-- paye, retenue domaine et montant remboursable sont calcules cote serveur.
-- Aucune insertion directe n'est autorisee depuis une session cliente.
create policy refund_requests_insert_staff on public.refund_requests
  for insert to authenticated
  with check (app.is_platform_admin());
create policy refund_requests_update on public.refund_requests
  for update to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy invoices_select on public.invoices
  for select to authenticated
  using (app.org_can(organization_id, 'billing.view') or app.is_platform_staff());
create policy invoices_write on public.invoices
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy connected_accounts_select on public.connected_accounts
  for select to authenticated
  using (app.org_can(organization_id, 'billing.view') or app.is_platform_staff());
create policy connected_accounts_write on public.connected_accounts
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- Les evenements de webhook n'ont aucune raison d'etre lus par un client.
create policy webhook_events_staff on public.webhook_events
  for select to authenticated using (app.is_platform_admin());

-- =============================================================================
--  5. Modules metier — portee par site
-- =============================================================================
do $$
declare
  t text;
  site_scoped text[] := array[
    'opening_hours','closures','availability_rules','menu_categories','menu_items',
    'product_categories','product_variants','service_areas'
  ];
begin
  foreach t in array site_scoped loop
    execute format($f$
      create policy %1$s_select on public.%1$I
        for select to authenticated
        using (app.is_site_member(site_id) or app.is_platform_staff());
      create policy %1$s_write on public.%1$I
        for all to authenticated
        using (app.site_can(site_id, 'content.edit') or app.is_platform_admin())
        with check (app.site_can(site_id, 'content.edit') or app.is_platform_admin());
    $f$, t);
  end loop;
end;
$$;

create policy forms_select on public.forms
  for select to authenticated using (app.is_org_member(organization_id) or app.is_platform_staff());
create policy forms_write on public.forms
  for all to authenticated
  using (app.org_can(organization_id, 'content.edit') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'content.edit') or app.is_platform_admin());

create policy form_fields_select on public.form_fields
  for select to authenticated
  using (exists (select 1 from public.forms f where f.id = form_id
                  and (app.is_org_member(f.organization_id) or app.is_platform_staff())));
create policy form_fields_write on public.form_fields
  for all to authenticated
  using (exists (select 1 from public.forms f where f.id = form_id
                  and (app.org_can(f.organization_id, 'content.edit') or app.is_platform_admin())))
  with check (exists (select 1 from public.forms f where f.id = form_id
                  and (app.org_can(f.organization_id, 'content.edit') or app.is_platform_admin())));

create policy form_submissions_select on public.form_submissions
  for select to authenticated
  using (app.org_can(organization_id, 'inbox.view') or app.is_platform_staff());
create policy form_submissions_update on public.form_submissions
  for update to authenticated
  using (app.org_can(organization_id, 'inbox.manage') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'inbox.manage') or app.is_platform_admin());
create policy form_submissions_delete on public.form_submissions
  for delete to authenticated
  using (app.org_can(organization_id, 'inbox.manage') or app.is_platform_admin());
-- Aucune policy INSERT : les soumissions publiques passent par le Worker
-- (service role) apres validation, anti-spam et limitation de debit.

create policy contacts_select on public.contacts
  for select to authenticated
  using (app.org_can(organization_id, 'inbox.view') or app.is_platform_staff());
create policy contacts_write on public.contacts
  for all to authenticated
  using (app.org_can(organization_id, 'inbox.manage') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'inbox.manage') or app.is_platform_admin());

create policy contact_notes_select on public.contact_notes
  for select to authenticated
  using (app.org_can(organization_id, 'inbox.view') or app.is_platform_staff());
create policy contact_notes_write on public.contact_notes
  for all to authenticated
  using (app.org_can(organization_id, 'inbox.manage') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'inbox.manage') or app.is_platform_admin());

create policy team_members_select on public.team_members
  for select to authenticated using (app.is_org_member(organization_id) or app.is_platform_staff());
create policy team_members_write on public.team_members
  for all to authenticated
  using (app.org_can(organization_id, 'content.edit') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'content.edit') or app.is_platform_admin());

create policy services_select on public.services
  for select to authenticated using (app.is_org_member(organization_id) or app.is_platform_staff());
create policy services_write on public.services
  for all to authenticated
  using (app.org_can(organization_id, 'content.edit') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'content.edit') or app.is_platform_admin());

create policy booking_services_select on public.booking_services
  for select to authenticated using (app.is_org_member(organization_id) or app.is_platform_staff());
create policy booking_services_write on public.booking_services
  for all to authenticated
  using (app.org_can(organization_id, 'content.edit') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'content.edit') or app.is_platform_admin());

create policy bookings_select on public.bookings
  for select to authenticated
  using (app.org_can(organization_id, 'inbox.view') or app.is_platform_staff());
create policy bookings_write on public.bookings
  for all to authenticated
  using (app.org_can(organization_id, 'inbox.manage') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'inbox.manage') or app.is_platform_admin());

create policy products_select on public.products
  for select to authenticated
  using (app.org_can(organization_id, 'commerce.view') or app.is_platform_staff());
create policy products_write on public.products
  for all to authenticated
  using (app.org_can(organization_id, 'commerce.manage') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'commerce.manage') or app.is_platform_admin());

create policy shop_orders_select on public.shop_orders
  for select to authenticated
  using (app.org_can(organization_id, 'commerce.view') or app.is_platform_staff());
create policy shop_orders_write on public.shop_orders
  for all to authenticated
  using (app.org_can(organization_id, 'commerce.manage') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'commerce.manage') or app.is_platform_admin());

create policy shop_order_items_select on public.shop_order_items
  for select to authenticated
  using (exists (select 1 from public.shop_orders o where o.id = shop_order_id
                  and (app.org_can(o.organization_id, 'commerce.view') or app.is_platform_staff())));
create policy shop_order_items_write on public.shop_order_items
  for all to authenticated
  using (exists (select 1 from public.shop_orders o where o.id = shop_order_id
                  and (app.org_can(o.organization_id, 'commerce.manage') or app.is_platform_admin())))
  with check (exists (select 1 from public.shop_orders o where o.id = shop_order_id
                  and (app.org_can(o.organization_id, 'commerce.manage') or app.is_platform_admin())));

create policy properties_select on public.properties
  for select to authenticated using (app.is_org_member(organization_id) or app.is_platform_staff());
create policy properties_write on public.properties
  for all to authenticated
  using (app.org_can(organization_id, 'content.edit') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'content.edit') or app.is_platform_admin());

create policy rooms_select on public.rooms
  for select to authenticated using (app.is_org_member(organization_id) or app.is_platform_staff());
create policy rooms_write on public.rooms
  for all to authenticated
  using (app.org_can(organization_id, 'content.edit') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'content.edit') or app.is_platform_admin());

create policy content_entries_select on public.content_entries
  for select to authenticated using (app.is_org_member(organization_id) or app.is_platform_staff());
create policy content_entries_write on public.content_entries
  for all to authenticated
  using (app.org_can(organization_id, 'content.edit') or app.is_platform_admin())
  with check (app.org_can(organization_id, 'content.edit') or app.is_platform_admin());

-- =============================================================================
--  6. Operations, securite, conformite
-- =============================================================================

-- Le hache d'un code d'activation n'est jamais expose a un client.
create policy activation_codes_staff on public.activation_codes
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy notifications_select on public.notifications
  for select to authenticated
  using (recipient_id = app.current_user_id() or app.is_platform_staff());
create policy notifications_update on public.notifications
  for update to authenticated
  using (recipient_id = app.current_user_id())
  with check (recipient_id = app.current_user_id());
create policy notifications_delete on public.notifications
  for delete to authenticated using (recipient_id = app.current_user_id());

create policy tickets_select on public.support_tickets
  for select to authenticated
  using (
    app.is_platform_staff()
    or (organization_id is not null and app.is_org_member(organization_id))
    or opened_by = app.current_user_id()
  );
create policy tickets_insert on public.support_tickets
  for insert to authenticated
  with check (
    opened_by = app.current_user_id()
    and (organization_id is null or app.org_can(organization_id, 'support.manage'))
  );
create policy tickets_update_staff on public.support_tickets
  for update to authenticated
  using (app.is_platform_staff()) with check (app.is_platform_staff());

create policy ticket_messages_select on public.support_messages
  for select to authenticated
  using (
    app.is_platform_staff()
    or (not is_internal and exists (
      select 1 from public.support_tickets t
       where t.id = ticket_id
         and (t.opened_by = app.current_user_id()
              or (t.organization_id is not null and app.is_org_member(t.organization_id)))))
  );
create policy ticket_messages_insert on public.support_messages
  for insert to authenticated
  with check (
    author_id = app.current_user_id()
    and (
      app.is_platform_staff()
      or (not is_internal and exists (
        select 1 from public.support_tickets t
         where t.id = ticket_id
           and (t.opened_by = app.current_user_id()
                or (t.organization_id is not null and app.is_org_member(t.organization_id)))))
    )
  );

create policy consents_select on public.consents
  for select to authenticated
  using (
    user_id = app.current_user_id()
    or (organization_id is not null and app.org_can(organization_id, 'org.view'))
    or app.is_platform_staff()
  );
create policy consents_insert on public.consents
  for insert to authenticated
  with check (user_id = app.current_user_id() or app.is_platform_admin());

create policy privacy_requests_select on public.privacy_requests
  for select to authenticated
  using (requester_id = app.current_user_id() or app.is_platform_admin());
create policy privacy_requests_insert on public.privacy_requests
  for insert to authenticated
  with check (requester_id = app.current_user_id() or app.is_platform_admin());
create policy privacy_requests_update on public.privacy_requests
  for update to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- Un client lit le journal de SON organisation ; l'equipe lit tout.
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    app.is_platform_staff()
    or (organization_id is not null and app.org_can(organization_id, 'org.manage'))
  );
create policy audit_logs_insert on public.audit_logs
  for insert to authenticated with check (true);

create policy security_events_select on public.security_events
  for select to authenticated using (app.is_platform_admin());

create policy impersonation_select on public.impersonation_sessions
  for select to authenticated
  using (
    app.is_platform_admin()
    or staff_id = app.current_user_id()
    -- Le client concerne a le droit de savoir qui a accede a son espace.
    or app.org_can(organization_id, 'org.manage')
  );
create policy impersonation_write on public.impersonation_sessions
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy analytics_events_select on public.analytics_events
  for select to authenticated
  using (app.site_can(site_id, 'analytics.view') or app.is_platform_staff());

create policy daily_metrics_select on public.daily_site_metrics
  for select to authenticated
  using (app.site_can(site_id, 'analytics.view') or app.is_platform_staff());

create policy jobs_staff on public.background_jobs
  for select to authenticated using (app.is_platform_admin());

create policy email_log_staff on public.email_log
  for select to authenticated using (app.is_platform_admin());

create policy system_health_staff on public.system_health
  for select to authenticated using (app.is_platform_staff());
create policy system_health_write on public.system_health
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- Les compteurs de limitation de debit ne sont manipules que cote serveur.
-- Aucune policy : seul le service role y accede.

-- =============================================================================
--  7. Privileges de base
-- =============================================================================
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Les fonctions de domaine reservees au serveur restent inaccessibles.
revoke all on function app.resolve_published_site(text) from anon, authenticated;
revoke all on function app.redeem_activation_code(text, uuid, text) from anon;
revoke all on function app.bump_rate_limit(text, text, int, int) from anon, authenticated;

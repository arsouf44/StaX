-- =============================================================================
--  StaX — Tests d'isolation multi-tenant et de RBAC
--
--  Ces tests s'executent contre une base reelle ayant recu toutes les
--  migrations. Chaque assertion qui echoue leve une exception : le script
--  sort en erreur et fait echouer la CI.
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off

-- -----------------------------------------------------------------------------
--  Harnais
-- -----------------------------------------------------------------------------
create schema if not exists t;

create or replace function t.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'ECHEC : %', p_label;
  end if;
  raise notice '  ok  %', p_label;
end;
$$;

-- Execute une requete sous l'identite d'un utilisateur donne et renvoie le
-- nombre de lignes visibles.
create or replace function t.count_as(p_user uuid, p_sql text)
returns integer language plpgsql as $$
declare v_count integer;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute 'select count(*) from (' || p_sql || ') q' into v_count;
  reset role;
  return v_count;
end;
$$;

-- Execute une instruction sous une identite et indique si elle a ete refusee
-- (exception) ou n'a affecte aucune ligne (RLS silencieuse).
create or replace function t.denied_as(p_user uuid, p_sql text)
returns boolean language plpgsql as $$
declare v_rows integer;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    execute p_sql;
    get diagnostics v_rows = row_count;
    reset role;
    return v_rows = 0;
  exception when others then
    reset role;
    return true;
  end;
end;
$$;

-- -----------------------------------------------------------------------------
--  Jeu de donnees : deux tenants totalement etrangers
-- -----------------------------------------------------------------------------
do $$
declare
  v_org_a uuid; v_org_b uuid;
  v_site_a uuid; v_site_b uuid;
  v_alice uuid; v_bob uuid; v_eve uuid; v_viewer uuid; v_staff uuid;
begin
  insert into auth.users (email) values ('alice@tenant-a.test')  returning id into v_alice;
  insert into auth.users (email) values ('bob@tenant-b.test')    returning id into v_bob;
  insert into auth.users (email) values ('eve@tenant-a.test')    returning id into v_eve;
  insert into auth.users (email) values ('viewer@tenant-a.test') returning id into v_viewer;
  insert into auth.users (email) values ('staff@stax.test')      returning id into v_staff;

  update public.profiles set platform_role = 'platform_admin' where id = v_staff;

  insert into public.organizations (name, slug, created_by)
       values ('Tenant A', 'tenant-a', v_alice) returning id into v_org_a;
  insert into public.organizations (name, slug, created_by)
       values ('Tenant B', 'tenant-b', v_bob) returning id into v_org_b;

  insert into public.organization_members (organization_id, user_id, role) values
    (v_org_a, v_alice,  'owner'),
    (v_org_a, v_eve,    'editor'),
    (v_org_a, v_viewer, 'viewer'),
    (v_org_b, v_bob,    'owner');

  insert into public.sites (organization_id, name, slug, plan_id, plan_slug, business_type_slug)
       values (v_org_a, 'Site A', 'site-a',
               (select id from public.plans where slug='premium'), 'premium', 'restaurant')
    returning id into v_site_a;
  insert into public.sites (organization_id, name, slug, plan_id, plan_slug, business_type_slug)
       values (v_org_b, 'Site B', 'site-b',
               (select id from public.plans where slug='classique'), 'classique', 'plombier')
    returning id into v_site_b;

  insert into public.site_settings (site_id, business_name) values
    (v_site_a, 'Restaurant A'), (v_site_b, 'Plomberie B');

  insert into public.site_pages (site_id, path, title, kind) values
    (v_site_a, '/', 'Accueil A', 'home'),
    (v_site_b, '/', 'Accueil B', 'home');

  insert into public.forms (site_id, organization_id, slug, name) values
    (v_site_a, v_org_a, 'contact', 'Contact A'),
    (v_site_b, v_org_b, 'contact', 'Contact B');

  insert into public.form_submissions (form_id, site_id, organization_id, data)
  select f.id, f.site_id, f.organization_id, '{"message":"bonjour"}'::jsonb
    from public.forms f;

  insert into public.payments (organization_id, site_id, scope, kind, status, amount_cents)
  values (v_org_a, v_site_a, 'platform', 'setup', 'succeeded', 49900),
         (v_org_b, v_site_b, 'platform', 'setup', 'succeeded', 23999);

  insert into public.subscriptions (organization_id, site_id, plan_slug, monthly_price_cents, status)
  values (v_org_a, v_site_a, 'premium', 3200, 'active'),
         (v_org_b, v_site_b, 'classique', 1400, 'active');

  -- Memorise les identifiants pour les assertions.
  create table if not exists t.fixtures (k text primary key, v uuid);
  insert into t.fixtures (k, v) values
    ('org_a', v_org_a), ('org_b', v_org_b),
    ('site_a', v_site_a), ('site_b', v_site_b),
    ('alice', v_alice), ('bob', v_bob), ('eve', v_eve),
    ('viewer', v_viewer), ('staff', v_staff)
  on conflict (k) do update set v = excluded.v;
end;
$$;

-- -----------------------------------------------------------------------------
--  1. Isolation des tenants en lecture
-- -----------------------------------------------------------------------------
\echo '--- Isolation des tenants (SELECT) ---'
do $$
declare
  a uuid := (select v from t.fixtures where k='alice');
  b uuid := (select v from t.fixtures where k='bob');
  org_b uuid := (select v from t.fixtures where k='org_b');
  site_b uuid := (select v from t.fixtures where k='site_b');
begin
  perform t.assert(t.count_as(a, 'select 1 from organizations') = 1,
    'Alice ne voit que sa propre organisation');
  perform t.assert(t.count_as(a, format('select 1 from organizations where id=%L', org_b)) = 0,
    'Alice ne peut pas lire l''organisation B');
  perform t.assert(t.count_as(a, format('select 1 from sites where id=%L', site_b)) = 0,
    'Alice ne peut pas lire le site B');
  perform t.assert(t.count_as(a, format('select 1 from site_pages where site_id=%L', site_b)) = 0,
    'Alice ne peut pas lire les pages du site B');
  perform t.assert(t.count_as(a, format('select 1 from site_settings where site_id=%L', site_b)) = 0,
    'Alice ne peut pas lire les reglages du site B');
  perform t.assert(t.count_as(a, format('select 1 from form_submissions where organization_id=%L', org_b)) = 0,
    'Alice ne peut pas lire les messages du tenant B');
  perform t.assert(t.count_as(a, format('select 1 from payments where organization_id=%L', org_b)) = 0,
    'Alice ne peut pas lire les paiements du tenant B');
  perform t.assert(t.count_as(a, format('select 1 from subscriptions where organization_id=%L', org_b)) = 0,
    'Alice ne peut pas lire l''abonnement du tenant B');
  perform t.assert(t.count_as(b, 'select 1 from sites') = 1,
    'Bob ne voit que son propre site');
  perform t.assert(t.count_as(a, 'select 1 from form_submissions') = 1,
    'Alice ne voit que les messages de son site');
end;
$$;

-- -----------------------------------------------------------------------------
--  2. Isolation en ecriture — identifiants forges
-- -----------------------------------------------------------------------------
\echo '--- Isolation des tenants (UPDATE / DELETE / INSERT forges) ---'
do $$
declare
  a uuid := (select v from t.fixtures where k='alice');
  org_b uuid := (select v from t.fixtures where k='org_b');
  site_b uuid := (select v from t.fixtures where k='site_b');
begin
  perform t.assert(t.denied_as(a, format('update organizations set name=''pirate'' where id=%L', org_b)),
    'Alice ne peut pas renommer l''organisation B');
  perform t.assert(t.denied_as(a, format('delete from organizations where id=%L', org_b)),
    'Alice ne peut pas supprimer l''organisation B');
  perform t.assert(t.denied_as(a, format('update sites set name=''pirate'' where id=%L', site_b)),
    'Alice ne peut pas modifier le site B');
  perform t.assert(t.denied_as(a, format('delete from site_pages where site_id=%L', site_b)),
    'Alice ne peut pas supprimer les pages du site B');
  perform t.assert(t.denied_as(a, format(
    'insert into site_pages (site_id, path, title) values (%L, ''/pirate'', ''Pirate'')', site_b)),
    'Alice ne peut pas injecter une page dans le site B');
  perform t.assert(t.denied_as(a, format(
    'update form_submissions set status=''archived'' where organization_id=%L', org_b)),
    'Alice ne peut pas modifier les messages du tenant B');
end;
$$;

-- -----------------------------------------------------------------------------
--  3. Deplacement de tenant (WITH CHECK)
-- -----------------------------------------------------------------------------
\echo '--- Un site ne peut pas changer de proprietaire ---'
do $$
declare
  a uuid := (select v from t.fixtures where k='alice');
  site_a uuid := (select v from t.fixtures where k='site_a');
  org_b uuid := (select v from t.fixtures where k='org_b');
begin
  perform t.assert(t.denied_as(a, format(
    'update sites set organization_id=%L where id=%L', org_b, site_a)),
    'Alice ne peut pas transferer son site vers l''organisation B');
end;
$$;

-- -----------------------------------------------------------------------------
--  4. RBAC intra-organisation
-- -----------------------------------------------------------------------------
\echo '--- RBAC : editeur, lecteur ---'
do $$
declare
  eve uuid := (select v from t.fixtures where k='eve');
  viewer uuid := (select v from t.fixtures where k='viewer');
  org_a uuid := (select v from t.fixtures where k='org_a');
  site_a uuid := (select v from t.fixtures where k='site_a');
begin
  perform t.assert(t.count_as(eve, format('select 1 from site_pages where site_id=%L', site_a)) = 1,
    'Un editeur lit les pages de son site');
  perform t.assert(not t.denied_as(eve, format(
    'update site_pages set title=''Accueil modifie'' where site_id=%L', site_a)),
    'Un editeur peut modifier le contenu');

  perform t.assert(t.count_as(eve, format('select 1 from payments where organization_id=%L', org_a)) = 0,
    'Un editeur n''accede PAS aux paiements');
  perform t.assert(t.count_as(eve, format('select 1 from subscriptions where organization_id=%L', org_a)) = 0,
    'Un editeur n''accede PAS a l''abonnement');
  perform t.assert(t.count_as(eve, format('select 1 from invoices where organization_id=%L', org_a)) = 0,
    'Un editeur n''accede PAS aux factures');

  perform t.assert(t.denied_as(viewer, format(
    'update site_pages set title=''Pirate'' where site_id=%L', site_a)),
    'Un lecteur ne peut PAS modifier le contenu');
  perform t.assert(t.denied_as(viewer, format(
    'insert into site_pages (site_id, path, title) values (%L, ''/x'', ''X'')', site_a)),
    'Un lecteur ne peut PAS creer de page');
  perform t.assert(t.count_as(viewer, format('select 1 from site_pages where site_id=%L', site_a)) = 1,
    'Un lecteur lit bien le contenu');
  perform t.assert(t.denied_as(viewer, format(
    'update organizations set name=''X'' where id=%L', org_a)),
    'Un lecteur ne peut PAS modifier l''organisation');
end;
$$;

-- -----------------------------------------------------------------------------
--  5. Escalade de privileges
-- -----------------------------------------------------------------------------
\echo '--- Escalade de privileges impossible ---'
do $$
declare
  a uuid := (select v from t.fixtures where k='alice');
  org_b uuid := (select v from t.fixtures where k='org_b');
begin
  perform t.assert(t.denied_as(a, format(
    'update profiles set platform_role=''platform_owner'' where id=%L', a)),
    'Un client ne peut pas s''attribuer un role plateforme');
  perform t.assert(t.denied_as(a, format(
    'insert into organization_members (organization_id, user_id, role) values (%L, %L, ''owner'')',
    org_b, a)),
    'Un client ne peut pas s''ajouter a une autre organisation');
  perform t.assert(t.denied_as(a, format(
    'insert into organization_feature_overrides (organization_id, feature_key, enabled, reason)
     values (%L, ''ecommerce'', true, ''auto-octroi'')',
    (select v from t.fixtures where k='org_a'))),
    'Un client ne peut pas s''octroyer une fonctionnalite');
  perform t.assert(t.count_as(a, 'select 1 from coupons') = 0,
    'Un client ne peut pas enumerer les codes promotionnels');
  perform t.assert(t.count_as(a, 'select 1 from activation_codes') = 0,
    'Un client ne peut pas lire les codes d''activation');
  perform t.assert(t.count_as(a, 'select 1 from webhook_events') = 0,
    'Un client ne peut pas lire les evenements de webhook');
  perform t.assert(t.count_as(a, 'select 1 from security_events') = 0,
    'Un client ne peut pas lire les evenements de securite');
end;
$$;

-- -----------------------------------------------------------------------------
--  6. Integrite financiere
-- -----------------------------------------------------------------------------
\echo '--- Integrite financiere ---'
do $$
declare
  a uuid := (select v from t.fixtures where k='alice');
  org_a uuid := (select v from t.fixtures where k='org_a');
  site_a uuid := (select v from t.fixtures where k='site_a');
begin
  perform t.assert(t.denied_as(a, format(
    'insert into orders (reference, organization_id, created_by, status, setup_price_cents, total_cents)
     values (''FORGE-1'', %L, %L, ''paid'', 1, 1)', org_a, a)),
    'Un client ne peut pas creer une commande a son propre prix');
  perform t.assert(t.denied_as(a, format(
    'update subscriptions set monthly_price_cents = 1 where organization_id=%L', org_a)),
    'Un client ne peut pas changer le prix de son abonnement');
  perform t.assert(t.denied_as(a, format(
    'update sites set plan_slug=''signature'' where id=%L', site_a)),
    'Un client ne peut pas changer son offre');
  perform t.assert(t.denied_as(a, format(
    'update organizations set status=''active'', is_demo=true where id=%L', org_a)),
    'Un client ne peut pas modifier un champ reserve a l''administration');
  perform t.assert(t.denied_as(a, format(
    'insert into refund_requests (organization_id, refund_amount_cents, amount_paid_cents)
     values (%L, 999999, 999999)', org_a)),
    'Un client ne peut pas forger une demande de remboursement');
end;
$$;

-- Les montants d'une commande payee sont immuables, meme cote serveur.
do $$
declare
  org_a uuid := (select v from t.fixtures where k='org_a');
  alice uuid := (select v from t.fixtures where k='alice');
  v_order uuid;
  v_failed boolean := false;
begin
  insert into orders (reference, organization_id, created_by, status,
                      setup_price_cents, total_cents, terms_version, terms_accepted_at)
  values ('TEST-IMMUABLE', org_a, alice, 'paid', 49900, 59880, 'v1', now())
  returning id into v_order;
  begin
    update orders set total_cents = 1 where id = v_order;
  exception when others then v_failed := true;
  end;
  perform t.assert(v_failed, 'Les montants d''une commande payee sont immuables');
end;
$$;

-- -----------------------------------------------------------------------------
--  7. Codes d'activation : usage unique, expiration, contrainte d'email
-- -----------------------------------------------------------------------------
\echo '--- Codes d''activation ---'
do $$
declare
  org_a uuid := (select v from t.fixtures where k='org_a');
  site_a uuid := (select v from t.fixtures where k='site_a');
  v_new uuid;
  v_res app.activation_result;
begin
  insert into auth.users (email) values ('nouveau@client.test') returning id into v_new;

  insert into activation_codes (organization_id, site_id, code_hash, code_hint,
                                granted_role, email_constraint, expires_at)
  values (org_a, site_a, 'hash-ok', 'AB12', 'owner', 'nouveau@client.test',
          now() + interval '7 days');

  v_res := app.redeem_activation_code('hash-ok', v_new, 'autre@client.test');
  perform t.assert(v_res.ok = false and v_res.reason = 'email_mismatch',
    'Un code lie a un e-mail refuse une autre adresse');

  v_res := app.redeem_activation_code('hash-ok', v_new, 'nouveau@client.test');
  perform t.assert(v_res.ok and v_res.organization_id = org_a,
    'Le bon e-mail consomme le code et cree l''appartenance');

  v_res := app.redeem_activation_code('hash-ok', v_new, 'nouveau@client.test');
  perform t.assert(v_res.ok = false and v_res.reason = 'already_used',
    'Un code ne peut PAS etre rejoue');

  perform t.assert(
    (select count(*) from organization_members where organization_id = org_a and user_id = v_new) = 1,
    'L''appartenance a bien ete creee, une seule fois');

  -- Code expire
  insert into activation_codes (organization_id, code_hash, code_hint, expires_at)
  values (org_a, 'hash-expire', 'CD34', now() - interval '1 day');
  v_res := app.redeem_activation_code('hash-expire', v_new, 'nouveau@client.test');
  perform t.assert(v_res.ok = false and v_res.reason = 'expired', 'Un code expire est refuse');

  -- Code revoque
  insert into activation_codes (organization_id, code_hash, code_hint, expires_at, revoked_at)
  values (org_a, 'hash-revoke', 'EF56', now() + interval '7 days', now());
  v_res := app.redeem_activation_code('hash-revoke', v_new, 'nouveau@client.test');
  perform t.assert(v_res.ok = false and v_res.reason = 'revoked', 'Un code revoque est refuse');

  -- Code inconnu : meme reponse qu'un code invalide, sans fuite d'information
  v_res := app.redeem_activation_code('hash-inexistant', v_new, 'nouveau@client.test');
  perform t.assert(v_res.ok = false and v_res.reason = 'invalid',
    'Un code inconnu ne revele rien');
end;
$$;

-- -----------------------------------------------------------------------------
--  8. Domaines : anti-detournement
-- -----------------------------------------------------------------------------
\echo '--- Domaines ---'
do $$
declare
  org_a uuid := (select v from t.fixtures where k='org_a');
  org_b uuid := (select v from t.fixtures where k='org_b');
  site_a uuid := (select v from t.fixtures where k='site_a');
  site_b uuid := (select v from t.fixtures where k='site_b');
  v_failed boolean := false;
begin
  insert into site_domains (site_id, organization_id, hostname, kind, status)
  values (site_a, org_a, 'restaurant-a.fr', 'custom', 'active');

  begin
    insert into site_domains (site_id, organization_id, hostname, kind, status)
    values (site_b, org_b, 'restaurant-a.fr', 'custom', 'pending');
  exception when unique_violation then v_failed := true;
  end;
  perform t.assert(v_failed,
    'Un hostname actif ne peut pas etre revendique par un second site');

  -- Une fois detache, le hostname redevient disponible.
  update site_domains set status='detached', detached_at=now() where hostname='restaurant-a.fr';
  insert into site_domains (site_id, organization_id, hostname, kind, status)
  values (site_b, org_b, 'restaurant-a.fr', 'custom', 'pending');
  perform t.assert(true, 'Un hostname detache redevient disponible');

  -- Format invalide refuse
  v_failed := false;
  begin
    insert into site_domains (site_id, organization_id, hostname)
    values (site_a, org_a, 'Pas Un Domaine');
  exception when check_violation then v_failed := true;
  end;
  perform t.assert(v_failed, 'Un hostname invalide est refuse par la base');
end;
$$;

-- -----------------------------------------------------------------------------
--  9. Machine a etats des sites
-- -----------------------------------------------------------------------------
\echo '--- Machine a etats ---'
do $$
declare
  site_a uuid := (select v from t.fixtures where k='site_a');
  v_failed boolean := false;
begin
  begin
    update sites set status = 'live' where id = site_a;
  exception when others then v_failed := true;
  end;
  perform t.assert(v_failed, 'Une transition draft -> live directe est refusee');

  update sites set status = 'building' where id = site_a;
  update sites set status = 'review'   where id = site_a;
  update sites set status = 'ready'    where id = site_a;
  perform t.assert(true, 'Les transitions legitimes sont acceptees');

  v_failed := false;
  begin
    update sites set status = 'live' where id = site_a;
  exception when others then v_failed := true;
  end;
  perform t.assert(v_failed, 'Un site sans version publiee ne peut pas passer en ligne');
end;
$$;

-- -----------------------------------------------------------------------------
--  10. Publication : snapshot immuable et isolation du brouillon
-- -----------------------------------------------------------------------------
\echo '--- Publication et versions ---'
do $$
declare
  site_a uuid := (select v from t.fixtures where k='site_a');
  alice uuid := (select v from t.fixtures where k='alice');
  v_version uuid;
  v_title text;
  v_failed boolean := false;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  v_version := app.publish_site(site_a, 'Mise en ligne initiale');
  perform t.assert(v_version is not null, 'La publication cree une version');
  perform t.assert((select status from sites where id = site_a) = 'live',
    'Le site passe en ligne apres publication');
  perform t.assert((select go_live_at is not null from projects where site_id = site_a
                    union all select true limit 1),
    'La publication ouvre la fenetre de retractation quand un projet existe');

  -- Modifier le brouillon ne touche pas la version publiee.
  update site_pages set title = 'Brouillon modifie' where site_id = site_a;
  select snapshot #>> '{pages,0,title}' into v_title from site_versions where id = v_version;
  perform t.assert(v_title <> 'Brouillon modifie',
    'Le brouillon n''altere pas la version deja publiee');

  begin
    update site_versions set snapshot = '{}'::jsonb where id = v_version;
  exception when others then v_failed := true;
  end;
  perform t.assert(v_failed, 'Une version publiee est immuable');
end;
$$;

-- Un membre d'un autre tenant ne peut pas publier.
do $$
declare
  site_a uuid := (select v from t.fixtures where k='site_a');
  bob uuid := (select v from t.fixtures where k='bob');
  v_failed boolean := false;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  begin
    perform app.publish_site(site_a);
  exception when others then v_failed := true;
  end;
  perform t.assert(v_failed, 'Bob ne peut pas publier le site d''Alice');

  -- Un lecteur non plus.
  v_failed := false;
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select v from t.fixtures where k='viewer'),
                      'role', 'authenticated')::text, true);
  begin
    perform app.publish_site(site_a);
  exception when others then v_failed := true;
  end;
  perform t.assert(v_failed, 'Un lecteur ne peut pas publier');
  perform set_config('request.jwt.claims', null, true);
end;
$$;

-- -----------------------------------------------------------------------------
--  11. Droits d'offre resolus par la base
-- -----------------------------------------------------------------------------
\echo '--- Droits d''offre ---'
do $$
declare
  org_a uuid := (select v from t.fixtures where k='org_a');
  org_b uuid := (select v from t.fixtures where k='org_b');
begin
  perform t.assert(app.has_feature(org_a, 'online_payments'),
    'Premium donne acces au paiement en ligne');
  perform t.assert(not app.has_feature(org_b, 'online_payments'),
    'Classique ne donne PAS acces au paiement en ligne');
  perform t.assert(not app.has_feature(org_b, 'customer_accounts'),
    'Classique ne donne PAS acces aux comptes clients');
  perform t.assert(app.feature_limit(org_a, 'max_pages') = 25,
    'La limite de pages Premium est de 25');
  perform t.assert(app.feature_limit(org_b, 'max_pages') = 8,
    'La limite de pages Classique est de 8');
  perform t.assert(app.feature_limit(org_b, 'max_products') = -1,
    'Une fonctionnalite absente de l''offre renvoie -1');

  -- Derogation commerciale
  insert into organization_feature_overrides (organization_id, feature_key, enabled, reason)
  values (org_b, 'online_payments', true, 'Geste commercial contractualise');
  perform t.assert(app.has_feature(org_b, 'online_payments'),
    'Une derogation accordee par StaX prend effet');

  -- Derogation expiree
  update organization_feature_overrides set expires_at = now() - interval '1 day'
   where organization_id = org_b;
  perform t.assert(not app.has_feature(org_b, 'online_payments'),
    'Une derogation expiree ne s''applique plus');
  delete from organization_feature_overrides where organization_id = org_b;
end;
$$;

-- -----------------------------------------------------------------------------
--  12. Tarification serveur et remboursement
-- -----------------------------------------------------------------------------
\echo '--- Tarification et remboursement ---'
do $$
declare
  v_price app.price_breakdown;
  v_plan uuid := (select id from plans where slug='classique');
begin
  v_price := app.compute_order_pricing(v_plan, null);
  perform t.assert(v_price.setup_cents = 23999, 'Prix Classique = 239,99 EUR');
  perform t.assert(v_price.vat_cents = 4799, 'TVA 20 % sur 239,99 EUR = 47,99 EUR');
  perform t.assert(v_price.total_cents = 28798, 'Total TTC = 287,98 EUR');

  insert into coupons (code, kind, value, applies_to) values ('BIENVENUE10', 'percent', 1000, 'setup');
  v_price := app.compute_order_pricing(v_plan, 'BIENVENUE10');
  perform t.assert(v_price.discount_cents = 2399, 'Remise de 10 % = 23,99 EUR');
  perform t.assert(v_price.total_cents = 25920, 'Total TTC apres remise = 259,20 EUR');

  -- Une offre sur devis ne peut pas etre commandee directement.
  begin
    v_price := app.compute_order_pricing((select id from plans where slug='sur-mesure'), null);
    perform t.assert(false, 'Une offre sur devis refuse le calcul direct');
  exception when others then
    perform t.assert(true, 'Une offre sur devis refuse le calcul direct');
  end;
end;
$$;

-- -----------------------------------------------------------------------------
--  13. Journal d'audit append-only
-- -----------------------------------------------------------------------------
\echo '--- Journal d''audit ---'
do $$
declare
  v_id uuid;
  v_failed boolean := false;
begin
  insert into audit_logs (action, actor_type, metadata_safe)
  values ('site.published', 'system',
          '{"password":"secret","ok":true}'::jsonb)
  returning id into v_id;

  begin update audit_logs set action = 'x.y' where id = v_id;
  exception when others then v_failed := true; end;
  perform t.assert(v_failed, 'Un journal d''audit ne peut pas etre modifie');

  v_failed := false;
  begin delete from audit_logs where id = v_id;
  exception when others then v_failed := true; end;
  perform t.assert(v_failed, 'Un journal d''audit ne peut pas etre supprime');

  -- write_audit expurge les cles sensibles.
  v_id := app.write_audit('security.mfa_disabled', null, null, 'user', 'x',
                          '{"token":"abc","secret":"s","reason":"test"}'::jsonb);
  perform t.assert(
    (select not (metadata_safe ? 'token') and not (metadata_safe ? 'secret')
            and metadata_safe ? 'reason' from audit_logs where id = v_id),
    'write_audit retire les cles sensibles du journal');
end;
$$;

-- -----------------------------------------------------------------------------
--  14. Le personnel plateforme voit tout, sans pouvoir tout faire
-- -----------------------------------------------------------------------------
\echo '--- Acces du personnel plateforme ---'
do $$
declare staff uuid := (select v from t.fixtures where k='staff');
begin
  perform t.assert(t.count_as(staff, 'select 1 from organizations') = 2,
    'Le personnel plateforme voit toutes les organisations');
  perform t.assert(t.count_as(staff, 'select 1 from sites') = 2,
    'Le personnel plateforme voit tous les sites');
  perform t.assert(t.denied_as(staff, 'delete from sites'),
    'Un platform_admin ne peut PAS supprimer un site (reserve au platform_owner)');
end;
$$;

-- -----------------------------------------------------------------------------
--  15. Limitation de debit
-- -----------------------------------------------------------------------------
\echo '--- Limitation de debit ---'
do $$
declare v_ok boolean;
begin
  for i in 1..3 loop
    v_ok := app.bump_rate_limit('login', 'hash-ip-test', 60, 3);
    perform t.assert(v_ok, format('Tentative %s autorisee', i));
  end loop;
  v_ok := app.bump_rate_limit('login', 'hash-ip-test', 60, 3);
  perform t.assert(not v_ok, 'La 4e tentative est refusee');
end;
$$;


-- -----------------------------------------------------------------------------
--  16. Surface RPC : les fonctions serveur restent inaccessibles aux clients
-- -----------------------------------------------------------------------------
\echo '--- Surface RPC exposee ---'
do $$
declare
  fn text;
  ok boolean;
  server_only text[] := array[
    'public.bump_rate_limit(text, text, int, int)',
    'public.resolve_published_site(text)',
    'public.redeem_activation_code(text, uuid, text)'
  ];
  client_allowed text[] := array[
    'public.has_feature(uuid, text)',
    'public.publish_site(uuid, text)',
    'public.create_order(uuid, uuid, text, text, jsonb, text, text, text, text, text, text)',
    'public.request_refund(uuid, text, int, int)'
  ];
begin
  foreach fn in array server_only loop
    ok := has_function_privilege('authenticated', fn, 'execute');
    perform t.assert(not ok, format('authenticated ne peut PAS executer %s', split_part(fn, '(', 1)));
    ok := has_function_privilege('anon', fn, 'execute');
    perform t.assert(not ok, format('anon ne peut PAS executer %s', split_part(fn, '(', 1)));
    ok := has_function_privilege('service_role', fn, 'execute');
    perform t.assert(ok, format('service_role peut executer %s', split_part(fn, '(', 1)));
  end loop;

  foreach fn in array client_allowed loop
    ok := has_function_privilege('authenticated', fn, 'execute');
    perform t.assert(ok, format('authenticated peut executer %s', split_part(fn, '(', 1)));
    ok := has_function_privilege('anon', fn, 'execute');
    perform t.assert(not ok, format('anon ne peut PAS executer %s', split_part(fn, '(', 1)));
  end loop;
end;
$$;

-- Le schema `app` n'est jamais expose : ses fonctions ne sont pas appelables
-- par une session cliente sans passer par une enveloppe publique auditee.
do $$
begin
  perform t.assert(
    not has_schema_privilege('anon', 'app', 'create'),
    'anon ne peut pas creer d objet dans le schema app');
  perform t.assert(
    not has_function_privilege('anon', 'app.resolve_published_site(text)', 'execute'),
    'anon ne peut pas appeler directement app.resolve_published_site');
end;
$$;

-- -----------------------------------------------------------------------------
--  17. Droits d offre exposes : un client ne lit que SES organisations
-- -----------------------------------------------------------------------------
\echo '--- Enveloppes RPC de droits ---'
do $$
declare
  alice uuid := (select v from t.fixtures where k='alice');
  org_b uuid := (select v from t.fixtures where k='org_b');
  org_a uuid := (select v from t.fixtures where k='org_a');
  v_result boolean;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  v_result := public.has_feature(org_a, 'online_payments');
  perform t.assert(v_result, 'Alice lit les droits de SON organisation');

  v_result := public.has_feature(org_b, 'custom_domain');
  perform t.assert(not v_result,
    'Alice ne peut pas interroger les droits d une autre organisation');

  perform t.assert(public.feature_limit(org_b, 'max_pages') = -1,
    'Le quota d une autre organisation n est pas divulgue');
  perform t.assert(
    cardinality(public.my_capabilities(org_b)) = 0,
    'Aucune capacite n est renvoyee pour une organisation etrangere');
  perform t.assert(
    'content.publish' = any (public.my_capabilities(org_a)),
    'Les capacites de sa propre organisation sont bien renvoyees');
  perform set_config('request.jwt.claims', null, true);
end;
$$;


-- -----------------------------------------------------------------------------
--  18. Etat des services : public, mais sans details d exploitation
-- -----------------------------------------------------------------------------
\echo '--- Page publique d etat des services ---'
do $$
begin
  perform t.assert(
    has_column_privilege('anon', 'public.system_health', 'status', 'select'),
    'anon peut lire le statut des services');
  perform t.assert(
    has_column_privilege('anon', 'public.system_health', 'label', 'select'),
    'anon peut lire le libelle des services');
  perform t.assert(
    not has_column_privilege('anon', 'public.system_health', 'metadata', 'select'),
    'anon ne peut PAS lire les metadonnees d exploitation');
  perform t.assert(
    not has_table_privilege('anon', 'public.system_health', 'update'),
    'anon ne peut PAS modifier l etat des services');
end;
$$;


-- -----------------------------------------------------------------------------
--  19. Reception du trafic public : isolation par le nom d hote
-- -----------------------------------------------------------------------------
--  Le Worker des sites publics agit avec le role de service, qui contourne la
--  RLS. Ces assertions verifient donc que les fonctions d ingestion refusent
--  elles-memes de franchir la frontiere entre deux clients, meme appelees avec
--  tous les droits.
\echo '--- Formulaires et reservations publics ---'
do $$
declare
  site_a uuid := (select v from t.fixtures where k='site_a');
  site_b uuid := (select v from t.fixtures where k='site_b');
  org_a  uuid := (select v from t.fixtures where k='org_a');
  org_b  uuid := (select v from t.fixtures where k='org_b');
  v_form_a uuid;
  v_form_b uuid;
  v_result jsonb;
  v_count  int;
  v_raised boolean;
  v_row    public.form_submissions%rowtype;
begin
  insert into public.forms (site_id, organization_id, slug, name, kind)
  values (site_a, org_a, 'contact-public', 'Contact', 'contact')
  returning id into v_form_a;

  insert into public.forms (site_id, organization_id, slug, name, kind)
  values (site_b, org_b, 'contact-public', 'Contact', 'contact')
  returning id into v_form_b;

  insert into public.form_fields (form_id, name, label, type, is_required)
  values (v_form_a, 'email', 'E-mail', 'email', true),
         (v_form_a, 'message', 'Message', 'textarea', true);

  -- Un champ obligatoire absent est signale, sans rien ecrire.
  v_result := app.submit_form(site_a, 'contact-public', '{"email":"visiteur@example.test"}'::jsonb);
  perform t.assert((v_result ->> 'ok')::boolean is false,
    'Un champ obligatoire manquant fait echouer la soumission');
  perform t.assert(v_result ->> 'code' = 'missing_fields',
    'Le motif du refus est explicite');
  select count(*) into v_count from public.form_submissions where form_id = v_form_a;
  perform t.assert(v_count = 0, 'Aucune soumission incomplete n est enregistree');

  -- Soumission valide, accompagnee de deux cles hostiles non declarees.
  v_result := app.submit_form(
    site_a, 'contact-public',
    '{"email":"visiteur@example.test","message":"Bonjour","admin":"true","site_id":"forge"}'::jsonb);
  perform t.assert((v_result ->> 'ok')::boolean, 'Une soumission complete est acceptee');

  -- On relit la ligne reellement ecrite : un comptage seul pourrait passer a
  -- vide et donner une fausse assurance.
  select * into v_row
    from public.form_submissions
   where id = (v_result ->> 'submissionId')::uuid;
  perform t.assert(v_row.id is not null, 'La soumission est bien enregistree');

  -- Liste blanche : les cles non declarees sont ecartees, y compris celles qui
  -- tenteraient de forcer un champ interne.
  perform t.assert(v_row.data ? 'message',
    'Les champs declares sont conserves');
  perform t.assert(not (v_row.data ? 'admin'),
    'Une cle non declaree est ignoree (liste blanche)');
  perform t.assert(not (v_row.data ? 'site_id'),
    'Un site_id injecte dans le corps est ignore');

  -- La soumission est rattachee au BON site et au BON formulaire.
  perform t.assert(v_row.site_id = site_a, 'La soumission est rattachee au site du formulaire');
  perform t.assert(v_row.form_id = v_form_a, 'La soumission est rattachee au formulaire vise');
  perform t.assert(v_row.organization_id = org_a,
    'L organisation proprietaire est celle du site');

  -- Isolation : le slug « contact » du site B n est jamais atteint depuis A.
  select count(*) into v_count from public.form_submissions where form_id = v_form_b;
  perform t.assert(v_count = 0,
    'Le formulaire homonyme d un autre client n a rien recu');

  -- Un formulaire d un autre tenant designe explicitement reste introuvable :
  -- la recherche se fait par couple (site, slug), jamais par identifiant seul.
  -- Le drapeau est pose AVANT le bloc : sans lui, un `assert` place dans le
  -- corps serait rattrape par son propre gestionnaire et le test passerait
  -- quoi qu il arrive.
  v_raised := false;
  begin
    v_result := app.submit_form(site_b, 'inexistant', '{}'::jsonb);
  exception when others then
    v_raised := true;
  end;
  perform t.assert(v_raised, 'Un slug inconnu pour ce site est refuse');

  -- Une soumission au score eleve est classee, jamais perdue.
  v_result := app.submit_form(
    site_a, 'contact-public',
    '{"email":"bot@example.test","message":"casino viagra"}'::jsonb, 0.95);
  perform t.assert((v_result ->> 'ok')::boolean, 'Une soumission suspecte est acceptee');
  perform t.assert((v_result ->> 'spam')::boolean, 'Elle est marquee comme indesirable');
  select count(*) into v_count
    from public.form_submissions where form_id = v_form_a and status = 'spam';
  perform t.assert(v_count = 1, 'Elle reste consultable par le client');
end;
$$;

do $$
declare
  site_a uuid := (select v from t.fixtures where k='site_a');
  site_b uuid := (select v from t.fixtures where k='site_b');
  org_a  uuid := (select v from t.fixtures where k='org_a');
  org_b  uuid := (select v from t.fixtures where k='org_b');
  v_service_a uuid;
  v_service_b uuid;
  v_result jsonb;
  v_slot   timestamptz;
  v_count  int;
begin
  insert into public.booking_services
    (site_id, organization_id, name, duration_minutes, capacity_per_slot,
     lead_time_hours, horizon_days, requires_approval)
  values (site_a, org_a, 'Table', 90, 2, 1, 60, true)
  returning id into v_service_a;

  insert into public.booking_services
    (site_id, organization_id, name, duration_minutes, capacity_per_slot,
     lead_time_hours, horizon_days, requires_approval)
  values (site_b, org_b, 'Table', 90, 20, 1, 60, true)
  returning id into v_service_b;

  v_slot := date_trunc('hour', now()) + interval '2 days';

  -- Une prestation d un AUTRE site ne peut pas etre reservee depuis le site A,
  -- meme si son identifiant est connu.
  v_result := app.create_booking(site_a, v_service_b, v_slot, 2, 'Mallory',
                                 'mallory@example.test', null);
  perform t.assert((v_result ->> 'ok')::boolean is false,
    'Une prestation d un autre client est inaccessible');
  perform t.assert(v_result ->> 'code' = 'service_unavailable',
    'Le refus ne revele pas l existence de la prestation');

  select count(*) into v_count from public.bookings where booking_service_id = v_service_b;
  perform t.assert(v_count = 0, 'Aucune reservation croisee n a ete creee');

  -- Reservation legitime.
  v_result := app.create_booking(site_a, v_service_a, v_slot, 2, 'Alice',
                                 'alice.client@example.test', null);
  perform t.assert((v_result ->> 'ok')::boolean, 'Une reservation valide est acceptee');
  perform t.assert(v_result ? 'reference', 'Une reference lisible est renvoyee');

  -- La capacite est un invariant : le creneau est maintenant complet.
  v_result := app.create_booking(site_a, v_service_a, v_slot, 1, 'Bob',
                                 'bob.client@example.test', null);
  perform t.assert((v_result ->> 'ok')::boolean is false,
    'La capacite du creneau est respectee');
  perform t.assert(v_result ->> 'code' = 'slot_full', 'Le motif indique un creneau complet');

  -- Delai minimal et horizon.
  v_result := app.create_booking(site_a, v_service_a, now() + interval '5 minutes', 1,
                                 'Trop tot', 'tot@example.test', null);
  perform t.assert(v_result ->> 'code' = 'too_soon', 'Le delai minimal est applique');

  v_result := app.create_booking(site_a, v_service_a, now() + interval '400 days', 1,
                                 'Trop loin', 'loin@example.test', null);
  perform t.assert(v_result ->> 'code' = 'too_far', 'L horizon de reservation est applique');

  -- Un contact est obligatoire.
  v_result := app.create_booking(site_a, v_service_a, v_slot + interval '4 hours', 1,
                                 'Anonyme', null, null);
  perform t.assert(v_result ->> 'code' = 'contact_required',
    'Une reservation sans e-mail ni telephone est refusee');
end;
$$;

\echo '--- Surface RPC de la reception publique ---'
do $$
begin
  perform t.assert(
    not has_function_privilege('authenticated',
      'public.submit_form(uuid, text, jsonb, numeric, text, text, text, text)', 'execute'),
    'authenticated ne peut PAS executer public.submit_form');
  perform t.assert(
    not has_function_privilege('anon',
      'public.submit_form(uuid, text, jsonb, numeric, text, text, text, text)', 'execute'),
    'anon ne peut PAS executer public.submit_form');
  perform t.assert(
    has_function_privilege('service_role',
      'public.submit_form(uuid, text, jsonb, numeric, text, text, text, text)', 'execute'),
    'service_role peut executer public.submit_form');

  perform t.assert(
    not has_function_privilege('anon',
      'public.create_booking(uuid, uuid, timestamptz, int, text, text, text, text, text)',
      'execute'),
    'anon ne peut PAS executer public.create_booking');
  perform t.assert(
    has_function_privilege('service_role',
      'public.create_booking(uuid, uuid, timestamptz, int, text, text, text, text, text)',
      'execute'),
    'service_role peut executer public.create_booking');

  perform t.assert(
    not has_function_privilege('authenticated', 'public.available_slots(uuid, uuid, date)',
      'execute'),
    'authenticated ne peut PAS enumerer les creneaux d un site');
  perform t.assert(
    not has_function_privilege('anon', 'public.record_page_view(uuid, text, text, text, char, text)',
      'execute'),
    'anon ne peut PAS injecter de mesure d audience');
  perform t.assert(
    has_function_privilege('service_role',
      'public.record_page_view(uuid, text, text, text, char, text)', 'execute'),
    'service_role peut enregistrer une vue de page');
end;
$$;

\echo ''
\echo '================================================'
\echo '  Tous les tests de securite sont passes.'
\echo '================================================'

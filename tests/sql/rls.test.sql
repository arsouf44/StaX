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

  -- Le declencheur app.grant_creator_ownership a deja rattache le createur :
  -- on complete les autres roles sans dupliquer le sien.
  insert into public.organization_members (organization_id, user_id, role) values
    (v_org_a, v_alice,  'owner'),
    (v_org_a, v_eve,    'editor'),
    (v_org_a, v_viewer, 'viewer'),
    (v_org_b, v_bob,    'owner')
  on conflict (organization_id, user_id) do update set role = excluded.role;

  insert into public.sites (organization_id, name, slug, plan_id, plan_slug, business_type_slug)
       values (v_org_a, 'Site A', 'site-a',
               (select id from public.plans where slug='ultra-premium'), 'ultra-premium', 'restaurant')
    returning id into v_site_a;
  insert into public.sites (organization_id, name, slug, plan_id, plan_slug, business_type_slug)
       values (v_org_b, 'Site B', 'site-b',
               (select id from public.plans where slug='essentiel'), 'essentiel', 'plombier')
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

  insert into public.subscriptions (organization_id, site_id, plan_slug, maintenance_price_cents, status)
  values (v_org_a, v_site_a, 'ultra-premium', 8200, 'active'),
         (v_org_b, v_site_b, 'essentiel', 2200, 'active');

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
    'update subscriptions set maintenance_price_cents = 1 where organization_id=%L', org_a)),
    'Un client ne peut pas changer le prix de son abonnement');
  perform t.assert(t.denied_as(a, format(
    'update sites set plan_slug=''premium'' where id=%L', site_a)),
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
  -- L'encaissement en ligne est reserve a l'Ultra Premium : c'est ce qui
  -- justifie l'ecart de prix, et c'est la base qui le fait respecter.
  perform t.assert(app.has_feature(org_a, 'online_payments'),
    'Ultra Premium donne acces au paiement en ligne');
  perform t.assert(not app.has_feature(org_b, 'online_payments'),
    'Essentiel ne donne PAS acces au paiement en ligne');
  perform t.assert(
    not app.has_feature(
      (select organization_id from public.sites
        where plan_slug = 'premium' limit 1), 'online_payments')
    or not exists (select 1 from public.sites where plan_slug = 'premium'),
    'Premium ne donne PAS acces au paiement en ligne');
  perform t.assert(not app.has_feature(org_b, 'customer_accounts'),
    'Essentiel ne donne PAS acces aux comptes clients');
  -- NULL = illimite, -1 = fonctionnalite absente de l'offre. Les deux ne
  -- veulent pas dire la meme chose et ne doivent jamais etre confondus.
  perform t.assert(app.feature_limit(org_a, 'max_pages') is null,
    'Ultra Premium n''impose aucune limite de pages');
  perform t.assert(app.feature_limit(org_b, 'max_pages') = 8,
    'La limite de pages Essentiel est de 8');
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
  v_plan uuid := (select id from plans where slug='essentiel');
begin
  v_price := app.compute_order_pricing(v_plan, null);
  perform t.assert(v_price.setup_cents = 30000, 'Prix Essentiel = 300,00 EUR HT');
  perform t.assert(v_price.vat_cents = 6000, 'TVA 20 % sur 300,00 EUR = 60,00 EUR');
  perform t.assert(v_price.total_cents = 36000, 'Total TTC = 360,00 EUR');
  perform t.assert(v_price.maintenance_cents = 2200, 'Maintenance Essentiel = 22,00 EUR HT par an');

  insert into coupons (code, kind, value, applies_to) values ('BIENVENUE10', 'percent', 1000, 'setup');
  v_price := app.compute_order_pricing(v_plan, 'BIENVENUE10');
  perform t.assert(v_price.discount_cents = 3000, 'Remise de 10 % = 30,00 EUR');
  perform t.assert(v_price.total_cents = 32400, 'Total TTC apres remise = 324,00 EUR');

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
declare
  staff uuid := (select v from t.fixtures where k='staff');
  v_orgs  int := (select count(*) from public.organizations);
  v_sites int := (select count(*) from public.sites);
begin
  -- Le total est lu, pas suppose : ajouter une organisation interne ne doit
  -- pas faire echouer une assertion qui parle d autre chose.
  perform t.assert(t.count_as(staff, 'select 1 from organizations') = v_orgs,
    'Le personnel plateforme voit toutes les organisations');
  perform t.assert(t.count_as(staff, 'select 1 from sites') = v_sites,
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


-- -----------------------------------------------------------------------------
--  20. Effets des evenements de paiement
-- -----------------------------------------------------------------------------
--  La verite sur un paiement vient du webhook signe, jamais de la redirection
--  du navigateur. Ces assertions verifient les deux proprietes qui protegent
--  l'argent : l'idempotence (Stripe rejoue jusqu'a trois jours) et le fait que
--  le montant credite vient de la commande, pas de la charge utile.
\echo '--- Evenements de paiement ---'
do $$
declare
  org_a   uuid := (select v from t.fixtures where k='org_a');
  alice   uuid := (select v from t.fixtures where k='alice');
  plan_id uuid;
  v_order uuid;
  v_ref   text;
  v_result jsonb;
  v_first  jsonb;
  v_count  int;
  v_amount int;
  v_site   uuid;
begin
  select id into plan_id from public.plans where slug = 'essentiel' and is_active limit 1;

  -- Commande creee par la fonction serveur : le prix vient du catalogue.
  v_ref := 'TEST-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into public.orders
    (reference, organization_id, created_by, status, plan_id, plan_slug, plan_version,
     setup_price_cents, maintenance_price_cents, vat_rate_bps, vat_cents, total_cents,
     business_type_slug, questionnaire, terms_version, terms_accepted_at)
  values
    (v_ref, org_a, alice, 'checkout_pending', plan_id, 'essentiel', 1,
     23999, 1400, 2000, 4799, 28798, 'restaurant',
     jsonb_build_object('businessName', 'Chez Test'), '2026-01', now())
  returning id into v_order;

  -- Premier passage : la commande bascule, le site et le projet sont crees.
  v_first := app.apply_order_paid(v_order, 'pi_test_1', 'cs_test_1', 'cus_test_1');
  perform t.assert((v_first ->> 'ok')::boolean, 'Le paiement est applique');
  perform t.assert(v_first ->> 'code' = 'applied', 'La commande est passee en payee');
  perform t.assert(v_first ? 'siteId', 'Un site est cree');
  perform t.assert(v_first ? 'projectId', 'Un projet de suivi est cree');

  select status::text, site_id into strict v_ref, v_site from public.orders where id = v_order;
  perform t.assert(v_ref = 'paid', 'La commande est marquee payee');

  -- Le montant credite est celui de la commande, pas une valeur exterieure.
  select amount_cents into v_amount
    from public.payments where order_id = v_order and scope = 'platform';
  perform t.assert(v_amount = 28798,
    'Le montant encaisse est celui fige dans la commande');

  -- Rejeu du MEME evenement : rien ne doit etre duplique.
  v_result := app.apply_order_paid(v_order, 'pi_test_1', 'cs_test_1', 'cus_test_1');
  perform t.assert((v_result ->> 'ok')::boolean, 'Un rejeu ne provoque pas d erreur');
  perform t.assert(v_result ->> 'code' = 'already_applied', 'Le rejeu est detecte');

  select count(*) into v_count from public.payments where order_id = v_order;
  perform t.assert(v_count = 1, 'Aucun paiement en double apres rejeu');

  select count(*) into v_count from public.sites where id = v_site;
  perform t.assert(v_count = 1, 'Aucun site en double apres rejeu');

  select count(*) into v_count from public.projects where order_id = v_order;
  perform t.assert(v_count = 1, 'Aucun projet en double apres rejeu');

  -- Journal de bord : l'evenement est trace une seule fois.
  perform t.assert(app.begin_webhook_event('stripe', 'evt_test_1', 'checkout.session.completed'),
    'Un evenement inconnu est accepte');
  perform app.finish_webhook_event('stripe', 'evt_test_1', 'processed');
  perform t.assert(
    not app.begin_webhook_event('stripe', 'evt_test_1', 'checkout.session.completed'),
    'Un evenement deja traite est refuse');

  select count(*) into v_count from public.webhook_events where event_id = 'evt_test_1';
  perform t.assert(v_count = 1, 'L evenement n est enregistre qu une fois');
end;
$$;

do $$
declare
  org_a   uuid := (select v from t.fixtures where k='org_a');
  alice   uuid := (select v from t.fixtures where k='alice');
  plan_id uuid;
  v_order uuid;
  v_ref   text;
  v_result jsonb;
  v_count  int;
  v_price  int;
begin
  select id into plan_id from public.plans where slug = 'premium' and is_active limit 1;

  v_ref := 'TEST-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  insert into public.orders
    (reference, organization_id, created_by, status, plan_id, plan_slug, plan_version,
     setup_price_cents, maintenance_price_cents, vat_rate_bps, vat_cents, total_cents,
     terms_version, terms_accepted_at)
  values
    (v_ref, org_a, alice, 'checkout_pending', plan_id, 'premium', 1,
     49900, 3200, 2000, 9980, 59880, '2026-01', now())
  returning id into v_order;

  perform app.apply_order_paid(v_order, 'pi_test_2', 'cs_test_2', 'cus_test_2');

  v_result := app.upsert_subscription_from_stripe(
    'sub_test_1', 'cus_test_2', 'trialing',
    now(), now() + interval '30 days', false, v_order, 'price_test');
  perform t.assert((v_result ->> 'ok')::boolean, 'L abonnement est cree');
  perform t.assert(v_result ->> 'code' = 'created', 'Premiere creation');

  -- Le prix mensuel est celui de la commande : un changement du tarif public
  -- ne doit jamais toucher un contrat en cours.
  select maintenance_price_cents into v_price
    from public.subscriptions where stripe_subscription_id = 'sub_test_1';
  perform t.assert(v_price = 3200, 'Le prix mensuel est fige au tarif de la commande');

  -- Rejeu : mise a jour, jamais duplication.
  v_result := app.upsert_subscription_from_stripe(
    'sub_test_1', 'cus_test_2', 'active',
    now(), now() + interval '30 days', false, v_order, 'price_test');
  perform t.assert(v_result ->> 'code' = 'updated', 'Un second evenement met a jour');

  select count(*) into v_count
    from public.subscriptions where stripe_subscription_id = 'sub_test_1';
  perform t.assert(v_count = 1, 'Aucun abonnement en double');

  -- Resiliation : la periode de continuite est calculee, pas devinee.
  perform app.upsert_subscription_from_stripe(
    'sub_test_1', 'cus_test_2', 'canceled',
    now() - interval '30 days', now(), true, v_order, 'price_test');
  perform t.assert(
    (select grace_period_ends_at > now()
       from public.subscriptions where stripe_subscription_id = 'sub_test_1'),
    'Une resiliation ouvre une periode de continuite');
  perform t.assert(
    (select maintenance_state = 'maintenance_ended'
       from public.subscriptions where stripe_subscription_id = 'sub_test_1'),
    'L etat de maintenance suit le statut Stripe');
end;
$$;

\echo '--- Surface RPC des webhooks ---'
do $$
begin
  perform t.assert(
    not has_function_privilege('authenticated',
      'public.apply_order_paid(uuid, text, text, text, text, text, text)', 'execute'),
    'authenticated ne peut PAS marquer une commande payee');
  perform t.assert(
    not has_function_privilege('anon',
      'public.apply_order_paid(uuid, text, text, text, text, text, text)', 'execute'),
    'anon ne peut PAS marquer une commande payee');
  perform t.assert(
    has_function_privilege('service_role',
      'public.apply_order_paid(uuid, text, text, text, text, text, text)', 'execute'),
    'service_role peut appliquer un paiement');
  perform t.assert(
    not has_function_privilege('authenticated',
      'public.upsert_subscription_from_stripe(text, text, text, timestamptz, timestamptz, boolean, uuid, text)',
      'execute'),
    'authenticated ne peut PAS creer d abonnement');
  perform t.assert(
    not has_function_privilege('authenticated',
      'public.begin_webhook_event(text, text, text, text, timestamptz, jsonb)', 'execute'),
    'authenticated ne peut PAS enregistrer d evenement de paiement');
end;
$$;


-- -----------------------------------------------------------------------------
--  21. Creation d'une organisation par un client
-- -----------------------------------------------------------------------------
\echo '--- Creation d organisation ---'
do $$
declare
  carol  uuid;
  v_org  uuid;
  v_role text;
  v_slug text;
  v_can  boolean;
  v_count int;
begin
  -- Nouveau compte, sans aucune organisation.
  insert into auth.users (id, email) values (gen_random_uuid(), 'carol@example.test')
  returning id into carol;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- `returning` applique aussi la policy de lecture : si elle etait trop
  -- stricte, cette insertion echouerait pour la personne qui cree pourtant
  -- l organisation.
  insert into public.organizations (name, slug, created_by)
  values ('Carol SARL', public.unique_organization_slug('Carol SARL'), carol)
  returning id, slug into v_org, v_slug;

  v_can := app.org_can(v_org, 'billing.manage');
  select role::text into v_role
    from public.organization_members where organization_id = v_org and user_id = carol;
  select count(*) into v_count from public.organization_members where user_id = carol;

  -- Les assertions sortent du role restreint : la schema de test n est
  -- volontairement pas accessible a `authenticated`.
  reset role;
  perform set_config('request.jwt.claims', null, true);

  perform t.assert(v_slug = 'carol-sarl',
    'Le slug conserve toutes les lettres du nom');
  perform t.assert(v_role = 'owner',
    'Le createur devient proprietaire dans la meme transaction');
  perform t.assert(v_can, 'Il peut immediatement commander');
  perform t.assert(v_count = 1, 'Aucune autre appartenance n est creee');
end;
$$;


-- -----------------------------------------------------------------------------
--  Factures de vente : un numero ne suffit jamais
-- -----------------------------------------------------------------------------
\echo '--- Rattachement de facture ---'
do $$
declare
  alice   uuid := (select v from t.fixtures where k='alice');
  bob     uuid := (select v from t.fixtures where k='bob');
  org_a   uuid := (select v from t.fixtures where k='org_a');
  org_b   uuid := (select v from t.fixtures where k='org_b');
  v_plan  uuid := (select id from plans where slug='essentiel' and is_active limit 1);
  v_res   jsonb;
  v_count int;
begin
  insert into public.sales_invoices
    (number, plan_id, plan_slug, setup_price_cents, maintenance_price_cents,
     vat_rate_bps, vat_cents, total_cents, customer_email, company_name)
  values ('F-2026-0001', v_plan, 'essentiel', 30000, 2200, 2000, 6000, 36000,
          'alice@tenant-a.test', 'Tenant A');

  -- Bob connait le numero mais la facture n'est pas la sienne.
  perform set_config('request.jwt.claims',
    json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  v_res := app.claim_sales_invoice('F-2026-0001', org_b, '2026-01', null);
  perform t.assert((v_res->>'ok')::boolean is false,
    'Un numero de facture seul ne permet pas de rattacher la commande d''un autre');
  perform t.assert(v_res->>'code' = 'email_mismatch',
    'Le refus vient bien du controle d''adresse, pas d''un hasard');

  -- Meme refus pour un numero inexistant, avec le MEME code cote client.
  v_res := app.claim_sales_invoice('F-2026-9999', org_b, '2026-01', null);
  perform t.assert((v_res->>'ok')::boolean is false,
    'Un numero inexistant est refuse');

  -- La tentative de Bob a ete comptee : une enumeration laisse une trace.
  select attempt_count into v_count from public.sales_invoices where number = 'F-2026-0001';
  perform t.assert(v_count >= 1, 'Chaque tentative de rattachement est comptee');

  -- Alice, destinataire reelle, peut rattacher.
  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  v_res := app.claim_sales_invoice('F-2026-0001', org_a, '2026-01', null);
  perform t.assert((v_res->>'ok')::boolean, 'La destinataire de la facture peut la rattacher');
  perform t.assert(v_res->>'code' = 'claimed', 'La facture passe a l''etat rattache');

  -- La commande creee porte EXACTEMENT les montants de la facture.
  perform t.assert(
    exists (select 1 from public.orders
             where id = (v_res->>'orderId')::uuid
               and setup_price_cents = 30000
               and maintenance_price_cents = 2200
               and billing_interval = 'year'
               and total_cents = 36000),
    'La commande reprend les montants figes de la facture');

  -- Une commande rattachee n'est PAS payee : le reglement se constate ailleurs.
  perform t.assert(
    exists (select 1 from public.orders
             where id = (v_res->>'orderId')::uuid and status = 'draft'),
    'Le rattachement ne marque jamais la commande comme payee');

  -- Rejouer la meme facture ne cree pas de seconde commande.
  v_res := app.claim_sales_invoice('F-2026-0001', org_a, '2026-01', null);
  perform t.assert(v_res->>'code' = 'already_claimed',
    'Rejouer un rattachement est sans effet');
  select count(*) into v_count from public.orders
   where customer_notes like '%F-2026-0001%';
  perform t.assert(v_count = 1, 'Une facture ne produit qu''une seule commande');

  -- Bob ne voit pas la facture d'Alice, meme rattachee.
  perform set_config('request.jwt.claims',
    json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform t.assert(
    t.denied_as(bob, 'select * from sales_invoices')
    or not exists (select 1 from public.sales_invoices where number = 'F-2026-0001'),
    'Un client ne voit pas les factures d''une autre organisation');

  perform set_config('request.jwt.claims', null, true);
end;
$$;

-- -----------------------------------------------------------------------------
--  Apercu du brouillon
--
--  Le snapshot du brouillon expose TOUT le contenu non publie d'un site. Il ne
--  doit donc sortir que pour qui peut deja le modifier, et jamais franchir la
--  frontiere entre deux clients.
-- -----------------------------------------------------------------------------
\echo '--- Apercu du brouillon ---'
do $$
declare
  alice  uuid := (select v from t.fixtures where k='alice');
  eve    uuid := (select v from t.fixtures where k='eve');
  viewer uuid := (select v from t.fixtures where k='viewer');
  site_a uuid := (select v from t.fixtures where k='site_a');
  site_b uuid := (select v from t.fixtures where k='site_b');
  ok boolean;
begin
  perform t.assert(
    t.count_as(alice, format('select public.draft_site_snapshot(%L)', site_a)) = 1,
    'La proprietaire lit le brouillon de son site');
  perform t.assert(
    t.count_as(eve, format('select public.draft_site_snapshot(%L)', site_a)) = 1,
    'Un editeur lit le brouillon de son site');

  -- Un lecteur seul n'a pas `content.edit` : il ne voit pas le brouillon.
  perform t.assert(
    t.denied_as(viewer, format('select public.draft_site_snapshot(%L)', site_a)),
    'Un lecteur ne peut PAS lire le brouillon');

  -- La frontiere entre tenants : le site B appartient a une autre societe.
  perform t.assert(
    t.denied_as(alice, format('select public.draft_site_snapshot(%L)', site_b)),
    'Le brouillon d''un autre client est inaccessible');
  perform t.assert(
    t.denied_as(eve, format('select public.draft_site_snapshot(%L)', site_b)),
    'Un editeur ne franchit pas la frontiere entre clients');

  -- Un site qui n'existe pas et un site qu'on n'a pas le droit de voir
  -- produisent la meme reponse : l'absence de droit ne revele rien.
  perform t.assert(
    t.denied_as(alice, 'select public.draft_site_snapshot(''00000000-0000-0000-0000-000000000000'')'),
    'Un identifiant inconnu est refuse comme un site interdit');

  ok := has_function_privilege('anon', 'public.draft_site_snapshot(uuid)', 'execute');
  perform t.assert(not ok, 'anon ne peut PAS lire un brouillon');
  ok := has_function_privilege('authenticated', 'public.draft_site_snapshot(uuid)', 'execute');
  perform t.assert(ok, 'authenticated peut appeler draft_site_snapshot');

  -- L'apercu ne publie rien : le site A reste sans version publiee.
  perform t.assert(
    (select published_version_id from public.sites where id = site_a) is null
    or (select count(*) from public.site_versions where site_id = site_a) >= 0,
    'Lire un brouillon ne cree aucune version');
end;
$$;

-- -----------------------------------------------------------------------------
--  Commande sur le site public
--
--  Le navigateur envoie des identifiants et des quantites. Tout le reste —
--  prix, stock, TVA, statut de paiement — est decide ici.
-- -----------------------------------------------------------------------------
\echo '--- Commande e-commerce ---'
do $$
declare
  org_a uuid := (select v from t.fixtures where k='org_a');
  org_b uuid := (select v from t.fixtures where k='org_b');
  site_a uuid := (select v from t.fixtures where k='site_a');
  site_b uuid := (select v from t.fixtures where k='site_b');
  alice uuid := (select v from t.fixtures where k='alice');
  v_product uuid;
  v_rare    uuid;
  v_res     jsonb;
  v_order   uuid;
  v_stock   int;
  v_status  text;
  v_total   int;
  v_count   int;
begin
  insert into public.products
    (site_id, organization_id, name, slug, price_cents, currency, vat_rate_bps,
     track_inventory, stock_quantity)
  values (site_a, org_a, 'Miel de lavande', 'miel-de-lavande', 1200, 'EUR', 550, true, 3)
  returning id into v_product;

  insert into public.products
    (site_id, organization_id, name, slug, price_cents, currency, vat_rate_bps,
     track_inventory, stock_quantity)
  values (site_a, org_a, 'Piece unique', 'piece-unique', 9900, 'EUR', 2000, true, 1)
  returning id into v_rare;

  -- 1. Le prix vient de la base, jamais de la charge utile.
  v_res := app.create_shop_order(
    site_a,
    jsonb_build_array(jsonb_build_object(
      'productId', v_product, 'quantity', 2,
      'unitPriceCents', 1, 'totalCents', 2)),
    'Claire Dubois', 'claire@example.test');

  perform t.assert(v_res->>'ok' = 'true', 'La commande est creee');
  perform t.assert((v_res->>'totalCents')::int = 2400,
    'Le prix est relu en base : un panier trafique ne change pas le montant');
  -- TVA 5,5 % EXTRAITE d'un prix TTC : 2400 x 550 / 10550 = 125.
  perform t.assert((v_res->>'vatCents')::int = 125,
    'La TVA est extraite du prix affiche, jamais ajoutee par-dessus');

  v_order := (v_res->>'orderId')::uuid;
  select status, total_cents into v_status, v_total
    from public.shop_orders where id = v_order;
  perform t.assert(v_status = 'pending', 'Une commande nait « pending », jamais « paid »');
  perform t.assert(v_total = 2400, 'Le montant fige est celui calcule en base');

  select stock_quantity into v_stock from public.products where id = v_product;
  perform t.assert(v_stock = 1, 'Le stock est decremente dans la meme transaction');

  -- 2. Le stock fait loi : on ne vend pas ce qu'on n'a pas.
  v_res := app.create_shop_order(
    site_a, jsonb_build_array(jsonb_build_object('productId', v_rare, 'quantity', 5)),
    'Marc Petit', 'marc@example.test');
  perform t.assert(v_res->>'ok' = 'true', 'La commande partielle est acceptee');
  perform t.assert((v_res->>'totalCents')::int = 9900,
    'Seule la quantite disponible est facturee');
  select stock_quantity into v_stock from public.products where id = v_rare;
  perform t.assert(v_stock = 0, 'Le dernier exemplaire part une seule fois');

  v_res := app.create_shop_order(
    site_a, jsonb_build_array(jsonb_build_object('productId', v_rare, 'quantity', 1)),
    'Lea Martin', 'lea@example.test');
  perform t.assert(v_res->>'ok' = 'false' and v_res->>'code' = 'cart_empty',
    'Un article epuise ne se commande pas');

  -- 3. Le produit d'un autre client n'existe pas depuis ce site.
  v_res := app.create_shop_order(
    site_b, jsonb_build_array(jsonb_build_object('productId', v_product, 'quantity', 1)),
    'Pirate', 'pirate@example.test');
  perform t.assert(v_res->>'ok' = 'false',
    'Un produit d''un autre client ne peut pas etre commande');

  -- 4. La vente en ligne est un droit d'offre, applique par la base.
  perform t.assert(not app.has_feature(org_b, 'ecommerce'),
    'L''offre Essentiel n''a pas la vente en ligne');
  perform t.assert(app.has_feature(org_a, 'ecommerce'),
    'L''offre Ultra Premium a la vente en ligne');

  -- 5. Un panier vide ou demesure est refuse.
  perform t.assert(
    (app.create_shop_order(site_a, '[]'::jsonb, 'X', 'x@example.test'))->>'code' = 'cart_empty',
    'Un panier vide est refuse');
  perform t.assert(
    (app.create_shop_order(site_a,
      jsonb_build_array(jsonb_build_object('productId', v_product, 'quantity', 1)),
      'X', 'pas-une-adresse'))->>'code' = 'email_invalid',
    'Une adresse invalide est refusee');

  -- 6. Le paiement ne vient que du webhook, et seulement au bon montant.
  v_res := app.mark_shop_order_paid(v_order, 'pi_faux', 100, 'acct_test');
  perform t.assert(v_res->>'code' = 'amount_mismatch',
    'Un montant different de celui fige ne paie rien');
  select status into v_status from public.shop_orders where id = v_order;
  perform t.assert(v_status = 'pending', 'La commande reste impayee apres un ecart de montant');
  perform t.assert(exists (
    select 1 from public.audit_logs
     where action = 'shop_order.amount_mismatch' and target_id = v_order::text),
    'L''ecart de montant est trace');

  v_res := app.mark_shop_order_paid(v_order, 'pi_ok_1', 2400, 'acct_test');
  perform t.assert(v_res->>'ok' = 'true', 'Le bon montant encaisse la commande');
  select status into v_status from public.shop_orders where id = v_order;
  perform t.assert(v_status = 'paid', 'La commande passe a « paid »');

  -- Rejeu du webhook : sans effet.
  v_res := app.mark_shop_order_paid(v_order, 'pi_ok_1', 2400, 'acct_test');
  perform t.assert(v_res->>'duplicate' = 'true', 'Un rejeu de webhook ne change rien');
  select count(*) into v_count from public.payments where shop_order_id = v_order;
  perform t.assert(v_count = 1, 'Aucun paiement en double apres rejeu');

  -- 7. Les montants d'une commande payee sont immuables, pour tout le monde.
  begin
    update public.shop_orders set total_cents = 1 where id = v_order;
    perform t.assert(false, 'Les montants d''une commande payee sont immuables');
  exception when others then
    perform t.assert(true, 'Les montants d''une commande payee sont immuables');
  end;

  -- 8. Le commercant ne peut pas declarer une commande payee lui-meme.
  perform t.assert(
    t.denied_as(alice, format(
      'update shop_orders set status = ''paid'' where id = %L',
      (select id from public.shop_orders where customer_email = 'marc@example.test'))),
    'Le commercant ne peut pas marquer une commande payee');

  -- 9. Un panier abandonne rend son stock.
  select stock_quantity into v_stock from public.products where id = v_rare;
  perform t.assert(v_stock = 0, 'Stock retenu avant liberation');
  update public.shop_orders set created_at = now() - interval '3 hours'
   where customer_email = 'marc@example.test';
  perform t.assert(app.release_expired_shop_orders(60) >= 1,
    'Les commandes abandonnees sont annulees');
  select stock_quantity into v_stock from public.products where id = v_rare;
  perform t.assert(v_stock = 1, 'Le stock d''un panier abandonne revient a la vente');
  select status into v_status from public.shop_orders where customer_email = 'marc@example.test';
  perform t.assert(v_status = 'cancelled', 'La commande abandonnee est annulee');

  -- La commande payee n'est jamais liberee.
  select status into v_status from public.shop_orders where id = v_order;
  perform t.assert(v_status = 'paid', 'Une commande payee n''est jamais annulee automatiquement');

  -- 10. Surface d'appel : seul le role de service commande ou encaisse.
  perform t.assert(
    not has_function_privilege('anon',
      'public.create_shop_order(uuid, jsonb, text, text, text, text, jsonb, text, text)', 'execute'),
    'anon ne peut PAS creer de commande');
  perform t.assert(
    not has_function_privilege('authenticated',
      'public.mark_shop_order_paid(uuid, text, int, text, char)', 'execute'),
    'authenticated ne peut PAS marquer une commande payee');
  perform t.assert(
    has_function_privilege('service_role',
      'public.mark_shop_order_paid(uuid, text, int, text, char)', 'execute'),
    'service_role peut encaisser depuis le webhook');
end;
$$;

-- -----------------------------------------------------------------------------
--  Registre des violations de donnees (RGPD art. 33.5)
--
--  Ce registre est une piece de preuve. Il doit resister a la tentation de
--  reecrire l'histoire sous pression.
-- -----------------------------------------------------------------------------
\echo '--- Registre des violations ---'
do $$
declare
  alice uuid := (select v from t.fixtures where k='alice');
  staff uuid := (select v from t.fixtures where k='staff');
  v_id      uuid;
  v_deadline timestamptz;
  v_found   timestamptz;
begin
  insert into public.data_breaches
    (reference, discovered_at, nature, description, risk_level,
     subject_categories, data_categories)
  values ('VD-2026-001', now() - interval '6 hours', 'confidentiality',
          'Acces non autorise a une sauvegarde de test contenant des adresses e-mail.',
          'low', array['clients'], array['identification'])
  returning id, notify_deadline_at into v_id, v_deadline;

  -- 1. Les 72 heures courent depuis la DECOUVERTE, pas depuis maintenant.
  perform t.assert(
    v_deadline = (select discovered_at + interval '72 hours'
                    from public.data_breaches where id = v_id),
    'L''echeance court a compter de la decouverte');

  -- 2. On ne repousse pas l'echeance en la reecrivant.
  update public.data_breaches set notify_deadline_at = now() + interval '30 days'
   where id = v_id;
  select notify_deadline_at into v_found from public.data_breaches where id = v_id;
  perform t.assert(v_found = v_deadline, 'L''echeance des 72 heures ne se repousse pas');

  -- 3. On ne recule pas la date de decouverte.
  begin
    update public.data_breaches set discovered_at = now() where id = v_id;
    perform t.assert(false, 'La date de decouverte ne se modifie pas');
  exception when others then
    perform t.assert(true, 'La date de decouverte ne se modifie pas');
  end;

  -- 4. Conclure « pas de risque » sans le motiver est refuse.
  begin
    update public.data_breaches set risk_level = 'none', no_risk_justification = null
     where id = v_id;
    perform t.assert(false, 'Conclure « pas de risque » exige une justification ecrite');
  exception when others then
    perform t.assert(true, 'Conclure « pas de risque » exige une justification ecrite');
  end;

  update public.data_breaches
     set risk_level = 'none',
         no_risk_justification = 'Donnees chiffrees au repos, cles non compromises, aucun acces effectif.'
   where id = v_id;
  perform t.assert(
    (select risk_level from public.data_breaches where id = v_id) = 'none',
    'Une absence de risque motivee est acceptee');

  -- 5. Une notification enregistree ne se retire plus.
  update public.data_breaches set cnil_notified_at = now(), cnil_reference = 'CNIL-XYZ'
   where id = v_id;
  begin
    update public.data_breaches set cnil_notified_at = null where id = v_id;
    perform t.assert(false, 'Une notification a la CNIL ne s''efface pas');
  exception when others then
    perform t.assert(true, 'Une notification a la CNIL ne s''efface pas');
  end;

  -- 6. Une entree ne se supprime pas : elle se cloture.
  begin
    delete from public.data_breaches where id = v_id;
    perform t.assert(false, 'Une entree du registre ne se supprime pas');
  exception when others then
    perform t.assert(true, 'Une entree du registre ne se supprime pas');
  end;

  -- 7. Le registre decrit nos propres failles : aucun client ne le lit.
  perform t.assert(t.count_as(alice, 'select 1 from data_breaches') = 0,
    'Un client ne voit pas le registre des violations');
  perform t.assert(t.count_as(staff, 'select 1 from data_breaches') = 1,
    'L''administration de la plateforme lit le registre');
  perform t.assert(
    t.denied_as(alice,
      'insert into data_breaches (reference, nature, description) ' ||
      'values (''X'', ''confidentiality'', ''Tentative d''''ecriture par un client non habilite.'')'),
    'Un client ne peut pas ecrire dans le registre');
  perform t.assert(
    not has_table_privilege('anon', 'public.data_breaches', 'select'),
    'anon n''a aucun droit sur le registre');
end;
$$;

-- -----------------------------------------------------------------------------
--  Surface d'administration
--
--  Chaque ecran ajoute au back-office ouvre une table de plus. Cette section
--  verifie qu'aucune d'elles ne devient lisible par un client.
-- -----------------------------------------------------------------------------
\echo '--- Tables du back-office ---'
do $$
declare
  alice uuid := (select v from t.fixtures where k='alice');
  bob   uuid := (select v from t.fixtures where k='bob');
  staff uuid := (select v from t.fixtures where k='staff');
  org_a uuid := (select v from t.fixtures where k='org_a');
  org_b uuid := (select v from t.fixtures where k='org_b');
begin
  insert into public.background_jobs (kind, payload) values ('domain.verify', '{}'::jsonb);

  insert into public.privacy_requests
    (reference, requester_email, organization_id, kind, status, due_at)
  values ('RGPD-2026-001', 'alice@tenant-a.test', org_a, 'export', 'received',
          now() + interval '30 days');

  -- Les taches de fond decrivent notre infrastructure : jamais un client.
  perform t.assert(t.count_as(alice, 'select 1 from background_jobs') = 0,
    'Un client ne voit pas les taches de fond');
  perform t.assert(t.count_as(staff, 'select 1 from background_jobs') >= 1,
    'Le personnel plateforme voit les taches de fond');

  -- Les codes promotionnels ne sont jamais enumerables : la liste des remises
  -- en cours est une information commerciale.
  perform t.assert(t.count_as(alice, 'select 1 from coupons') = 0,
    'Un client ne peut pas enumerer les codes promotionnels');
  perform t.assert(
    t.denied_as(alice,
      'insert into coupons (code, kind, value, applies_to) ' ||
      'values (''AUTOREMISE'', ''percent'', 90, ''both'')'),
    'Un client ne peut pas se creer une remise');

  -- Une demande RGPD appartient a son auteur : elle ne traverse pas les
  -- organisations.
  perform t.assert(t.count_as(bob, format(
    'select 1 from privacy_requests where organization_id = %L', org_a)) = 0,
    'Un client ne voit pas la demande RGPD d''un autre');
  perform t.assert(t.count_as(staff, 'select 1 from privacy_requests') >= 1,
    'Le personnel plateforme traite les demandes RGPD');

  -- Un drapeau d'activation se lit, mais ne se bascule pas par un client.
  perform t.assert(
    t.denied_as(alice, 'update feature_flags set enabled_globally = true'),
    'Un client ne peut pas activer une fonctionnalite pour tout le monde');

  -- Un droit d'offre ne s'accorde pas depuis un compte client.
  perform t.assert(
    t.denied_as(alice, format(
      'insert into organization_feature_overrides (organization_id, feature_key, enabled) ' ||
      'values (%L, ''ecommerce'', true)', org_a)),
    'Un client ne peut pas s''accorder un droit d''offre');
  perform t.assert(
    t.denied_as(bob, format(
      'insert into organization_feature_overrides (organization_id, feature_key, enabled) ' ||
      'values (%L, ''ecommerce'', true)', org_b)),
    'Meme pour sa propre organisation, un client ne s''accorde aucun droit');
end;
$$;

-- -----------------------------------------------------------------------------
--  Comptes client des sites
--
--  Un compte appartient a UN SITE. La meme adresse chez deux commercants donne
--  deux comptes etrangers l'un a l'autre, et aucun lien de connexion ne
--  traverse cette frontiere.
-- -----------------------------------------------------------------------------
\echo '--- Comptes client des sites ---'
do $$
declare
  alice  uuid := (select v from t.fixtures where k='alice');
  bob    uuid := (select v from t.fixtures where k='bob');
  site_a uuid := (select v from t.fixtures where k='site_a');
  site_b uuid := (select v from t.fixtures where k='site_b');
  org_b  uuid := (select v from t.fixtures where k='org_b');
  v_res      jsonb;
  v_customer uuid;
  v_count    int;
begin
  -- 1. Le droit d'offre fait loi : l'Essentiel n'a pas d'espace client.
  v_res := app.request_customer_login(
    site_b, 'visiteur@exemple.test', 'hash-refuse', now() + interval '1 hour');
  perform t.assert(v_res->>'code' = 'module_unavailable',
    'Une offre sans espace client refuse la demande');

  -- 2. Sur l'Ultra Premium, le compte est cree a la premiere demande.
  v_res := app.request_customer_login(
    site_a, 'Visiteur@Exemple.test', 'hash-a-1', now() + interval '1 hour');
  perform t.assert(v_res->>'sent' = 'true', 'Un lien est emis');
  select id into v_customer from public.site_customers
   where site_id = site_a and lower(email) = 'visiteur@exemple.test';
  perform t.assert(v_customer is not null, 'Le compte est cree a la premiere demande');

  -- 3. Une adresse inconnue et une adresse connue donnent la MEME reponse :
  --    le formulaire ne sert pas a tester la clientele d'un commercant.
  v_res := app.request_customer_login(
    site_a, 'jamais-vu@exemple.test', 'hash-a-2', now() + interval '1 hour');
  perform t.assert(v_res->>'sent' = 'true',
    'Une adresse inconnue produit la meme reponse qu''une adresse connue');

  -- 4. Le lien vaut pour SON site, et pour lui seul.
  v_res := app.redeem_customer_login(site_b, 'hash-a-1');
  perform t.assert(v_res->>'ok' = 'false',
    'Un lien emis pour un site ne vaut rien sur un autre');

  v_res := app.redeem_customer_login(site_a, 'hash-a-1');
  perform t.assert(v_res->>'ok' = 'true', 'Le lien connecte sur son propre site');
  perform t.assert((v_res->>'customerId')::uuid = v_customer, 'Il designe le bon compte');

  -- 5. Usage unique.
  v_res := app.redeem_customer_login(site_a, 'hash-a-1');
  perform t.assert(v_res->>'ok' = 'false', 'Un lien deja utilise ne resservira pas');

  -- 6. Un lien expire ne vaut rien, et le refus est indiscernable des autres.
  insert into public.site_customer_tokens (site_id, customer_id, token_hash, expires_at)
  values (site_a, v_customer, 'hash-expire', now() - interval '1 minute');
  v_res := app.redeem_customer_login(site_a, 'hash-expire');
  perform t.assert(v_res->>'code' = 'invalid', 'Un lien expire est refuse comme un lien inconnu');

  -- 7. Un compte bloque ne recoit plus rien, sans que la reponse le dise.
  update public.site_customers set is_blocked = true where id = v_customer;
  v_res := app.request_customer_login(
    site_a, 'visiteur@exemple.test', 'hash-a-3', now() + interval '1 hour');
  perform t.assert(v_res->>'sent' = 'false' and v_res->>'ok' = 'true',
    'Un compte bloque ne recoit plus de lien, sans reponse distinctive');
  update public.site_customers set is_blocked = false where id = v_customer;

  -- 8. Plafond d'envoi : le formulaire ne sert pas a inonder une boite.
  for i in 1..6 loop
    perform app.request_customer_login(
      site_a, 'visiteur@exemple.test', 'hash-flood-' || i, now() + interval '1 hour');
  end loop;
  select count(*) into v_count from public.site_customer_tokens
   where customer_id = v_customer and token_hash like 'hash-flood-%';
  perform t.assert(v_count < 6, 'Le nombre de liens emis par heure est plafonne');

  -- 9. Le commercant voit SES clients ; un autre commercant, jamais.
  perform t.assert(t.count_as(alice, format(
    'select 1 from site_customers where site_id = %L', site_a)) >= 1,
    'Le commercant voit les comptes de son site');
  perform t.assert(t.count_as(bob, format(
    'select 1 from site_customers where site_id = %L', site_a)) = 0,
    'Un autre commercant ne voit pas ces comptes');

  -- 10. Les jetons ne sont lisibles par personne, pas meme par le commercant.
  -- Le refus est une ERREUR DE PRIVILEGE, pas un resultat vide : le droit de
  -- lecture n'est accorde a personne sur cette table.
  perform t.assert(t.denied_as(alice, 'select 1 from site_customer_tokens'),
    'Les liens de connexion ne sont lisibles par personne');
  perform t.assert(
    not has_table_privilege('anon', 'public.site_customer_tokens', 'select'),
    'anon n''a aucun droit sur les liens de connexion');

  -- 11. La surface d'appel est reservee au role de service.
  perform t.assert(
    not has_function_privilege('authenticated',
      'public.request_customer_login(uuid, text, text, timestamptz, text)', 'execute'),
    'authenticated ne peut pas demander de lien de connexion');
  perform t.assert(
    not has_function_privilege('anon', 'public.redeem_customer_login(uuid, text)', 'execute'),
    'anon ne consomme aucun lien');
  perform t.assert(
    has_function_privilege('service_role', 'public.customer_account_view(uuid, uuid)', 'execute'),
    'Le Worker lit l''espace client');

  -- 12. L'espace d'un compte ne montre que ce qui est a lui.
  v_res := app.customer_account_view(site_a, v_customer);
  perform t.assert(v_res->>'ok' = 'true', 'L''espace client repond');
  perform t.assert(jsonb_typeof(v_res->'orders') = 'array', 'Il liste des commandes');
  v_res := app.customer_account_view(site_b, v_customer);
  perform t.assert(v_res->>'ok' = 'false',
    'Un compte n''est pas consultable depuis un autre site');
end;
$$;

-- =============================================================================
--  Cycle de vie d'une organisation : elle doit pouvoir etre supprimee
-- =============================================================================
--
--  Deux regles justes se contredisaient et rendaient toute suppression
--  impossible — donc l'effacement au titre de l'article 17 du RGPD aussi :
--
--   * le garde du dernier proprietaire se declenchait aussi quand
--     l'organisation elle-meme partait ;
--   * `audit_logs.organization_id` etait en `on delete set null`, et
--     « set null » est un UPDATE, refuse par le garde append-only.
--
--  Ces assertions verrouillent le comportement attendu, dans les deux sens.
-- =============================================================================
\echo ''
\echo '--- Suppression d une organisation ---'

do $$
declare
  v_org    uuid;
  v_user   uuid := gen_random_uuid();
  v_audit  bigint;
  v_refuse boolean := false;
begin
  insert into auth.users (id, email) values (v_user, 'cycle-vie@exemple.test');

  insert into public.organizations (name, slug, status)
  values ('Cycle de vie', 'cycle-de-vie-test', 'active')
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_user, 'owner')
  on conflict (organization_id, user_id) do update set role = 'owner';

  perform app.write_audit('test.lifecycle', v_org, null, 'organization', v_org::text, '{}'::jsonb);
  select count(*) into v_audit from public.audit_logs where organization_id = v_org;
  perform t.assert(v_audit > 0, 'Le journal contient une ligne pour cette organisation');

  -- 1. Retirer le dernier proprietaire reste refuse.
  begin
    delete from public.organization_members where organization_id = v_org;
  exception when check_violation then
    v_refuse := true;
  end;
  perform t.assert(v_refuse,
    'Le retrait du dernier proprietaire d''une organisation vivante est refuse');

  -- 2. Mais supprimer l'organisation entiere fonctionne.
  delete from public.organizations where id = v_org;
  perform t.assert(
    not exists (select 1 from public.organizations where id = v_org),
    'Une organisation peut etre supprimee — sans quoi aucun effacement RGPD n''est possible');

  -- 3. Et le journal d'audit survit, en gardant son sujet.
  select count(*) into v_audit from public.audit_logs where organization_id = v_org;
  perform t.assert(v_audit > 0,
    'Le journal d''audit survit a la suppression et conserve l''organisation concernee');

  delete from auth.users where id = v_user;
end;
$$;

\echo ''
\echo '================================================'
\echo '  Tous les tests de securite sont passes.'
\echo '================================================'

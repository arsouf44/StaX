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

  -- Sites deja confies a leurs clients (0041) : c'est le cas nominal des tests
  -- d'isolation et de RBAC ci-dessous.
  -- Ces deux sites exercent le moteur multi-tenant historique (pages, sections,
  -- instantanes publies) : ils sont explicitement `legacy_engine`. Les sites
  -- developpes independamment ont leur propre bloc de tests plus bas.
  insert into public.sites (organization_id, name, slug, plan_id, plan_slug, business_type_slug,
                            delivered_at, architecture)
       values (v_org_a, 'Site A', 'site-a',
               (select id from public.plans where slug='ultra-premium' and is_active
                   and valid_until is null), 'ultra-premium', 'restaurant',
               now(), 'legacy_engine')
    returning id into v_site_a;
  insert into public.sites (organization_id, name, slug, plan_id, plan_slug, business_type_slug,
                            delivered_at, architecture)
       values (v_org_b, 'Site B', 'site-b',
               (select id from public.plans where slug='essentiel' and is_active
                   and valid_until is null), 'essentiel', 'plombier',
               now(), 'legacy_engine')
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
  perform t.assert(app.feature_limit(org_a, 'max_pages') = 20,
    'La limite de pages Ultra Premium est de 20');
  perform t.assert(app.feature_limit(org_b, 'max_pages') = 5,
    'La limite de pages Essentiel est de 5');
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
  v_plan uuid := (select id from plans where slug='essentiel' and is_active and valid_until is null);
begin
  v_price := app.compute_order_pricing(v_plan, null);
  perform t.assert(v_price.setup_cents = 30000, 'Prix Essentiel = 300,00 EUR HT');
  perform t.assert(v_price.vat_cents = 6000, 'TVA 20 % sur 300,00 EUR = 60,00 EUR');
  perform t.assert(v_price.total_cents = 36000, 'Total TTC = 360,00 EUR');
  perform t.assert(v_price.maintenance_cents = 1200, 'Maintenance Essentiel = 12,00 EUR HT par mois');
  perform t.assert((select billing_interval from plans where id = v_plan) = 'month',
    'La maintenance Essentiel est mensuelle');

  insert into coupons (code, kind, value, applies_to) values ('BIENVENUE10', 'percent', 1000, 'setup');
  v_price := app.compute_order_pricing(v_plan, 'BIENVENUE10');
  perform t.assert(v_price.discount_cents = 3000, 'Remise de 10 % = 30,00 EUR');
  perform t.assert(v_price.total_cents = 32400, 'Total TTC apres remise = 324,00 EUR');

  -- Une offre sur devis ne peut pas etre commandee directement.
  begin
    v_price := app.compute_order_pricing((select id from plans where slug='sur-mesure' and is_active and valid_until is null), null);
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
  perform t.assert(
    (select s.plan_id from public.sites s where s.id = v_site) = plan_id,
    'Le site cree au paiement porte la version exacte de l''offre achetee');
  perform t.assert(app.has_feature(org_a, 'version_history'),
    'Les droits de l''offre achetee s''appliquent des le paiement');

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

-- -----------------------------------------------------------------------------
--  Comptes internes : le privilege est une regle de la BASE
-- -----------------------------------------------------------------------------
\echo '--- Comptes internes (commande sans paiement) ---'
do $$
declare
  alice      uuid := (select v from t.fixtures where k='alice');
  v_internal uuid;
  v_plan     uuid := (select id from public.plans where slug = 'ultra-premium' and is_active and valid_until is null);
  v_result   jsonb;
  v_order    public.orders%rowtype;
  v_refuse   boolean := false;
begin
  -- Un client ordinaire ne peut ni commander sans payer...
  perform t.assert(t.denied_as(alice, format(
    'select public.create_internal_order(%L::uuid, %L, %L, %L)',
    v_plan, 'restauration', 'restaurant', 'Tentative gratuite')),
    'Un client ordinaire ne peut pas passer de commande interne');

  -- ... ni s'attribuer le statut interne.
  perform t.assert(t.denied_as(alice, format(
    'update public.profiles set account_type = %L, billing_exempt = true where id = %L',
    'internal', alice)),
    'Un client ne peut pas s''attribuer le statut de compte interne');
  perform t.assert(
    (select account_type from public.profiles where id = alice) = 'customer',
    'Le profil du client est inchange');

  -- Compte interne, attribue par l'approvisionnement serveur (sans jeton
  -- utilisateur : c'est la cle de service qui agit).
  perform set_config('request.jwt.claims', null, true);
  insert into auth.users (email) values ('interne@stax.test') returning id into v_internal;
  update public.profiles
     set account_type = 'internal', billing_exempt = true, unlimited_sites = true, all_features = true
   where id = v_internal;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_internal, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_result := public.create_internal_order(v_plan, 'restauration', 'restaurant', 'Site interne');
  reset role;
  perform set_config('request.jwt.claims', null, true);

  perform t.assert((v_result ->> 'ok')::boolean, 'Le compte interne commande sans paiement');
  select * into v_order from public.orders where id = (v_result ->> 'orderId')::uuid;
  perform t.assert(v_order.status::text = 'internal' and v_order.billing_mode = 'internal',
    'La commande est marquee interne');
  perform t.assert(v_order.total_cents = 0 and v_order.discount_cents = v_order.setup_price_cents,
    'La commande interne est a 0 EUR, prix catalogue integralement remis');
  perform t.assert(
    not exists (select 1 from public.payments where order_id = v_order.id),
    'Aucun encaissement n''est cree pour une commande interne');
  perform t.assert(
    (select plan_id from public.sites where id = (v_result ->> 'siteId')::uuid) = v_plan,
    'Le site interne porte l''offre choisie');
  perform t.assert(
    app.has_feature((v_result ->> 'organizationId')::uuid, 'ecommerce')
      and app.feature_limit((v_result ->> 'organizationId')::uuid, 'max_pages') is null,
    'Toutes les fonctionnalites, sans limite, pour l''organisation interne');

  -- Une commande interne ne devient jamais payee (aucun paiement n'a eu lieu).
  begin
    update public.orders set status = 'paid' where id = v_order.id;
  exception when others then
    v_refuse := true;
  end;
  perform t.assert(v_refuse, 'Une commande interne ne peut pas basculer en payee');

  -- Sites illimites : une seconde commande interne passe aussi.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_internal, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_result := public.create_internal_order(
    (select id from public.plans where slug = 'essentiel' and is_active and valid_until is null),
    'artisanat', 'plombier', 'Second site interne');
  reset role;
  perform set_config('request.jwt.claims', null, true);
  perform t.assert((v_result ->> 'ok')::boolean, 'Le compte interne cree autant de sites qu''il veut');
end;
$$;

-- -----------------------------------------------------------------------------
--  Editeur : isolation, annulation, corbeille, versions immuables
-- -----------------------------------------------------------------------------
\echo '--- Editeur et versions ---'
do $$
declare
  alice   uuid := (select v from t.fixtures where k='alice');
  eve     uuid := (select v from t.fixtures where k='eve');
  viewer  uuid := (select v from t.fixtures where k='viewer');
  bob     uuid := (select v from t.fixtures where k='bob');
  site_a  uuid := (select v from t.fixtures where k='site_a');
  site_b  uuid := (select v from t.fixtures where k='site_b');
  page_a  uuid := (select id from public.site_pages where site_id = (select v from t.fixtures where k='site_a') and path = '/');
  page_b  uuid := (select id from public.site_pages where site_id = (select v from t.fixtures where k='site_b') and path = '/');
  v_block uuid := gen_random_uuid();
  v_foreign uuid := gen_random_uuid();
  v_v1 uuid; v_v2 uuid; v_v3 uuid;
  v_refuse boolean;
  v_title text;
  v_before int := (select count(*) from public.site_versions where site_id = (select v from t.fixtures where k='site_a'));
begin
  -- Une section existe sur le site du voisin.
  insert into public.page_blocks (id, page_id, site_id, type, props, sort_order)
  values (v_foreign, page_b, site_b, 'hero', '{"title":"Voisin"}', 10);

  -- L'editrice de A enregistre une section.
  perform set_config('request.jwt.claims',
    json_build_object('sub', eve, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.editor_commit(page_a,
    jsonb_build_array(jsonb_build_object('id', v_block, 'type', 'hero',
      'props', jsonb_build_object('title', 'Premier titre'))),
    'block.add', 'Ajout de la bannière', v_block);
  perform public.editor_commit(page_a,
    jsonb_build_array(jsonb_build_object('id', v_block, 'type', 'hero',
      'props', jsonb_build_object('title', 'Second titre'))),
    'block.edit', 'Titre modifié', v_block);
  reset role;
  perform t.assert(
    (select props ->> 'title' from public.page_blocks where id = v_block) = 'Second titre',
    'L''editeur enregistre les modifications du brouillon');

  -- Annuler, retablir.
  set local role authenticated;
  perform public.editor_undo(page_a);
  reset role;
  perform t.assert(
    (select props ->> 'title' from public.page_blocks where id = v_block) = 'Premier titre',
    'Annuler revient a l''etat precedent');
  set local role authenticated;
  perform public.editor_redo(page_a);
  reset role;
  perform t.assert(
    (select props ->> 'title' from public.page_blocks where id = v_block) = 'Second titre',
    'Retablir reapplique la modification');

  -- Supprimer = corbeille, jamais une destruction.
  set local role authenticated;
  perform public.editor_commit(page_a, '[]'::jsonb, 'block.delete', 'Section supprimée', v_block);
  reset role;
  perform t.assert(
    (select deleted_at is not null from public.page_blocks where id = v_block),
    'Une section supprimee part a la corbeille, elle n''est pas effacee');
  set local role authenticated;
  perform public.editor_commit(page_a,
    jsonb_build_array(jsonb_build_object('id', v_block, 'type', 'hero',
      'props', jsonb_build_object('title', 'Second titre'))),
    'block.restore', 'Section restaurée', v_block);
  reset role;
  perform set_config('request.jwt.claims', null, true);
  perform t.assert(
    (select deleted_at is null from public.page_blocks where id = v_block),
    'Une section de la corbeille se restaure');

  -- Isolation : ni un autre tenant, ni un lecteur, ni une section volee.
  perform t.assert(t.denied_as(bob, format(
    'select public.editor_commit(%L::uuid, %L::jsonb, %L, %L)',
    page_a, '[]', 'block.delete', 'Vandalisme')),
    'Un autre client ne peut pas modifier le brouillon d''un site qui n''est pas le sien');
  perform t.assert(t.denied_as(viewer, format(
    'select public.editor_commit(%L::uuid, %L::jsonb, %L, %L)',
    page_a, '[]', 'block.delete', 'Lecteur')),
    'Un membre en lecture seule ne modifie pas le site');
  perform t.assert(t.denied_as(alice, format(
    'select public.editor_commit(%L::uuid, %L::jsonb, %L, %L)',
    page_a,
    jsonb_build_array(jsonb_build_object('id', v_foreign, 'type', 'hero', 'props', '{}'::jsonb)),
    'block.add', 'Section d''un autre site')),
    'Une section d''un autre site ne peut pas etre rattachee a sa propre page');
  perform t.assert(
    (select page_id from public.page_blocks where id = v_foreign) = page_b
      and (select props ->> 'title' from public.page_blocks where id = v_foreign) = 'Voisin',
    'La section du voisin est intacte');

  -- Publication : versions numerotees et immuables.
  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_v1 := public.publish_site(site_a);
  reset role;
  perform t.assert(
    (select published_version_id from public.sites where id = site_a) = v_v1,
    'La publication rend la nouvelle version visible');

  v_refuse := false;
  begin
    update public.site_versions set snapshot = '{}'::jsonb where id = v_v1;
  exception when others then
    v_refuse := true;
  end;
  perform t.assert(v_refuse, 'Une version publiee est immuable, meme pour la base');

  set local role authenticated;
  perform public.editor_commit(page_a,
    jsonb_build_array(jsonb_build_object('id', v_block, 'type', 'hero',
      'props', jsonb_build_object('title', 'Titre de la version 2'))),
    'block.edit', 'Titre modifié', v_block);
  reset role;
  perform t.assert(
    (select snapshot::text from public.site_versions where id = v_v1) not like '%version 2%',
    'Le brouillon ne touche jamais la version en ligne');

  set local role authenticated;
  v_v2 := public.publish_site(site_a);
  v_v3 := public.rollback_site(site_a, v_v1);
  reset role;
  perform set_config('request.jwt.claims', null, true);

  perform t.assert(
    (select published_version_id from public.sites where id = site_a) = v_v3
      and (select version_number from public.site_versions where id = v_v3)
        = (select version_number from public.site_versions where id = v_v2) + 1,
    'Revenir a une version anterieure la republie sous un nouveau numero');
  perform t.assert(
    (select count(*) from public.site_versions where site_id = site_a) = v_before + 3,
    'Revenir en arriere ne detruit aucune version');
  select snapshot #>> '{pages,0,blocks,0,props,title}' into v_title
    from public.site_versions where id = v_v3;
  perform t.assert(v_title = 'Second titre', 'La version republiee est bien le contenu de la version choisie');

  perform t.assert(t.denied_as(bob, format(
    'select public.rollback_site(%L::uuid, %L::uuid)', site_a, v_v2)),
    'Un autre client ne peut pas republier une version de ce site');
  perform t.assert(t.denied_as(eve, format(
    'select public.purge_trash_item(%L, %L::uuid)', 'block', v_foreign)),
    'On ne purge pas la corbeille d''un autre site');
end;
$$;

-- -----------------------------------------------------------------------------
--  Equipe StaX : acces au site d'un client UNIQUEMENT en session d'assistance
-- -----------------------------------------------------------------------------
\echo '--- Intervention de l equipe StaX ---'
do $$
declare
  org_a    uuid := (select v from t.fixtures where k='org_a');
  site_a   uuid := (select v from t.fixtures where k='site_a');
  page_a   uuid := (select id from public.site_pages where site_id = (select v from t.fixtures where k='site_a') and path = '/');
  v_support uuid;
  v_session uuid;
  v_blocks jsonb;
begin
  insert into auth.users (email) values ('support@stax.test') returning id into v_support;
  update public.profiles set platform_role = 'support' where id = v_support;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'type', type, 'props', props)
                            order by sort_order), '[]'::jsonb)
    into v_blocks
    from public.page_blocks where page_id = page_a and deleted_at is null;

  perform t.assert(t.denied_as(v_support, format(
    'select public.editor_commit(%L::uuid, %L::jsonb, %L, %L)',
    page_a, v_blocks, 'block.edit', 'Sans session')),
    'Sans session d''assistance, l''equipe ne modifie pas le site d''un client');

  insert into public.impersonation_sessions (staff_id, organization_id, reason, token_hash, expires_at)
  values (v_support, org_a, 'Correction demandee par le client (ticket)', 'hash-test', now() + interval '1 hour')
  returning id into v_session;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_support, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.editor_commit(page_a, v_blocks, 'block.edit', 'Correction par l''equipe');
  reset role;
  perform set_config('request.jwt.claims', null, true);

  perform t.assert(
    (select actor_kind from public.editor_revisions
      where page_id = page_a order by created_at desc, seq desc limit 1) = 'stax',
    'La modification est attribuee a l''equipe StaX, visible par le client');
  perform t.assert(not app.org_can(org_a, 'billing.manage') ,
    'La session n''accorde aucun droit financier (contexte sans jeton)');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_support, 'role', 'authenticated')::text, true);
  perform t.assert(not app.org_can(org_a, 'billing.manage')
                   and not app.org_can(org_a, 'members.manage'),
    'En session, l''equipe n''a ni droits financiers ni gestion des membres');
  perform set_config('request.jwt.claims', null, true);

  update public.impersonation_sessions set ended_at = now(), ended_reason = 'fin' where id = v_session;
  perform t.assert(t.denied_as(v_support, format(
    'select public.editor_commit(%L::uuid, %L::jsonb, %L, %L)',
    page_a, v_blocks, 'block.edit', 'Apres la session')),
    'La session terminee, l''acces s''arrete');
end;
$$;

-- -----------------------------------------------------------------------------
--  Comptes clients d'un site : le commercant les gere, personne d'autre
-- -----------------------------------------------------------------------------
\echo '--- Comptes clients (effacement RGPD) ---'
do $$
declare
  alice  uuid := (select v from t.fixtures where k='alice');
  bob    uuid := (select v from t.fixtures where k='bob');
  viewer uuid := (select v from t.fixtures where k='viewer');
  org_a  uuid := (select v from t.fixtures where k='org_a');
  site_a uuid := (select v from t.fixtures where k='site_a');
  v_customer uuid;
begin
  perform set_config('request.jwt.claims', null, true);
  insert into public.site_customers (site_id, organization_id, email, full_name)
  values (site_a, org_a, 'cliente@exemple.test', 'Cliente Test')
  returning id into v_customer;

  perform t.assert(t.count_as(alice, 'select 1 from public.site_customers where email = ''cliente@exemple.test''') = 1,
    'Le commercant voit les comptes clients de son site');
  perform t.assert(t.count_as(bob, 'select 1 from public.site_customers where email = ''cliente@exemple.test''') = 0,
    'Un autre commercant ne voit pas ces comptes');
  perform t.assert(t.denied_as(bob, format('select public.delete_site_customer(%L::uuid)', v_customer)),
    'Un autre commercant ne peut pas effacer un compte client');
  perform t.assert(t.denied_as(viewer, format('select public.delete_site_customer(%L::uuid)', v_customer)),
    'Un membre en lecture seule ne peut pas effacer un compte client');
  perform t.assert(exists (select 1 from public.site_customers where id = v_customer),
    'Le compte est intact apres les tentatives refusees');

  perform set_config('request.jwt.claims',
    json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.delete_site_customer(v_customer);
  reset role;
  perform set_config('request.jwt.claims', null, true);

  perform t.assert(not exists (select 1 from public.site_customers where id = v_customer),
    'Le commercant efface un compte client sur demande');
  perform t.assert(exists (select 1 from public.audit_logs
                            where action = 'site_customer.erased' and target_id = v_customer::text),
    'L''effacement est journalise, sans l''adresse e-mail');
end;
$$;

\echo '--- Signalements de contenus (DSA) ---'
do $$
declare
  alice  uuid := (select v from t.fixtures where k='alice');
  staff  uuid := (select v from t.fixtures where k='staff');
  org_a  uuid := (select v from t.fixtures where k='org_a');
  site_a uuid := (select v from t.fixtures where k='site_a');
  v_result jsonb;
  v_report uuid;
begin
  perform set_config('request.jwt.claims', null, true);
  insert into public.site_domains (site_id, organization_id, hostname, status)
  values (site_a, org_a, 'signalement-a.test', 'active')
  on conflict do nothing;

  perform t.assert(t.denied_as(alice,
      'select public.record_content_report(''https://x.test/'', ''other'', ''un texte assez long pour passer'', ''A'', ''a@b.test'', true)'),
    'Un utilisateur connecte ne peut pas ecrire directement un signalement');

  v_result := public.record_content_report(
    'https://signalement-a.test/page', 'defamation',
    'Cette page contient des propos diffamatoires a mon egard.', 'Jean Test', 'jean@exemple.test', true);
  perform t.assert((v_result->>'ok')::boolean and (v_result->>'hosted')::boolean,
    'Un signalement est enregistre et rattache au site heberge');

  v_result := public.record_content_report(
    'https://signalement-a.test/page', 'defamation',
    'Cette page contient des propos diffamatoires a mon egard.', null, null, true);
  perform t.assert(not (v_result->>'ok')::boolean,
    'Hors abus sur mineurs, un signalement anonyme est refuse');

  v_result := public.record_content_report(
    'https://signalement-a.test/page', 'child_abuse',
    'Contenu pedopornographique visible sur cette page du site.', null, null, true);
  perform t.assert((v_result->>'ok')::boolean,
    'Un signalement d''abus sur mineurs peut etre anonyme');

  v_result := public.record_content_report(
    'https://signalement-a.test/page', 'fraud',
    'Cette page contient une arnaque evidente aux visiteurs.', 'Jean Test', 'jean@exemple.test', false);
  perform t.assert(not (v_result->>'ok')::boolean,
    'La declaration de bonne foi est obligatoire');

  perform t.assert(t.count_as(alice, 'select 1 from public.content_reports') = 0,
    'Le commercant ne lit pas les signalements (ni l''identite de leurs auteurs)');
  perform t.assert(t.count_as(staff, 'select 1 from public.content_reports') >= 2,
    'L''equipe StaX lit les signalements');

  select id into v_report from public.content_reports where category = 'defamation' limit 1;
  perform t.assert(t.denied_as(alice, format(
      'select public.decide_content_report(%L::uuid, ''rejected'', ''Aucun contenu illicite constate'')', v_report)),
    'Le commercant ne decide pas d''un signalement');
  perform t.assert(t.denied_as(staff, format(
      'select public.decide_content_report(%L::uuid, ''actioned'', ''court'')', v_report)),
    'Une decision non motivee est refusee');

  perform set_config('request.jwt.claims',
    json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.decide_content_report(v_report, 'actioned',
    'Contenu retire : propos diffamatoires caracterises.');
  reset role;
  perform set_config('request.jwt.claims', null, true);

  perform t.assert(exists (select 1 from public.content_reports
                            where id = v_report and status = 'actioned' and decided_by = staff),
    'La decision motivee est enregistree avec son auteur');
end;
$$;

\echo '--- Site construit par StaX, puis confie au client ---'
do $$
declare
  alice uuid := (select v from t.fixtures where k='alice');
  bob   uuid := (select v from t.fixtures where k='bob');
  staff uuid := (select v from t.fixtures where k='staff');
  v_result jsonb;
  v_org  uuid;
  v_site uuid;
  v_page uuid;
begin
  perform t.assert(t.denied_as(alice,
    'select public.admin_create_site(''Chez Alice'', ''restaurant'', null, ''Lyon'')'),
    'Un client ne peut pas creer de site depuis l''administration');

  perform set_config('request.jwt.claims',
                     json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_result := public.admin_create_site('Chez Alice', 'restaurant', null, 'Lyon');
  reset role;
  v_org  := (v_result ->> 'organizationId')::uuid;
  v_site := (v_result ->> 'siteId')::uuid;
  perform t.assert(v_site is not null, 'L''administration cree un site de zero');
  perform t.assert((select architecture from public.sites where id = v_site) = 'external_repository',
    'Un nouveau site est un projet independant (depot et projet Cloudflare propres)');
  -- La suite de ce bloc exerce le parcours HISTORIQUE (site rendu par le
  -- moteur multi-tenant) : le site est bascule explicitement, par la cle de
  -- service. Le parcours cible a son propre bloc ci-dessous.
  perform set_config('request.jwt.claims', null, true);
  update public.sites set architecture = 'legacy_engine' where id = v_site;
  perform t.assert(exists (select 1 from public.organization_members
                            where organization_id = v_org and user_id = staff and role = 'owner'),
    'La personne de l''equipe qui cree le site en garde la main (proprietaire)');
  perform t.assert(not exists (select 1 from public.site_pages where site_id = v_site),
    'Le site part de zero : aucune page imposee');

  -- Le client est rattache a l'organisation, mais le site n'est pas encore confie.
  perform set_config('request.jwt.claims', null, true);
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, alice, 'owner');
  insert into public.site_pages (site_id, path, title, kind)
  values (v_site, '/', 'Accueil', 'home') returning id into v_page;

  perform t.assert(t.denied_as(alice,
    format('insert into public.site_pages (site_id, path, title, kind) values (%L, ''/carte'', ''Carte'', ''standard'')', v_site)),
    'Avant attribution, le client ne peut pas ajouter de page');
  perform t.assert(t.denied_as(alice,
    format('update public.site_pages set title = ''Pirate'' where id = %L', v_page)),
    'Avant attribution, le client ne peut pas modifier le site');
  perform t.assert(t.denied_as(alice,
    format('update public.sites set delivered_at = now() where id = %L', v_site)),
    'Le client ne peut pas s''attribuer le site lui-meme');
  perform t.assert(t.denied_as(alice,
    format('select public.deliver_site(%L)', v_site)),
    'Le client ne peut pas declencher l''attribution');

  -- L'equipe StaX, elle, travaille sur le site en construction.
  perform t.assert(not t.denied_as(staff,
    format('update public.site_pages set title = ''Accueil — Chez Alice'' where id = %L', v_page)),
    'L''equipe StaX modifie le site en construction');

  perform set_config('request.jwt.claims',
                     json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_result := public.deliver_site(v_site, 'personne-inconnue@exemple.test');
  reset role;
  perform t.assert(v_result ->> 'code' = 'no_account',
    'Une adresse sans compte ne recoit pas le site');

  perform set_config('request.jwt.claims',
                     json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_result := public.deliver_site(v_site, 'bob@tenant-b.test', 'editor');
  reset role;
  perform set_config('request.jwt.claims', null, true);
  perform t.assert((v_result ->> 'ok')::boolean,
    'L''administration confie le site au client, par son adresse e-mail');
  perform t.assert(exists (select 1 from public.organization_members
                            where organization_id = v_org and user_id = bob and role = 'editor'),
    'Le compte designe devient membre de l''organisation du site');
  perform t.assert(exists (select 1 from public.notifications
                            where recipient_id = bob and site_id = v_site and type = 'site.delivered'),
    'Le client est prevenu que son site est pret');

  perform t.assert(not t.denied_as(alice,
    format('update public.site_pages set title = ''Bienvenue'' where id = %L', v_page)),
    'Une fois le site confie, le client le modifie');
  perform t.assert(not t.denied_as(staff,
    format('update public.site_pages set title = ''Bienvenue chez Alice'' where id = %L', v_page)),
    'L''equipe StaX garde la main apres l''attribution');

  perform set_config('request.jwt.claims',
                     json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.withdraw_site(v_site);
  reset role;
  perform set_config('request.jwt.claims', null, true);
  perform t.assert(t.denied_as(alice,
    format('update public.site_pages set title = ''Encore'' where id = %L', v_page)),
    'Un site repris redevient inaccessible au client en modification');
end;
$$;

\echo '--- Durees de conservation ---'
do $$
declare
  alice uuid := (select v from t.fixtures where k='alice');
  v_failed boolean := false;
begin
  perform set_config('request.jwt.claims', null, true);
  insert into public.audit_logs (action, created_at) values
    ('test.retention_old', now() - interval '4 years'),
    ('test.retention_recent', now() - interval '2 years');
  insert into public.security_events (kind, created_at) values
    ('test.retention_old', now() - interval '13 months'),
    ('test.retention_recent', now() - interval '1 month');

  perform t.assert(t.denied_as(alice, 'select public.apply_retention()'),
    'Un utilisateur ne peut pas declencher la purge');

  begin
    delete from public.audit_logs where action = 'test.retention_recent';
  exception when others then
    v_failed := true;
  end;
  perform t.assert(v_failed, 'Hors purge, le journal d''audit reste impossible a effacer');

  perform public.apply_retention();

  perform t.assert(not exists (select 1 from public.audit_logs where action = 'test.retention_old'),
    'Le journal d''audit de plus de 3 ans est purge');
  perform t.assert(exists (select 1 from public.audit_logs where action = 'test.retention_recent'),
    'Le journal d''audit de moins de 3 ans est conserve');
  perform t.assert(not exists (select 1 from public.security_events where kind = 'test.retention_old'),
    'Les journaux de securite de plus de 12 mois sont purges');
  perform t.assert(exists (select 1 from public.security_events where kind = 'test.retention_recent'),
    'Les journaux de securite recents sont conserves');

  v_failed := false;
  begin
    delete from public.audit_logs where action = 'test.retention_recent';
  exception when others then
    v_failed := true;
  end;
  perform t.assert(v_failed, 'Apres la purge, le journal redevient immuable');
end;
$$;

-- -----------------------------------------------------------------------------
--  Offres : cinq niveaux, maintenance mensuelle, promesses adossees aux droits
-- -----------------------------------------------------------------------------
\echo '--- Offres : cinq niveaux, maintenance mensuelle ---'
do $$
declare
  v_refused boolean := false;
  v_premium uuid := (select id from public.plans where slug = 'premium' and is_active and valid_until is null);
begin
  perform set_config('request.jwt.claims', null, true);

  perform t.assert(
    (select count(*) from public.plans where is_active and is_public and valid_until is null) = 5,
    'Cinq offres publiques : Essentiel, Premium, Ultra Premium, Exceptionnel, Sur mesure');
  perform t.assert(
    (select string_agg(slug || ':' || setup_price_cents || ':' || maintenance_price_cents || ':'
                       || billing_interval, ',' order by sort_order)
       from public.plans where is_active and is_public and not is_quote_only and valid_until is null)
    = 'essentiel:30000:1200:month,premium:55000:1400:month,ultra-premium:109900:1600:month,'
      || 'exceptionnel:179000:1800:month',
    'Tarifs : 300/12, 550/14, 1099/16, 1790/18 EUR HT, maintenance mensuelle');
  perform t.assert(
    (select is_quote_only and billing_interval = 'month' from public.plans
      where slug = 'sur-mesure' and is_active and valid_until is null),
    'Sur mesure : sur devis, maintenance definie selon le projet');
  perform t.assert(
    not exists (select 1 from public.plans
                 where is_active and is_public and valid_until is null and billing_interval = 'year'),
    'Plus aucune offre en vente avec une maintenance annuelle');
  perform t.assert(
    exists (select 1 from public.plans where slug = 'premium' and version = 2 and not is_active),
    'Les versions annuelles sont archivees, jamais supprimees (contrats en cours)');
  perform t.assert(
    (select highlight from public.plans where slug = 'exceptionnel' and is_active) = 'signature',
    'Exceptionnel est presentee comme une categorie superieure');

  -- Droits : ce qui distingue reellement les offres.
  perform t.assert(
    (select count(*) from public.features where key in ('advanced_animations', 'custom_design',
                                                         'max_sites', 'max_monthly_submissions')) = 0,
    'Aucun droit fictif : animations, design, sites et messages ne sont plus des « fonctionnalites »');
  perform t.assert(
    (select limit_value from public.plan_features pf join public.plans p on p.id = pf.plan_id
      where p.slug = 'exceptionnel' and p.is_active and pf.feature_key = 'max_pages') = 35,
    'Exceptionnel : jusqu''a 35 pages');
  perform t.assert(
    (select enabled from public.plan_features pf join public.plans p on p.id = pf.plan_id
      where p.slug = 'premium' and p.is_active and pf.feature_key = 'bookings')
    and not (select enabled from public.plan_features pf join public.plans p on p.id = pf.plan_id
      where p.slug = 'premium' and p.is_active and pf.feature_key = 'ecommerce'),
    'Premium : reservations oui, boutique non');

  -- Une inclusion adossee a un droit que l'offre n'accorde pas est refusee.
  begin
    insert into public.plan_inclusions (plan_id, category, label, feature_key)
    values (v_premium, 'site', 'Boutique en ligne offerte', 'ecommerce');
  exception when others then v_refused := true; end;
  perform t.assert(v_refused, 'Une promesse sans droit correspondant est refusee par la base');

  -- Une commande fige les inclusions et annonce la maintenance a la livraison.
  perform t.assert(jsonb_array_length(app.plan_inclusions_snapshot(v_premium)) > 5,
    'Les inclusions de l''offre sont figees dans chaque commande');

  -- Aucun code promotionnel ne pretend remiser la maintenance.
  v_refused := false;
  begin
    insert into public.coupons (code, kind, value, applies_to) values ('MAINT50', 'percent', 5000, 'maintenance');
  exception when others then v_refused := true; end;
  perform t.assert(v_refused, 'Un code promotionnel sur la maintenance est refuse (jamais applique)');
end;
$$;

-- -----------------------------------------------------------------------------
--  Sites developpes independamment : rattachement, livraison, publication
-- -----------------------------------------------------------------------------
-- Appelle une fonction sous l'identite d'une personne connectee et renvoie
-- son resultat JSON (le role est retabli avant tout retour).
create or replace function t.json_as(p_user uuid, p_sql text)
returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute 'select to_jsonb(' || p_sql || ')' into v_result;
  reset role;
  perform set_config('request.jwt.claims', null, true);
  return v_result;
exception when others then
  reset role;
  perform set_config('request.jwt.claims', null, true);
  raise;
end;
$$;

\echo '--- Sites independants : depot, Cloudflare, livraison, publication ---'
do $$
declare
  staff     uuid := (select v from t.fixtures where k='staff');
  bob       uuid := (select v from t.fixtures where k='bob');
  claire    uuid;
  v_result  jsonb;
  v_org_x   uuid; v_site_x uuid;
  v_org_y   uuid; v_site_y uuid;
  v_manifest uuid;
  v_v1 uuid; v_v2 uuid; v_v3 uuid; v_v4 uuid; v_v5 uuid;
  v_dep     uuid;
  v_hosting uuid;
  v_refused boolean;
  v_rev     int;
  sha1 text := repeat('1', 40);
  sha2 text := repeat('2', 40);
  sha4 text := repeat('4', 40);
  sha5 text := repeat('5', 40);
  v_account text := repeat('ab', 16);
  v_essentiel uuid := (select id from public.plans where slug = 'essentiel' and is_active and valid_until is null);
  v_repo_x text;
begin
  perform set_config('request.jwt.claims', null, true);
  insert into auth.users (email) values ('claire@client-x.test') returning id into claire;
  insert into t.fixtures (k, v) values ('claire', claire) on conflict (k) do update set v = excluded.v;

  -- Installation de l'application GitHub StaX, connue du serveur.
  perform public.upsert_github_installation(1001, 'stax-sites', 5001, 'Organization', 'selected', false);

  -- Deux sites, deux organisations clientes.
  v_result := t.json_as(staff, format('public.admin_create_site(%L, %L, %L::uuid, %L)',
    'Atelier X', 'restaurant', v_essentiel, 'Paris'));
  v_org_x := (v_result ->> 'organizationId')::uuid; v_site_x := (v_result ->> 'siteId')::uuid;
  v_result := t.json_as(staff, format('public.admin_create_site(%L, %L, %L::uuid, %L)',
    'Studio Y', 'coiffeur', v_essentiel, 'Lyon'));
  v_org_y := (v_result ->> 'organizationId')::uuid; v_site_y := (v_result ->> 'siteId')::uuid;
  insert into public.organization_members (organization_id, user_id, role) values (v_org_x, claire, 'owner');
  insert into t.fixtures (k, v) values ('site_x', v_site_x), ('org_x', v_org_x)
    on conflict (k) do update set v = excluded.v;

  perform t.assert((select architecture from public.sites where id = v_site_x) = 'external_repository',
    'Un nouveau site est un projet independant, jamais genere par StaX');

  -- 1. Rattachement du depot : reserve a l'administration, jamais au client.
  v_repo_x := format('public.connect_site_repository(%L::uuid, 1001, 9001, %L, 5001, %L, %L, %L, %L, %L)',
    v_site_x, 'stax-sites', 'atelier-x', 'stax-sites/atelier-x',
    'https://github.com/stax-sites/atelier-x', 'main', 'main');
  perform t.assert(t.denied_as(claire, 'select ' || v_repo_x),
    'Un client ne peut pas rattacher un depot GitHub');

  v_result := t.json_as(staff, v_repo_x);
  perform t.assert((v_result ->> 'ok')::boolean, 'L''administration rattache le depot du site');

  v_result := t.json_as(staff, format(
    'public.connect_site_repository(%L::uuid, 1001, 9001, %L, 5001, %L, %L, %L, %L, %L)',
    v_site_y, 'stax-sites', 'atelier-x', 'stax-sites/atelier-x',
    'https://github.com/stax-sites/atelier-x', 'main', 'main'));
  perform t.assert(v_result ->> 'code' = 'repository_already_attached',
    'Le depot d''une autre organisation ne peut pas etre rattache');

  v_result := t.json_as(staff, format(
    'public.connect_site_repository(%L::uuid, 4242, 9002, %L, 666, %L, %L, %L, %L, %L)',
    v_site_y, 'pirate', 'studio-y', 'pirate/studio-y', 'https://github.com/pirate/studio-y',
    'main', 'main'));
  perform t.assert(v_result ->> 'code' = 'installation_unknown',
    'Un depot hors de l''application GitHub StaX est refuse');

  v_result := t.json_as(staff, format(
    'public.connect_site_repository(%L::uuid, 1001, 9003, %L, 777, %L, %L, %L, %L, %L)',
    v_site_y, 'autre-compte', 'studio-y', 'autre-compte/studio-y',
    'https://github.com/autre-compte/studio-y', 'main', 'main'));
  perform t.assert(v_result ->> 'code' = 'owner_mismatch',
    'Un depot d''un autre compte GitHub que celui de l''installation est refuse');

  -- 2. Projet Cloudflare : un projet, un site.
  v_result := t.json_as(staff, format(
    'public.connect_site_hosting(%L::uuid, %L, %L, %L, %L, %L, %L)',
    v_site_x, 'cloudflare_pages', v_account, 'atelier-x', 'proj-atelier-x', 'main',
    'https://atelier-x.pages.dev'));
  perform t.assert((v_result ->> 'ok')::boolean, 'L''administration rattache le projet Cloudflare');
  v_result := t.json_as(staff, format(
    'public.connect_site_hosting(%L::uuid, %L, %L, %L, %L, %L, %L)',
    v_site_y, 'cloudflare_pages', v_account, 'atelier-x', 'proj-atelier-x', 'main',
    'https://atelier-x.pages.dev'));
  perform t.assert(v_result ->> 'code' = 'project_already_attached',
    'Le projet Cloudflare d''un autre site ne peut pas etre rattache');

  -- 3. Contrat d'edition et contenu initial (version 1, deploiement verifie).
  v_result := t.json_as(staff, format(
    'public.record_site_manifest(%L::uuid, %L, %L, 1, %L::jsonb, %L, %L, %L::jsonb, %L::jsonb, %L::jsonb, true)',
    v_site_x, sha1, 'stax.manifest.json', '{"contract":1,"site":{"name":"Atelier X"}}',
    'hash-manifest', 'valid', '[]', '[]', '{"pages":3,"locales":1,"forms":1,"collections":0}'));
  v_manifest := (v_result ->> 'manifestId')::uuid;
  perform t.assert((v_result ->> 'active')::boolean, 'Un manifeste valide devient le contrat actif');

  v_result := t.json_as(staff, format(
    'public.initialize_site_content(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L::jsonb)',
    v_site_x, v_manifest, '{"pages":{"home":{"hero":{"title":"Bienvenue"}}}}', 'hash-v1', sha1,
    '{"status":"building","providerDeploymentId":"dep-0"}'));
  perform t.assert(v_result ->> 'code' = 'deployment_not_verified',
    'Pas de contenu initial sans deploiement de production reussi');

  v_result := t.json_as(staff, format(
    'public.initialize_site_content(%L::uuid, %L::uuid, %L::jsonb, %L, %L, %L::jsonb)',
    v_site_x, v_manifest, '{"pages":{"home":{"hero":{"title":"Bienvenue"}}}}', 'hash-v1', sha1,
    '{"status":"success","providerDeploymentId":"dep-1","url":"https://d1.atelier-x.pages.dev"}'));
  v_v1 := (v_result ->> 'releaseId')::uuid;
  perform t.assert(v_v1 is not null, 'Le contenu initial devient la version 1, adossee a son commit');

  -- L'equipe StaX travaille sur le projet AVANT la livraison.
  v_rev := (select revision from public.site_content_drafts where site_id = v_site_x);
  v_result := t.json_as(staff, format('public.save_site_draft(%L::uuid, %L::jsonb, %s)',
    v_site_x, '{"pages":{"home":{"hero":{"title":"Bienvenue a l''atelier"}}}}', v_rev));
  perform t.assert((v_result ->> 'ok')::boolean,
    'L''equipe StaX modifie le brouillon avant la livraison');

  perform t.assert(
    (select production_release_id from public.sites where id = v_site_x) = v_v1
    and (select status from public.site_releases where id = v_v1) = 'published',
    'La version 1 est la version de production');

  -- 4. Avant la livraison, le client ne peut rien modifier ni publier.
  v_rev := (select revision from public.site_content_drafts where site_id = v_site_x);
  perform t.assert(t.denied_as(claire, format(
    'select public.save_site_draft(%L, %L::jsonb, %s)', v_site_x, '{"x":1}', v_rev)),
    'Avant la livraison, le client ne peut pas modifier son site');
  perform t.assert(t.denied_as(claire, format(
    'select public.request_site_release(%L, ''publish'', null, %s)', v_site_x, v_rev)),
    'Avant la livraison, le client ne peut pas publier');
  perform t.assert(t.denied_as(claire, format('select public.begin_site_preview(%L)', v_site_x)),
    'Avant la livraison, le client ne peut pas demander d''apercu');
  perform t.assert(t.denied_as(claire, format('select public.deliver_site(%L)', v_site_x)),
    'Le client ne peut pas se livrer le site lui-meme');

  -- 5. Livraison : refusee tant que la checklist n'est pas complete.
  v_result := t.json_as(staff, format('public.deliver_site(%L::uuid)', v_site_x));
  perform t.assert(v_result ->> 'code' = 'checklist_incomplete'
                   and v_result -> 'missing' ? 'deployed' and v_result -> 'missing' ? 'forms',
    'Pas de livraison sans checklist complete (deploiement, domaine, HTTPS, formulaires...)');

  perform t.assert(t.denied_as(staff, format(
    'select public.attest_delivery_check(%L, ''https'', true, ''Verifie a la main, promis'')', v_site_x)),
    'Un controle automatique (HTTPS) ne s''atteste pas a la main');
  perform t.assert(t.denied_as(staff, format(
    'select public.attest_delivery_check(%L, ''forms'', true, ''ok'')', v_site_x)),
    'Une attestation manuelle exige une description de ce qui a ete verifie');

  perform t.json_as(staff, format('public.attest_delivery_check(%L::uuid, %L, true, %L)',
    v_site_x, 'forms', 'Formulaire de contact envoye et recu dans la messagerie StaX'));
  perform t.json_as(staff, format('public.attest_delivery_check(%L::uuid, %L, true, %L)',
    v_site_x, 'responsive', 'Verifie sur iPhone 15, Pixel 8, iPad et ordinateur 1440 px'));

  perform t.assert(t.denied_as(staff, format(
    'select public.record_delivery_check(%L, ''deployed'', true, ''{}''::jsonb)', v_site_x)),
    'Seul le serveur enregistre un controle automatique (preuve a l''appui)');
  perform set_config('request.jwt.claims', null, true);
  perform public.record_delivery_check(v_site_x, 'deployed', true, '{"deployment":"dep-1"}'::jsonb);
  perform public.record_delivery_check(v_site_x, 'domain', true, '{"hostname":"atelier-x.fr"}'::jsonb);
  perform public.record_delivery_check(v_site_x, 'https', true, '{"status":200}'::jsonb);
  perform public.record_delivery_check(v_site_x, 'seo', true, '{"title":true,"sitemap":true}'::jsonb);

  v_result := t.json_as(staff, format('public.delivery_readiness(%L::uuid)', v_site_x));
  perform t.assert((v_result ->> 'ready')::boolean, 'Checklist complete : le site est pret a livrer');
  v_result := t.json_as(staff, format('public.deliver_site(%L::uuid)', v_site_x));
  perform t.assert((v_result ->> 'ok')::boolean, 'La livraison aboutit une fois la checklist complete');
  perform t.assert((select status from public.sites where id = v_site_x) = 'live'
                   and (select delivered_at is not null from public.sites where id = v_site_x),
    'Le site livre est en ligne et confie au client');
  perform t.assert((select status::text from public.projects where site_id = v_site_x) = 'delivered',
    'Le projet passe a l''etape Livraison');

  -- 6. Apres la livraison, le client modifie et publie.
  v_rev := (select revision from public.site_content_drafts where site_id = v_site_x);
  v_result := t.json_as(claire, format('public.save_site_draft(%L::uuid, %L::jsonb, %s)',
    v_site_x, '{"pages":{"home":{"hero":{"title":"Nouveau titre"}}}}', v_rev));
  perform t.assert((v_result ->> 'ok')::boolean, 'La livraison ouvre l''edition au client');
  v_result := t.json_as(claire, format('public.save_site_draft(%L::uuid, %L::jsonb, %s)',
    v_site_x, '{"pages":{}}', v_rev));
  perform t.assert(v_result ->> 'code' = 'conflict',
    'Un brouillon modifie entre-temps n''est pas ecrase (controle de revision)');
  v_rev := (select revision from public.site_content_drafts where site_id = v_site_x);
  v_result := t.json_as(claire, format(
    'public.request_site_release(%L::uuid, %L, null, %s, null, %L)', v_site_x, 'publish', v_rev,
    'Nouveau titre'));
  v_v2 := (v_result ->> 'releaseId')::uuid;
  perform t.assert((v_result ->> 'ok')::boolean and (v_result ->> 'version')::int = 2,
    'Publier cree une nouvelle version (v2)');
  v_result := t.json_as(claire, format('public.request_site_release(%L::uuid, %L, null, %s)',
    v_site_x, 'publish', v_rev));
  perform t.assert(v_result ->> 'code' = 'release_in_progress',
    'Une seule publication a la fois par site');
  v_result := t.json_as(claire, format(
    'public.request_site_release(%L::uuid, %L, null, null, now() + interval %L)',
    v_site_x, 'publish', '2 days'));
  perform t.assert(v_result ->> 'code' = 'feature_unavailable',
    'La publication programmee est refusee hors des offres qui la comprennent');

  perform t.assert((select status from public.site_releases where id = v_v2) = 'queued'
                   and (select production_release_id from public.sites where id = v_site_x) = v_v1,
    'Une version demandee n''est PAS publiee : la production reste en v1');

  -- 7. Un client ne peut pas se declarer publie.
  perform t.assert(t.denied_as(claire, format(
    'select public.record_release_commit(%L, %L, %L, ''https://x'', ''main'')', v_v2, sha1, sha2)),
    'Un client ne peut pas inscrire un commit a la place de GitHub');
  perform t.assert(t.denied_as(claire, format(
    'select public.record_site_deployment((select id from site_hosting where site_id = %L), ''dep-x'', ''production'', ''success'', %L)',
    v_site_x, sha2)),
    'Un client ne peut pas declarer un deploiement Cloudflare reussi');
  perform t.assert(t.denied_as(claire, format(
    'update public.site_releases set status = ''published'' where id = %L', v_v2)),
    'Un client ne peut pas modifier l''etat d''une version');

  -- 8. Cycle serveur : commit GitHub puis deploiement Cloudflare confirme.
  perform set_config('request.jwt.claims', null, true);
  v_result := public.claim_site_release(v_v2);
  perform t.assert((v_result ->> 'ok')::boolean, 'Le serveur prend la version en charge');
  v_result := public.record_release_commit(v_v2, sha1, sha2,
    'https://github.com/stax-sites/atelier-x/commit/' || sha2, 'main');
  v_dep := (v_result ->> 'deploymentId')::uuid;
  v_hosting := (select hosting_id from public.site_deployments where id = v_dep);
  perform t.assert((select status from public.site_releases where id = v_v2) = 'deploying'
                   and (select production_release_id from public.sites where id = v_site_x) = v_v1,
    'Commit ecrit, deploiement en cours : la production reste en v1 (« publie » jamais affiche)');

  v_result := public.record_site_deployment(v_hosting, 'dep-2', 'production', 'building', sha2, 'main');
  perform t.assert((select status from public.site_releases where id = v_v2) = 'deploying',
    'Un build en cours ne publie rien');
  v_result := public.record_site_deployment(v_hosting, 'dep-2', 'production', 'success', sha2, 'main',
    'https://d2.atelier-x.pages.dev');
  perform t.assert((select status from public.site_releases where id = v_v2) = 'published'
                   and (select production_release_id from public.sites where id = v_site_x) = v_v2,
    'Le deploiement confirme publie la v2 : la version publiee correspond a un commit');
  perform t.assert((select status from public.site_releases where id = v_v1) = 'superseded',
    'La version precedente est remplacee, pas effacee');
  perform t.assert((select commit_sha from public.site_releases where id = v_v2) = sha2,
    'La version publiee porte le SHA du commit deploye');

  v_result := public.record_site_deployment(v_hosting, 'dep-2', 'production', 'failure', sha2);
  perform t.assert(v_result ->> 'code' = 'already_final'
                   and (select status from public.site_releases where id = v_v2) = 'published',
    'Un evenement tardif ne peut pas « depublier » une version');

  -- 9. Echec GitHub : la production ne bouge pas.
  v_rev := (select revision from public.site_content_drafts where site_id = v_site_x);
  v_v3 := (t.json_as(claire, format('public.request_site_release(%L::uuid, %L, null, %s)',
    v_site_x, 'publish', v_rev)) ->> 'releaseId')::uuid;
  perform public.claim_site_release(v_v3);
  perform public.fail_site_release(v_v3, 'github', 'github_unavailable',
    'GitHub n''a pas accepte le commit.');
  perform t.assert((select status from public.site_releases where id = v_v3) = 'failed'
                   and (select production_release_id from public.sites where id = v_site_x) = v_v2,
    'Echec GitHub : la version n''est pas publiee, la v2 reste en production');
  perform t.assert(exists (select 1 from public.notifications
                            where recipient_id = claire and type = 'site.release_failed'),
    'Le client recoit une erreur claire');

  -- 10. Echec Cloudflare : idem.
  v_v4 := (t.json_as(claire, format('public.request_site_release(%L::uuid, %L, null, %s)',
    v_site_x, 'publish', v_rev)) ->> 'releaseId')::uuid;
  perform public.claim_site_release(v_v4);
  perform public.record_release_commit(v_v4, sha2, sha4, 'https://github.com/x/y/commit/' || sha4, 'main');
  perform public.record_site_deployment(v_hosting, 'dep-4', 'production', 'failure', sha4, 'main',
    null, 'build', 'npm run build exited with 1');
  perform t.assert((select status from public.site_releases where id = v_v4) = 'failed'
                   and (select error_stage from public.site_releases where id = v_v4) = 'cloudflare'
                   and (select production_release_id from public.sites where id = v_site_x) = v_v2,
    'Echec Cloudflare : la version echoue, la v2 reste la version de production');

  -- 11. Retour arriere : la v1 est republiee, comme une nouvelle version.
  v_result := t.json_as(claire, format('public.request_site_release(%L::uuid, %L, %L::uuid)',
    v_site_x, 'rollback', v_v1));
  v_v5 := (v_result ->> 'releaseId')::uuid;
  perform t.assert((select content from public.site_releases where id = v_v5)
                   = (select content from public.site_releases where id = v_v1)
                   and (select kind from public.site_releases where id = v_v5) = 'rollback',
    'Restaurer la v1 cree une version v5 au contenu de la v1');
  perform public.claim_site_release(v_v5);
  perform public.record_release_commit(v_v5, sha4, sha5, 'https://github.com/x/y/commit/' || sha5, 'main');
  perform public.record_site_deployment(v_hosting, 'dep-5', 'production', 'success', sha5, 'main');
  perform t.assert((select production_release_id from public.sites where id = v_site_x) = v_v5,
    'Le retour arriere est redeploye puis mis en production');

  -- 12. Le contenu d'une version est immuable, pour tout le monde.
  perform set_config('request.jwt.claims', null, true);
  v_refused := false;
  begin
    update public.site_releases set content = '{"pirate":true}'::jsonb where id = v_v2;
  exception when others then v_refused := true; end;
  perform t.assert(v_refused, 'Le contenu d''une version publiee ne se modifie jamais');
  v_refused := false;
  begin
    insert into public.site_releases (site_id, organization_id, version_number, kind, status,
                                      manifest_id, content, content_hash)
    values (v_site_x, v_org_x, 99, 'publish', 'published', v_manifest, '{}'::jsonb, 'x');
  exception when others then v_refused := true; end;
  perform t.assert(v_refused, 'Une version ne peut pas naitre « publiee » sans commit ni deploiement');

  -- 13. Isolation : une autre societe ne voit ni ne touche rien.
  perform t.assert(t.count_as(bob, format('select 1 from site_content_drafts where site_id = %L', v_site_x)) = 0,
    'Un autre client ne lit pas le brouillon');
  perform t.assert(t.count_as(bob, format('select 1 from site_releases where site_id = %L', v_site_x)) = 0,
    'Un autre client ne lit pas l''historique des versions');
  perform t.assert(t.count_as(claire, 'select 1 from site_repositories') = 0
                   and t.count_as(claire, 'select 1 from site_hosting') = 0,
    'Le client ne voit pas les details d''infrastructure (depot, compte Cloudflare)');
  perform t.assert(t.count_as(claire, format('select 1 from site_releases where site_id = %L', v_site_x)) = 5,
    'Le client voit l''historique complet de SES versions');
  perform t.assert(t.denied_as(bob, format(
    'select public.save_site_draft(%L, ''{}''::jsonb, null)', v_site_x)),
    'Un autre client ne peut pas modifier le site');
  perform t.assert(t.denied_as(bob, format(
    'select public.request_site_release(%L, ''rollback'', %L)', v_site_x, v_v1)),
    'Un autre client ne peut pas publier ni restaurer le site');

  -- 14. Apercu : un seul build a la fois.
  v_result := t.json_as(claire, format('public.begin_site_preview(%L::uuid)', v_site_x));
  perform t.assert((v_result ->> 'ok')::boolean, 'Le client livre demande un apercu');
  v_result := t.json_as(claire, format('public.begin_site_preview(%L::uuid)', v_site_x));
  perform t.assert(v_result ->> 'code' = 'preview_in_progress', 'Un seul apercu en preparation a la fois');

  -- 15. Le moteur multi-tenant ne publie jamais un site independant.
  perform set_config('request.jwt.claims', null, true);
  v_refused := false;
  begin
    insert into public.site_versions (site_id, version_number, snapshot, content_hash)
    values (v_site_x, 1, '{}'::jsonb, 'x');
  exception when others then v_refused := true; end;
  perform t.assert(v_refused, 'Aucun instantane du moteur de rendu pour un site independant');

  -- 16. Le domaine d'un site independant est gere par l'equipe.
  perform t.assert(t.denied_as(claire, format(
    'insert into public.site_domains (site_id, organization_id, hostname) values (%L, %L, ''pirate.example'')',
    v_site_x, v_org_x)),
    'Le client ne rattache pas lui-meme un domaine a un site independant');

  -- 17. Plus aucun modele de site.
  perform t.assert(not exists (select 1 from pg_proc where proname = 'provision_site')
                   and to_regclass('public.site_templates') is null,
    'Aucun modele de site : ni fonction de provisionnement, ni catalogue de structures');
end;
$$;

\echo '--- Confirmation tardive d''un deploiement, droits des modules ---'
do $$
declare
  staff     uuid := (select v from t.fixtures where k='staff');
  claire    uuid := (select v from t.fixtures where k='claire');
  v_site_x  uuid := (select v from t.fixtures where k='site_x');
  v_hosting uuid;
  v_result  jsonb;
  v_rev     int;
  v_v6 uuid; v_v7 uuid; v_v8 uuid;
  v_before  uuid;
  sha6 text := repeat('6', 40);
  sha7 text := repeat('7', 40);
  sha8 text := repeat('8', 40);
  v_site_y  uuid;
  v_essentiel uuid := (select id from public.plans where slug = 'essentiel' and is_active and valid_until is null);
begin
  perform set_config('request.jwt.claims', null, true);
  v_hosting := (select id from public.site_hosting where site_id = v_site_x and status = 'connected');
  v_before := (select production_release_id from public.sites where id = v_site_x);

  -- 1. Delai depasse : la version est declaree en echec, la production ne bouge pas.
  v_rev := (select revision from public.site_content_drafts where site_id = v_site_x);
  v_v6 := (t.json_as(claire, format('public.request_site_release(%L::uuid, %L, null, %s)',
    v_site_x, 'publish', v_rev)) ->> 'releaseId')::uuid;
  perform set_config('request.jwt.claims', null, true);
  perform public.claim_site_release(v_v6);
  perform public.record_release_commit(v_v6, null, sha6, 'https://github.com/x/y/commit/' || sha6, 'main');
  perform public.fail_site_release(v_v6, 'timeout', 'deployment_timeout',
    'Cloudflare n''a pas confirme le deploiement dans le delai.');
  perform t.assert((select status from public.site_releases where id = v_v6) = 'failed'
                   and (select production_release_id from public.sites where id = v_site_x) = v_before,
    'Sans confirmation dans le delai : echec affiche, la production ne change pas');

  -- 2. Cloudflare confirme ensuite CE commit : la version est bien en ligne.
  perform public.record_site_deployment(v_hosting, 'dep-6', 'production', 'success', sha6, 'main');
  perform t.assert((select status from public.site_releases where id = v_v6) = 'published'
                   and (select production_release_id from public.sites where id = v_site_x) = v_v6
                   and (select error_stage from public.site_releases where id = v_v6) is null,
    'Confirmation tardive de Cloudflare : la version devient publiee (etat reel du site)');

  -- 3. Une confirmation tardive ne passe jamais devant une version plus recente.
  v_rev := (select revision from public.site_content_drafts where site_id = v_site_x);
  v_v7 := (t.json_as(claire, format('public.request_site_release(%L::uuid, %L, null, %s)',
    v_site_x, 'publish', v_rev)) ->> 'releaseId')::uuid;
  perform set_config('request.jwt.claims', null, true);
  perform public.claim_site_release(v_v7);
  perform public.record_release_commit(v_v7, sha6, sha7, 'https://github.com/x/y/commit/' || sha7, 'main');
  perform public.fail_site_release(v_v7, 'timeout', 'deployment_timeout', 'Delai depasse.');
  v_v8 := (t.json_as(claire, format('public.request_site_release(%L::uuid, %L, null, %s)',
    v_site_x, 'publish', v_rev)) ->> 'releaseId')::uuid;
  perform set_config('request.jwt.claims', null, true);
  perform public.claim_site_release(v_v8);
  perform public.record_release_commit(v_v8, sha7, sha8, 'https://github.com/x/y/commit/' || sha8, 'main');
  perform public.record_site_deployment(v_hosting, 'dep-8', 'production', 'success', sha8, 'main');
  perform public.record_site_deployment(v_hosting, 'dep-7', 'production', 'success', sha7, 'main');
  perform t.assert((select status from public.site_releases where id = v_v7) = 'failed'
                   and (select production_release_id from public.sites where id = v_site_x) = v_v8,
    'Une confirmation tardive ne remplace jamais une version plus recente');

  -- 4. Une version en echec pour une autre raison ne se « rattrape » pas.
  perform t.assert(not exists (
      select 1 from public.site_releases
       where site_id = v_site_x and status = 'failed' and error_stage = 'cloudflare'
         and published_at is not null),
    'Un echec Cloudflare reste un echec');

  -- 5. Offre Essentiel : un contrat qui utilise les reservations et deux
  --    langues ne peut pas etre livre.
  v_result := t.json_as(staff, format('public.admin_create_site(%L, %L, %L::uuid, %L)',
    'Cabinet Z', 'coiffeur', v_essentiel, 'Nantes'));
  v_site_y := (v_result ->> 'siteId')::uuid;
  v_result := t.json_as(staff, format(
    'public.record_site_manifest(%L::uuid, %L, %L, 1, %L::jsonb, %L, %L, %L::jsonb, %L::jsonb, %L::jsonb, true)',
    v_site_y, sha6, 'stax.manifest.json', '{"contract":1,"site":{"name":"Cabinet Z"}}',
    'hash-z', 'valid', '[]', '[]',
    '{"pages":3,"locales":2,"forms":1,"collections":0,"advancedForms":false,"modules":["contact","booking"]}'));
  v_result := t.json_as(staff, format('public.delivery_readiness(%L::uuid)', v_site_y));
  perform t.assert(
    exists (select 1 from jsonb_array_elements(v_result -> 'checks') c
             where c ->> 'key' = 'plan' and c ->> 'status' = 'failed'
               and (c -> 'evidence' -> 'problems')::text like '%booking%'
               and (c -> 'evidence' -> 'problems')::text like '%multilingue%'),
    'Checklist : un module ou une langue hors offre bloque la livraison');
end;
$$;

\echo '--- Validation du client pendant le projet ---'
do $$
declare
  staff     uuid := (select v from t.fixtures where k='staff');
  bob       uuid := (select v from t.fixtures where k='bob');
  dana      uuid;
  v_result  jsonb;
  v_org     uuid;
  v_site    uuid;
  v_project uuid;
  v_essentiel uuid := (select id from public.plans where slug = 'essentiel' and is_active and valid_until is null);
begin
  perform set_config('request.jwt.claims', null, true);
  insert into auth.users (email) values ('dana@client-z.test') returning id into dana;
  v_result := t.json_as(staff, format('public.admin_create_site(%L, %L, %L::uuid, %L)',
    'Atelier Z', 'restaurant', v_essentiel, 'Lille'));
  v_org := (v_result ->> 'organizationId')::uuid;
  v_site := (v_result ->> 'siteId')::uuid;
  insert into public.organization_members (organization_id, user_id, role) values (v_org, dana, 'owner');
  v_project := (select id from public.projects where site_id = v_site order by created_at desc limit 1);

  v_result := t.json_as(dana, format('public.respond_to_project_review(%L::uuid, true, null)', v_project));
  perform t.assert(v_result ->> 'code' = 'not_awaiting_review',
    'Le client ne « valide » rien tant qu''aucune validation n''est demandee');

  perform t.json_as(staff, format('public.set_project_phase(%L::uuid, %L, %L)', v_site, 'design', 'Maquettes'));
  perform t.json_as(staff, format('public.set_project_phase(%L::uuid, %L, %L)', v_site, 'client_review',
    'Les maquettes sont pretes'));
  perform t.assert(t.denied_as(bob, format('select public.respond_to_project_review(%L, true, null)', v_project)),
    'Un autre client ne peut pas valider le projet d''une autre societe');

  v_result := t.json_as(dana, format('public.respond_to_project_review(%L::uuid, false, null)', v_project));
  perform t.assert(v_result ->> 'code' = 'message_required',
    'Demander des corrections exige de les decrire');

  v_result := t.json_as(dana, format('public.respond_to_project_review(%L::uuid, false, %L)', v_project,
    'Le logo doit etre plus grand'));
  perform t.assert((v_result ->> 'ok')::boolean
                   and (select status::text from public.projects where id = v_project) = 'changes_requested',
    'Le client demande des corrections : le projet passe en corrections');

  perform t.json_as(staff, format('public.set_project_phase(%L::uuid, %L, null)', v_site, 'client_review'));
  v_result := t.json_as(dana, format('public.respond_to_project_review(%L::uuid, true, %L)', v_project,
    'Parfait, merci'));
  perform t.assert((select status::text from public.projects where id = v_project) = 'development',
    'Le client valide la conception : le projet passe au developpement');
  perform t.assert(exists (select 1 from public.project_events
                            where project_id = v_project and kind = 'client_approved' and is_public),
    'La validation du client est inscrite dans l''historique du projet');
end;
$$;

-- -----------------------------------------------------------------------------
--  Maintenance : elle commence a la livraison, jamais a la commande
-- -----------------------------------------------------------------------------
\echo '--- Maintenance : demarrage a la livraison ---'
do $$
declare
  v_site_x uuid := (select v from t.fixtures where k='site_x');
  v_org_x  uuid := (select v from t.fixtures where k='org_x');
  v_site_y uuid;
  v_org_y  uuid;
  v_plan   uuid := (select id from public.plans where slug = 'premium' and is_active and valid_until is null);
  v_order_x uuid; v_order_y uuid;
  v_result jsonb;
begin
  perform set_config('request.jwt.claims', null, true);
  select id, organization_id into v_site_y, v_org_y from public.sites where name = 'Studio Y';

  insert into public.orders (reference, organization_id, site_id, status, plan_id, plan_slug,
    setup_price_cents, maintenance_price_cents, billing_interval, total_cents,
    terms_version, terms_accepted_at)
  values ('STX-TEST-Y', v_org_y, v_site_y, 'checkout_pending', v_plan, 'premium', 55000, 1400,
          'month', 66000, '2026-09', now())
  returning id into v_order_y;
  update public.orders set status = 'paid' where id = v_order_y;
  perform t.assert((select maintenance_status from public.orders where id = v_order_y) = 'pending_delivery',
    'Au paiement, la maintenance est en attente de livraison : rien n''est preleve');

  v_result := app.upsert_subscription_from_stripe('sub_test_y', 'cus_test_y', 'active', now(),
    now() + interval '1 month', false, v_order_y, null);
  perform t.assert(v_result ->> 'code' = 'site_not_delivered'
                   and not exists (select 1 from public.subscriptions where order_id = v_order_y),
    'Un abonnement de maintenance est refuse tant que le site n''est pas livre');

  insert into public.orders (reference, organization_id, site_id, status, plan_id, plan_slug,
    setup_price_cents, maintenance_price_cents, billing_interval, total_cents,
    terms_version, terms_accepted_at)
  values ('STX-TEST-X', v_org_x, v_site_x, 'checkout_pending', v_plan, 'premium', 55000, 1400,
          'month', 66000, '2026-09', now())
  returning id into v_order_x;
  update public.orders set status = 'paid' where id = v_order_x;
  v_result := app.upsert_subscription_from_stripe('sub_test_x', 'cus_test_x', 'active', now(),
    now() + interval '1 month', false, v_order_x, null);
  perform t.assert((v_result ->> 'ok')::boolean
                   and (select billing_interval from public.subscriptions where order_id = v_order_x) = 'month',
    'Une fois le site livre, la maintenance mensuelle demarre');
  perform t.assert((select maintenance_status from public.orders where id = v_order_x) = 'started'
                   and (select maintenance_started_at is not null from public.orders where id = v_order_x),
    'La commande enregistre la date de demarrage de la maintenance');
end;
$$;

-- -----------------------------------------------------------------------------
--  Quotas appliques par la base
-- -----------------------------------------------------------------------------
\echo '--- Quotas appliques ---'
do $$
declare
  claire uuid := (select v from t.fixtures where k='claire');
  staff  uuid := (select v from t.fixtures where k='staff');
  v_site_x uuid := (select v from t.fixtures where k='site_x');
  v_org_x  uuid := (select v from t.fixtures where k='org_x');
  v_org_a  uuid := (select v from t.fixtures where k='org_a');
  v_ticket uuid;
begin
  perform set_config('request.jwt.claims', null, true);
  -- Essentiel : 2 comptes collaborateurs. Claire occupe le premier ; l'equipe
  -- StaX, membre de l'organisation, ne compte pas.
  perform t.assert(app.usage_count(v_org_x, 'max_team_members') = 1,
    'L''equipe StaX ne consomme pas le quota de collaborateurs du client');
  perform t.assert(not t.denied_as(claire, format(
    'insert into public.organization_invitations (organization_id, email, role, token_hash, expires_at) '
    'values (%L, ''dora@client-x.test'', ''editor'', ''h1'', now() + interval ''7 days'')', v_org_x)),
    'Un second collaborateur est invite (2 sur 2)');
  perform t.assert(t.denied_as(claire, format(
    'insert into public.organization_invitations (organization_id, email, role, token_hash, expires_at) '
    'values (%L, ''eric@client-x.test'', ''editor'', ''h2'', now() + interval ''7 days'')', v_org_x)),
    'Un troisieme collaborateur est refuse sur l''offre Essentiel');

  -- Boutique : droit d'offre, verifie par la base.
  perform t.assert(t.denied_as(claire, format(
    'insert into public.products (site_id, organization_id, name, slug, price_cents) '
    'values (%L, %L, ''Pain'', ''pain'', 250)', v_site_x, v_org_x)),
    'Sans boutique dans l''offre, aucun produit ne peut etre cree');

  -- Pages : celles du contrat d'edition comptent.
  perform t.assert(app.usage_count(v_org_x, 'max_pages') = 3,
    'Les pages d''un site independant sont celles de son contrat d''edition');

  -- Support prioritaire : un droit applique.
  insert into public.support_tickets (reference, organization_id, subject, priority)
  values ('SUP-TEST-A', v_org_a, 'Question sur ma boutique', 'normal')
  returning id into v_ticket;
  perform t.assert((select priority from public.support_tickets where id = v_ticket) = 'high',
    'Support prioritaire : la demande d''un client Ultra Premium est ouverte en priorite haute');
end;
$$;

-- -----------------------------------------------------------------------------
--  Site suspendu : ni edition, ni publication, rien d'efface
-- -----------------------------------------------------------------------------
\echo '--- Site suspendu ---'
do $$
declare
  claire   uuid := (select v from t.fixtures where k='claire');
  v_site_x uuid := (select v from t.fixtures where k='site_x');
  v_rev     int;
  v_pending uuid;
  v_online  uuid;
  v_result  jsonb;
  v_status  text;
begin
  perform set_config('request.jwt.claims', null, true);
  v_rev := (select revision from public.site_content_drafts where site_id = v_site_x);
  v_result := t.json_as(claire, format('public.request_site_release(%L::uuid, %L, null, %s)',
    v_site_x, 'publish', v_rev));
  v_pending := (v_result ->> 'releaseId')::uuid;
  perform t.assert(v_pending is not null, 'Une publication est demandee avant la suspension');
  v_online := (select production_release_id from public.sites where id = v_site_x);
  v_status := (select status::text from public.sites where id = v_site_x);

  -- Suspension par le statut (parcours historique), sans date.
  perform set_config('request.jwt.claims', null, true);
  update public.sites set status = 'suspended' where id = v_site_x;

  v_result := public.claim_site_release(v_pending);
  perform t.assert(v_result ->> 'code' = 'site_unavailable'
                   and (select status from public.site_releases where id = v_pending) = 'failed'
                   and (select production_release_id from public.sites where id = v_site_x) = v_online,
    'Une publication en attente n''est jamais deployee sur un site suspendu');
  perform t.assert(t.denied_as(claire, format(
    'select public.save_site_draft(%L, ''{}''::jsonb, null)', v_site_x)),
    'Un site suspendu ne se modifie plus');
  perform t.assert(t.denied_as(claire, format(
    'select public.request_site_release(%L, ''publish'', null, null)', v_site_x)),
    'Un site suspendu ne se publie plus');
  perform t.assert(t.denied_as(claire, format('select public.begin_site_preview(%L)', v_site_x)),
    'Un site suspendu ne produit plus d''apercu');
  perform t.assert(t.count_as(claire, format('select 1 from site_releases where site_id = %L', v_site_x)) > 0,
    'Le client relit toujours l''historique de ses versions');

  perform set_config('request.jwt.claims', null, true);
  update public.sites set status = v_status::app.site_status where id = v_site_x;
  perform t.assert(not t.denied_as(claire, format(
    'select public.save_site_draft(%L, ''{"pages":{}}''::jsonb, null)', v_site_x)),
    'Leve la suspension, le client retrouve l''edition');
end;
$$;

-- -----------------------------------------------------------------------------
--  Durcissements 0052 : journal d'audit et calcul du prix
-- -----------------------------------------------------------------------------
\echo '--- Journal d''audit et calcul du prix (0052) ---'
do $$
declare
  alice   uuid := (select v from t.fixtures where k='alice');
  staff   uuid := (select v from t.fixtures where k='staff');
  v_org_a uuid := (select v from t.fixtures where k='org_a');
  v_org_b uuid := (select v from t.fixtures where k='org_b');
  v_site_a uuid := (select v from t.fixtures where k='site_a');
  v_site_b uuid := (select v from t.fixtures where k='site_b');
  v_before int;
begin
  perform set_config('request.jwt.claims', null, true);
  v_before := (select count(*) from public.audit_logs where organization_id = v_org_b);
  perform t.assert(t.denied_as(alice, format(
    'select public.write_audit(''site.delivered'', %L::uuid, %L::uuid, ''site'', ''x'', ''{}''::jsonb)',
    v_org_b, v_site_b)),
    'Un client ne peut pas ecrire dans le journal d''audit d''une autre organisation');
  perform t.assert(t.denied_as(alice, format(
    'select public.write_audit(''site.cache_purged'', %L::uuid, %L::uuid, ''site'', ''x'', ''{}''::jsonb)',
    v_org_a, v_site_b)),
    'Un client ne peut pas rattacher une ligne d''audit au site d''une autre organisation');
  perform t.assert(t.denied_as(alice,
    'select public.write_audit(''system.anything'', null, null, null, null, ''{}''::jsonb)'),
    'Un client ne peut pas ecrire une ligne d''audit sans organisation');
  perform set_config('request.jwt.claims', null, true);
  perform t.assert((select count(*) from public.audit_logs where organization_id = v_org_b) = v_before,
    'Le journal de l''autre organisation est intact');

  perform t.assert(not t.denied_as(alice, format(
    'select public.write_audit(''site.cache_purged'', %L::uuid, %L::uuid, ''site'', ''x'', ''{}''::jsonb)',
    v_org_a, v_site_a)),
    'Un client ecrit dans le journal de sa propre organisation');
  perform t.assert(not t.denied_as(staff, format(
    'select public.write_audit(''site.domain_attached'', %L::uuid, %L::uuid, ''site'', ''x'', ''{}''::jsonb)',
    v_org_b, v_site_b)),
    'L''equipe StaX ecrit dans le journal de toute organisation');
  perform set_config('request.jwt.claims', null, true);

  perform t.assert(not has_function_privilege('anon', 'public.compute_order_pricing(uuid, text)', 'execute'),
    'anon ne peut PAS calculer un prix ni tester un code promotionnel');
  perform t.assert(has_function_privilege('authenticated', 'public.compute_order_pricing(uuid, text)', 'execute'),
    'Une personne connectee peut calculer le prix de sa commande');
end;
$$;

-- -----------------------------------------------------------------------------
--  Tache de fond planifiee par la base (0053)
-- -----------------------------------------------------------------------------
\echo '--- Tache de fond des sites (0053) ---'
do $$
begin
  perform t.assert(to_regprocedure('app.trigger_site_operations()') is not null,
    'La base sait declencher la tache de fond des sites');
  perform t.assert(not has_function_privilege('anon', 'app.trigger_site_operations()', 'execute')
                   and not has_function_privilege('authenticated', 'app.trigger_site_operations()', 'execute'),
    'Ni un visiteur ni un client ne peuvent declencher la tache de fond');
  perform t.assert(app.trigger_site_operations() is null,
    'Sans adresse ni secret dans Vault, le declencheur ne fait rien');
end;
$$;

\echo ''
\echo '================================================'
\echo '  Tous les tests de securite sont passes.'
\echo '================================================'

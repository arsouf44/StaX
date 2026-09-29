-- =============================================================================
--  0056 — Durcissement de sécurité (audit du 2026-09-27)
--
--  La base est la VRAIE frontière : un utilisateur connecté peut appeler
--  l'API (PostgREST) directement avec son propre jeton, sans passer par les
--  actions serveur de la plateforme. Tout ce que l'application vérifie doit
--  donc l'être aussi ici. Cet audit a trouvé quatre écarts.
--
--  1. Double facteur du personnel : exigé par la base.
--     `mfa_enforced` n'était contrôlé que par l'application (`getAdminContext`).
--     Avec le seul mot de passe d'un compte de l'équipe, un jeton `aal1`
--     suffisait pour lire, via l'API, les données de TOUS les clients.
--     Désormais `app.platform_role()` — dont dépendent toutes les règles
--     « personnel StaX » — ne reconnaît le rôle qu'avec un jeton `aal2` quand
--     le compte porte `mfa_enforced`. Le garde-fou des rôles passe par elle :
--     un jeton `aal1` ne peut pas non plus lever sa propre obligation.
--
--  2. Messagerie (discussion de projet, tickets) : ce que l'auteur ne choisit pas.
--     Un client pouvait, via l'API, antidater ou postdater un message
--     (`created_at`), le marquer « lu par l'équipe » (il n'apparaissait alors
--     dans aucune file), joindre des pièces jointes arbitraires, et envoyer
--     des milliers de messages. Un ticket pouvait naître « urgent », « résolu »
--     ou assigné à quelqu'un. La base impose maintenant l'horodatage, les
--     accusés de lecture, le statut et la priorité, et limite le débit.
--
--  3. Texte des messages : caractères invisibles et trompeurs retirés.
--     Contrôles, marques de direction (U+202E « RLO » retourne l'affichage
--     d'un nom de fichier ou d'un lien), espaces de largeur nulle, caractères
--     « tag » invisibles (texte caché dans un message). Le texte visible,
--     y compris `<script>` ou `'; drop table …`, est conservé TEL QUEL : c'est
--     du texte, jamais exécuté (requêtes paramétrées, rendu échappé).
--
--  4. Stockage des médias : le SVG est refusé.
--     Le seau public `site-media` acceptait `image/svg+xml`. Un SVG est un
--     document pouvant contenir du script : déposé directement via l'API de
--     stockage, il était servi depuis le domaine public du stockage. La règle
--     écrite dans `@stax/security` (« SVG toujours refusé ») est désormais
--     appliquée au seau lui-même. Aucun fichier existant n'est supprimé.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Double facteur exigé par la base
-- -----------------------------------------------------------------------------
create or replace function app.current_aal()
returns text
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.aal', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal'
  );
$$;

comment on function app.current_aal() is
  'Niveau d''authentification du jeton courant (aal1 = mot de passe, aal2 = second facteur valide).';

create or replace function app.platform_role()
returns app.platform_role
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select platform_role
    from public.profiles
   where id = app.current_user_id()
     and disabled_at is null
     -- Compte soumis au second facteur : le rôle n'existe qu'avec un jeton
     -- aal2. Un mot de passe volé ne suffit pas à ouvrir les données clients.
     and (not mfa_enforced or app.current_aal() = 'aal2');
$$;

create or replace function app.guard_platform_role()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor_role app.platform_role;
begin
  if new.platform_role is not distinct from old.platform_role
     and new.mfa_enforced is not distinct from old.mfa_enforced then
    return new;
  end if;

  -- Les migrations, scripts d'administration et webhooks tournent en service_role.
  if app.is_service_role() then
    return new;
  end if;

  -- Rôle EFFECTIF (second facteur compris), et non la colonne brute : un jeton
  -- aal1 ne doit pas pouvoir lever l'obligation de second facteur.
  v_actor_role := app.platform_role();

  if v_actor_role in ('platform_owner', 'platform_admin') then
    -- Seul un platform_owner peut creer un autre platform_owner.
    if new.platform_role = 'platform_owner' and v_actor_role <> 'platform_owner' then
      raise exception 'Seul un platform_owner peut attribuer le role platform_owner'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Modification du role plateforme interdite'
    using errcode = '42501';
end;
$$;

-- -----------------------------------------------------------------------------
--  2 et 3. Messagerie
-- -----------------------------------------------------------------------------

-- Retire ce qui ne s'affiche pas mais trompe : contrôles (sauf tabulation et
-- saut de ligne), marques et surcharges de direction, espaces de largeur nulle,
-- trait d'union conditionnel, caractères « tag ». Garde U+200C / U+200D
-- (émojis composés, certaines écritures). Normalise les fins de ligne et
-- limite les lignes vides consécutives.
create or replace function app.clean_message_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select btrim(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 replace(replace(p_text, E'\r\n', E'\n'), E'\r', E'\n'),
                 '[\u2028\u2029]', E'\n', 'g'),
               '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\U000E0000-\U000E007F]',
               '', 'g'),
             E'\n[ \t]*\n([ \t]*\n)+', E'\n\n\n', 'g'),
           E' \t\n');
$$;

comment on function app.clean_message_text(text) is
  'Texte de message sans caracteres invisibles ni marques de direction ; le texte visible est conserve tel quel.';

-- Plafonds d'envoi pour un client (l'équipe et le serveur n'en ont pas) :
-- largement au-dessus d'une conversation humaine, bien en dessous d'un robot.
create or replace function app.guard_conversation_message()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_last_minute int;
  v_last_hour   int;
begin
  new.body := app.clean_message_text(new.body);

  if app.is_service_role() then
    return new;
  end if;

  -- Ce que l'auteur ne choisit pas : la base date le message, il n'est lu par
  -- personne à sa naissance, et les pièces jointes passent par le serveur.
  new.created_at := now();
  new.attachments := '[]'::jsonb;
  if tg_table_name = 'project_messages' then
    new.read_by_client_at := null;
    new.read_by_staff_at := null;
  end if;

  if new.author_side = 'client' then
    if length(new.body) > 5000 then
      raise exception 'message_too_long'
        using errcode = '22001', hint = 'Un message fait au plus 5 000 caracteres.';
    end if;

    if tg_table_name = 'project_messages' then
      select count(*) filter (where created_at > now() - interval '1 minute'),
             count(*)
        into v_last_minute, v_last_hour
        from public.project_messages
       where author_id = new.author_id
         and created_at > now() - interval '1 hour';
    else
      select count(*) filter (where created_at > now() - interval '1 minute'),
             count(*)
        into v_last_minute, v_last_hour
        from public.support_messages
       where author_id = new.author_id
         and created_at > now() - interval '1 hour';
    end if;

    if v_last_minute >= 10 or v_last_hour >= 60 then
      raise exception 'rate_limited'
        using errcode = 'P0001',
              hint = 'Trop de messages en peu de temps. Patientez quelques minutes.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists project_messages_guard on public.project_messages;
create trigger project_messages_guard
  before insert on public.project_messages
  for each row execute function app.guard_conversation_message();

drop trigger if exists support_messages_guard on public.support_messages;
create trigger support_messages_guard
  before insert on public.support_messages
  for each row execute function app.guard_conversation_message();

create index if not exists project_messages_author_recent_idx
  on public.project_messages (author_id, created_at desc);
create index if not exists support_messages_author_recent_idx
  on public.support_messages (author_id, created_at desc);

-- Un ticket ouvert par un client naît « ouvert », de priorité normale (le
-- support prioritaire de l'offre est ensuite appliqué par
-- `support_tickets_priority`, qui s'exécute après ce déclencheur), et
-- n'est assigné à personne.
create or replace function app.guard_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  new.subject := btrim(regexp_replace(app.clean_message_text(new.subject), '\s+', ' ', 'g'));

  if app.is_service_role() or app.is_platform_staff() then
    return new;
  end if;

  new.status := 'open';
  new.priority := 'normal';
  new.assigned_to := null;
  new.first_response_at := null;
  new.resolved_at := null;
  new.closed_at := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

-- Nommé pour s'exécuter AVANT `support_tickets_priority` (ordre alphabétique).
drop trigger if exists support_tickets_guard on public.support_tickets;
create trigger support_tickets_guard
  before insert on public.support_tickets
  for each row execute function app.guard_support_ticket();

-- Quand le client répond, c'est à l'équipe de jouer. L'action serveur tentait
-- cette mise à jour avec le jeton du client, que la règle `tickets_update_staff`
-- refusait en silence : le ticket restait « en attente du client ».
create or replace function app.reopen_ticket_on_client_reply()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if new.author_side = 'client' and not new.is_internal then
    update public.support_tickets
       set status = 'waiting_support'
     where id = new.ticket_id
       and status in ('open', 'waiting_customer');
  end if;
  return null;
end;
$$;

drop trigger if exists support_messages_reopen_ticket on public.support_messages;
create trigger support_messages_reopen_ticket
  after insert on public.support_messages
  for each row execute function app.reopen_ticket_on_client_reply();

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'app.current_aal()',
    'app.clean_message_text(text)',
    'app.guard_conversation_message()',
    'app.guard_support_ticket()',
    'app.reopen_ticket_on_client_reply()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
--  4. Stockage : plus de SVG dans le seau public
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'storage' and table_name = 'buckets') then
    raise notice 'Schema storage absent : seau non modifie (PostgreSQL nu).';
    return;
  end if;

  update storage.buckets
     set allowed_mime_types = array_remove(allowed_mime_types, 'image/svg+xml')
   where id = 'site-media';
end;
$$;

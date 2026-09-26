-- =============================================================================
--  0055 — Discussion client ↔ équipe StaX, invitations de collaborateurs
--
--  1. Le côté de l'auteur d'un message est IMPOSÉ PAR LA BASE.
--     Les policies d'insertion de `project_messages` et `support_messages` ne
--     vérifiaient que l'auteur, pas son côté : un client appelant l'API
--     directement pouvait écrire un message affiché « Équipe StaX ». Seule
--     l'action serveur imposait `client` ; ce n'est pas une frontière.
--
--  2. Messages lus / non lus, des deux côtés, et une boîte de réception pour
--     l'équipe : jusqu'ici, un message de client n'apparaissait sur aucun
--     écran de l'administration.
--
--  3. Acceptation d'une invitation de collaborateur. L'e-mail d'invitation
--     était envoyé, mais rien ne permettait de l'accepter.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. Côté de l'auteur imposé
-- -----------------------------------------------------------------------------
drop policy if exists project_messages_insert on public.project_messages;
create policy project_messages_insert on public.project_messages
  for insert to authenticated
  with check (
    author_id = app.current_user_id()
    and author_side = case when app.is_platform_staff() then 'stax' else 'client' end
    and exists (
      select 1 from public.projects p
       where p.id = project_id
         and (app.is_org_member(p.organization_id) or app.is_platform_staff()))
  );

drop policy if exists ticket_messages_insert on public.support_messages;
create policy ticket_messages_insert on public.support_messages
  for insert to authenticated
  with check (
    author_id = app.current_user_id()
    and author_side = case when app.is_platform_staff() then 'stax' else 'client' end
    and (
      app.is_platform_staff()
      or (not is_internal and exists (
        select 1 from public.support_tickets t
         where t.id = ticket_id
           and (t.opened_by = app.current_user_id()
                or (t.organization_id is not null and app.is_org_member(t.organization_id)))))
    )
  );

create index if not exists project_messages_unread_staff_idx
  on public.project_messages (project_id)
  where author_side = 'client' and read_by_staff_at is null;
create index if not exists project_messages_unread_client_idx
  on public.project_messages (project_id)
  where author_side = 'stax' and read_by_client_at is null;

-- -----------------------------------------------------------------------------
--  2. Lu / non lu
--
--  Marque comme lus les messages de l'AUTRE côté. Une personne ne peut
--  marquer que les fils qu'elle a le droit de lire.
-- -----------------------------------------------------------------------------
create or replace function app.mark_conversation_read(p_project uuid)
returns integer
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_org   uuid;
  v_count integer := 0;
begin
  if app.current_user_id() is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  select organization_id into v_org from public.projects where id = p_project;
  if v_org is null then
    return 0;
  end if;

  if app.is_platform_staff() then
    update public.project_messages
       set read_by_staff_at = now()
     where project_id = p_project and author_side = 'client' and read_by_staff_at is null;
    get diagnostics v_count = row_count;
  elsif app.is_org_member(v_org) then
    update public.project_messages
       set read_by_client_at = now()
     where project_id = p_project and author_side = 'stax' and read_by_client_at is null;
    get diagnostics v_count = row_count;
  else
    raise exception 'Discussion inaccessible' using errcode = '42501';
  end if;
  return v_count;
end;
$$;

-- Boîte de réception de l'équipe : un fil par projet, le plus récent d'abord.
create or replace function app.staff_conversations(p_limit int default 100)
returns table (
  project_id        uuid,
  organization_id   uuid,
  organization_name text,
  site_id           uuid,
  site_name         text,
  last_message_at   timestamptz,
  last_message      text,
  last_author_side  text,
  unread_count      integer,
  message_count     integer,
  proposal_status   text
)
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if not app.is_platform_staff() then
    raise exception 'Reserve a l''equipe StaX' using errcode = '42501';
  end if;
  return query
  select p.id, p.organization_id, o.name, p.site_id, s.name,
         last.created_at, left(last.body, 280), last.author_side,
         (select count(*)::int from public.project_messages u
           where u.project_id = p.id and u.author_side = 'client' and u.read_by_staff_at is null),
         (select count(*)::int from public.project_messages c where c.project_id = p.id),
         (select sp.status from public.site_proposals sp
           where sp.site_id = p.site_id order by sp.created_at desc limit 1)
    from public.projects p
    join lateral (
      select m.created_at, m.body, m.author_side
        from public.project_messages m
       where m.project_id = p.id
       order by m.created_at desc
       limit 1
    ) last on true
    left join public.organizations o on o.id = p.organization_id
    left join public.sites s on s.id = p.site_id
   order by last.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- Nombre de fils où un client attend une réponse (pastille de l'administration).
create or replace function app.staff_unread_conversations()
returns integer
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select case when app.is_platform_staff() then
    (select count(distinct m.project_id)::int from public.project_messages m
      where m.author_side = 'client' and m.read_by_staff_at is null)
  else 0 end;
$$;

-- -----------------------------------------------------------------------------
--  3. Invitations de collaborateurs
-- -----------------------------------------------------------------------------
create or replace function app.peek_organization_invitation(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_inv public.organization_invitations%rowtype;
  v_org text;
begin
  if app.current_user_id() is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  select * into v_inv from public.organization_invitations
   where token_hash = coalesce(p_token_hash, '');
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  select name into v_org from public.organizations where id = v_inv.organization_id;
  return jsonb_build_object(
    'ok', v_inv.revoked_at is null and v_inv.accepted_at is null and v_inv.expires_at > now(),
    'code', case when v_inv.revoked_at is not null then 'revoked'
                 when v_inv.accepted_at is not null then 'already_used'
                 when v_inv.expires_at <= now() then 'expired'
                 else 'valid' end,
    'organizationName', v_org,
    'role', v_inv.role);
end;
$$;

create or replace function app.accept_organization_invitation(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor uuid := app.current_user_id();
  v_email text;
  v_inv   public.organization_invitations%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  select * into v_inv from public.organization_invitations
   where token_hash = coalesce(p_token_hash, '')
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if v_inv.revoked_at is not null then
    return jsonb_build_object('ok', false, 'code', 'revoked');
  end if;
  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = v_actor then
      return jsonb_build_object('ok', true, 'code', 'already_member',
                                'organizationId', v_inv.organization_id);
    end if;
    return jsonb_build_object('ok', false, 'code', 'already_used');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;

  -- L'invitation est nominative : elle ne vaut que pour l'adresse invitée.
  select email into v_email from public.profiles where id = v_actor;
  if lower(coalesce(v_email, '')) <> lower(v_inv.email) then
    return jsonb_build_object('ok', false, 'code', 'email_mismatch');
  end if;

  insert into public.organization_members (organization_id, user_id, role, invited_by)
  values (v_inv.organization_id, v_actor, v_inv.role, v_inv.created_by)
  on conflict (organization_id, user_id) do nothing;

  update public.organization_invitations
     set accepted_at = now(), accepted_by = v_actor
   where id = v_inv.id;

  perform app.write_audit('member.invitation_accepted', v_inv.organization_id, null,
                          'organization_invitation', v_inv.id::text,
                          jsonb_build_object('role', v_inv.role));

  return jsonb_build_object('ok', true, 'code', 'accepted',
                            'organizationId', v_inv.organization_id);
end;
$$;

-- -----------------------------------------------------------------------------
--  Surface exposée et privilèges
-- -----------------------------------------------------------------------------
create or replace function public.mark_conversation_read(p_project uuid)
returns integer language sql security definer set search_path = public, app, pg_catalog as $$
  select app.mark_conversation_read(p_project);
$$;

create or replace function public.staff_conversations(p_limit int default 100)
returns table (
  project_id uuid, organization_id uuid, organization_name text, site_id uuid, site_name text,
  last_message_at timestamptz, last_message text, last_author_side text, unread_count integer,
  message_count integer, proposal_status text)
language sql stable security definer set search_path = public, app, pg_catalog as $$
  select * from app.staff_conversations(p_limit);
$$;

create or replace function public.staff_unread_conversations()
returns integer language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.staff_unread_conversations();
$$;

create or replace function public.peek_organization_invitation(p_token_hash text)
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.peek_organization_invitation(p_token_hash);
$$;

create or replace function public.accept_organization_invitation(p_token_hash text)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.accept_organization_invitation(p_token_hash);
$$;

do $$
declare
  fn text;
  user_callable text[] := array[
    'public.mark_conversation_read(uuid)',
    'public.staff_conversations(int)',
    'public.staff_unread_conversations()',
    'public.peek_organization_invitation(text)',
    'public.accept_organization_invitation(text)'
  ];
  internal text[] := array[
    'app.mark_conversation_read(uuid)',
    'app.staff_conversations(int)',
    'app.staff_unread_conversations()',
    'app.peek_organization_invitation(text)',
    'app.accept_organization_invitation(text)'
  ];
begin
  foreach fn in array user_callable loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
  foreach fn in array internal loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;

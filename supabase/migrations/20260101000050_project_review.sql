-- =============================================================================
--  StaX — 0050 · Validation du client pendant le projet
--
--  Pendant la conception et le developpement, l'equipe demande au client de
--  valider (maquettes, contenus, site avant mise en ligne). Sa reponse doit
--  etre enregistree par la base — pas seulement ecrite dans un message :
--   - « Je valide » fait avancer le projet a l'etape suivante celle ou la
--     validation a ete demandee (conception -> developpement, developpement
--     -> verifications, verifications -> mise en ligne) ;
--   - « Je demande des corrections » passe le projet en « corrections en
--     cours », avec le detail ecrit par le client.
--  Seul un membre de l'organisation du projet peut repondre, et seulement
--  quand une validation est reellement attendue.
-- =============================================================================

alter table public.projects
  add column if not exists review_return_status app.project_status;

comment on column public.projects.review_return_status is
  'Etape du projet au moment ou la validation du client a ete demandee : sert a le faire '
  'avancer a l''etape suivante quand le client valide.';

-- Etapes du projet (reprise de 0044) : memorise l'etape d'ou part une demande
-- de validation.
create or replace function app.set_project_phase(p_site uuid, p_status text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_project public.projects%rowtype;
  v_title   text;
begin
  if app.current_user_id() is null or not app.is_platform_site_editor() then
    raise exception 'Reserve a l''equipe StaX' using errcode = '42501';
  end if;
  if p_status not in ('ordered', 'questionnaire_pending', 'assets_pending', 'design',
                      'client_review', 'changes_requested', 'development', 'verification',
                      'deploying') then
    raise exception 'Etape inconnue ou reservee a la livraison' using errcode = '22023';
  end if;
  select * into v_project from public.projects where site_id = p_site
   order by created_at desc limit 1 for update;
  if not found then
    return false;
  end if;
  if v_project.status in ('delivered', 'cancelled', 'archived') then
    raise exception 'Ce projet est clos' using errcode = '23514';
  end if;

  update public.projects
     set status = p_status::app.project_status,
         review_return_status = case
           when p_status = 'client_review'
                and v_project.status not in ('client_review', 'changes_requested')
             then v_project.status
           when p_status = 'client_review' then coalesce(review_return_status, 'design')
           else review_return_status
         end
   where id = v_project.id;

  v_title := case p_status
    when 'ordered' then 'Commande validée'
    when 'questionnaire_pending' then 'Informations attendues'
    when 'assets_pending' then 'Éléments attendus'
    when 'design' then 'Conception en cours'
    when 'client_review' then 'Votre validation est attendue'
    when 'changes_requested' then 'Corrections en cours'
    when 'development' then 'Développement en cours'
    when 'verification' then 'Vérifications en cours'
    when 'deploying' then 'Mise en ligne en cours'
  end;
  insert into public.project_events (project_id, kind, title, description, is_public, actor_id)
  values (v_project.id, 'phase', v_title, nullif(left(btrim(coalesce(p_note, '')), 1000), ''),
          true, app.current_user_id());

  perform app.write_audit('project.phase_changed', v_project.organization_id, p_site, 'project',
                          v_project.id::text,
                          jsonb_build_object('from', v_project.status, 'to', p_status));
  return true;
end;
$$;

-- Reponse du client a une demande de validation.
create or replace function app.respond_to_project_review(
  p_project  uuid,
  p_approved boolean,
  p_message  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_actor   uuid := app.current_user_id();
  v_project public.projects%rowtype;
  v_next    app.project_status;
  v_message text := nullif(left(btrim(coalesce(p_message, '')), 5000), '');
begin
  if v_actor is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  select * into v_project from public.projects where id = p_project for update;
  if not found or not app.is_org_member(v_project.organization_id) then
    raise exception 'Projet introuvable' using errcode = 'P0002';
  end if;
  if not (app.org_can(v_project.organization_id, 'org.manage')
          or app.org_can(v_project.organization_id, 'content.edit')) then
    raise exception 'Votre role ne permet pas de valider ce projet' using errcode = '42501';
  end if;
  if v_project.status <> 'client_review' then
    return jsonb_build_object('ok', false, 'code', 'not_awaiting_review');
  end if;
  if not p_approved and v_message is null then
    return jsonb_build_object('ok', false, 'code', 'message_required');
  end if;

  if p_approved then
    v_next := case coalesce(v_project.review_return_status, 'design')
                when 'design' then 'development'
                when 'development' then 'verification'
                when 'verification' then 'deploying'
                when 'in_progress' then 'verification'
                when 'internal_review' then 'deploying'
                else coalesce(v_project.review_return_status, 'development')
              end::app.project_status;
  else
    v_next := 'changes_requested';
  end if;

  update public.projects
     set status = v_next,
         review_return_status = case when p_approved then null else review_return_status end
   where id = v_project.id;

  insert into public.project_events (project_id, kind, title, description, is_public, actor_id)
  values (v_project.id, case when p_approved then 'client_approved' else 'client_changes' end,
          case when p_approved then 'Vous avez validé' else 'Vous avez demandé des corrections' end,
          v_message, true, v_actor);

  if v_message is not null then
    insert into public.project_messages (project_id, author_id, author_side, body)
    values (v_project.id, v_actor, 'client',
            case when p_approved then 'Validation : ' else 'Corrections demandées : ' end
            || v_message);
  end if;

  if v_project.assigned_to is not null then
    insert into public.notifications
      (recipient_id, organization_id, site_id, type, title, message, link, level)
    values (v_project.assigned_to, v_project.organization_id, v_project.site_id,
            'project.review_answered',
            case when p_approved then 'Validation du client reçue' else 'Corrections demandées' end,
            'Projet ' || v_project.reference || coalesce(' : ' || left(v_message, 200), '.'),
            '/admin/projets', case when p_approved then 'success' else 'warning' end);
  end if;

  perform app.write_audit(
    case when p_approved then 'project.client_approved' else 'project.client_changes' end,
    v_project.organization_id, v_project.site_id, 'project', v_project.id::text,
    jsonb_build_object('next', v_next));
  return jsonb_build_object('ok', true, 'status', v_next);
end;
$$;

create or replace function public.respond_to_project_review(
  p_project uuid, p_approved boolean, p_message text default null)
returns jsonb language sql security definer set search_path = public, app, pg_catalog as $$
  select app.respond_to_project_review(p_project, p_approved, p_message);
$$;

revoke all on function app.respond_to_project_review(uuid, boolean, text)
  from public, anon, authenticated;
revoke all on function public.respond_to_project_review(uuid, boolean, text) from public, anon;
grant execute on function public.respond_to_project_review(uuid, boolean, text)
  to authenticated, service_role;

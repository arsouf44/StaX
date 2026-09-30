-- =============================================================================
--  Nemasus — 0062 · Pilotage de l'équipe : ce qui attend, ce qui est en retard
--
--  L'accueil de l'administration comptait les commandes, les devis, les
--  remboursements… mais pas ce qui fait qu'un client attend : un message sans
--  réponse, un projet qui a dépassé sa date de livraison, un site en panne,
--  une proposition qui expire dans deux jours, une livraison automatique en
--  échec après paiement. Et aucun écran ne montrait l'ensemble des projets en
--  cours, étape par étape.
--
--  1. `staff_work_queue()` : les compteurs « à traiter » qui manquaient.
--  2. `staff_production_board()` : chaque projet ouvert (et ceux livrés depuis
--     30 jours), avec son étape, son échéance, ce qu'il attend (le client ou
--     l'équipe), ses messages non lus et la personne qui en a la charge.
--
--  Réservés à l'équipe : pour toute autre personne, `null`.
-- =============================================================================

create or replace function app.staff_work_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
begin
  if not app.is_platform_staff() then
    return null;
  end if;

  return jsonb_build_object(
    'unreadConversations',
      (select count(distinct m.project_id) from public.project_messages m
        where m.author_side = 'client' and m.read_by_staff_at is null),
    'lateProjects',
      (select count(*) from public.projects p
        where p.due_at < now()
          and p.status not in ('delivered', 'maintenance', 'cancelled', 'archived')),
    'waitingOnClient',
      (select count(*) from public.projects p
        where p.status in ('questionnaire_pending', 'assets_pending', 'client_review')),
    'sitesDown',
      (select count(*) from public.sites s
         join lateral (select h.ok from public.site_health_checks h
                        where h.site_id = s.id order by h.checked_at desc limit 1) h on true
        where s.delivered_at is not null and s.archived_at is null and h.ok = false),
    'proposalsExpiring',
      (select count(*) from public.site_proposals sp
        where sp.status in ('sent', 'claimed')
          and sp.expires_at between now() and now() + interval '3 days'),
    'deliveriesFailed',
      (select count(*) from public.site_proposals sp
        where sp.status = 'paid' and sp.delivery_error is not null),
    'ticketsWaiting',
      (select count(*) from public.support_tickets t
        where t.status in ('open', 'waiting_support')),
    -- Les sites en panne sont nommés : on ne répare pas un compteur.
    'sitesDownList',
      (select coalesce(jsonb_agg(jsonb_build_object(
                'siteId', s.id, 'name', s.name, 'organization', o.name, 'url', h.url,
                'statusCode', h.status_code, 'error', left(h.error, 160),
                'checkedAt', h.checked_at) order by h.checked_at desc), '[]'::jsonb)
         from public.sites s
         join public.organizations o on o.id = s.organization_id
         join lateral (select hc.ok, hc.url, hc.status_code, hc.error, hc.checked_at
                         from public.site_health_checks hc
                        where hc.site_id = s.id order by hc.checked_at desc limit 1) h on true
        where s.delivered_at is not null and s.archived_at is null and h.ok = false)
  );
end;
$$;

comment on function app.staff_work_queue() is
  'Compteurs « a traiter » de l''equipe : conversations sans reponse, projets en retard, '
  'sites en panne, propositions qui expirent, livraisons en echec, tickets en attente.';

create or replace function app.staff_production_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_board jsonb;
begin
  if not app.is_platform_staff() then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(b) order by b.late desc, b.due_at nulls last, b.created_at),
                  '[]'::jsonb)
    into v_board
    from (
      select p.id,
             p.reference,
             p.status::text as status,
             p.due_at,
             p.created_at,
             p.delivered_at,
             coalesce((select max(e.created_at) from public.project_events e
                        where e.project_id = p.id), p.updated_at) as last_activity_at,
             p.site_id,
             s.name as site_name,
             o.name as organization_name,
             coalesce(pl.name, s.plan_slug) as plan_name,
             nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), '')
               as assignee,
             (select count(*) from public.project_messages m
               where m.project_id = p.id and m.author_side = 'client'
                 and m.read_by_staff_at is null) as unread_messages,
             case when p.status in ('questionnaire_pending', 'assets_pending', 'client_review')
                  then 'client' else 'team' end as waiting_on,
             (p.due_at is not null and p.due_at < now()
              and p.status not in ('delivered', 'maintenance')) as late
        from public.projects p
        left join public.sites s          on s.id = p.site_id
        left join public.organizations o  on o.id = p.organization_id
        left join public.plans pl         on pl.id = s.plan_id
        left join public.profiles pr      on pr.id = p.assigned_to
       where p.status not in ('cancelled', 'archived')
         and (p.status not in ('delivered', 'maintenance')
              or coalesce(p.delivered_at, s.delivered_at) > now() - interval '30 days')
       limit 300
    ) b;

  return v_board;
end;
$$;

comment on function app.staff_production_board() is
  'Projets ouverts (et livres depuis 30 jours) pour le tableau de production de l''equipe.';

revoke all on function app.staff_work_queue() from public, anon, authenticated;
revoke all on function app.staff_production_board() from public, anon, authenticated;

create or replace function public.staff_work_queue()
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.staff_work_queue();
$$;

create or replace function public.staff_production_board()
returns jsonb language sql stable security definer set search_path = public, app, pg_catalog as $$
  select app.staff_production_board();
$$;

revoke all on function public.staff_work_queue() from public, anon;
revoke all on function public.staff_production_board() from public, anon;
grant execute on function public.staff_work_queue() to authenticated;
grant execute on function public.staff_production_board() to authenticated;

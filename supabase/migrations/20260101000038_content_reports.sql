-- =============================================================================
--  StaX — 0038 · Signalement des contenus illicites
--
--  StaX heberge les sites de ses clients : a ce titre, toute personne doit
--  pouvoir signaler un contenu qu'elle estime illicite (article 16 du reglement
--  (UE) 2022/2065 sur les services numeriques, article 6 de la LCEN), recevoir
--  un accuse de reception, et connaitre la suite donnee.
--
--  Le formulaire est public : l'ecriture passe par une fonction reservee au
--  role de service, qui borne chaque champ. La decision est prise par une
--  personne habilitee, jamais automatiquement, et elle est motivee : le motif
--  est obligatoire, parce qu'il doit etre communique a l'auteur du signalement
--  et a l'editeur du site (article 17).
-- =============================================================================

create table public.content_reports (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null,
  content_url     text not null,
  /** Site concerne, retrouve a partir du nom d'hote quand il est heberge ici. */
  site_id         uuid references public.sites (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,

  category        text not null,
  explanation     text not null,
  /** Facultatifs : un signalement d'abus sur mineurs peut etre anonyme. */
  reporter_name   text,
  reporter_email  text,
  good_faith      boolean not null,

  status          text not null default 'received',
  decision        text,
  decided_at      timestamptz,
  decided_by      uuid references public.profiles (id) on delete set null,

  ip_hash         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint content_reports_category check (category in (
    'illegal', 'intellectual_property', 'privacy', 'defamation', 'fraud', 'child_abuse',
    'hate', 'other')),
  constraint content_reports_status check (status in (
    'received', 'reviewing', 'actioned', 'rejected')),
  constraint content_reports_decision_required check (
    status in ('received', 'reviewing') or length(btrim(coalesce(decision, ''))) >= 10),
  constraint content_reports_email_format check (
    reporter_email is null or reporter_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint content_reports_good_faith check (good_faith)
);

create unique index content_reports_reference_key on public.content_reports (reference);
create index content_reports_status_idx on public.content_reports (status, created_at);
create index content_reports_site_idx on public.content_reports (site_id);

create trigger content_reports_touch_updated_at
  before update on public.content_reports
  for each row execute function app.touch_updated_at();

alter table public.content_reports enable row level security;

-- Lecture reservee a l'equipe StaX. Aucune policy d'ecriture : l'enregistrement
-- et la decision passent par les fonctions ci-dessous.
create policy content_reports_select on public.content_reports
  for select to authenticated using (app.is_platform_staff());

grant select on table public.content_reports to authenticated;

-- -----------------------------------------------------------------------------
--  Enregistrement (formulaire public, cle de service)
-- -----------------------------------------------------------------------------
create or replace function app.record_content_report(
  p_url         text,
  p_category    text,
  p_explanation text,
  p_name        text default null,
  p_email       text default null,
  p_good_faith  boolean default false,
  p_ip_hash     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_url       text := left(btrim(coalesce(p_url, '')), 2000);
  v_host      text;
  v_reference text;
  v_site      uuid;
  v_org       uuid;
begin
  if v_url !~* '^https?://[^\s/]+' then
    return jsonb_build_object('ok', false, 'code', 'invalid_url');
  end if;
  if length(btrim(coalesce(p_explanation, ''))) < 20 then
    return jsonb_build_object('ok', false, 'code', 'explanation_required');
  end if;
  if not coalesce(p_good_faith, false) then
    return jsonb_build_object('ok', false, 'code', 'good_faith_required');
  end if;
  -- L'anonymat n'est admis que pour les contenus d'abus sur mineurs.
  if p_category <> 'child_abuse'
     and (coalesce(btrim(p_email), '') = '' or coalesce(btrim(p_name), '') = '') then
    return jsonb_build_object('ok', false, 'code', 'identity_required');
  end if;

  v_host := lower(substring(v_url from '^[a-zA-Z]+://([^/:?#]+)'));
  select d.site_id, d.organization_id
    into v_site, v_org
    from public.site_domains d
   where d.hostname = v_host
     and d.status <> 'detached'
   limit 1;

  v_reference := 'S-' || to_char(now(), 'YYMM') || '-'
                 || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.content_reports
    (reference, content_url, site_id, organization_id, category, explanation,
     reporter_name, reporter_email, good_faith, ip_hash)
  values
    (v_reference, v_url, v_site, v_org, p_category, left(btrim(p_explanation), 5000),
     nullif(left(btrim(coalesce(p_name, '')), 120), ''),
     nullif(lower(left(btrim(coalesce(p_email, '')), 254)), ''),
     true, p_ip_hash);

  perform app.write_audit(
    'content_report.received', v_org, v_site, 'content_report', v_reference,
    jsonb_build_object('category', p_category));

  return jsonb_build_object('ok', true, 'reference', v_reference, 'hosted', v_site is not null);
end;
$$;

create or replace function public.record_content_report(
  p_url text, p_category text, p_explanation text, p_name text default null,
  p_email text default null, p_good_faith boolean default false, p_ip_hash text default null
) returns jsonb language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.record_content_report(p_url, p_category, p_explanation, p_name, p_email,
                                   p_good_faith, p_ip_hash);
$$;

revoke all on function app.record_content_report(text, text, text, text, text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.record_content_report(text, text, text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.record_content_report(text, text, text, text, text, boolean, text)
  to service_role;

-- -----------------------------------------------------------------------------
--  Decision motivee (equipe StaX habilitee)
-- -----------------------------------------------------------------------------
create or replace function app.decide_content_report(
  p_report   uuid,
  p_status   text,
  p_decision text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_report public.content_reports%rowtype;
begin
  if not app.is_platform_admin() then
    raise exception 'Decision reservee a l''administration de la plateforme' using errcode = '42501';
  end if;
  if p_status not in ('reviewing', 'actioned', 'rejected') then
    raise exception 'Statut inconnu' using errcode = '22023';
  end if;
  if p_status in ('actioned', 'rejected') and length(btrim(coalesce(p_decision, ''))) < 10 then
    raise exception 'Une decision doit etre motivee' using errcode = '22023';
  end if;

  select * into v_report from public.content_reports where id = p_report for update;
  if not found then
    return false;
  end if;

  update public.content_reports
     set status = p_status,
         decision = case when p_status = 'reviewing' then decision
                         else left(btrim(p_decision), 4000) end,
         decided_at = case when p_status = 'reviewing' then null else now() end,
         decided_by = app.current_user_id()
   where id = p_report;

  perform app.write_audit(
    'content_report.' || p_status, v_report.organization_id, v_report.site_id,
    'content_report', v_report.reference, '{}'::jsonb);
  return true;
end;
$$;

create or replace function public.decide_content_report(
  p_report uuid, p_status text, p_decision text default null
) returns boolean language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.decide_content_report(p_report, p_status, p_decision);
$$;

revoke all on function app.decide_content_report(uuid, text, text) from public, anon, authenticated;
revoke all on function public.decide_content_report(uuid, text, text) from public, anon;
grant execute on function public.decide_content_report(uuid, text, text) to authenticated;

comment on table public.content_reports is
  'Signalements de contenus illicites (DSA art. 16, LCEN art. 6). Decision humaine et motivee.';

-- =============================================================================
--  StaX — 0007 · Operations, securite, conformite, observabilite
-- =============================================================================

-- -----------------------------------------------------------------------------
--  activation_codes — remise d'un espace client a usage unique
--  Le code clair n'existe qu'une fois, a l'ecran, au moment de sa creation.
-- -----------------------------------------------------------------------------
create table public.activation_codes (
  id               uuid primary key default gen_random_uuid(),
  site_id          uuid references public.sites (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete cascade,

  /** HMAC-SHA256 du code. Le code en clair n'est jamais persiste. */
  code_hash        text not null,
  /** 4 derniers caracteres, pour permettre a l'admin d'identifier le code. */
  code_hint        text not null,
  /** Role accorde a l'acceptation. */
  granted_role     app.org_role not null default 'owner',
  /** Optionnel : le code n'est utilisable que par cette adresse. */
  email_constraint text,

  expires_at       timestamptz not null,
  used_at          timestamptz,
  used_by          uuid references public.profiles (id) on delete set null,
  attempt_count    int not null default 0,
  last_attempt_at  timestamptz,
  revoked_at       timestamptz,
  revoked_by       uuid references public.profiles (id) on delete set null,

  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint activation_codes_email_format
    check (email_constraint is null or email_constraint ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint activation_codes_granted_role_valid
    check (granted_role in ('owner', 'admin', 'editor')),
  constraint activation_codes_hint_short check (length(code_hint) <= 8)
);

create unique index activation_codes_hash_key on public.activation_codes (code_hash);
create index activation_codes_org_idx on public.activation_codes (organization_id, created_at desc);
create index activation_codes_open_idx on public.activation_codes (expires_at)
  where used_at is null and revoked_at is null;

comment on table public.activation_codes is
  'Codes a usage unique. Consommation atomique via app.redeem_activation_code(), '
  'qui verifie expiration, revocation, contrainte d''email et nombre de tentatives.';

-- -----------------------------------------------------------------------------
--  notifications in-app
-- -----------------------------------------------------------------------------
create table public.notifications (
  id               uuid primary key default app.uuid_v7(),
  recipient_id     uuid not null references public.profiles (id) on delete cascade,
  organization_id  uuid references public.organizations (id) on delete cascade,
  site_id          uuid references public.sites (id) on delete cascade,

  type             text not null,
  title            text not null,
  message          text,
  link             text,
  /** `info` | `success` | `warning` | `danger` */
  level            text not null default 'info',
  read_at          timestamptz,
  created_at       timestamptz not null default now(),

  constraint notifications_level_valid check (level in ('info','success','warning','danger')),
  -- Empeche l'open redirect : seuls les chemins internes sont acceptes.
  constraint notifications_link_internal check (link is null or link ~ '^/[^/\\]')
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id)
  where read_at is null;

-- -----------------------------------------------------------------------------
--  Support
-- -----------------------------------------------------------------------------
create table public.support_tickets (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null,
  organization_id  uuid references public.organizations (id) on delete cascade,
  site_id          uuid references public.sites (id) on delete set null,
  opened_by        uuid references public.profiles (id) on delete set null,

  subject          text not null,
  category         text not null default 'general',
  status           app.ticket_status not null default 'open',
  priority         app.ticket_priority not null default 'normal',
  assigned_to      uuid references public.profiles (id) on delete set null,

  first_response_at timestamptz,
  resolved_at      timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint support_tickets_category_valid
    check (category in ('general','technical','billing','content','domain','bug','feature')),
  constraint support_tickets_subject_bounded check (length(subject) between 3 and 200)
);

create unique index support_tickets_reference_key on public.support_tickets (reference);
create index support_tickets_org_idx on public.support_tickets (organization_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets (status, priority, created_at desc);

create trigger support_tickets_touch_updated_at
  before update on public.support_tickets
  for each row execute function app.touch_updated_at();

create sequence if not exists public.ticket_reference_seq;

create or replace function app.next_ticket_reference()
returns text
language sql
volatile
set search_path = public, pg_catalog
as $$
  select 'SUP-' || lpad(nextval('public.ticket_reference_seq')::text, 6, '0');
$$;

create table public.support_messages (
  id          uuid primary key default app.uuid_v7(),
  ticket_id   uuid not null references public.support_tickets (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  author_side text not null,
  body        text not null,
  attachments jsonb not null default '[]'::jsonb,
  /** Note interne StaX, jamais visible du client. */
  is_internal boolean not null default false,
  created_at  timestamptz not null default now(),

  constraint support_messages_side_valid check (author_side in ('client','stax')),
  constraint support_messages_body_bounded check (length(body) between 1 and 20000)
);

create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at asc);

-- -----------------------------------------------------------------------------
--  Conformite RGPD : consentements, demandes, sous-traitants
-- -----------------------------------------------------------------------------
create table public.consents (
  id              uuid primary key default app.uuid_v7(),
  /** Peut concerner un utilisateur StaX ou un visiteur d'un site client. */
  user_id         uuid references public.profiles (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete cascade,
  site_id         uuid references public.sites (id) on delete cascade,

  /** terms | privacy | cookies | marketing | dpa */
  kind            text not null,
  /** Version exacte du document accepte. */
  document_version text not null,
  granted         boolean not null,
  /** Categories acceptees pour un consentement cookies. */
  categories      text[] not null default '{}',

  /** Preuve d'acceptation : jamais d'IP complete, uniquement un hache. */
  ip_hash         text,
  user_agent_family text,
  source          text not null default 'web',
  granted_at      timestamptz not null default now(),
  withdrawn_at    timestamptz,

  constraint consents_kind_valid check (kind in ('terms','privacy','cookies','marketing','dpa')),
  constraint consents_subject_present check (user_id is not null or site_id is not null)
);

create index consents_user_idx on public.consents (user_id, kind, granted_at desc);
create index consents_site_idx on public.consents (site_id, kind, granted_at desc);

comment on table public.consents is
  'Preuve d''acceptation : type de document, version exacte, horodatage, hache d''IP. '
  'Le retrait du consentement est enregistre, jamais efface.';

create table public.privacy_requests (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null,
  requester_id    uuid references public.profiles (id) on delete set null,
  requester_email text not null,
  organization_id uuid references public.organizations (id) on delete set null,
  site_id         uuid references public.sites (id) on delete set null,

  kind            app.privacy_request_kind not null,
  status          app.privacy_request_status not null default 'received',
  details         text,
  /** Verification d'identite avant tout traitement. */
  identity_verified_at timestamptz,
  /** Echeance legale : un mois a compter de la reception (RGPD art. 12). */
  due_at          timestamptz not null default (now() + interval '30 days'),

  handled_by      uuid references public.profiles (id) on delete set null,
  response_note   text,
  export_storage_path text,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint privacy_requests_email_format
    check (requester_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create unique index privacy_requests_reference_key on public.privacy_requests (reference);
create index privacy_requests_status_idx on public.privacy_requests (status, due_at);

create trigger privacy_requests_touch_updated_at
  before update on public.privacy_requests
  for each row execute function app.touch_updated_at();

create table public.subprocessors (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  purpose      text not null,
  /** Pays d'hebergement des donnees. */
  location     text not null,
  /** Garanties de transfert hors UE (CCT, adequation…). */
  transfer_safeguards text,
  privacy_url  text,
  dpa_url      text,
  category     text not null default 'infrastructure',
  is_active    boolean not null default true,
  sort_order   int not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger subprocessors_touch_updated_at
  before update on public.subprocessors
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  audit_logs — append-only
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id               uuid primary key default app.uuid_v7(),
  actor_id         uuid references public.profiles (id) on delete set null,
  actor_email      text,
  /** `user` | `platform_staff` | `system` | `webhook` */
  actor_type       text not null default 'user',
  /** Renseigne quand l'action a ete faite via « voir comme ce client ». */
  impersonated_by  uuid references public.profiles (id) on delete set null,

  organization_id  uuid references public.organizations (id) on delete set null,
  site_id          uuid references public.sites (id) on delete set null,

  action           text not null,
  target_type      text,
  target_id        text,
  /** Metadonnees expurgees : aucun secret, aucun mot de passe, aucun jeton. */
  metadata_safe    jsonb not null default '{}'::jsonb,
  ip_hash          text,
  user_agent_family text,
  created_at       timestamptz not null default now(),

  constraint audit_logs_actor_type_valid
    check (actor_type in ('user','platform_staff','system','webhook','anonymous')),
  constraint audit_logs_action_format check (action ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  constraint audit_logs_metadata_object check (jsonb_typeof(metadata_safe) = 'object')
);

create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);

-- Journal immuable : ni modification, ni suppression, quel que soit le role.
create or replace function app.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Table append-only : % interdit sur %', tg_op, tg_table_name
    using errcode = '42501';
end;
$$;

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function app.forbid_mutation();

create table public.security_events (
  id            uuid primary key default app.uuid_v7(),
  kind          text not null,
  severity      text not null default 'info',
  user_id       uuid references public.profiles (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  email_attempted text,
  ip_hash       text,
  user_agent_family text,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),

  constraint security_events_severity_valid
    check (severity in ('info','warning','critical'))
);

create index security_events_kind_idx on public.security_events (kind, created_at desc);
create index security_events_severity_idx on public.security_events (severity, created_at desc)
  where severity <> 'info';

create trigger security_events_append_only
  before update or delete on public.security_events
  for each row execute function app.forbid_mutation();

-- -----------------------------------------------------------------------------
--  impersonation — « voir comme ce client », strictement encadre
-- -----------------------------------------------------------------------------
create table public.impersonation_sessions (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references public.profiles (id) on delete cascade,
  target_user_id  uuid references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  /** Motif obligatoire, saisi avant ouverture de la session. */
  reason          text not null,
  ticket_id       uuid references public.support_tickets (id) on delete set null,
  /** Jeton de session d'impersonation (HMAC stocke). */
  token_hash      text not null,
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  ended_at        timestamptz,
  ended_reason    text,

  constraint impersonation_reason_bounded check (length(trim(reason)) between 10 and 500),
  constraint impersonation_duration_bounded check (expires_at > started_at)
);

create unique index impersonation_token_key on public.impersonation_sessions (token_hash);
create index impersonation_staff_idx on public.impersonation_sessions (staff_id, started_at desc);
create index impersonation_active_idx on public.impersonation_sessions (expires_at)
  where ended_at is null;

comment on table public.impersonation_sessions is
  'Toute session « voir comme ce client » est tracee : motif, duree limitee, '
  'banniere visible, sortie instantanee. Les operations financieres restent bloquees.';

-- -----------------------------------------------------------------------------
--  Limitation de debit persistante (complement du cache edge)
-- -----------------------------------------------------------------------------
create table public.rate_limit_counters (
  bucket       text not null,
  identifier   text not null,
  window_start timestamptz not null,
  count        int not null default 1,
  primary key (bucket, identifier, window_start)
);

create index rate_limit_counters_window_idx on public.rate_limit_counters (window_start);

create or replace function app.bump_rate_limit(
  p_bucket text,
  p_identifier text,
  p_window_seconds int,
  p_max int
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_count int;
begin
  insert into public.rate_limit_counters (bucket, identifier, window_start, count)
  values (p_bucket, p_identifier, v_window, 1)
  on conflict (bucket, identifier, window_start)
    do update set count = public.rate_limit_counters.count + 1
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

comment on function app.bump_rate_limit(text, text, int, int) is
  'Incremente un compteur a fenetre fixe et indique si la requete reste autorisee. '
  'Renvoie false des que le quota est depasse.';

-- -----------------------------------------------------------------------------
--  Analytics respectueuses de la vie privee
-- -----------------------------------------------------------------------------
create table public.analytics_events (
  id           uuid primary key default app.uuid_v7(),
  site_id      uuid not null references public.sites (id) on delete cascade,
  /** Empreinte journaliere et salee : ne permet aucun suivi inter-jours. */
  visitor_hash text not null,
  session_hash text,
  kind         text not null default 'pageview',
  path         text not null,
  referrer_host text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  device       text,
  browser      text,
  os           text,
  country      char(2),
  duration_ms  int,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),

  constraint analytics_events_kind_valid
    check (kind in ('pageview','form_submit','booking','purchase','click','outbound')),
  constraint analytics_events_path_bounded check (length(path) <= 512)
);

create index analytics_events_site_created_idx on public.analytics_events (site_id, created_at desc);
create index analytics_events_site_path_idx on public.analytics_events (site_id, path, created_at desc);

comment on table public.analytics_events is
  'Aucune adresse IP complete n''est conservee. Les evenements bruts sont agreges '
  'quotidiennement dans daily_site_metrics puis purges.';

create table public.daily_site_metrics (
  site_id          uuid not null references public.sites (id) on delete cascade,
  day              date not null,
  pageviews        int not null default 0,
  visitors         int not null default 0,
  sessions         int not null default 0,
  form_submissions int not null default 0,
  bookings         int not null default 0,
  orders           int not null default 0,
  revenue_cents    bigint not null default 0,
  avg_duration_ms  int not null default 0,
  bounce_rate_bps  int not null default 0,
  /** Agregats : { "top_pages": [...], "sources": [...], "devices": {...} } */
  breakdown        jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now(),

  primary key (site_id, day)
);

create index daily_site_metrics_day_idx on public.daily_site_metrics (day desc);

-- -----------------------------------------------------------------------------
--  Taches asynchrones — idempotentes, reessayables, observables
-- -----------------------------------------------------------------------------
create table public.background_jobs (
  id             uuid primary key default app.uuid_v7(),
  kind           text not null,
  /** Cle d'idempotence : deux enfilements identiques ne s'executent qu'une fois. */
  idempotency_key text,
  payload        jsonb not null default '{}'::jsonb,
  status         text not null default 'queued',
  attempts       int not null default 0,
  max_attempts   int not null default 5,
  run_after      timestamptz not null default now(),
  locked_at      timestamptz,
  locked_by      text,
  last_error     text,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint background_jobs_status_valid
    check (status in ('queued','running','completed','failed','cancelled')),
  constraint background_jobs_kind_format check (kind ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$')
);

create unique index background_jobs_idempotency_key
  on public.background_jobs (kind, idempotency_key) where idempotency_key is not null;
create index background_jobs_queue_idx on public.background_jobs (status, run_after)
  where status in ('queued', 'running');

create trigger background_jobs_touch_updated_at
  before update on public.background_jobs
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  Journal des envois d'e-mails (observabilite, pas de contenu sensible)
-- -----------------------------------------------------------------------------
create table public.email_log (
  id            uuid primary key default app.uuid_v7(),
  template      text not null,
  to_hash       text not null,
  organization_id uuid references public.organizations (id) on delete set null,
  site_id       uuid references public.sites (id) on delete set null,
  provider      text not null default 'console',
  provider_message_id text,
  status        text not null default 'queued',
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),

  constraint email_log_status_valid check (status in ('queued','sent','failed','bounced'))
);

create index email_log_created_idx on public.email_log (created_at desc);
create index email_log_status_idx on public.email_log (status) where status <> 'sent';

comment on column public.email_log.to_hash is
  'Hache du destinataire : permet le diagnostic sans conserver l''adresse en clair.';

-- -----------------------------------------------------------------------------
--  Sante systeme (backups, crons, webhooks) affichee dans /admin/system
-- -----------------------------------------------------------------------------
create table public.system_health (
  key           text primary key,
  label         text not null,
  status        text not null default 'unknown',
  detail        text,
  /** Renseigne uniquement si la donnee est reellement disponible. */
  observed_at   timestamptz,
  metadata      jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),

  constraint system_health_status_valid
    check (status in ('unknown','healthy','degraded','failing','not_configured'))
);

create trigger system_health_touch_updated_at
  before update on public.system_health
  for each row execute function app.touch_updated_at();

comment on table public.system_health is
  'Etat reel des dependances. Un indicateur reste `unknown` ou `not_configured` '
  'tant que la donnee n''est pas reellement observee : jamais de sante simulee.';

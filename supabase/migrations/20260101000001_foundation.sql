-- =============================================================================
--  StaX — 0001 · Fondations
--  Extensions, schema applicatif, helpers d'identite et de tenancy, enums.
--  Ces helpers sont la BASE de toute la Row Level Security : ils sont
--  SECURITY DEFINER pour pouvoir lire les tables d'appartenance sans declencher
--  la recursion infinie classique des policies auto-referentes.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Schema prive : jamais expose via PostgREST (non liste dans `db.schemas`).
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
--  UUIDv7 : identifiants triables dans le temps pour les tables a fort volume
--  (audit, analytics, evenements). Reduit la fragmentation des index B-tree.
-- -----------------------------------------------------------------------------
create or replace function app.uuid_v7()
returns uuid
language plpgsql
volatile
set search_path = extensions, pg_catalog
as $$
declare
  v_time_ms bigint;
  v_bytes   bytea;
begin
  v_time_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  -- 6 octets de timestamp (millisecondes) + 10 octets aleatoires
  v_bytes := substring(int8send(v_time_ms) from 3 for 6) || gen_random_bytes(10);
  -- version 7 (nibble haut de l'octet 6)
  v_bytes := set_byte(v_bytes, 6, ((get_byte(v_bytes, 6) & 15) | 112));
  -- variante RFC 4122 (deux bits hauts de l'octet 8)
  v_bytes := set_byte(v_bytes, 8, ((get_byte(v_bytes, 8) & 63) | 128));
  return encode(v_bytes, 'hex')::uuid;
end;
$$;

comment on function app.uuid_v7() is
  'Genere un UUID version 7 (triable chronologiquement). Utilise pour les tables append-only.';

-- -----------------------------------------------------------------------------
--  Trigger utilitaire : maintien de updated_at
-- -----------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
--  Enums — machines a etats
-- -----------------------------------------------------------------------------

-- Roles au sein d'une organisation cliente
create type app.org_role as enum ('owner', 'admin', 'editor', 'billing', 'viewer');

-- Roles internes a la plateforme (equipe StaX)
create type app.platform_role as enum (
  'platform_owner',
  'platform_admin',
  'support',
  'designer',
  'developer',
  'billing_admin'
);

-- Cycle de vie d'un site
create type app.site_status as enum (
  'draft', 'building', 'review', 'ready', 'live', 'suspended', 'archived'
);

-- Cycle de vie d'un domaine rattache a un site
create type app.domain_status as enum (
  'pending', 'verifying', 'active', 'failed', 'expired', 'detached'
);

create type app.domain_kind as enum ('platform_subdomain', 'custom');

create type app.ssl_status as enum ('none', 'pending', 'active', 'failed');

-- Commandes plateforme (vente d'un site)
create type app.order_status as enum (
  'draft', 'checkout_pending', 'paid', 'cancelled', 'refunded', 'partially_refunded'
);

-- Paiements (plateforme ET sites clients)
create type app.payment_status as enum (
  'pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'disputed'
);

-- Abonnement de maintenance
create type app.subscription_status as enum (
  'incomplete', 'trialing', 'active', 'past_due', 'unpaid',
  'cancel_at_period_end', 'canceled', 'paused'
);

-- Cycle de vie du contrat de maintenance cote produit (distinct de Stripe)
create type app.maintenance_state as enum (
  'active', 'cancel_at_period_end', 'maintenance_ended', 'grace_period', 'suspended', 'archived'
);

-- Projet de creation de site
create type app.project_status as enum (
  'ordered', 'questionnaire_pending', 'assets_pending', 'in_progress',
  'internal_review', 'client_review', 'changes_requested', 'approved',
  'ready_to_publish', 'published', 'maintenance', 'cancelled', 'archived'
);

-- Devis
create type app.quote_status as enum (
  'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'paid'
);

-- Demandes de remboursement
create type app.refund_request_status as enum (
  'requested', 'under_review', 'approved', 'rejected', 'processing', 'refunded', 'failed'
);

-- Reservations
create type app.booking_status as enum (
  'pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'
);

-- Boite de reception des formulaires
create type app.submission_status as enum ('unread', 'read', 'archived', 'spam');

-- Pipeline CRM
create type app.contact_status as enum ('new', 'contacted', 'qualified', 'won', 'lost');

-- Support
create type app.ticket_status as enum (
  'open', 'waiting_customer', 'waiting_support', 'resolved', 'closed'
);
create type app.ticket_priority as enum ('low', 'normal', 'high', 'urgent');

-- Commandes e-commerce sur les sites clients
create type app.shop_order_status as enum (
  'pending', 'awaiting_payment', 'paid', 'preparing', 'fulfilled', 'cancelled', 'refunded'
);

-- Comptes Stripe Connect
create type app.connect_status as enum (
  'not_started', 'onboarding', 'pending_verification', 'active', 'restricted', 'disabled'
);

-- Demandes RGPD
create type app.privacy_request_kind as enum ('export', 'deletion', 'rectification', 'objection');
create type app.privacy_request_status as enum (
  'received', 'verifying', 'in_progress', 'completed', 'refused'
);

-- Traitement des webhooks
create type app.webhook_status as enum ('received', 'processing', 'processed', 'failed', 'ignored');

-- -----------------------------------------------------------------------------
--  Helpers d'identite (SECURITY DEFINER — contournent volontairement la RLS)
-- -----------------------------------------------------------------------------

-- Reimplemente localement plutot que de dependre de auth.uid(), afin que le
-- schema reste testable sur un PostgreSQL nu (tests d'isolation en CI).
create or replace function app.current_user_id()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid;
$$;

comment on function app.current_user_id() is
  'Identifiant de l''utilisateur courant. NULL pour un appel anonyme ou service_role.';

/*
 * L'appelant est-il de confiance serveur ?
 *
 * PostgREST positionne TOUJOURS explicitement le role de la requete
 * (`set local role anon|authenticated|service_role`) et publie les claims du
 * JWT. Une connexion directe a PostgreSQL (migrations, scripts d'exploitation,
 * tache planifiee) ne positionne rien : l'absence de role explicite signale
 * donc une connexion serveur, jamais une requete issue d'un navigateur.
 *
 * Volontairement base sur les GUC et non sur `current_user` : a l'interieur
 * d'une fonction SECURITY DEFINER, `current_user` vaut le proprietaire de la
 * fonction, ce qui rendrait tout garde-fou inoperant.
 */
create or replace function app.is_service_role()
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           nullif(current_setting('role', true), 'none'),
           'service_role'
         ) = 'service_role';
$$;

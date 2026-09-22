-- =============================================================================
--  Registre des violations de donnees (RGPD art. 33.5)
--
--  L'article 33.5 n'est pas optionnel : le responsable du traitement DOIT
--  documenter toute violation, y compris celles qu'il ne notifie pas. C'est ce
--  registre que la CNIL demande en premier lors d'un controle, et son absence
--  est un manquement en soi, independamment de la violation elle-meme.
--
--  Trois choix structurent cette table :
--
--   1. L'ECHEANCE DES 72 HEURES EST CALCULEE, pas saisie. Elle court a compter
--      de la DECOUVERTE, pas du fait generateur (art. 33.1). Laisser quelqu'un
--      la taper reviendrait a laisser quelqu'un se tromper sous pression.
--   2. UNE ENTREE NE S'EFFACE PAS. Pas de suppression, et les elements de
--      notification deja poses ne se retirent plus : ce registre est une piece
--      de preuve, pas un brouillon.
--   3. « PAS DE RISQUE » SE JUSTIFIE. Ne pas notifier est une decision
--      defendable (art. 33.1), mais elle doit etre motivee par ecrit — sinon
--      c'est une omission, pas une decision.
-- =============================================================================

create type app.breach_risk as enum ('pending', 'none', 'low', 'high');

create table public.data_breaches (
  id                      uuid primary key default app.uuid_v7(),

  /** Reference interne, communiquee a la CNIL et aux personnes concernees. */
  reference               text not null,

  /** Quand la violation s'est produite, au mieux de ce qu'on sait. */
  occurred_at             timestamptz,
  /** Quand NOUS en avons eu connaissance. C'est ce point qui declenche les 72 h. */
  discovered_at           timestamptz not null default now(),

  /**
   * Echeance de notification.
   *
   * Toujours recalculee par declencheur a partir de `discovered_at`, jamais
   * acceptee telle qu'elle arrive : personne ne doit pouvoir la repousser en
   * modifiant une ligne. (Une colonne generee serait plus directe, mais
   * l'addition d'un intervalle a un `timestamptz` depend du fuseau et n'est
   * donc pas immuable au sens de PostgreSQL.)
   */
  notify_deadline_at      timestamptz not null default now(),

  /** Nature de la violation : confidentialite, integrite, disponibilite. */
  nature                  text not null,
  description             text not null,

  /** Categories de personnes et de donnees concernees (art. 33.3.a). */
  subject_categories      text[] not null default '{}',
  data_categories         text[] not null default '{}',
  approximate_subjects    int,
  approximate_records     int,

  /** Consequences probables et mesures prises (art. 33.3.c et d). */
  likely_consequences     text,
  measures_taken          text,

  risk_level              app.breach_risk not null default 'pending',
  /** Obligatoire des que le risque est evalue a « none » : art. 33.1. */
  no_risk_justification   text,

  cnil_notified_at        timestamptz,
  cnil_reference          text,
  /** Notification tardive : l'art. 33.1 exige d'en donner le motif. */
  delay_justification     text,

  /** Information des personnes concernees (art. 34), si le risque est eleve. */
  subjects_notified_at    timestamptz,
  subjects_notification_method text,
  /** Exemption art. 34.3 : chiffrement, mesures ulterieures, effort disproportionne. */
  subjects_exemption      text,

  affected_organizations  uuid[] not null default '{}',

  closed_at               timestamptz,
  created_by              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint data_breaches_nature_valid
    check (nature in ('confidentiality', 'integrity', 'availability', 'combined')),
  constraint data_breaches_description_substantial check (length(btrim(description)) >= 20),
  -- Conclure « pas de risque » sans l'ecrire n'est pas une evaluation.
  constraint data_breaches_no_risk_motivated
    check (risk_level <> 'none' or length(btrim(coalesce(no_risk_justification, ''))) >= 20)
);

create unique index data_breaches_reference_key on public.data_breaches (reference);
create index data_breaches_open_idx on public.data_breaches (notify_deadline_at)
  where closed_at is null;

create trigger data_breaches_touch_updated_at
  before update on public.data_breaches
  for each row execute function app.touch_updated_at();

/** L'echeance des 72 heures est calculee, jamais saisie. */
create or replace function app.set_breach_deadline()
returns trigger
language plpgsql
set search_path = public, app, pg_catalog
as $$
begin
  new.notify_deadline_at := new.discovered_at + interval '72 hours';
  return new;
end;
$$;

create trigger data_breaches_deadline
  before insert or update on public.data_breaches
  for each row execute function app.set_breach_deadline();

/**
 * Immuabilite des elements de preuve.
 *
 * Une date de decouverte qu'on peut reculer, une notification qu'on peut
 * effacer : le registre ne vaudrait plus rien. On peut completer une entree,
 * jamais defaire ce qui y est deja inscrit.
 */
create or replace function app.guard_breach_record()
returns trigger
language plpgsql
set search_path = public, app, pg_catalog
as $$
begin
  if new.discovered_at is distinct from old.discovered_at then
    raise exception 'La date de decouverte fixe le delai de 72 heures : elle ne se modifie pas'
      using errcode = '23514';
  end if;

  if old.cnil_notified_at is not null
     and new.cnil_notified_at is distinct from old.cnil_notified_at then
    raise exception 'Une notification a la CNIL deja enregistree ne se retire pas'
      using errcode = '23514';
  end if;

  if old.subjects_notified_at is not null
     and new.subjects_notified_at is distinct from old.subjects_notified_at then
    raise exception 'Une information des personnes deja enregistree ne se retire pas'
      using errcode = '23514';
  end if;

  if old.reference is distinct from new.reference then
    raise exception 'La reference d''une violation est definitive' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger data_breaches_guard
  before update on public.data_breaches
  for each row execute function app.guard_breach_record();

/** Une entree du registre ne se supprime pas. Elle se cloture. */
create or replace function app.forbid_breach_delete()
returns trigger
language plpgsql
set search_path = public, app, pg_catalog
as $$
begin
  raise exception 'Le registre des violations est inalterable : cloturez l''entree, ne la supprimez pas'
    using errcode = '42501';
end;
$$;

create trigger data_breaches_no_delete
  before delete on public.data_breaches
  for each row execute function app.forbid_breach_delete();

alter table public.data_breaches enable row level security;
alter table public.data_breaches force row level security;

-- Le registre contient la description de nos propres failles. Il n'est lisible
-- que par l'administration de la plateforme, jamais par un client.
create policy data_breaches_admin on public.data_breaches
  for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

revoke all on table public.data_breaches from anon, authenticated;
grant select, insert, update on table public.data_breaches to authenticated;

comment on table public.data_breaches is
  'Registre des violations de donnees exige par l''article 33.5 du RGPD. '
  'Documente TOUTE violation, y compris celles qui ne sont pas notifiees. '
  'Inalterable : on complete une entree, on ne la reecrit pas et on ne la supprime pas.';
comment on column public.data_breaches.notify_deadline_at is
  'Echeance des 72 heures, calculee par declencheur depuis la DECOUVERTE '
  '(art. 33.1) et non depuis le fait generateur. Elle ne se repousse pas.';

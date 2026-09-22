-- =============================================================================
--  StaX — 0028 · Le journal d'audit survit a ce qu'il documente
-- =============================================================================
--
--  `audit_logs` et `security_events` sont append-only : un declencheur refuse
--  tout UPDATE et tout DELETE. C'est la regle, et elle est juste.
--
--  Mais leurs colonnes portaient des cles etrangeres en `on delete set null`.
--  Or « set null », c'est un UPDATE. Les deux regles se contredisaient :
--
--   * supprimer une organisation declenchait
--     `update audit_logs set organization_id = null`, refuse par le garde
--     append-only — donc AUCUNE organisation ne pouvait etre supprimee, et
--     aucun compte qui en dependait. L'effacement au titre de l'article 17 du
--     RGPD etait inexecutable ;
--
--   * et si le UPDATE avait ete autorise, le resultat aurait ete pire : le
--     journal aurait perdu SON SUJET au moment precis ou il devient utile.
--     Un audit qui oublie de qui il parle des que la ligne concernee
--     disparait ne prouve plus rien.
--
--  Les identifiants restent donc des `uuid` ordinaires. C'est la forme
--  habituelle d'une table d'archive : elle conserve la reference telle qu'elle
--  etait au moment des faits, y compris quand l'objet reference n'existe plus.
--  Les lectures de l'application filtrent deja sur ces colonnes sans jointure
--  obligatoire, et les policies RLS s'appuient sur `organization_id` — rien ne
--  change pour elles.
--
-- =============================================================================

alter table public.audit_logs
  drop constraint if exists audit_logs_actor_id_fkey,
  drop constraint if exists audit_logs_impersonated_by_fkey,
  drop constraint if exists audit_logs_organization_id_fkey,
  drop constraint if exists audit_logs_site_id_fkey;

alter table public.security_events
  drop constraint if exists security_events_organization_id_fkey,
  drop constraint if exists security_events_user_id_fkey;

comment on column public.audit_logs.organization_id is
  'Organisation concernee AU MOMENT DES FAITS. Volontairement sans cle '
  'etrangere : le journal est append-only, et une suppression ne doit ni '
  'echouer, ni effacer le sujet de l''enregistrement.';

comment on column public.audit_logs.actor_id is
  'Auteur de l''action au moment des faits. Conserve meme apres suppression '
  'du compte — `actor_email` garde la trace lisible.';

comment on column public.security_events.organization_id is
  'Organisation concernee au moment des faits. Sans cle etrangere, pour la '
  'meme raison que dans audit_logs.';

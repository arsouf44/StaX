-- =============================================================================
--  StaX — 0013 · Etat des services, publiable
--
--  La page /status doit etre consultable sans compte : c'est sa raison d'etre.
--  On expose donc les indicateurs en lecture anonyme, MAIS colonne par colonne :
--  `metadata` peut contenir des details d'exploitation (identifiants de tache,
--  messages d'erreur bruts) qui n'ont rien a faire sur une page publique.
-- =============================================================================

create policy system_health_public_read on public.system_health
  for select to anon
  using (true);

-- La RLS ne filtre pas les colonnes : c'est le privilege SELECT qui s'en charge.
revoke select on public.system_health from anon;
grant select (key, label, status, detail, observed_at) on public.system_health to anon;

comment on column public.system_health.metadata is
  'Details d''exploitation. Volontairement NON accessibles au role anon : la '
  'page publique /status n''expose que le libelle, le statut et l''horodatage.';

-- =============================================================================
--  Demandes entrantes du site StaX lui-meme
-- =============================================================================
--  Contact commercial et demande de devis. Ces formulaires sont ouverts au
--  public : personne n'est authentifie au moment de l'envoi, et le Worker agit
--  avec le role de service.
--
--  La fonction fait donc elle-meme tout ce que la RLS ferait pour un
--  utilisateur identifie : bornage des champs, classement des indesirables
--  sans perte, et aucune ecriture dans une table dont le public n'a rien a
--  connaitre.
-- =============================================================================

create or replace function app.record_platform_lead(
  p_kind        text,
  p_name        text,
  p_email       text,
  p_phone       text default null,
  p_company     text default null,
  p_subject     text default null,
  p_message     text default null,
  p_brief       jsonb default '{}'::jsonb,
  p_sector      text default null,
  p_business    text default null,
  p_spam_score  numeric default 0,
  p_ip_hash     text default null,
  p_locale      text default 'fr'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_reference text;
  v_quote     uuid;
  v_contact   uuid;
  v_spam      boolean := coalesce(p_spam_score, 0) >= 0.8;
begin
  if coalesce(btrim(p_email), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'email_required');
  end if;

  -- Reference lisible, unique, sans compteur global revelateur du volume
  -- d'affaires.
  v_reference := 'D-' || to_char(now(), 'YYMM') || '-'
                 || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  if p_kind = 'quote' then
    insert into public.quotes
      (reference, contact_name, contact_email, contact_phone, company_name,
       sector_slug, business_type_slug, brief, status, currency)
    values
      (v_reference, left(btrim(p_name), 100), lower(btrim(p_email)),
       nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_company, '')), ''),
       p_sector, p_business, coalesce(p_brief, '{}'::jsonb),
       case when v_spam then 'draft' else 'requested' end, 'EUR')
    returning id into v_quote;
  end if;

  -- Le contact commercial est conserve dans le CRM de la plateforme, sans
  -- organisation : c'est un prospect, pas encore un client.
  if not v_spam then
    insert into public.contacts
      (organization_id, first_name, last_name, email, phone, company, source, notes)
    select o.id, null, left(btrim(p_name), 100), lower(btrim(p_email)),
           nullif(btrim(coalesce(p_phone, '')), ''),
           nullif(btrim(coalesce(p_company, '')), ''),
           'form',
           left(coalesce(p_subject, '') || case when p_message is not null
                                                then E'\n' || p_message else '' end, 4000)
      from public.organizations o
     where o.slug = 'stax-plateforme'
     limit 1
    on conflict (organization_id, lower(email)) where email is not null
    do update set
      phone = coalesce(public.contacts.phone, excluded.phone),
      company = coalesce(public.contacts.company, excluded.company),
      last_contacted_at = now(),
      updated_at = now()
    returning id into v_contact;
  end if;

  return jsonb_build_object(
    'ok', true,
    'reference', v_reference,
    'quoteId', v_quote,
    'contactId', v_contact,
    'spam', v_spam
  );
end;
$$;

revoke all on function
  app.record_platform_lead(text, text, text, text, text, text, text, jsonb, text, text, numeric, text, text)
  from public, anon, authenticated;

create or replace function public.record_platform_lead(
  p_kind text, p_name text, p_email text, p_phone text default null,
  p_company text default null, p_subject text default null, p_message text default null,
  p_brief jsonb default '{}'::jsonb, p_sector text default null, p_business text default null,
  p_spam_score numeric default 0, p_ip_hash text default null, p_locale text default 'fr'
) returns jsonb language sql security definer
set search_path = public, app, pg_catalog as $$
  select app.record_platform_lead(p_kind, p_name, p_email, p_phone, p_company, p_subject,
                                  p_message, p_brief, p_sector, p_business,
                                  p_spam_score, p_ip_hash, p_locale);
$$;

revoke all on function
  public.record_platform_lead(text, text, text, text, text, text, text, jsonb, text, text, numeric, text, text)
  from public, anon, authenticated;
grant execute on function
  public.record_platform_lead(text, text, text, text, text, text, text, jsonb, text, text, numeric, text, text)
  to service_role;

-- -----------------------------------------------------------------------------
--  Organisation interne StaX
-- -----------------------------------------------------------------------------
--  Elle sert de rattachement aux prospects du site vitrine. Elle est creee ici
--  plutot que dans un jeu de donnees de demonstration : sans elle, un formulaire
--  de contact en production n'aurait nulle part ou deposer un prospect.
insert into public.organizations (name, slug, status)
values ('StaX', 'stax-plateforme', 'active')
on conflict (slug) do nothing;

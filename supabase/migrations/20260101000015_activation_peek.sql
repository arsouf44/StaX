-- =============================================================================
--  Verification d'un code d'activation SANS le consommer
-- =============================================================================
--  Le parcours d'activation se fait en deux temps : on verifie le code, puis on
--  cree le compte. Sans cette fonction, il faudrait creer le compte AVANT de
--  savoir si le code est valide, ce qui laisserait des comptes orphelins a
--  chaque saisie erronee et donnerait a un inconnu un moyen de creer des
--  comptes en masse.
--
--  Elle ne consomme rien, mais elle COMPTE la tentative : un code ne peut donc
--  pas etre teste indefiniment sous couvert de « simple verification ».
--
--  Elle renvoie exactement les memes motifs que la consommation, avec la meme
--  reponse pour un code inconnu et pour un code deja utilise : le formulaire
--  ne doit jamais servir d'oracle.
-- =============================================================================

create or replace function app.peek_activation_code(
  p_code_hash text,
  p_email     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  v_code public.activation_codes%rowtype;
  v_org  text;
begin
  select * into v_code
    from public.activation_codes
   where code_hash = p_code_hash
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- La tentative est comptee meme lorsqu'elle echoue : c'est ce qui rend le
  -- test exhaustif de codes impraticable.
  update public.activation_codes
     set attempt_count = attempt_count + 1,
         last_attempt_at = now()
   where id = v_code.id;

  if v_code.attempt_count >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;
  if v_code.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if v_code.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  if v_code.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_code.email_constraint is not null
     and lower(v_code.email_constraint) <> lower(coalesce(p_email, '')) then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;

  select o.name into v_org from public.organizations o where o.id = v_code.organization_id;

  -- Seules des informations que le destinataire legitime connait deja sont
  -- renvoyees : le nom de son organisation, et le role qui lui sera accorde.
  return jsonb_build_object(
    'ok', true,
    'reason', 'ok',
    'organizationName', v_org,
    'grantedRole', v_code.granted_role
  );
end;
$$;

revoke all on function app.peek_activation_code(text, text) from public, anon, authenticated;

create or replace function public.peek_activation_code(p_code_hash text, p_email text)
returns jsonb
language sql
security definer
set search_path = public, app, pg_catalog
as $$
  select app.peek_activation_code(p_code_hash, p_email);
$$;

revoke all on function public.peek_activation_code(text, text) from public, anon, authenticated;
grant execute on function public.peek_activation_code(text, text) to service_role;

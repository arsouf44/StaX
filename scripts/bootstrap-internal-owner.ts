/**
 * Approvisionnement du compte interne StaX (commandes sans paiement).
 *
 * ============================== SECURITE ==================================
 *
 * Ce script est le SEUL chemin par lequel un compte devient « interne » :
 * commandes honorees sans paiement, sites illimites, toutes fonctionnalites.
 *
 *  1. Le privilege est porte par des COLONNES de `profiles` (account_type,
 *     billing_exempt, unlimited_sites, all_features), ecrites ici avec la cle
 *     de service. Un declencheur refuse toute autre provenance : ni
 *     l interface, ni une requete forgee, ni le compte lui-meme ne peuvent se
 *     les attribuer. Posseder l adresse e-mail ne confere RIEN.
 *
 *  2. Le mot de passe est un SECRET D APPROVISIONNEMENT. Il est lu depuis
 *     `INTERNAL_OWNER_PASSWORD`, au moment de l execution. Il n apparait ni
 *     dans le depot, ni dans une migration, ni dans `.env.example`, ni dans
 *     le code livre au navigateur, ni dans un journal. Ce script ne l affiche
 *     jamais et ne le renvoie jamais.
 *
 *  3. Idempotent. Relance, il ne cree rien en double et NE MODIFIE PAS le mot
 *     de passe d un compte existant, sauf demande explicite
 *     (`INTERNAL_OWNER_RESET_PASSWORD=true`).
 *
 * Usage :
 *   INTERNAL_OWNER_EMAIL=a.gomez@macrobot-ai.com \
 *   INTERNAL_OWNER_PASSWORD='…' \
 *   pnpm internal:bootstrap
 * ==========================================================================
 */
import { createClient } from '@supabase/supabase-js';
import { assertServerOnly, readEnv } from '@stax/config';
import { loadRootEnv } from '@stax/config/dotenv';

assertServerOnly('scripts/bootstrap-internal-owner');
loadRootEnv(import.meta.dirname);

function say(message: string): void {
  process.stdout.write(`${message}\n`);
}

function fail(message: string): never {
  process.stderr.write(`\n[StaX] ${message}\n\n`);
  process.exit(1);
}

/** Exigences minimales. Le mot de passe lui-meme n apparait dans aucun message. */
function assertPasswordStrength(password: string): void {
  const problems: string[] = [];
  if (password.length < 12) problems.push('au moins 12 caracteres');
  if (!/[a-zA-Z]/.test(password)) problems.push('au moins une lettre');
  if (!/[0-9]/.test(password) && !/[^A-Za-z0-9]/.test(password)) {
    problems.push('au moins un chiffre ou un caractere special');
  }
  if (problems.length > 0) {
    fail(`INTERNAL_OWNER_PASSWORD est trop faible. Il lui manque : ${problems.join(', ')}.`);
  }
}

async function findUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string } | null> {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Impossible de lister les comptes : ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return { id: found.id };
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main(): Promise<void> {
  const email = readEnv('INTERNAL_OWNER_EMAIL')?.toLowerCase();
  const password = readEnv('INTERNAL_OWNER_PASSWORD');
  const fullName = readEnv('INTERNAL_OWNER_NAME') ?? 'Arsene Gomez';
  const resetPassword = readEnv('INTERNAL_OWNER_RESET_PASSWORD') === 'true';
  const supabaseUrl = readEnv('SUPABASE_URL');
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fail('INTERNAL_OWNER_EMAIL est absent ou invalide.');
  }
  if (!supabaseUrl || !serviceKey) {
    fail(
      'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis. ' +
        'La cle de service ne doit exister que dans les secrets de deploiement.',
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  say(`Compte interne : ${email}`);
  const existing = await findUserByEmail(admin, email);

  let userId: string;
  if (existing) {
    userId = existing.id;
    if (resetPassword) {
      if (!password) fail('INTERNAL_OWNER_RESET_PASSWORD=true exige INTERNAL_OWNER_PASSWORD.');
      assertPasswordStrength(password);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) fail(`Mise a jour du mot de passe impossible : ${error.message}`);
      say('→ Le compte existe deja : mot de passe remplace (demande explicite).');
    } else {
      say('→ Le compte existe deja : aucun mot de passe n est modifie.');
    }
  } else {
    if (!password) {
      fail(
        'INTERNAL_OWNER_PASSWORD est absent.\n' +
          'Ce secret est fourni UNIQUEMENT au moment de l approvisionnement.\n' +
          'Il ne doit figurer ni dans le depot, ni dans .env.example, ni dans un journal.',
      );
    }
    assertPasswordStrength(password);
    const [firstName, ...rest] = fullName.split(' ');
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        first_name: firstName ?? fullName,
        last_name: rest.join(' ') || null,
      },
    });
    if (error || !data.user) fail(`Creation du compte impossible : ${error?.message ?? 'vide'}`);
    userId = data.user.id;
    say('→ Compte cree.');
  }

  // Le profil est cree par le declencheur `app.handle_new_auth_user`.
  let ready = false;
  for (let attempt = 0; attempt < 20 && !ready; attempt += 1) {
    const { data } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (data) ready = true;
    else await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) fail('Le profil n a pas ete cree. Les migrations sont-elles appliquees ?');

  const [firstName, ...rest] = fullName.split(' ');
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      full_name: fullName,
      first_name: firstName ?? fullName,
      last_name: rest.join(' ') || null,
      account_type: 'internal',
      billing_exempt: true,
      unlimited_sites: true,
      all_features: true,
    })
    .eq('id', userId);
  if (profileError) fail(`Attribution des privileges impossible : ${profileError.message}`);

  // Trace d audit, sans aucun secret.
  await admin.rpc('write_audit', {
    p_action: 'account.internal_provisioned',
    p_target_type: 'profile',
    p_target_id: userId,
    p_metadata: { email, billing_exempt: true, unlimited_sites: true, all_features: true },
  });

  say('→ Compte interne : commandes sans paiement, sites illimites, toutes fonctionnalites.');
  say('');
  say('Le mot de passe n a ete ni affiche ni journalise.');
  say('Retirez INTERNAL_OWNER_PASSWORD de l environnement d approvisionnement.');
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : 'Echec inattendu du script.');
});

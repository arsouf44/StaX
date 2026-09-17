/**
 * Creation du compte proprietaire de la plateforme.
 *
 * ============================== SECURITE ==================================
 *
 * Ce script est le SEUL chemin par lequel un compte obtient le role
 * `platform_owner`. Ce que cela implique, et qui est verifie par les tests :
 *
 *  1. Le mot de passe initial n est JAMAIS present dans le depot. Il est lu
 *     depuis `ADMIN_BOOTSTRAP_PASSWORD`, un secret fourni au moment de
 *     l approvisionnement, et il n est ni journalise, ni affiche, ni renvoye.
 *
 *  2. POSSEDER L ADRESSE ADMIN NE DONNE AUCUN DROIT. Si un inconnu cree un
 *     compte avec cette adresse par le formulaire d inscription public, il
 *     obtient un compte ordinaire : le role vient de la colonne
 *     `profiles.platform_role`, ecrite ici avec la cle de service, et protegee
 *     en base par le declencheur `app.guard_platform_role`.
 *
 *  3. Le script refuse de s executer cote navigateur et exige la cle de
 *     service, qui n est jamais exposee au client.
 *
 *  4. Il est idempotent : relance sans effet de bord si le compte existe deja.
 *     Il ne reinitialise jamais un mot de passe existant.
 *
 *  5. L authentification a double facteur est marquee obligatoire pour ce
 *     compte des sa creation (`mfa_enforced`), et la premiere connexion impose
 *     son enrolement.
 *
 * Usage : pnpm admin:bootstrap
 * ==========================================================================
 */
import { createClient } from '@supabase/supabase-js';
import { assertServerOnly, readEnv } from '@stax/config';

assertServerOnly('scripts/bootstrap-admin');

/** Sortie sure : aucune valeur sensible n arrive jamais ici. */
function say(message: string): void {
  process.stdout.write(`${message}\n`);
}

function fail(message: string): never {
  process.stderr.write(`\n[StaX] ${message}\n\n`);
  process.exit(1);
}

/**
 * Exigences minimales sur le mot de passe initial.
 * Volontairement strictes : ce compte peut tout faire sur la plateforme.
 */
function assertPasswordStrength(password: string): void {
  const problems: string[] = [];
  if (password.length < 16) problems.push('au moins 16 caracteres');
  if (!/[a-z]/.test(password)) problems.push('une minuscule');
  if (!/[A-Z]/.test(password)) problems.push('une majuscule');
  if (!/[0-9]/.test(password)) problems.push('un chiffre');
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('un caractere special');
  if (problems.length > 0) {
    // Le mot de passe lui-meme n apparait pas dans le message.
    fail(
      `ADMIN_BOOTSTRAP_PASSWORD est trop faible. Il lui manque : ${problems.join(', ')}.\n` +
        'Generez-en un avec : openssl rand -base64 24',
    );
  }
}

async function main(): Promise<void> {
  const email = readEnv('ADMIN_EMAIL');
  const password = readEnv('ADMIN_BOOTSTRAP_PASSWORD');
  const supabaseUrl = readEnv('SUPABASE_URL');
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!email) fail('ADMIN_EMAIL est absent. Definissez-le avant de lancer ce script.');
  if (!supabaseUrl || !serviceKey) {
    fail(
      'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis. ' +
        'La cle de service ne doit exister que dans les secrets de deploiement.',
    );
  }
  if (!password) {
    fail(
      'ADMIN_BOOTSTRAP_PASSWORD est absent.\n' +
        'Ce secret est fourni UNIQUEMENT au moment de l approvisionnement :\n' +
        '  ADMIN_BOOTSTRAP_PASSWORD="$(openssl rand -base64 24)" pnpm admin:bootstrap\n' +
        'Il ne doit figurer ni dans le depot, ni dans .env.example, ni dans un journal.',
    );
  }
  assertPasswordStrength(password);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  say(`Compte proprietaire : ${email}`);

  // 1. Le compte existe-t-il deja ? La recherche se fait par e-mail exact.
  const { data: existing, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) fail(`Impossible de lister les comptes : ${listError.message}`);

  const found = existing.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

  let userId: string;
  if (found) {
    userId = found.id;
    say('→ Le compte existe deja : aucun mot de passe n est modifie.');
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Administrateur StaX' },
    });
    if (createError || !created.user) {
      fail(`Creation du compte impossible : ${createError?.message ?? 'reponse vide'}`);
    }
    userId = created.user.id;
    say('→ Compte cree.');
  }

  // 2. Le profil est cree par le declencheur app.handle_new_auth_user ; on
  //    attend sa disponibilite plutot que de le recreer, pour ne jamais
  //    dupliquer une ligne.
  let profileReady = false;
  for (let attempt = 0; attempt < 10 && !profileReady; attempt += 1) {
    const { data } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (data) profileReady = true;
    else await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!profileReady) {
    fail('Le profil associe n a pas ete cree. Verifiez que les migrations sont appliquees.');
  }

  // 3. Attribution du role et de l obligation de double facteur.
  //    Cette ecriture n est possible qu avec la cle de service : le
  //    declencheur app.guard_platform_role refuse toute autre provenance.
  const { error: roleError } = await admin
    .from('profiles')
    .update({ platform_role: 'platform_owner', mfa_enforced: true })
    .eq('id', userId);
  if (roleError) fail(`Attribution du role impossible : ${roleError.message}`);

  // 4. Trace d audit, sans aucun secret.
  await admin.rpc('write_audit', {
    p_action: 'platform.owner_bootstrapped',
    p_target_type: 'profile',
    p_target_id: userId,
    p_metadata: { email },
  });

  say('→ Role « platform_owner » attribue.');
  say('→ Double authentification rendue obligatoire pour ce compte.');
  say('');
  say('Prochaines etapes :');
  say('  1. Connectez-vous et enrolez immediatement votre application d authentification.');
  say('  2. Changez le mot de passe initial depuis votre espace.');
  say('  3. Retirez ADMIN_BOOTSTRAP_PASSWORD de l environnement d approvisionnement.');
  say('');
  say('Rappel : posseder cette adresse e-mail ne confere aucun droit.');
  say('Seule la colonne profiles.platform_role fait autorite, et elle n est');
  say('modifiable que par la cle de service.');
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : 'Echec inattendu du script.');
});

/**
 * Verification de la configuration legale.
 *
 * Publier un site commercial francais sans mentions legales valides est une
 * infraction, pas un detail cosmetique. Ce script est donc branche dans la
 * chaine de deploiement : il echoue bruyamment plutot que de laisser partir en
 * production une page affichant « [A CONFIGURER — SIREN] ».
 *
 * Aucune valeur n est inventee ni devinee : le script se contente de constater
 * ce qui manque.
 *
 * Usage : pnpm legal:check
 */
import { LEGAL_FIELDS, deployEnvironment, legalStatus, readEnv } from '@stax/config';
import { loadRootEnv } from '@stax/config/dotenv';

/**
 * Les variables viennent de `.env.local` a la racine du depot (copie de
 * `.env.example`) ou de l environnement d execution. Une variable deja definie
 * — `VAR=... pnpm <script>`, secret de CI — n est jamais ecrasee.
 */
loadRootEnv(import.meta.dirname);

const status = legalStatus();
const environment = deployEnvironment();
const allowIncomplete = readEnv('LEGAL_ALLOW_INCOMPLETE') === 'true';

function line(text = ''): void {
  process.stdout.write(`${text}\n`);
}

function labelOf(key: string): string {
  return LEGAL_FIELDS.find((field) => field.key === key)?.label ?? key;
}

function hintOf(key: string): string {
  return LEGAL_FIELDS.find((field) => field.key === key)?.hint ?? '';
}

line();
line(`Environnement : ${environment}`);
line(`Relecture juridique requise : ${status.reviewRequired ? 'oui' : 'non'}`);
line();

if (status.missingRequired.length > 0) {
  line('Informations obligatoires manquantes :');
  for (const key of status.missingRequired) {
    line(`  ✗ ${key.padEnd(22)} ${labelOf(key)}`);
    line(`    ${hintOf(key)}`);
  }
  line();
}

if (status.missingOptional.length > 0) {
  line('Informations facultatives non renseignees :');
  for (const key of status.missingOptional) {
    line(`  · ${key.padEnd(22)} ${labelOf(key)}`);
  }
  line();
}

if (status.configured) {
  line('Toutes les informations obligatoires sont renseignees.');
  line();
  line('Rappel : les textes livres sont des MODELES. Ils doivent etre relus et');
  line('valides par un professionnel du droit avant toute ouverture commerciale.');
  line();
  process.exit(0);
}

if (environment !== 'production') {
  line('Environnement non productif : les champs manquants s affichent sous forme');
  line('de marqueurs explicites. Aucune valeur n est inventee.');
  line();
  process.exit(0);
}

if (allowIncomplete) {
  line('LEGAL_ALLOW_INCOMPLETE=true : le demarrage est autorise malgre les');
  line('manques. Cette option doit etre retiree avant l ouverture commerciale.');
  line();
  process.exit(0);
}

process.stderr.write(
  '\nDeploiement refuse : les mentions legales obligatoires ne sont pas configurees.\n' +
    'Renseignez les variables listees ci-dessus dans les secrets de production,\n' +
    'ou definissez LEGAL_ALLOW_INCOMPLETE=true tant que le deploiement reste prive.\n' +
    'Voir docs/legal-configuration.md.\n\n',
);
process.exit(1);

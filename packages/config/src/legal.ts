import { deployEnvironment, readEnv } from './runtime.js';

/**
 * LEGAL_REVIEW_REQUIRED
 * ---------------------
 * Every legal text shipped with StaX (CGV, CGU, politique de confidentialite,
 * mentions legales, politique de remboursement, cookies, sous-traitants) is a
 * TEMPLATE. It must be reviewed and validated by a qualified lawyer before the
 * platform is opened commercially. Nothing in these templates overrides the
 * mandatory protections of French and EU consumer law.
 *
 * No company identifier is ever hard-coded: everything comes from the
 * environment so that the repository never contains invented legal data.
 */
export const LEGAL_REVIEW_REQUIRED = true as const;

export interface LegalField {
  key: LegalKey;
  label: string;
  /** Mandatory fields block production start-up when unset. */
  required: boolean;
  /** Explicit development placeholder — obviously fake, never plausible. */
  placeholder: string;
  hint: string;
}

export type LegalKey =
  | 'LEGAL_COMPANY_NAME'
  | 'LEGAL_FORM'
  | 'LEGAL_CAPITAL'
  | 'LEGAL_ADDRESS'
  | 'LEGAL_SIREN'
  | 'LEGAL_RCS'
  | 'LEGAL_VAT'
  | 'LEGAL_DIRECTOR'
  | 'LEGAL_HOST'
  | 'LEGAL_HOST_ADDRESS'
  | 'LEGAL_DPO_CONTACT'
  | 'LEGAL_MEDIATOR'
  | 'SUPPORT_EMAIL'
  | 'SUPPORT_PHONE';

export const LEGAL_FIELDS: readonly LegalField[] = [
  {
    key: 'LEGAL_COMPANY_NAME',
    label: 'Denomination sociale',
    required: true,
    placeholder: '[A CONFIGURER — denomination sociale]',
    hint: 'Nom exact figurant sur l’extrait Kbis.',
  },
  {
    key: 'LEGAL_FORM',
    label: 'Forme juridique',
    required: true,
    placeholder: '[A CONFIGURER — forme juridique]',
    hint: 'SASU, SAS, SARL, EI, micro-entreprise…',
  },
  {
    key: 'LEGAL_CAPITAL',
    label: 'Capital social',
    required: false,
    placeholder: '[A CONFIGURER — capital social]',
    hint: 'Obligatoire pour les societes de capitaux. Laisser vide pour une entreprise individuelle.',
  },
  {
    key: 'LEGAL_ADDRESS',
    label: 'Siege social',
    required: true,
    placeholder: '[A CONFIGURER — adresse du siege social]',
    hint: 'Adresse postale complete.',
  },
  {
    key: 'LEGAL_SIREN',
    label: 'SIREN / SIRET',
    required: true,
    placeholder: '[A CONFIGURER — SIREN]',
    hint: 'Numero d’identification INSEE.',
  },
  {
    key: 'LEGAL_RCS',
    label: 'RCS',
    required: false,
    placeholder: '[A CONFIGURER — RCS]',
    hint: 'Ville d’immatriculation et numero, si applicable.',
  },
  {
    key: 'LEGAL_VAT',
    label: 'TVA intracommunautaire',
    required: false,
    placeholder: '[A CONFIGURER — numero de TVA]',
    hint: 'Laisser vide si franchise en base de TVA (article 293 B du CGI).',
  },
  {
    key: 'LEGAL_DIRECTOR',
    label: 'Directeur de la publication',
    required: true,
    placeholder: '[A CONFIGURER — directeur de la publication]',
    hint: 'Personne physique responsable au sens de la loi du 21 juin 2004 (LCEN).',
  },
  {
    key: 'LEGAL_HOST',
    label: 'Hebergeur',
    required: true,
    placeholder: '[A CONFIGURER — hebergeur]',
    hint: 'Raison sociale de l’hebergeur (Cloudflare, Inc. et Supabase, Inc. pour StaX).',
  },
  {
    key: 'LEGAL_HOST_ADDRESS',
    label: 'Adresse de l’hebergeur',
    required: true,
    placeholder: '[A CONFIGURER — adresse de l’hebergeur]',
    hint: 'Adresse postale et moyen de contact de l’hebergeur.',
  },
  {
    key: 'LEGAL_DPO_CONTACT',
    label: 'Contact donnees personnelles',
    required: true,
    placeholder: '[A CONFIGURER — contact RGPD]',
    hint: 'Adresse de contact pour l’exercice des droits RGPD.',
  },
  {
    key: 'LEGAL_MEDIATOR',
    label: 'Mediateur de la consommation',
    required: false,
    placeholder: '[A CONFIGURER — mediateur de la consommation]',
    hint: 'Obligatoire pour les ventes aux consommateurs (article L.612-1 du Code de la consommation).',
  },
  {
    key: 'SUPPORT_EMAIL',
    label: 'E-mail de support',
    required: true,
    placeholder: '[A CONFIGURER — email de support]',
    hint: 'Adresse de contact affichee publiquement.',
  },
  {
    key: 'SUPPORT_PHONE',
    label: 'Telephone de support',
    required: false,
    placeholder: '[A CONFIGURER — telephone de support]',
    hint: 'Facultatif mais recommande pour la confiance client.',
  },
] as const;

export type LegalConfig = Record<LegalKey, string>;

export interface LegalStatus {
  configured: boolean;
  missingRequired: LegalKey[];
  missingOptional: LegalKey[];
  reviewRequired: true;
}

function fieldFor(key: LegalKey): LegalField {
  const found = LEGAL_FIELDS.find((field) => field.key === key);
  if (!found) throw new Error(`[StaX] Champ legal inconnu : ${key}`);
  return found;
}

/**
 * Resolves the legal identity block.
 * Unset values fall back to an unmistakable placeholder so that no fake SIREN,
 * address or director name can ever reach a rendered page.
 */
export function legalConfig(): LegalConfig {
  const entries = LEGAL_FIELDS.map((field) => {
    const value = readEnv(field.key);
    return [field.key, value ?? field.placeholder] as const;
  });
  return Object.fromEntries(entries) as LegalConfig;
}

export function legalValue(key: LegalKey): string {
  return readEnv(key) ?? fieldFor(key).placeholder;
}

export function isLegalValueConfigured(key: LegalKey): boolean {
  return readEnv(key) !== undefined;
}

export function legalStatus(): LegalStatus {
  const missingRequired: LegalKey[] = [];
  const missingOptional: LegalKey[] = [];
  for (const field of LEGAL_FIELDS) {
    if (isLegalValueConfigured(field.key)) continue;
    if (field.required) missingRequired.push(field.key);
    else missingOptional.push(field.key);
  }
  return {
    configured: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    reviewRequired: LEGAL_REVIEW_REQUIRED,
  };
}

/**
 * Called during production boot. Refuses to start a commercially open platform
 * whose mandatory legal identity is incomplete — publishing a French commercial
 * site without valid mentions legales is an offence, not a cosmetic issue.
 *
 * Set `LEGAL_ALLOW_INCOMPLETE=true` to downgrade this to a loud admin warning
 * while a deployment is still private.
 */
export function assertLegalConfigured(): void {
  const status = legalStatus();
  if (status.configured) return;
  if (deployEnvironment() !== 'production') return;
  if (readEnv('LEGAL_ALLOW_INCOMPLETE') === 'true') {
    console.warn(
      `[StaX] Mentions legales incompletes en production : ${status.missingRequired.join(', ')}. ` +
        'LEGAL_ALLOW_INCOMPLETE=true est actif — a retirer avant ouverture commerciale.',
    );
    return;
  }
  throw new Error(
    `[StaX] Demarrage refuse : informations legales obligatoires manquantes (${status.missingRequired.join(
      ', ',
    )}). Renseignez-les dans les secrets de production ou definissez LEGAL_ALLOW_INCOMPLETE=true ` +
      'tant que le deploiement reste prive. Voir docs/legal-configuration.md.',
  );
}

/* -------------------------------------------------------------------------- */
/*  Commercial policy values that the legal texts reference                    */
/* -------------------------------------------------------------------------- */

export interface RefundPolicyConfig {
  /** Days after go-live during which a refund may be requested. */
  windowDays: number;
  /** Amount withheld when a domain name was genuinely purchased, in cents. */
  domainDeductionCents: number;
  currency: 'EUR';
}

export function refundPolicyConfig(): RefundPolicyConfig {
  const windowDays = Number.parseInt(readEnv('REFUND_WINDOW_DAYS') ?? '15', 10);
  const deduction = Number.parseInt(readEnv('DOMAIN_REFUND_DEDUCTION_CENTS') ?? '1000', 10);
  return {
    windowDays: Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 15,
    domainDeductionCents: Number.isFinite(deduction) && deduction >= 0 ? deduction : 1000,
    currency: 'EUR',
  };
}

export interface MaintenancePolicyConfig {
  /** Days a site stays online after maintenance ends before suspension. */
  gracePeriodDays: number;
  /** Days a suspended site is kept before archival. */
  suspensionRetentionDays: number;
  /** Days archived data is kept before deletion is permitted. */
  archiveRetentionDays: number;
  /** Accounting retention imposed by French commercial law (10 years). */
  financialRetentionYears: number;
}

export function maintenancePolicyConfig(): MaintenancePolicyConfig {
  const int = (key: string, fallback: number): number => {
    const parsed = Number.parseInt(readEnv(key) ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    gracePeriodDays: int('MAINTENANCE_GRACE_PERIOD_DAYS', 30),
    suspensionRetentionDays: int('MAINTENANCE_SUSPENSION_RETENTION_DAYS', 90),
    archiveRetentionDays: int('MAINTENANCE_ARCHIVE_RETENTION_DAYS', 365),
    financialRetentionYears: 10,
  };
}

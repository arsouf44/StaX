import { checkLegalIdentity, type IdentityProblem } from './identity';
import { deployEnvironment, readEnv } from './runtime';

/**
 * LEGAL_REVIEW_REQUIRED
 * ---------------------
 * Every legal text shipped with Nemasus (CGV, CGU, politique de confidentialite,
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
  /**
   * Publicly mandatory identity of the publisher, committed on purpose.
   *
   * A SIREN, a registered address or a VAT number are not secrets: French law
   * REQUIRES them to appear on every page of a commercial website. Keeping
   * them out of the repository would not protect anything — it would only mean
   * the site cannot render its own mandatory notices.
   *
   * The share capital, the publication director and the public contact address
   * are published on the same pages for the same reason; they were provided by
   * the company (2026-09-28) and can still be overridden by an environment
   * variable if they change.
   */
  defaultValue?: string;
}

export type LegalKey =
  | 'LEGAL_COMPANY_NAME'
  | 'LEGAL_SIRET'
  | 'LEGAL_BRAND'
  | 'LEGAL_FORM'
  | 'LEGAL_CAPITAL'
  | 'LEGAL_ADDRESS'
  | 'LEGAL_SIREN'
  | 'LEGAL_RCS'
  | 'LEGAL_VAT'
  | 'LEGAL_DIRECTOR'
  | 'LEGAL_REPRESENTATIVE'
  | 'LEGAL_PHONE'
  | 'LEGAL_HOST'
  | 'LEGAL_HOST_ADDRESS'
  | 'LEGAL_HOST_PHONE'
  | 'LEGAL_DPO_CONTACT'
  | 'LEGAL_MEDIATOR'
  | 'SUPPORT_EMAIL'
  | 'SUPPORT_PHONE';

export const LEGAL_FIELDS: readonly LegalField[] = [
  {
    key: 'LEGAL_COMPANY_NAME',
    label: 'Dénomination sociale',
    required: true,
    placeholder: '[A CONFIGURER — dénomination sociale]',
    defaultValue: 'LallianSe',
    hint: 'Nom exact figurant sur l’extrait Kbis.',
  },
  {
    key: 'LEGAL_BRAND',
    label: 'Nom commercial',
    required: true,
    placeholder: '[A CONFIGURER — nom commercial]',
    defaultValue: 'Nemasus',
    hint: 'Marque sous laquelle l’activité est exercée. Nemasus est une branche d’activité de LallianSe.',
  },
  {
    key: 'LEGAL_FORM',
    label: 'Forme juridique',
    required: true,
    placeholder: '[A CONFIGURER — forme juridique]',
    defaultValue: 'SAS (société par actions simplifiée)',
    hint: 'SASU, SAS, SARL, EI, micro-entreprise…',
  },
  {
    key: 'LEGAL_CAPITAL',
    label: 'Capital social',
    required: true,
    placeholder: '[A CONFIGURER — capital social]',
    defaultValue: '3 000 €',
    hint: 'Obligatoire pour une société de capitaux (article R.123-237 du Code de commerce). Montant exact figurant sur le Kbis, par exemple « 10 000 € ».',
  },
  {
    key: 'LEGAL_ADDRESS',
    label: 'Siège social',
    required: true,
    placeholder: '[A CONFIGURER — adresse du siège social]',
    defaultValue: '229 rue Saint-Honoré, 75001 Paris, France',
    hint: 'Adresse postale complète.',
  },
  {
    key: 'LEGAL_SIREN',
    label: 'SIREN',
    required: true,
    placeholder: '[A CONFIGURER — SIREN]',
    defaultValue: '814 648 663',
    hint: 'Numéro d’identification INSEE à neuf chiffres. La clé de contrôle est vérifiée au démarrage.',
  },
  {
    key: 'LEGAL_SIRET',
    label: 'SIRET du siège',
    required: true,
    placeholder: '[A CONFIGURER — SIRET]',
    defaultValue: '814 648 663 00031',
    hint: 'SIREN suivi du NIC de l’établissement. Doit commencer par le SIREN déclaré.',
  },
  {
    key: 'LEGAL_RCS',
    label: 'RCS',
    required: true,
    placeholder: '[A CONFIGURER — RCS]',
    defaultValue: 'RCS Paris 814 648 663',
    hint: 'Ville d’immatriculation et numéro (article R.123-237 du Code de commerce).',
  },
  {
    key: 'LEGAL_VAT',
    label: 'TVA intracommunautaire',
    required: true,
    placeholder: '[A CONFIGURER — numéro de TVA]',
    defaultValue: 'FR58814648663',
    hint: 'Calculé depuis le SIREN et vérifié au démarrage. Laisser vide uniquement en franchise en base de TVA (article 293 B du CGI).',
  },
  {
    key: 'LEGAL_DIRECTOR',
    label: 'Directeur de la publication',
    required: true,
    placeholder: '[A CONFIGURER — directeur de la publication]',
    defaultValue: 'Julie Rachline Gomez',
    hint: 'Personne physique responsable au sens de la loi du 29 juillet 1982 (art. 93-2) et de la LCEN : le représentant légal de la société. La présidente de LallianSe étant une personne morale (SELALLIAN), c’est la représentante légale de celle-ci.',
  },
  {
    key: 'LEGAL_REPRESENTATIVE',
    label: 'Représentant légal',
    required: false,
    placeholder: '[A CONFIGURER — representant legal]',
    // Registre national des entreprises : SELALLIAN présidente de LallianSe
    // depuis le 30 juin 2025 ; Julie Gomez (née Rachline) gérante de SELALLIAN.
    defaultValue:
      'SELALLIAN (EURL, RCS Saint-Nazaire 938 435 849), présidente, représentée par sa gérante, Julie Rachline Gomez',
    hint: 'Chaîne de représentation telle qu’elle figure au registre : présidente de la société, et personne physique qui la représente.',
  },
  {
    key: 'LEGAL_PHONE',
    label: 'Téléphone de l’éditeur',
    required: true,
    placeholder: '[A CONFIGURER — téléphone de l’éditeur]',
    hint: 'Exigé pour une personne morale par l’article 6 III de la LCEN, avec la dénomination et le siège. À défaut, SUPPORT_PHONE est utilisé.',
  },
  {
    key: 'LEGAL_HOST',
    label: 'Hébergeur',
    required: true,
    placeholder: '[A CONFIGURER — hebergeur]',
    defaultValue: 'Vercel Inc.',
    hint: 'Raison sociale du prestataire qui héberge la plateforme (article 6 III de la LCEN). Les sites des clients et la base de données ont leurs propres prestataires, nommés dans les mentions légales.',
  },
  {
    key: 'LEGAL_HOST_ADDRESS',
    label: 'Adresse de l’hébergeur',
    required: true,
    placeholder: '[A CONFIGURER — adresse de l’hebergeur]',
    defaultValue: '440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis',
    hint: 'Adresse postale de l’hébergeur, telle qu’il la publie.',
  },
  {
    key: 'LEGAL_HOST_PHONE',
    label: 'Téléphone de l’hébergeur',
    required: true,
    placeholder: '[A CONFIGURER — téléphone de l’hébergeur]',
    // Numéro publié par Vercel Inc. (vercel.com/legal/dmca-policy).
    defaultValue: '+1 559 288 7060',
    hint: 'Exigé par l’article 6 III de la LCEN (modifié par la loi du 21 mai 2024) : numéro de téléphone du prestataire d’hébergement, tel qu’il le publie.',
  },
  {
    key: 'LEGAL_DPO_CONTACT',
    label: 'Contact données personnelles',
    required: true,
    placeholder: '[A CONFIGURER — contact RGPD]',
    defaultValue: 'nemasus@lallianse.com',
    hint: 'Adresse de contact pour l’exercice des droits RGPD.',
  },
  {
    key: 'LEGAL_MEDIATOR',
    label: 'Médiateur de la consommation',
    required: false,
    placeholder: '[A CONFIGURER — mediateur de la consommation]',
    hint: 'Obligatoire pour les ventes aux consommateurs (article L.612-1 du Code de la consommation).',
  },
  {
    key: 'SUPPORT_EMAIL',
    label: 'E-mail de support',
    required: true,
    placeholder: '[A CONFIGURER — email de support]',
    defaultValue: 'nemasus@lallianse.com',
    hint: 'Adresse de contact affichee publiquement.',
  },
  {
    key: 'SUPPORT_PHONE',
    label: 'Téléphone de support',
    required: false,
    placeholder: '[A CONFIGURER — téléphone du support]',
    hint: 'Facultatif mais recommande pour la confiance client. À défaut, LEGAL_PHONE est affiché.',
  },
] as const;

/**
 * Un meme numero sert souvent aux deux usages : le telephone de l'editeur
 * (obligation LCEN) et celui du support. L'un tient lieu de l'autre.
 */
const LEGAL_ALIASES: Partial<Record<LegalKey, LegalKey>> = {
  LEGAL_PHONE: 'SUPPORT_PHONE',
  SUPPORT_PHONE: 'LEGAL_PHONE',
};

function configuredValue(key: LegalKey): string | undefined {
  const alias = LEGAL_ALIASES[key];
  return readEnv(key) ?? (alias ? readEnv(alias) : undefined);
}

export type LegalConfig = Record<LegalKey, string>;

export interface LegalStatus {
  configured: boolean;
  missingRequired: LegalKey[];
  missingOptional: LegalKey[];
  /** Identifiants mal formes : cle de controle fausse, SIRET etranger au SIREN. */
  identityProblems: IdentityProblem[];
  reviewRequired: true;
}

function fieldFor(key: LegalKey): LegalField {
  const found = LEGAL_FIELDS.find((field) => field.key === key);
  if (!found) throw new Error(`[Nemasus] Champ légal inconnu : ${key}`);
  return found;
}

/**
 * Resolves the legal identity block.
 * Unset values fall back to an unmistakable placeholder so that no fake SIREN,
 * address or director name can ever reach a rendered page.
 */
export function legalConfig(): LegalConfig {
  const entries = LEGAL_FIELDS.map((field) => [field.key, legalValue(field.key)] as const);
  return Object.fromEntries(entries) as LegalConfig;
}

/**
 * Ordre de resolution : secret de deploiement, puis valeur publique connue,
 * puis marqueur de substitution.
 *
 * Le marqueur est volontairement impossible a confondre avec une vraie valeur :
 * il vaut mieux qu'une page affiche « [A CONFIGURER] » qu'un SIREN invente.
 */
export function legalValue(key: LegalKey): string {
  const field = fieldFor(key);
  return configuredValue(key) ?? field.defaultValue ?? field.placeholder;
}

export function isLegalValueConfigured(key: LegalKey): boolean {
  const field = fieldFor(key);
  return configuredValue(key) !== undefined || field.defaultValue !== undefined;
}

export function legalStatus(): LegalStatus {
  const missingRequired: LegalKey[] = [];
  const missingOptional: LegalKey[] = [];
  for (const field of LEGAL_FIELDS) {
    if (isLegalValueConfigured(field.key)) continue;
    if (field.required) missingRequired.push(field.key);
    else missingOptional.push(field.key);
  }
  // Un identifiant renseigne mais faux est un probleme DIFFERENT d'un
  // identifiant absent, et tout aussi bloquant : il serait imprime sur chaque
  // facture et chaque page de mentions legales.
  const identityProblems = checkLegalIdentity({
    siren: legalValue('LEGAL_SIREN'),
    siret: legalValue('LEGAL_SIRET'),
    vat: legalValue('LEGAL_VAT'),
  });

  return {
    configured: missingRequired.length === 0 && identityProblems.length === 0,
    missingRequired,
    missingOptional,
    identityProblems,
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

  const details = [
    status.missingRequired.length > 0 ? `manquantes : ${status.missingRequired.join(', ')}` : null,
    ...status.identityProblems.map((problem) => `${problem.field} — ${problem.message}`),
  ].filter((entry): entry is string => entry !== null);

  // Une cle de controle fausse n'est JAMAIS tolerable, meme en developpement :
  // c'est une faute de frappe, pas une configuration incomplete, et elle ne se
  // verrait qu'une fois imprimee sur une facture.
  if (status.identityProblems.length > 0) {
    throw new Error(`[Nemasus] Identite commerciale invalide : ${details.join(' | ')}`);
  }

  if (deployEnvironment() !== 'production') return;

  if (readEnv('LEGAL_ALLOW_INCOMPLETE') === 'true') {
    console.warn(
      `[Nemasus] Mentions légales incomplètes en production : ${details.join(' | ')}. ` +
        'LEGAL_ALLOW_INCOMPLETE=true est actif — a retirer avant ouverture commerciale.',
    );
    return;
  }

  throw new Error(
    `[Nemasus] Demarrage refuse : informations legales obligatoires ${details.join(' | ')}. ` +
      'Renseignez-les dans les secrets de production ou definissez LEGAL_ALLOW_INCOMPLETE=true ' +
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

/**
 * Delai de realisation annonce commercialement.
 *
 * Un delai annonce engage le vendeur : l'article L.216-1 du Code de la
 * consommation impose d'indiquer une date de livraison, et le droit commun des
 * contrats fait de meme entre professionnels. Le delai vit donc ici, en un seul
 * endroit, plutot que d'etre recopie dans une page de vente ou personne ne le
 * remettrait a jour.
 *
 * Il court a partir de la reception des elements du client, pas de la commande :
 * c'est la realite du travail, et le dire evite une promesse intenable.
 */
export interface DeliveryPolicyConfig {
  minWeeks: number;
  maxWeeks: number;
  /** Formulation prete a afficher : « 1 à 3 semaines ». */
  label: string;
}

export function deliveryPolicyConfig(): DeliveryPolicyConfig {
  const int = (key: string, fallback: number): number => {
    const parsed = Number.parseInt(readEnv(key) ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const minWeeks = int('DELIVERY_MIN_WEEKS', 1);
  const maxWeeks = Math.max(int('DELIVERY_MAX_WEEKS', 3), minWeeks);

  return {
    minWeeks,
    maxWeeks,
    label:
      minWeeks === maxWeeks
        ? `${minWeeks} semaine${minWeeks > 1 ? 's' : ''}`
        : `${minWeeks} à ${maxWeeks} semaines`,
  };
}

export interface MaintenancePolicyConfig {
  /** Days a site stays online after the last paid period (service continues). */
  gracePeriodDays: number;
  /**
   * Days, after the end of the service, during which the Client who chose
   * « restitution » can still export its data and obtain the source code,
   * before final deletion (RGPD art. 28 § 3 g : restitution OR deletion, at
   * the controller's choice).
   */
  exportWindowDays: number;
  /** Days after which deleted data has also left the encrypted backups. */
  backupRotationDays: number;
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
    exportWindowDays: int('MAINTENANCE_EXPORT_WINDOW_DAYS', 90),
    backupRotationDays: 30,
    financialRetentionYears: 10,
  };
}

/** Sort des données choisi par le Client à la résiliation. */
export type EndOfContractChoice = 'restitution' | 'suppression';

/**
 * Date de suppression définitive, à partir de la fin de la dernière période
 * payée : période de continuité, puis, si le Client a choisi la restitution,
 * délai d'export.
 */
export function endOfContractDeletionDate(periodEnd: Date, choice: EndOfContractChoice): Date {
  const policy = maintenancePolicyConfig();
  const days = policy.gracePeriodDays + (choice === 'restitution' ? policy.exportWindowDays : 0);
  return new Date(periodEnd.getTime() + days * 86_400_000);
}

/**
 * Identite de Nemasus en tant qu HEBERGEUR des sites de ses clients.
 *
 * Chaque site client doit nommer son hebergeur dans ses mentions legales
 * (article 6 III de la LCEN) : c est Nemasus, qui fournit l hebergement. Seules
 * les valeurs reellement configurees sont renvoyees — jamais un marqueur
 * « [A CONFIGURER] », qui n a rien a faire sur le site d un client.
 */
export interface SiteHostIdentity {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  reportUrl: string | null;
}

export function siteHostIdentity(platformBaseUrl: string | null): SiteHostIdentity {
  const configured = (key: LegalKey): string | null =>
    isLegalValueConfigured(key) ? legalValue(key) : null;
  return {
    name: configured('LEGAL_COMPANY_NAME') ?? 'Nemasus',
    address: configured('LEGAL_ADDRESS'),
    phone: configured('LEGAL_PHONE'),
    email: configured('SUPPORT_EMAIL'),
    reportUrl: platformBaseUrl
      ? `${platformBaseUrl.replace(/\/+$/, '')}/signaler-un-contenu`
      : null,
  };
}

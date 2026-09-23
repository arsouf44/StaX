import { z } from 'zod';

/**
 * Identite legale d un site client.
 *
 * Le client est l EDITEUR de son site : c est a lui que l article 6 III de la
 * loi pour la confiance dans l economie numerique impose de s identifier. Ces
 * informations sont saisies une fois dans « Mon entreprise », et les pages
 * « Mentions légales » et « Confidentialité » du site les reprennent
 * automatiquement. Rien n est jamais invente : un champ vide reste vide, et la
 * verification avant publication le signale.
 */

const field = (max: number) => z.string().trim().max(max).default('');

export const legalIdentitySchema = z.object({
  /** Raison sociale, ou nom et prenom de l entrepreneur individuel. */
  legalName: field(160),
  /** SAS, SARL, EI, micro-entreprise, association loi 1901… */
  legalForm: field(80),
  /** Montant du capital social, pour une societe. */
  capital: field(40),
  /** « RCS Paris 123 456 789 », « RNE 123 456 789 », « RNA W123456789 »… */
  registration: field(160),
  vatNumber: field(40),
  /** Adresse du siege (ou du domicile declare de l entrepreneur). */
  address: field(240),
  /** Directeur ou directrice de la publication. */
  publicationDirector: field(120),
  /** Profession reglementee : ordre, titre, pays d obtention, regles. */
  regulatedProfession: field(400),
  /** Mediateur de la consommation (obligatoire si l on vend a des particuliers). */
  mediator: field(300),
  /** Contact pour l exercice des droits RGPD, si different de l e-mail public. */
  privacyContact: field(180),
});

export type LegalIdentity = z.infer<typeof legalIdentitySchema>;

export function parseLegalIdentity(raw: unknown): LegalIdentity {
  const parsed = legalIdentitySchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : legalIdentitySchema.parse({});
}

/** Mentions sans lesquelles un site professionnel ne peut pas etre publie. */
export const REQUIRED_LEGAL_FIELDS = [
  ['legalName', 'la raison sociale (ou votre nom)'],
  ['legalForm', 'la forme juridique'],
  ['registration', 'le numéro d’immatriculation (SIREN, RCS, RNE ou RNA)'],
  ['address', 'l’adresse du siège'],
  ['publicationDirector', 'le directeur de la publication'],
] as const satisfies ReadonlyArray<readonly [keyof LegalIdentity, string]>;

export function missingLegalFields(identity: LegalIdentity): string[] {
  return REQUIRED_LEGAL_FIELDS.filter(([key]) => !identity[key].trim()).map(([, label]) => label);
}

/**
 * Hebergeur du site : StaX, qui le fournit au client. Ses coordonnees
 * viennent de la configuration du deploiement, jamais du code.
 */
export interface HostIdentity {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  /** Page de signalement des contenus illicites. */
  reportUrl: string | null;
}

export const DEFAULT_HOST: HostIdentity = {
  name: 'StaX',
  address: null,
  phone: null,
  email: null,
  reportUrl: null,
};

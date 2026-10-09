import 'server-only';
import { bankTransferDetails, deliveryPolicyConfig } from '@nemasus/config';
import type { Db } from '@nemasus/database';
import {
  accessCodeEmail,
  bankTransferInstructionsEmail,
  sendEmail,
  siteOrderReceivedEmail,
} from '@nemasus/emails';
import { formatMoney, toMajorUnits } from '@nemasus/payments/money';
import {
  activationCodeHint,
  generateActivationCode,
  hashActivationCode,
  normalizeActivationCode,
} from '@nemasus/security';
import { absolutePlatformUrl } from './action-guard';
import { TERMS_VERSION } from '~/content/legal';

/**
 * Commandes réglées par virement, et code d'accès personnel.
 *
 * Le parcours : commande → modalités de paiement par virement → virement reçu
 * → code d'accès envoyé → le client saisit son code → son espace s'ouvre.
 *
 * Le code n'existe en clair que le temps de l'e-mail (et, si l'e-mail ne part
 * pas, d'un unique affichage à l'équipe) : la base n'en garde que l'empreinte
 * HMAC, calculée avec la clé serveur `NEMASUS_SECRET_KEY`.
 */

/** Validité d'un code d'accès, par défaut : 30 jours. */
export const ACCESS_CODE_VALID_DAYS = 30;

export type SiteOrderStatus = 'received' | 'payment_requested' | 'paid' | 'cancelled';

export const SITE_ORDER_STATUS_LABELS: Record<SiteOrderStatus, string> = {
  received: 'Reçue · modalités à envoyer',
  payment_requested: 'Virement attendu',
  paid: 'Payée · accès ouvert',
  cancelled: 'Annulée',
};

export interface SiteOrderRow {
  id: string;
  reference: string;
  status: SiteOrderStatus;
  company_name: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  city: string | null;
  sector_slug: string | null;
  business_type_slug: string | null;
  project_description: string | null;
  answers: Record<string, unknown>;
  domain_handling: 'customer_owned' | 'purchase' | 'later';
  requested_domain: string | null;
  terms_version: string;
  terms_accepted_at: string;
  source: 'web' | 'team';
  amount_cents: number | null;
  currency: string;
  payment_message: string | null;
  payment_requested_at: string | null;
  payment_request_count: number;
  paid_at: string | null;
  paid_amount_cents: number | null;
  organization_id: string | null;
  site_id: string | null;
  project_id: string | null;
  confirmation_email_status: string | null;
  payment_email_status: string | null;
  access_email_status: string | null;
  last_email_error: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  internal_notes: string | null;
  created_at: string;
}

export const SITE_ORDER_COLUMNS =
  'id, reference, status, company_name, contact_first_name, contact_last_name, contact_email, ' +
  'contact_phone, city, sector_slug, business_type_slug, project_description, answers, ' +
  'domain_handling, requested_domain, terms_version, terms_accepted_at, source, amount_cents, ' +
  'currency, payment_message, payment_requested_at, payment_request_count, paid_at, ' +
  'paid_amount_cents, organization_id, site_id, project_id, confirmation_email_status, ' +
  'payment_email_status, access_email_status, last_email_error, cancelled_at, cancel_reason, ' +
  'internal_notes, created_at';

/* -------------------------------------------------------------------------- */
/*  Codes d'accès                                                              */
/* -------------------------------------------------------------------------- */

/** 12 caractères lisibles au téléphone, sans 0/O ni 1/I/L : `7K2M-9QXP-4HTA`. */
export function generateAccessCode(): string {
  return generateActivationCode(3, 4);
}

export function normalizeAccessCode(input: string): string {
  return normalizeActivationCode(input);
}

/** Empreinte HMAC du code : la seule forme sous laquelle la base le connaît. */
export async function hashAccessCode(code: string): Promise<string> {
  return hashActivationCode(code);
}

export function accessCodeHint(code: string): string {
  return activationCodeHint(code);
}

/** Lien de l'e-mail : le code est prérempli, il faut encore confirmer sur la page. */
export function accessCodeUrl(code: string): string {
  return absolutePlatformUrl(`/acces?code=${encodeURIComponent(normalizeAccessCode(code))}`);
}

/* -------------------------------------------------------------------------- */
/*  Montants et dates                                                          */
/* -------------------------------------------------------------------------- */

export function formatOrderAmount(cents: number, currency = 'EUR'): string {
  return formatMoney(cents, (currency || 'EUR') as 'EUR', { hideDecimalsWhenRound: true });
}

/**
 * Montant saisi par l'équipe (« 1 250 », « 1250,50 », « 1 250,50 € ») en
 * centimes entiers. `null` si la saisie n'est pas un montant positif.
 */
export function parseAmountToCents(input: string): number | null {
  const clean = input
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/\u20ac|eur/gi, '')
    .replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return null;
  const [units = '0', decimals = ''] = clean.split('.');
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });

/** Montant en saisie : « 1250 » ou « 1250,50 », sans séparateur de milliers. */
export function amountInputValue(cents: number | null): string {
  if (!cents) return '';
  return new Intl.NumberFormat('fr-FR', {
    useGrouping: false,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(toMajorUnits(cents));
}

/** Instant situé `days` jours avant maintenant, en ISO (hors rendu React). */
export function isoDaysAgo(days: number): string {
  return new Date(new Date().getTime() - days * 86_400_000).toISOString();
}

/** Un instant ISO est-il passé ? */
export function isPast(iso: string): boolean {
  return new Date(iso).getTime() <= new Date().getTime();
}

export function formatOrderDate(iso: string): string {
  return LONG_DATE.format(new Date(iso));
}

/* -------------------------------------------------------------------------- */
/*  E-mails                                                                    */
/*                                                                             */
/*  `db` sert à inscrire le résultat de l'envoi sur la commande (fonctions     */
/*  réservées à l'administration ou au serveur) ; le journal des e-mails,      */
/*  lui, est tenu par `sendEmail` avec la clé de service.                      */
/* -------------------------------------------------------------------------- */

interface EmailOutcome {
  ok: boolean;
  skipped: boolean;
  error?: string;
}

function outcomeStatus(result: EmailOutcome): 'sent' | 'failed' | 'skipped' {
  return !result.ok ? 'failed' : result.skipped ? 'skipped' : 'sent';
}

async function safeSend(
  send: () => Promise<{ ok: boolean; skipped?: boolean; error?: string }>,
): Promise<EmailOutcome> {
  try {
    const result = await send();
    return { ok: result.ok, skipped: Boolean(result.skipped), error: result.error };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error instanceof Error ? error.message : 'Envoi impossible.',
    };
  }
}

/** Accusé de réception, envoyé au client juste après sa commande. */
export async function sendOrderReceivedEmail(
  db: Db,
  order: Pick<
    SiteOrderRow,
    'id' | 'reference' | 'company_name' | 'contact_first_name' | 'contact_email'
  >,
): Promise<EmailOutcome> {
  const result = await safeSend(() =>
    sendEmail(
      siteOrderReceivedEmail({
        to: order.contact_email,
        firstName: order.contact_first_name,
        reference: order.reference,
        companyName: order.company_name,
      }),
    ),
  );
  await db.rpc('record_site_order_email', {
    p_order: order.id,
    p_kind: 'confirmation',
    p_status: outcomeStatus(result),
    p_error: result.error ?? null,
  });
  return result;
}

/** Modalités de paiement par virement. Exige des coordonnées bancaires configurées. */
export async function sendPaymentInstructionsEmail(
  db: Db,
  order: SiteOrderRow,
  options: { reminder?: boolean } = {},
): Promise<EmailOutcome & { missingBankDetails?: boolean }> {
  const bank = bankTransferDetails();
  if (!bank || !order.amount_cents) {
    return { ok: false, skipped: false, missingBankDetails: !bank, error: 'Coordonnées absentes.' };
  }
  const result = await safeSend(() =>
    sendEmail(
      bankTransferInstructionsEmail({
        to: order.contact_email,
        firstName: order.contact_first_name,
        reference: order.reference,
        companyName: order.company_name,
        amountLabel: formatOrderAmount(order.amount_cents ?? 0, order.currency),
        bank,
        message: order.payment_message,
        reminder: options.reminder ?? false,
        termsVersion: TERMS_VERSION,
        deliveryLabel: deliveryPolicyConfig().label,
      }),
      { organizationId: order.organization_id ?? undefined },
    ),
  );
  await db.rpc('record_site_order_email', {
    p_order: order.id,
    p_kind: 'payment',
    p_status: outcomeStatus(result),
    p_error: result.error ?? null,
  });
  return result;
}

/** Code d'accès personnel, envoyé à l'adresse de la commande. */
export async function sendAccessCodeEmail(
  db: Db,
  order: Pick<
    SiteOrderRow,
    | 'id'
    | 'reference'
    | 'company_name'
    | 'contact_first_name'
    | 'contact_email'
    | 'organization_id'
    | 'site_id'
  >,
  code: { id: string; value: string; expiresAt: string },
): Promise<EmailOutcome> {
  const result = await safeSend(() =>
    sendEmail(
      accessCodeEmail({
        to: order.contact_email,
        firstName: order.contact_first_name,
        code: normalizeAccessCode(code.value),
        companyName: order.company_name,
        orderReference: order.reference,
        accessUrl: accessCodeUrl(code.value),
        expiresLabel: formatOrderDate(code.expiresAt),
      }),
      {
        organizationId: order.organization_id ?? undefined,
        siteId: order.site_id ?? undefined,
      },
    ),
  );
  const status = outcomeStatus(result);
  await db.rpc('record_access_code_email', { p_code: code.id, p_status: status });
  await db.rpc('record_site_order_email', {
    p_order: order.id,
    p_kind: 'access',
    p_status: status,
    p_error: result.error ?? null,
  });
  return result;
}

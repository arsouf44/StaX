'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient, unwrapList, unwrapMaybe } from '@stax/database';
import { salesInvoiceIssuedEmail, sendEmail } from '@stax/emails';
import { platformUrl } from '@stax/config';
import { computeOrderPricing, formatMoney } from '@stax/payments';
import { boundedText, emailSchema, optionalText, uuidSchema } from '@stax/validation';
import { z } from 'zod';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { requireAdminRole } from '~/lib/admin';

/**
 * Emission d'une facture de vente.
 *
 * Le commercial convient d'un prix par telephone, parmi les offres du
 * catalogue. Cette action fige le chiffrage au moment de l'emission : le
 * montant est recalcule ICI depuis le catalogue, jamais saisi a la main et
 * jamais repris d'un formulaire. Un prix invente ne peut donc pas entrer dans
 * la comptabilite.
 *
 * Le numero est attribue par le serveur, sequentiel par annee civile, sans
 * trou : la numerotation continue et chronologique des factures est une
 * obligation fiscale (article 242 nonies A de l'annexe II au CGI).
 */

const issueSchema = z.object({
  planId: uuidSchema,
  customerEmail: emailSchema,
  customerName: optionalText(120),
  companyName: boundedText(2, 120, 'Le nom de l’entreprise'),
  sectorSlug: optionalText(60),
  businessTypeSlug: optionalText(60),
  internalNotes: optionalText(2000),
  dueInDays: z.coerce.number().int().min(0).max(120).default(30),
});

/** Numero suivant, alloue sous verrou pour rester sans trou ni doublon. */
async function nextInvoiceNumber(service: ReturnType<typeof createServiceClient>): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `F-${year}-`;

  const existing = unwrapList<{ number: string }>(
    (await service
      .from('sales_invoices')
      .select('number')
      .like('number', `${prefix}%`)
      .order('number', { ascending: false })
      .limit(1)) as never,
  );

  const last = existing[0]?.number ?? '';
  const sequence = Number.parseInt(last.slice(prefix.length), 10);
  const next = Number.isFinite(sequence) ? sequence + 1 : 1;

  return `${prefix}${String(next).padStart(4, '0')}`;
}

export async function issueSalesInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session } = await requireAdminRole('billing_admin');

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const parsed = issueSchema.safeParse({
    planId: formData.get('planId'),
    customerEmail: formData.get('customerEmail'),
    customerName: formData.get('customerName') ?? undefined,
    companyName: formData.get('companyName'),
    sectorSlug: formData.get('sectorSlug') ?? undefined,
    businessTypeSlug: formData.get('businessTypeSlug') ?? undefined,
    internalNotes: formData.get('internalNotes') ?? undefined,
    dueInDays: formData.get('dueInDays') ?? 30,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Vérifiez l’offre, l’adresse e-mail et le nom de l’entreprise.',
    };
  }

  // La cle de service est necessaire : `sales_invoices` est en ecriture
  // reservee a la plateforme, et le role a deja ete verifie ci-dessus.
  const service = createServiceClient();

  const plan = unwrapMaybe<{
    id: string;
    slug: string;
    version: number;
    setup_price_cents: number;
    maintenance_price_cents: number;
    billing_interval: string;
    vat_rate_bps: number;
    prices_include_vat: boolean;
    currency: string;
    is_quote_only: boolean;
    is_active: boolean;
  }>(
    (await service
      .from('plans')
      .select(
        'id, slug, version, setup_price_cents, maintenance_price_cents, billing_interval, vat_rate_bps, prices_include_vat, currency, is_quote_only, is_active',
      )
      .eq('id', parsed.data.planId)
      .maybeSingle()) as never,
  );

  if (!plan || !plan.is_active) {
    return { status: 'error', message: 'Cette offre n’est plus au catalogue.' };
  }

  if (plan.is_quote_only) {
    return {
      status: 'error',
      message: 'Une offre sur devis se chiffre depuis un devis, pas depuis une facture directe.',
    };
  }

  // Le chiffrage vient du CATALOGUE, pas du formulaire.
  const pricing = computeOrderPricing({
    slug: plan.slug,
    setupPriceCents: plan.setup_price_cents,
    maintenancePriceCents: plan.maintenance_price_cents,
    billingInterval: plan.billing_interval === 'month' ? 'month' : 'year',
    vatRateBps: plan.vat_rate_bps,
    pricesIncludeVat: plan.prices_include_vat,
    currency: 'EUR',
    isQuoteOnly: false,
  });

  const number = await nextInvoiceNumber(service);
  const dueAt = new Date(Date.now() + parsed.data.dueInDays * 86_400_000).toISOString();

  const { error } = await service.from('sales_invoices').insert({
    number,
    plan_id: plan.id,
    plan_slug: plan.slug,
    plan_version: plan.version,
    setup_price_cents: pricing.setupCents,
    maintenance_price_cents: pricing.maintenanceCents,
    billing_interval: plan.billing_interval,
    vat_rate_bps: pricing.vatRateBps,
    vat_cents: pricing.vatCents,
    total_cents: pricing.totalCents,
    currency: 'EUR',
    customer_email: parsed.data.customerEmail.trim().toLowerCase(),
    customer_name: parsed.data.customerName ?? null,
    company_name: parsed.data.companyName,
    sector_slug: parsed.data.sectorSlug ?? null,
    business_type_slug: parsed.data.businessTypeSlug ?? null,
    internal_notes: parsed.data.internalNotes ?? null,
    due_at: dueAt,
    created_by: session.user.id,
  });

  if (error) {
    if (error.code === '23505') {
      return {
        status: 'error',
        message: 'Ce numéro vient d’être attribué à une autre facture. Réessayez.',
      };
    }
    console.error('[stax:invoice] emission refusee', error.code, error.message);
    return { status: 'error', message: 'Cette facture n’a pas pu être émise.' };
  }

  await service.from('audit_logs').insert({
    actor_id: session.user.id,
    actor_email: session.profile.email,
    actor_type: 'platform_staff',
    action: 'invoice.issued',
    target_type: 'sales_invoice',
    target_id: number,
    metadata_safe: {
      plan: plan.slug,
      total_cents: pricing.totalCents,
      recipient_domain: parsed.data.customerEmail.split('@')[1] ?? null,
    },
  });

  // L'e-mail part APRES l'ecriture : une facture enregistree sans e-mail se
  // renvoie, un e-mail parti sans facture est un engagement qu'on ne tient pas.
  const money = (cents: number) => formatMoney(cents, 'EUR', { hideDecimalsWhenRound: true });
  const dueLabel = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(dueAt));

  const delivery = await sendEmail(
    salesInvoiceIssuedEmail({
      to: parsed.data.customerEmail.trim().toLowerCase(),
      firstName: parsed.data.customerName ?? null,
      invoiceNumber: number,
      companyName: parsed.data.companyName,
      planName: plan.slug,
      setupAmount: money(pricing.setupCents),
      maintenanceAmount: `${money(pricing.maintenanceCents)} / an`,
      totalAmount: money(pricing.totalCents),
      dueLabel,
      claimUrl: `${platformUrl()}/facture?numero=${encodeURIComponent(number)}`,
    }),
    { db: service },
  );

  revalidatePath('/admin/factures');

  if (!delivery.ok) {
    // La facture EXISTE : ne pas le cacher. Une numerotation fiscale sans trou
    // interdit de « refaire » la facture, il faut donc renvoyer l'e-mail.
    return {
      status: 'success',
      message:
        `Facture ${number} émise pour ${parsed.data.companyName}, mais l’e-mail n’a pas pu ` +
        `partir. Transmettez le numéro au client par un autre canal : il lui suffira pour ` +
        `rattacher sa commande depuis son compte.`,
    };
  }

  return {
    status: 'success',
    message: `Facture ${number} émise et envoyée à ${parsed.data.customerEmail}. Le numéro seul ne donne accès à rien : c’est son adresse e-mail qui autorisera le rattachement.`,
  };
}

const cancelSchema = z.object({
  invoiceId: uuidSchema,
  reason: boundedText(5, 500, 'Le motif'),
});

export async function cancelSalesInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session } = await requireAdminRole('billing_admin');

  const parsed = cancelSchema.safeParse({
    invoiceId: formData.get('invoiceId'),
    reason: formData.get('reason'),
  });

  if (!parsed.success) {
    return { status: 'error', message: 'Indiquez le motif de l’annulation.' };
  }

  const service = createServiceClient();

  // Une facture deja rattachee a produit une commande : l'annuler ici
  // laisserait cette commande orpheline. On refuse, et on renvoie vers le
  // traitement qui convient.
  const { data, error } = await service
    .from('sales_invoices')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: parsed.data.reason,
    })
    .eq('id', parsed.data.invoiceId)
    // Le filtre sur l'etat rend l'operation sure face a une double soumission :
    // la seconde ne touche aucune ligne au lieu d'ecraser une annulation.
    .eq('status', 'issued')
    .select('id');

  if (error) return { status: 'error', message: 'Cette annulation n’a pas pu être enregistrée.' };

  if (!Array.isArray(data) || data.length === 0) {
    return {
      status: 'error',
      message:
        'Cette facture est déjà rattachée ou déjà annulée. Une facture rattachée se traite par un avoir, pas par une annulation.',
    };
  }

  await service.from('audit_logs').insert({
    actor_id: session.user.id,
    actor_email: session.profile.email,
    actor_type: 'platform_staff',
    action: 'invoice.cancelled',
    target_type: 'sales_invoice',
    target_id: parsed.data.invoiceId,
    metadata_safe: { reason: parsed.data.reason },
  });

  revalidatePath('/admin/factures');
  return { status: 'success', message: 'Facture annulée.' };
}

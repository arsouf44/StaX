import 'server-only';
import { unwrapMaybe, type Db } from '@stax/database';
import { proposalPaymentReminderEmail, sendEmail, siteProposalEmail } from '@stax/emails';
import { formatMaintenance, formatMoney } from '@stax/payments';
import { generateActivationCode, hmacHex, normalizeActivationCode } from '@stax/security';
import { absolutePlatformUrl } from './action-guard';
import { sendDeliveryEmails } from './delivery-email';
import { runDeliveryChecks } from './external-sites/admin-flows';
import { startMaintenanceAtDelivery } from './maintenance';
import { alertTeam } from './team-alerts';

/**
 * Propositions de site : le parcours « appel commercial → site prêt → le
 * prospect le récupère et le paie ».
 *
 * Le code personnel n'existe en clair que le temps de l'e-mail : la base n'en
 * garde que l'empreinte HMAC (clé serveur `STAX_SECRET_KEY`). Un code perdu se
 * remplace (« Relancer »), il ne se relit pas.
 */

/** Durée de validité d'une proposition, choisie commercialement : 14 jours. */
export const PROPOSAL_VALID_DAYS = 14;

/** Code de 12 caractères, lisible au téléphone : `7K2M-9QXP-4HTA`. */
export function generateProposalCode(): string {
  return generateActivationCode(3, 4);
}

export function normalizeProposalCode(input: string): string {
  return normalizeActivationCode(input);
}

export async function hashProposalCode(code: string): Promise<string> {
  return hmacHex(normalizeActivationCode(code), 'site-proposal-code');
}

export function proposalCodeHint(code: string): string {
  return normalizeActivationCode(code).replace(/-/g, '').slice(-4);
}

/** Lien du bouton « Récupérer mon site » : code et adresse préremplis. */
export function proposalClaimUrl(code: string, email: string): string {
  return absolutePlatformUrl(
    `/recuperer?code=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}`,
  );
}

const LONG_DATE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeZone: 'Europe/Paris',
});

export function formatProposalDate(iso: string): string {
  return LONG_DATE.format(new Date(iso));
}

export interface ProposalPrices {
  setup_price_cents: number;
  total_cents: number;
  maintenance_price_cents: number;
  billing_interval: string;
  currency: string;
}

/** « 550 € HT (660 € TTC) » : un professionnel raisonne hors taxes. */
export function proposalPriceLabel(prices: ProposalPrices): string {
  const currency = (prices.currency || 'EUR') as 'EUR';
  const ht = formatMoney(prices.setup_price_cents, currency, { hideDecimalsWhenRound: true });
  const ttc = formatMoney(prices.total_cents, currency, { hideDecimalsWhenRound: true });
  return `${ht} HT (${ttc} TTC)`;
}

export function proposalMaintenanceLabel(prices: ProposalPrices): string | null {
  if (prices.maintenance_price_cents <= 0) return null;
  return `${formatMaintenance(
    prices.maintenance_price_cents,
    (prices.currency || 'EUR') as 'EUR',
    prices.billing_interval === 'year' ? 'year' : 'month',
  )} HT`;
}

interface ProposalForEmail extends ProposalPrices {
  id: string;
  site_id: string;
  organization_id: string;
  prospect_email: string;
  prospect_name: string | null;
  company_name: string;
  plan_name: string;
  message: string | null;
  expires_at: string;
}

async function productionUrl(db: Db, siteId: string): Promise<string | null> {
  const hosting = unwrapMaybe<{ production_url: string }>(
    (await db
      .from('site_hosting')
      .select('production_url')
      .eq('site_id', siteId)
      .eq('status', 'connected')
      .maybeSingle()) as never,
  );
  return hosting?.production_url ?? null;
}

/**
 * Envoie (ou renvoie) l'e-mail de proposition. Le résultat est inscrit sur la
 * proposition : l'équipe voit dans la liste si le message est parti.
 */
export async function sendProposalEmail(
  db: Db,
  proposal: ProposalForEmail,
  code: string,
  options: { reminder?: boolean } = {},
): Promise<{ ok: boolean; skipped: boolean; error?: string }> {
  const siteUrl = await productionUrl(db, proposal.site_id);
  const result = await sendEmail(
    siteProposalEmail({
      to: proposal.prospect_email,
      firstName: proposal.prospect_name,
      companyName: proposal.company_name,
      siteUrl,
      claimUrl: proposalClaimUrl(code, proposal.prospect_email),
      code,
      planName: proposal.plan_name,
      priceLabel: proposalPriceLabel(proposal),
      maintenanceLabel: proposalMaintenanceLabel(proposal),
      expiresLabel: formatProposalDate(proposal.expires_at),
      message: proposal.message,
      reminder: options.reminder ?? false,
    }),
    { db, organizationId: proposal.organization_id, siteId: proposal.site_id },
  ).catch((error: unknown) => ({
    ok: false,
    skipped: false,
    error: error instanceof Error ? error.message : 'Envoi impossible.',
  }));

  const status = !result.ok ? 'failed' : result.skipped ? 'skipped' : 'sent';
  await db.rpc('record_proposal_email', {
    p_proposal: proposal.id,
    p_status: status,
    p_error: result.ok ? null : (result.error ?? null),
  });
  return { ok: result.ok, skipped: Boolean(result.skipped), error: result.error };
}

/** Rappel à un prospect qui a récupéré son site sans l'avoir encore réglé. */
export async function sendPaymentReminder(
  db: Db,
  proposal: ProposalForEmail,
): Promise<{ ok: boolean; skipped: boolean; error?: string }> {
  const result = await sendEmail(
    proposalPaymentReminderEmail({
      to: proposal.prospect_email,
      firstName: proposal.prospect_name,
      companyName: proposal.company_name,
      appUrl: absolutePlatformUrl('/app'),
      priceLabel: proposalPriceLabel(proposal),
      expiresLabel: formatProposalDate(proposal.expires_at),
    }),
    { db, organizationId: proposal.organization_id, siteId: proposal.site_id },
  ).catch((error: unknown) => ({
    ok: false,
    skipped: false,
    error: error instanceof Error ? error.message : 'Envoi impossible.',
  }));
  const status = !result.ok ? 'failed' : result.skipped ? 'skipped' : 'sent';
  await db.rpc('record_proposal_email', {
    p_proposal: proposal.id,
    p_status: status,
    p_error: result.ok ? null : (result.error ?? null),
  });
  return { ok: result.ok, skipped: Boolean(result.skipped), error: result.error };
}

const CHECK_LABELS: Record<string, string> = {
  repository: 'dépôt GitHub',
  hosting: 'projet Cloudflare',
  deployed: 'site déployé',
  https: 'HTTPS',
  seo: 'SEO minimum',
  forms: 'formulaires testés',
  responsive: 'responsive vérifié',
  manifest: 'contrat d’édition',
  editor: 'contenu initial',
  client_account: 'compte client',
  plan: 'offre',
};

const AUTOMATIC_CHECKS = ['deployed', 'https', 'seo'] as const;
const FRESH_FOR_MS = 20 * 60 * 60 * 1000;

/** Contrôles automatiques absents, en échec, ou proches de leur échéance de 24 h. */
export async function automaticChecksStale(service: Db, siteId: string): Promise<boolean> {
  const { data } = await service
    .from('site_delivery_checks')
    .select('check_key, status, checked_at')
    .eq('site_id', siteId)
    .in('check_key', [...AUTOMATIC_CHECKS]);
  const rows = (data ?? []) as Array<{ check_key: string; status: string; checked_at: string }>;
  const limit = new Date().getTime() - FRESH_FOR_MS;
  return AUTOMATIC_CHECKS.some((key) => {
    const row = rows.find((candidate) => candidate.check_key === key);
    return !row || row.status !== 'passed' || new Date(row.checked_at).getTime() < limit;
  });
}

export interface PaidProposalOutcome {
  /** `false` : la commande n'est pas celle d'une proposition. */
  handled: boolean;
  delivered: boolean;
  siteId?: string;
  missing?: string[];
}

/**
 * Paiement confirmé d'une proposition : livraison automatique.
 *
 * Appelée par le webhook Stripe (après `apply_order_paid`) puis, tant que la
 * livraison n'a pas abouti, par la tâche de fond. Les contrôles automatiques
 * (déploiement, HTTPS, SEO) ne valent que 24 heures : ils sont refaits juste
 * avant, avec la clé de service. Si un contrôle échoue, rien n'est livré, le
 * client voit « nous finalisons la mise en ligne », et l'équipe est alertée
 * une fois.
 */
export async function completePaidProposal(
  service: Db,
  orderId: string,
): Promise<PaidProposalOutcome> {
  const proposal = unwrapMaybe<{
    id: string;
    reference: string;
    site_id: string;
    organization_id: string;
    status: string;
    company_name: string;
    plan_name: string;
    prospect_email: string;
    delivery_attempted_at: string | null;
  }>(
    (await service
      .from('site_proposals')
      .select(
        'id, reference, site_id, organization_id, status, company_name, plan_name, ' +
          'prospect_email, delivery_attempted_at',
      )
      .eq('order_id', orderId)
      .maybeSingle()) as never,
  );
  if (!proposal) return { handled: false, delivered: false };
  if (proposal.status === 'delivered') {
    return { handled: true, delivered: true, siteId: proposal.site_id };
  }

  // Les contrôles automatiques valent 24 heures : ils ne sont refaits que
  // s'ils approchent de l'échéance (Cloudflare et le site sont alors
  // réinterrogés), pas à chaque passage.
  if (await automaticChecksStale(service, proposal.site_id)) {
    await runDeliveryChecks(service, service, {
      id: proposal.site_id,
      organizationId: proposal.organization_id,
    }).catch((error: unknown) => {
      console.error('[stax:proposal] controles', error instanceof Error ? error.message : error);
    });
  }

  const { data, error } = await service.rpc('complete_paid_proposal', { p_order: orderId });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { code?: string; delivered?: boolean; missing?: string[] };

  const lines: Array<[string, string]> = [
    ['Proposition', proposal.reference],
    ['Entreprise', proposal.company_name],
    ['Offre', proposal.plan_name],
    ['Client', proposal.prospect_email],
  ];

  if (result.delivered) {
    if (result.code === 'delivered') {
      const maintenance = await startMaintenanceAtDelivery(service, proposal.site_id);
      await sendDeliveryEmails(service, proposal.site_id).catch((mailError: unknown) => {
        console.error('[stax:proposal] e-mail de livraison', mailError);
      });
      await alertTeam(
        {
          subject: `Site payé et livré — ${proposal.company_name}`,
          heading: 'Un prospect a payé : son site lui est livré',
          lines: [
            ...lines,
            [
              'Maintenance',
              maintenance.status === 'started'
                ? 'démarrée'
                : maintenance.status === 'failed'
                  ? `à relancer (${maintenance.message})`
                  : 'sans objet',
            ],
          ],
          path: `/admin/sites/${proposal.site_id}`,
        },
        { db: service, organizationId: proposal.organization_id, siteId: proposal.site_id },
      );
    }
    return { handled: true, delivered: true, siteId: proposal.site_id };
  }

  const missing = (result.missing ?? []).map((key) => CHECK_LABELS[key] ?? key);
  // Une alerte à la première tentative, pas à chaque passage de la tâche de fond.
  if (!proposal.delivery_attempted_at) {
    await alertTeam(
      {
        subject: `Paiement reçu, livraison à terminer — ${proposal.company_name}`,
        heading: 'Paiement reçu : la livraison automatique attend un contrôle',
        lines: [...lines, ['À vérifier', missing.join(', ') || 'contrôles de livraison']],
        path: `/admin/sites/${proposal.site_id}/livraison`,
        actionLabel: 'Ouvrir la checklist de livraison',
      },
      { db: service, organizationId: proposal.organization_id, siteId: proposal.site_id },
    );
  }
  return { handled: true, delivered: false, siteId: proposal.site_id, missing };
}

/** Tâche de fond : reprend les livraisons automatiques qui n'ont pas abouti. */
export async function retryProposalDeliveries(
  service: Db,
  options: { limit?: number } = {},
): Promise<{ attempted: number; delivered: number; errors: string[] }> {
  const report = { attempted: 0, delivered: 0, errors: [] as string[] };
  const { data, error } = await service.rpc('proposals_awaiting_delivery', {
    p_limit: options.limit ?? 5,
  });
  if (error) {
    report.errors.push(`propositions : ${error.message}`);
    return report;
  }
  for (const row of (data ?? []) as Array<{ order_id: string }>) {
    report.attempted += 1;
    try {
      const outcome = await completePaidProposal(service, row.order_id);
      if (outcome.delivered) report.delivered += 1;
    } catch (retryError) {
      report.errors.push(
        `proposition ${row.order_id} : ${retryError instanceof Error ? retryError.message : 'erreur'}`,
      );
    }
  }
  return report;
}

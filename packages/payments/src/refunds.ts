import type { Cents, Currency, RefundRequestStatus } from '@stax/types';

/**
 * Politique commerciale de remboursement.
 *
 * LEGAL_REVIEW_REQUIRED — Cette regle est une GARANTIE COMMERCIALE offerte par
 * StaX. Elle s'ajoute aux droits legaux du client et ne s'y substitue jamais :
 * un professionnel ne beneficie pas du droit de retractation de l'article
 * L.221-18 du Code de la consommation dans les memes conditions qu'un
 * consommateur, et aucune stipulation contractuelle ne peut ecarter les
 * garanties legales applicables. Le texte definitif doit etre valide par un
 * professionnel du droit avant ouverture commerciale.
 *
 * Regle implementee :
 *  - la fenetre court a partir de la MISE EN LIGNE INITIALE du site ;
 *  - duree configurable (REFUND_WINDOW_DAYS, 15 jours par defaut) ;
 *  - si, et seulement si, un nom de domaine a REELLEMENT ete achete pour le
 *    client, une retenue couvre ce cout (DOMAIN_REFUND_DEDUCTION_CENTS).
 *    Aucun domaine achete => aucune retenue.
 */

export interface RefundPolicy {
  windowDays: number;
  domainDeductionCents: Cents;
  currency: Currency;
}

export const DEFAULT_REFUND_POLICY: RefundPolicy = {
  windowDays: 15,
  domainDeductionCents: 1000,
  currency: 'EUR',
};

export interface RefundEligibilityInput {
  /** Date de mise en ligne initiale. `null` = site jamais publie. */
  goLiveAt: Date | null;
  /** Montant reellement encaisse, deduction faite des remboursements deja emis. */
  amountPaidCents: Cents;
  /** Un domaine a-t-il ete achete par StaX pour ce client ? */
  domainPurchased: boolean;
  /** Cout reel du domaine, conserve comme preuve d'achat. */
  domainCostCents?: Cents;
  requestedAt?: Date;
  policy?: RefundPolicy;
}

export interface RefundEligibility {
  /** `null` = indeterminable (la fenetre n'a pas commence). */
  eligible: boolean | null;
  reason: string;
  deadlineAt: Date | null;
  daysRemaining: number | null;
  amountPaidCents: Cents;
  deductionCents: Cents;
  refundAmountCents: Cents;
  currency: Currency;
}

const MS_PER_DAY = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(date);
}

export function computeRefundEligibility(input: RefundEligibilityInput): RefundEligibility {
  const policy = input.policy ?? DEFAULT_REFUND_POLICY;
  const requestedAt = input.requestedAt ?? new Date();
  const amountPaidCents = Math.max(input.amountPaidCents, 0);

  // La retenue n'existe que si un domaine a effectivement ete achete, et ne
  // peut jamais depasser le montant reellement encaisse.
  const deductionCents = input.domainPurchased
    ? Math.min(policy.domainDeductionCents, amountPaidCents)
    : 0;
  const refundAmountCents = Math.max(amountPaidCents - deductionCents, 0);

  if (!input.goLiveAt) {
    return {
      eligible: null,
      reason:
        "Votre site n'a pas encore ete mis en ligne : la periode de garantie n'a pas commence. " +
        'Contactez-nous, nous etudierons votre demande au cas par cas.',
      deadlineAt: null,
      daysRemaining: null,
      amountPaidCents,
      deductionCents,
      refundAmountCents,
      currency: policy.currency,
    };
  }

  const deadlineAt = addDays(input.goLiveAt, policy.windowDays);
  const eligible = requestedAt.getTime() <= deadlineAt.getTime();
  const daysRemaining = Math.ceil((deadlineAt.getTime() - requestedAt.getTime()) / MS_PER_DAY);

  return {
    eligible,
    reason: eligible
      ? `Demande recue dans la periode de garantie de ${policy.windowDays} jours ` +
        `suivant la mise en ligne du ${formatDate(input.goLiveAt)}.`
      : `La periode de garantie de ${policy.windowDays} jours a pris fin le ` +
        `${formatDate(deadlineAt)}. Votre demande reste examinee par notre equipe, ` +
        'et vos droits legaux ne sont pas affectes par cette regle commerciale.',
    deadlineAt,
    daysRemaining: eligible ? Math.max(daysRemaining, 0) : 0,
    amountPaidCents,
    deductionCents,
    refundAmountCents,
    currency: policy.currency,
  };
}

/** Transitions autorisees du workflow de remboursement. */
const REFUND_TRANSITIONS: Record<RefundRequestStatus, readonly RefundRequestStatus[]> = {
  requested: ['under_review', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['processing', 'rejected'],
  processing: ['refunded', 'failed'],
  failed: ['processing', 'rejected'],
  rejected: [],
  refunded: [],
};

export function canTransitionRefund(
  from: RefundRequestStatus,
  to: RefundRequestStatus,
): boolean {
  return REFUND_TRANSITIONS[from].includes(to);
}

export function assertRefundTransition(
  from: RefundRequestStatus,
  to: RefundRequestStatus,
): void {
  if (!canTransitionRefund(from, to)) {
    throw new Error(`Transition de remboursement interdite : ${from} -> ${to}`);
  }
}

export const REFUND_STATUS_LABELS: Record<RefundRequestStatus, string> = {
  requested: 'Demande recue',
  under_review: 'En cours d’examen',
  approved: 'Approuvee',
  rejected: 'Refusee',
  processing: 'Remboursement en cours',
  refunded: 'Remboursee',
  failed: 'Echec du remboursement',
};

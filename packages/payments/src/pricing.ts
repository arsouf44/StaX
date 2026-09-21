import type { BillingInterval, Cents, Currency } from '@stax/types';
import { applyBasisPoints, assertCents, vatFromGross } from './money';

/**
 * Calcul tarifaire canonique cote application.
 *
 * Miroir exact de app.compute_order_pricing() en SQL. La base reste la source
 * de verite au moment de la commande — cette implementation sert a l'affichage
 * et aux tests, et un test croise verifie que les deux donnent le meme centime.
 */

/** Nombre d'echeances de maintenance dans une annee civile. */
export function periodsPerYear(interval: BillingInterval): number {
  return interval === 'year' ? 1 : 12;
}

export interface PricingPlanInput {
  slug: string;
  setupPriceCents: Cents;
  maintenancePriceCents: Cents;
  /** Periodicite de la maintenance. Annuelle pour toutes les offres StaX. */
  billingInterval: BillingInterval;
  vatRateBps: number;
  pricesIncludeVat: boolean;
  currency: Currency;
  isQuoteOnly: boolean;
}

export interface CouponInput {
  code: string;
  kind: 'percent' | 'amount';
  /** percent : points de base (1000 = 10 %). amount : centimes. */
  value: number;
  appliesTo: 'setup' | 'maintenance' | 'both';
  planSlugs?: readonly string[];
  validFrom?: Date;
  validUntil?: Date | null;
  maxRedemptions?: number | null;
  redeemedCount?: number;
  isActive?: boolean;
}

export interface PriceBreakdown {
  setupCents: Cents;
  maintenanceCents: Cents;
  discountCents: Cents;
  netCents: Cents;
  vatCents: Cents;
  totalCents: Cents;
  vatRateBps: number;
  currency: Currency;
  /** Premiere echeance annuelle de maintenance, TVA comprise. */
  maintenanceTotalCents: Cents;
}

export function isCouponUsable(coupon: CouponInput, planSlug: string, now = new Date()): boolean {
  if (coupon.isActive === false) return false;
  if (coupon.validFrom && coupon.validFrom > now) return false;
  if (coupon.validUntil && coupon.validUntil <= now) return false;
  if (coupon.maxRedemptions != null && (coupon.redeemedCount ?? 0) >= coupon.maxRedemptions) {
    return false;
  }
  if (coupon.planSlugs && coupon.planSlugs.length > 0 && !coupon.planSlugs.includes(planSlug)) {
    return false;
  }
  return true;
}

export function computeDiscount(
  plan: PricingPlanInput,
  coupon: CouponInput | null | undefined,
  now = new Date(),
): Cents {
  if (!coupon) return 0;
  if (!isCouponUsable(coupon, plan.slug, now)) return 0;
  if (coupon.appliesTo !== 'setup' && coupon.appliesTo !== 'both') return 0;

  if (coupon.kind === 'percent') {
    return applyBasisPoints(plan.setupPriceCents, coupon.value);
  }
  return Math.min(coupon.value, plan.setupPriceCents);
}

export function computeOrderPricing(
  plan: PricingPlanInput,
  coupon?: CouponInput | null,
  now = new Date(),
): PriceBreakdown {
  if (plan.isQuoteOnly) {
    throw new Error('Une offre sur devis ne peut pas être chiffrée automatiquement.');
  }
  assertCents(plan.setupPriceCents, 'prix de création');
  assertCents(plan.maintenancePriceCents, 'prix de maintenance');

  const discountCents = computeDiscount(plan, coupon, now);
  const netCents = Math.max(plan.setupPriceCents - discountCents, 0);

  if (plan.pricesIncludeVat) {
    const vatCents = vatFromGross(netCents, plan.vatRateBps);
    return {
      setupCents: plan.setupPriceCents,
      maintenanceCents: plan.maintenancePriceCents,
      discountCents,
      netCents: netCents - vatCents,
      vatCents,
      totalCents: netCents,
      vatRateBps: plan.vatRateBps,
      currency: plan.currency,
      maintenanceTotalCents: plan.maintenancePriceCents,
    };
  }

  const vatCents = applyBasisPoints(netCents, plan.vatRateBps);
  return {
    setupCents: plan.setupPriceCents,
    maintenanceCents: plan.maintenancePriceCents,
    discountCents,
    netCents,
    vatCents,
    totalCents: netCents + vatCents,
    vatRateBps: plan.vatRateBps,
    currency: plan.currency,
    maintenanceTotalCents:
      plan.maintenancePriceCents + applyBasisPoints(plan.maintenancePriceCents, plan.vatRateBps),
  };
}

/**
 * Cout total de la premiere annee : creation + les echeances de maintenance
 * dues sur douze mois.
 *
 * Affiche sur la page tarifs pour qu'aucun cout ne soit cache. Le nombre
 * d'echeances vient de la periodicite de l'offre, jamais d'une constante : une
 * offre mensuelle et une offre annuelle ne se calculent pas pareil, et le
 * chiffre annonce doit rester exact si la periodicite change.
 */
export function firstYearTotal(plan: PricingPlanInput, coupon?: CouponInput | null): Cents {
  const breakdown = computeOrderPricing(plan, coupon);
  return (
    breakdown.totalCents + breakdown.maintenanceTotalCents * periodsPerYear(plan.billingInterval)
  );
}

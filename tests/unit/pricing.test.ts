import { describe, expect, it } from 'vitest';
import {
  computeDiscount,
  computeOrderPricing,
  firstYearTotal,
  isCouponUsable,
  type CouponInput,
  type PricingPlanInput,
} from '@stax/payments';

/**
 * Les trois offres du catalogue, en centimes HORS TAXES.
 *
 * Ces montants doivent rester identiques a ceux de la migration de donnees de
 * reference : le test d'integration `pricing-parity` verifie que le calcul SQL
 * et le calcul TypeScript donnent le meme centime pour chacun.
 */
const ESSENTIEL: PricingPlanInput = {
  slug: 'essentiel',
  setupPriceCents: 30_000,
  maintenancePriceCents: 2_200,
  billingInterval: 'year',
  vatRateBps: 2000,
  pricesIncludeVat: false,
  currency: 'EUR',
  isQuoteOnly: false,
};

const PREMIUM: PricingPlanInput = {
  ...ESSENTIEL,
  slug: 'premium',
  setupPriceCents: 55_000,
  maintenancePriceCents: 3_200,
};

const ULTRA: PricingPlanInput = {
  ...ESSENTIEL,
  slug: 'ultra-premium',
  setupPriceCents: 109_900,
  maintenancePriceCents: 8_200,
};

describe('tarification des offres', () => {
  it('chiffre l’offre Essentiel conformement au catalogue', () => {
    const p = computeOrderPricing(ESSENTIEL);
    expect(p.setupCents).toBe(30_000);
    expect(p.vatCents).toBe(6_000);
    expect(p.totalCents).toBe(36_000);
    expect(p.maintenanceCents).toBe(2_200);
    expect(p.maintenanceTotalCents).toBe(2_640);
  });

  it('chiffre l’offre Premium', () => {
    const p = computeOrderPricing(PREMIUM);
    expect(p.totalCents).toBe(66_000);
    expect(p.maintenanceTotalCents).toBe(3_840);
  });

  it('chiffre l’offre Ultra Premium', () => {
    const p = computeOrderPricing(ULTRA);
    expect(p.totalCents).toBe(131_880);
    expect(p.maintenanceTotalCents).toBe(9_840);
  });

  it('refuse de chiffrer une offre sur devis', () => {
    expect(() => computeOrderPricing({ ...ESSENTIEL, isQuoteOnly: true })).toThrow();
  });

  it('affiche le cout reel de la premiere annee, sans cout cache', () => {
    // Maintenance ANNUELLE : une seule echeance la premiere annee.
    // 360,00 € + 26,40 € = 386,40 €
    expect(firstYearTotal(ESSENTIEL)).toBe(36_000 + 2_640);
    expect(firstYearTotal(PREMIUM)).toBe(66_000 + 3_840);
    expect(firstYearTotal(ULTRA)).toBe(131_880 + 9_840);
  });

  it('compte douze echeances si une offre passait au mois', () => {
    // La periodicite vient de l'offre, jamais d'une constante : une bascule au
    // mois doit recalculer juste, sans toucher au code d'affichage.
    const mensuel: PricingPlanInput = { ...ESSENTIEL, billingInterval: 'month' };
    expect(firstYearTotal(mensuel)).toBe(36_000 + 2_640 * 12);
  });
});

describe('codes promotionnels', () => {
  const percent: CouponInput = {
    code: 'BIENVENUE10',
    kind: 'percent',
    value: 1000,
    appliesTo: 'setup',
  };

  it('applique une remise en pourcentage', () => {
    expect(computeDiscount(ESSENTIEL, percent)).toBe(3_000);
    const p = computeOrderPricing(ESSENTIEL, percent);
    expect(p.totalCents).toBe(32_400);
  });

  it('applique une remise en montant fixe, plafonnee au prix', () => {
    const fixed: CouponInput = { code: 'X', kind: 'amount', value: 90_000, appliesTo: 'setup' };
    expect(computeDiscount(ESSENTIEL, fixed)).toBe(30_000);
    expect(computeOrderPricing(ESSENTIEL, fixed).totalCents).toBe(0);
  });

  it('ignore un code expire, desactive ou epuise', () => {
    const past = new Date('2020-01-01T00:00:00Z');
    expect(isCouponUsable({ ...percent, validUntil: past }, 'essentiel')).toBe(false);
    expect(isCouponUsable({ ...percent, isActive: false }, 'essentiel')).toBe(false);
    expect(isCouponUsable({ ...percent, maxRedemptions: 5, redeemedCount: 5 }, 'essentiel')).toBe(
      false,
    );
    expect(computeDiscount(ESSENTIEL, { ...percent, isActive: false })).toBe(0);
  });

  it('ignore un code reserve a une autre offre', () => {
    const scoped: CouponInput = { ...percent, planSlugs: ['premium'] };
    expect(computeDiscount(ESSENTIEL, scoped)).toBe(0);
    expect(computeDiscount(PREMIUM, scoped)).toBe(5_500);
  });

  it('n’applique pas une remise « maintenance » au prix de creation', () => {
    expect(computeDiscount(ESSENTIEL, { ...percent, appliesTo: 'maintenance' })).toBe(0);
  });

  it('ne rend jamais un total negatif', () => {
    const huge: CouponInput = { code: 'X', kind: 'amount', value: 9_999_999, appliesTo: 'both' };
    expect(computeOrderPricing(ESSENTIEL, huge).totalCents).toBe(0);
  });
});

describe('prix TTC affiches', () => {
  it('extrait correctement la TVA incluse', () => {
    const ttc: PricingPlanInput = { ...ESSENTIEL, pricesIncludeVat: true, setupPriceCents: 12_000 };
    const p = computeOrderPricing(ttc);
    expect(p.totalCents).toBe(12000);
    expect(p.vatCents).toBe(2000);
    expect(p.netCents).toBe(10000);
  });
});

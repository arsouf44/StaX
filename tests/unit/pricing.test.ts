import { describe, expect, it } from 'vitest';
import {
  computeDiscount,
  computeOrderPricing,
  firstYearTotal,
  isCouponUsable,
  type CouponInput,
  type PricingPlanInput,
} from '@stax/payments';

const CLASSIQUE: PricingPlanInput = {
  slug: 'classique',
  setupPriceCents: 23999,
  monthlyPriceCents: 1400,
  vatRateBps: 2000,
  pricesIncludeVat: false,
  currency: 'EUR',
  isQuoteOnly: false,
};

const PREMIUM: PricingPlanInput = {
  ...CLASSIQUE,
  slug: 'premium',
  setupPriceCents: 49900,
  monthlyPriceCents: 3200,
};

const SIGNATURE: PricingPlanInput = {
  ...CLASSIQUE,
  slug: 'signature',
  setupPriceCents: 99900,
  monthlyPriceCents: 4000,
};

describe('tarification des offres', () => {
  it('chiffre l’offre Classique conformement au catalogue', () => {
    const p = computeOrderPricing(CLASSIQUE);
    expect(p.setupCents).toBe(23999);
    expect(p.vatCents).toBe(4799);
    expect(p.totalCents).toBe(28798);
    expect(p.monthlyCents).toBe(1400);
    expect(p.monthlyTotalCents).toBe(1680);
  });

  it('chiffre l’offre Premium', () => {
    const p = computeOrderPricing(PREMIUM);
    expect(p.totalCents).toBe(59880);
    expect(p.monthlyTotalCents).toBe(3840);
  });

  it('chiffre l’offre Signature', () => {
    const p = computeOrderPricing(SIGNATURE);
    expect(p.totalCents).toBe(119880);
    expect(p.monthlyTotalCents).toBe(4800);
  });

  it('refuse de chiffrer une offre sur devis', () => {
    expect(() => computeOrderPricing({ ...CLASSIQUE, isQuoteOnly: true })).toThrow();
  });

  it('affiche le cout reel de la premiere annee, sans cout cache', () => {
    // 287,98 € + 12 x 16,80 € = 489,58 €
    expect(firstYearTotal(CLASSIQUE)).toBe(28798 + 1680 * 12);
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
    expect(computeDiscount(CLASSIQUE, percent)).toBe(2399);
    const p = computeOrderPricing(CLASSIQUE, percent);
    expect(p.totalCents).toBe(25920);
  });

  it('applique une remise en montant fixe, plafonnee au prix', () => {
    const fixed: CouponInput = { code: 'X', kind: 'amount', value: 50_000, appliesTo: 'setup' };
    expect(computeDiscount(CLASSIQUE, fixed)).toBe(23999);
    expect(computeOrderPricing(CLASSIQUE, fixed).totalCents).toBe(0);
  });

  it('ignore un code expire, desactive ou epuise', () => {
    const past = new Date('2020-01-01T00:00:00Z');
    expect(isCouponUsable({ ...percent, validUntil: past }, 'classique')).toBe(false);
    expect(isCouponUsable({ ...percent, isActive: false }, 'classique')).toBe(false);
    expect(
      isCouponUsable({ ...percent, maxRedemptions: 5, redeemedCount: 5 }, 'classique'),
    ).toBe(false);
    expect(computeDiscount(CLASSIQUE, { ...percent, isActive: false })).toBe(0);
  });

  it('ignore un code reserve a une autre offre', () => {
    const scoped: CouponInput = { ...percent, planSlugs: ['premium'] };
    expect(computeDiscount(CLASSIQUE, scoped)).toBe(0);
    expect(computeDiscount(PREMIUM, scoped)).toBe(4990);
  });

  it('n’applique pas une remise « maintenance » au prix de creation', () => {
    expect(computeDiscount(CLASSIQUE, { ...percent, appliesTo: 'monthly' })).toBe(0);
  });

  it('ne rend jamais un total negatif', () => {
    const huge: CouponInput = { code: 'X', kind: 'amount', value: 9_999_999, appliesTo: 'both' };
    expect(computeOrderPricing(CLASSIQUE, huge).totalCents).toBe(0);
  });
});

describe('prix TTC affiches', () => {
  it('extrait correctement la TVA incluse', () => {
    const ttc: PricingPlanInput = { ...CLASSIQUE, pricesIncludeVat: true, setupPriceCents: 12000 };
    const p = computeOrderPricing(ttc);
    expect(p.totalCents).toBe(12000);
    expect(p.vatCents).toBe(2000);
    expect(p.netCents).toBe(10000);
  });
});

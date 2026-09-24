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
 * Les quatre offres chiffrees du catalogue, en centimes HORS TAXES.
 *
 * Ces montants doivent rester identiques a ceux de la migration de donnees de
 * reference (0043) : le test d'integration `pricing-parity` verifie que le
 * calcul SQL et le calcul TypeScript donnent le meme centime pour chacun. La
 * maintenance est MENSUELLE et ne commence qu'a la livraison.
 */
const ESSENTIEL: PricingPlanInput = {
  slug: 'essentiel',
  setupPriceCents: 30_000,
  maintenancePriceCents: 1_200,
  billingInterval: 'month',
  vatRateBps: 2000,
  pricesIncludeVat: false,
  currency: 'EUR',
  isQuoteOnly: false,
};

const PREMIUM: PricingPlanInput = {
  ...ESSENTIEL,
  slug: 'premium',
  setupPriceCents: 55_000,
  maintenancePriceCents: 1_400,
};

const ULTRA: PricingPlanInput = {
  ...ESSENTIEL,
  slug: 'ultra-premium',
  setupPriceCents: 109_900,
  maintenancePriceCents: 1_600,
};

const EXCEPTIONNEL: PricingPlanInput = {
  ...ESSENTIEL,
  slug: 'exceptionnel',
  setupPriceCents: 179_000,
  maintenancePriceCents: 1_800,
};

describe('tarification des offres', () => {
  it('chiffre l’offre Essentiel : 300 € HT, puis 12 € HT par mois', () => {
    const p = computeOrderPricing(ESSENTIEL);
    expect(p.setupCents).toBe(30_000);
    expect(p.vatCents).toBe(6_000);
    expect(p.totalCents).toBe(36_000);
    expect(p.maintenanceCents).toBe(1_200);
    expect(p.maintenanceTotalCents).toBe(1_440);
  });

  it('chiffre l’offre Premium : 550 € HT, puis 14 € HT par mois', () => {
    const p = computeOrderPricing(PREMIUM);
    expect(p.totalCents).toBe(66_000);
    expect(p.maintenanceTotalCents).toBe(1_680);
  });

  it('chiffre l’offre Ultra Premium : 1 099 € HT, puis 16 € HT par mois', () => {
    const p = computeOrderPricing(ULTRA);
    expect(p.totalCents).toBe(131_880);
    expect(p.maintenanceTotalCents).toBe(1_920);
  });

  it('chiffre l’offre Exceptionnel : 1 790 € HT, puis 18 € HT par mois', () => {
    const p = computeOrderPricing(EXCEPTIONNEL);
    expect(p.setupCents).toBe(179_000);
    expect(p.totalCents).toBe(214_800);
    expect(p.maintenanceTotalCents).toBe(2_160);
  });

  it('refuse de chiffrer une offre sur devis', () => {
    expect(() => computeOrderPricing({ ...ESSENTIEL, isQuoteOnly: true })).toThrow();
  });

  it('affiche le cout reel : creation + douze premiers mois de maintenance', () => {
    // 360,00 € + 12 x 14,40 € = 532,80 €
    expect(firstYearTotal(ESSENTIEL)).toBe(36_000 + 1_440 * 12);
    expect(firstYearTotal(PREMIUM)).toBe(66_000 + 1_680 * 12);
    expect(firstYearTotal(ULTRA)).toBe(131_880 + 1_920 * 12);
    expect(firstYearTotal(EXCEPTIONNEL)).toBe(214_800 + 2_160 * 12);
  });

  it('compte une seule echeance pour un ancien contrat annuel', () => {
    // La periodicite vient du contrat, jamais d'une constante : les contrats
    // annuels vendus avant la maintenance mensuelle restent justes.
    const annuel: PricingPlanInput = {
      ...ESSENTIEL,
      maintenancePriceCents: 2_200,
      billingInterval: 'year',
    };
    expect(firstYearTotal(annuel)).toBe(36_000 + 2_640);
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

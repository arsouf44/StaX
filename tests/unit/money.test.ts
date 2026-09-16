import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  applyBasisPoints,
  assertCents,
  formatMoney,
  formatMonthly,
  fromMajorUnits,
  grossFromNet,
  sumCents,
  toMajorUnits,
  vatFromGross,
  vatFromNet,
} from '@stax/payments';

describe('arithmetique monetaire', () => {
  it('refuse les montants non entiers', () => {
    expect(() => assertCents(12.5)).toThrow(MoneyError);
    expect(() => assertCents(Number.NaN)).toThrow(MoneyError);
    expect(() => assertCents(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
    expect(() => assertCents(23999)).not.toThrow();
  });

  it('applique un taux en points de base sans flottant', () => {
    expect(applyBasisPoints(23999, 2000)).toBe(4799);
    expect(applyBasisPoints(49900, 2000)).toBe(9980);
    expect(applyBasisPoints(1400, 2000)).toBe(280);
    expect(applyBasisPoints(0, 2000)).toBe(0);
  });

  it('tronque comme PostgreSQL, sans arrondi au superieur', () => {
    // 23999 * 2000 / 10000 = 4799,8 -> 4799 (et non 4800)
    expect(applyBasisPoints(23999, 2000)).toBe(4799);
    // 999 * 1000 / 10000 = 99,9 -> 99
    expect(applyBasisPoints(999, 1000)).toBe(99);
  });

  it('extrait la TVA d’un montant TTC', () => {
    expect(vatFromGross(12000, 2000)).toBe(2000);
    expect(vatFromNet(10000, 2000)).toBe(2000);
    expect(grossFromNet(10000, 2000)).toBe(12000);
  });

  it('refuse un taux negatif', () => {
    expect(() => applyBasisPoints(1000, -100)).toThrow(MoneyError);
  });

  it('additionne en validant chaque terme', () => {
    expect(sumCents(23999, 1400, 0)).toBe(25399);
    expect(() => sumCents(100, 1.5)).toThrow(MoneyError);
  });

  it('convertit en unites majeures pour l’affichage uniquement', () => {
    expect(toMajorUnits(23999)).toBeCloseTo(239.99, 10);
    expect(fromMajorUnits(239.99)).toBe(23999);
    expect(fromMajorUnits(14)).toBe(1400);
  });

  it('formate en francais', () => {
    expect(formatMoney(23999).replace(/ | /g, ' ')).toBe('239,99 €');
    expect(formatMoney(1400, 'EUR', { hideDecimalsWhenRound: true }).replace(/ | /g, ' ')).toBe('14 €');
    expect(formatMonthly(3200).replace(/ | /g, ' ')).toBe('32 € / mois');
  });
});

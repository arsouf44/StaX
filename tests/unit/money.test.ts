import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  applyBasisPoints,
  assertCents,
  formatMoney,
  formatMaintenance,
  moneyInputValue,
  parseMoneyInput,
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
    // Intl insere une espace insecable etroite avant le symbole monetaire :
    // on la normalise pour que l'assertion reste lisible dans le code source.
    const normalize = (value: string) => value.replace(/\u202f|\u00a0/g, ' ');
    expect(normalize(formatMoney(23999))).toBe('239,99 \u20ac');
    expect(normalize(formatMoney(1400, 'EUR', { hideDecimalsWhenRound: true }))).toBe('14 \u20ac');
    // La maintenance StaX est ANNUELLE : ce libelle ne doit jamais dire « mois ».
    expect(normalize(formatMaintenance(3200))).toBe('32 \u20ac / an');
    expect(normalize(formatMaintenance(2200))).toBe('22 \u20ac / an');
  });
  it('lit un montant saisi a la main sans jamais passer par un flottant', () => {
    expect(parseMoneyInput('12,50')).toBe(1250);
    expect(parseMoneyInput('12.5')).toBe(1250);
    expect(parseMoneyInput('39')).toBe(3900);
    expect(parseMoneyInput('1\u00a0234,05')).toBe(123405);
    expect(parseMoneyInput('239,99 \u20ac')).toBe(23999);
    expect(parseMoneyInput('  ')).toBeNull();
    expect(parseMoneyInput('')).toBeNull();
  });

  it('refuse une saisie qui ressemble a un montant sans en etre un', () => {
    expect(() => parseMoneyInput('douze euros')).toThrow(MoneyError);
    expect(() => parseMoneyInput('12,505')).toThrow(MoneyError);
    expect(() => parseMoneyInput('12,,5')).toThrow(MoneyError);
  });

  it('evite l erreur de centime des flottants', () => {
    // parseFloat('0.29') * 100 vaut 28.999999999999996 : arrondi a 29 ici,
    // mais la lecture par chaine ne laisse aucune place au doute.
    expect(parseMoneyInput('0,29')).toBe(29);
    expect(parseMoneyInput('1,10')).toBe(110);
    expect(parseMoneyInput('8,70')).toBe(870);
  });

  it('reaffiche un montant dans un champ de saisie sans perte', () => {
    for (const cents of [0, 5, 29, 110, 1250, 23999, 99900]) {
      expect(parseMoneyInput(moneyInputValue(cents))).toBe(cents);
    }
    expect(moneyInputValue(null)).toBe('');
    expect(moneyInputValue(1250)).toBe('12,50');
    expect(moneyInputValue(5)).toBe('0,05');
  });
});

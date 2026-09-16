import type { Cents, Currency } from '@stax/types';

/**
 * Arithmetique monetaire.
 *
 * Regle absolue : l'argent est TOUJOURS manipule en unites mineures entieres
 * (centimes). Aucun flottant n'intervient dans un calcul de montant — les
 * conversions en unites majeures sont reservees a l'affichage.
 *
 * Les arrondis reproduisent EXACTEMENT la semantique PostgreSQL utilisee par
 * app.compute_order_pricing() : division entiere tronquee vers zero. Les deux
 * implementations doivent donner le meme centime, sans quoi une commande
 * afficherait un montant different de celui reellement debite.
 */

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Valide qu'une valeur est un montant en centimes exploitable. */
export function assertCents(value: number, label = 'montant'): asserts value is Cents {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`Le ${label} doit etre un entier de centimes, recu : ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Le ${label} depasse la plage entiere sure : ${value}`);
  }
}

/** Division entiere tronquee vers zero — semantique de l'operateur `/` SQL. */
function intDiv(numerator: number, denominator: number): number {
  return Math.trunc(numerator / denominator);
}

/** Applique un taux exprime en points de base (2000 = 20,00 %). */
export function applyBasisPoints(amountCents: Cents, basisPoints: number): Cents {
  assertCents(amountCents);
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new MoneyError(`Taux en points de base invalide : ${basisPoints}`);
  }
  return intDiv(amountCents * basisPoints, 10_000);
}

/** TVA calculee sur un montant hors taxes. */
export function vatFromNet(netCents: Cents, vatRateBps: number): Cents {
  return applyBasisPoints(netCents, vatRateBps);
}

/** Part de TVA contenue dans un montant toutes taxes comprises. */
export function vatFromGross(grossCents: Cents, vatRateBps: number): Cents {
  assertCents(grossCents);
  const net = intDiv(grossCents * 10_000, 10_000 + vatRateBps);
  return grossCents - net;
}

export function grossFromNet(netCents: Cents, vatRateBps: number): Cents {
  return netCents + vatFromNet(netCents, vatRateBps);
}

export function sumCents(...amounts: Cents[]): Cents {
  return amounts.reduce((total, amount) => {
    assertCents(amount);
    return total + amount;
  }, 0);
}

export function clampCents(amountCents: Cents, min: Cents, max: Cents): Cents {
  return Math.min(Math.max(amountCents, min), max);
}

/** Conversion en unites majeures. Reservee a l'affichage et aux APIs externes. */
export function toMajorUnits(amountCents: Cents): number {
  assertCents(amountCents);
  return amountCents / 100;
}

export function fromMajorUnits(amount: number): Cents {
  const cents = Math.round(amount * 100);
  assertCents(cents);
  return cents;
}

const CURRENCY_LOCALE: Record<Currency, string> = { EUR: 'fr-FR' };

/** Formatage localise : « 239,99 € ». */
export function formatMoney(
  amountCents: Cents,
  currency: Currency = 'EUR',
  options: { locale?: string; hideDecimalsWhenRound?: boolean } = {},
): string {
  assertCents(amountCents);
  const locale = options.locale ?? CURRENCY_LOCALE[currency] ?? 'fr-FR';
  const isRound = amountCents % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: options.hideDecimalsWhenRound && isRound ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(toMajorUnits(amountCents));
}

/** « 14 € / mois ». */
export function formatMonthly(amountCents: Cents, currency: Currency = 'EUR'): string {
  return `${formatMoney(amountCents, currency, { hideDecimalsWhenRound: true })} / mois`;
}

/** « 20 % » a partir de points de base. */
export function formatBasisPoints(basisPoints: number, locale = 'fr-FR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(basisPoints / 10_000);
}

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
    throw new MoneyError(`Le ${label} doit être un entier de centimes, reçu : ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Le ${label} dépasse la plage entière sure : ${value}`);
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
  // Seul endroit du code ou un montant devient un flottant : la frontiere
  // d'affichage. La regle ESLint interdit cette division partout ailleurs.
  // eslint-disable-next-line no-restricted-syntax
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

/**
 * Maintenance : « 12 € / mois ».
 *
 * SEUL endroit du code ou la periodicite d'un abonnement s'ecrit. La
 * maintenance StaX est MENSUELLE ; les rares contrats annuels vendus avant ce
 * passage gardent leur periodicite, lue sur le contrat (`billing_interval`),
 * jamais supposee. Afficher « / an » pour un prix mensuel (ou l'inverse)
 * annoncerait un prix faux au moment ou la personne decide d'acheter.
 */
export function formatMaintenance(
  amountCents: Cents,
  currency: Currency = 'EUR',
  interval: 'month' | 'year' = 'month',
): string {
  const amount = formatMoney(amountCents, currency, { hideDecimalsWhenRound: true });
  return `${amount} / ${interval === 'year' ? 'an' : 'mois'}`;
}

/** « par mois » / « par an », pour une phrase qui porte deja le montant. */
export function maintenancePeriodLabel(interval: 'month' | 'year' = 'month'): string {
  return interval === 'year' ? 'par an' : 'par mois';
}

/** « 20 % » a partir de points de base. */
export function formatBasisPoints(basisPoints: number, locale = 'fr-FR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(basisPoints / 10_000);
}

/**
 * Lecture d'un montant saisi par un humain : « 12,50 », « 12.5 », « 1 234,05 »,
 * « 39 € ».
 *
 * La conversion se fait par decoupage de chaine de caracteres, JAMAIS par un
 * flottant intermediaire. `parseFloat('0.29') * 100` vaut 28.999999999999996 :
 * une erreur d'un centime sur une facture est une erreur de trop.
 *
 * Renvoie `null` pour une saisie vide (« pas de prix », « sur devis »), et
 * leve `MoneyError` pour une saisie qui ressemble a un montant sans en etre un.
 */
export function parseMoneyInput(input: string): Cents | null {
  const cleaned = input
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/[€]/g, '')
    .replace(',', '.');

  if (cleaned === '') return null;

  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    throw new MoneyError(`Montant illisible : « ${input} ». Exemple attendu : 12,50`);
  }

  const [, sign, units, fraction = ''] = match;
  const centimes = Number.parseInt(fraction.padEnd(2, '0'), 10);
  const cents = Number.parseInt(units ?? '0', 10) * 100 + centimes;

  const signed = sign === '-' ? -cents : cents;
  assertCents(signed);
  return signed;
}

/** Montant pre-rempli dans un champ de saisie : « 12,50 », ou « » si absent. */
export function moneyInputValue(amountCents: Cents | null | undefined): string {
  if (amountCents == null) return '';
  assertCents(amountCents);
  const sign = amountCents < 0 ? '-' : '';
  const absolute = Math.abs(amountCents);
  const units = intDiv(absolute, 100);
  const centimes = absolute % 100;
  return `${sign}${units},${String(centimes).padStart(2, '0')}`;
}

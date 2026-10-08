/**
 * Numéro français au format international (E.164), pour les liens `tel:` et
 * les données structurées : « 07 82 09 37 51 » → « +33782093751 ». Un numéro
 * déjà international est seulement débarrassé de ses séparateurs.
 */
export function internationalPhone(phone: string): string {
  const compact = phone.replace(/[^\d+]/g, '');
  if (/^0\d{9}$/.test(compact)) return `+33${compact.slice(1)}`;
  if (/^0033\d{9}$/.test(compact)) return `+${compact.slice(2)}`;
  return compact;
}

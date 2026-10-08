/**
 * Description de page pour les moteurs de recherche : 158 caractères au plus,
 * au-delà desquels les résultats la tronquent. Coupée en fin de phrase quand
 * c'est possible, sinon sur un mot, jamais au milieu.
 */
export function metaDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sentence = clean.slice(0, max + 1).lastIndexOf('. ');
  if (sentence >= 90) return clean.slice(0, sentence + 1);
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:–—-]+$/, '')}…`;
}

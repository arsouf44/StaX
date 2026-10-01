const NUMBER = new Intl.NumberFormat('fr-FR');

/** Le mot accordé : en français, 0 et 1 restent au singulier. */
export function agree(count: number, singular: string, plural = `${singular}s`): string {
  return Math.abs(count) < 2 ? singular : plural;
}

/** « 0 visiteur », « 1 visiteur », « 1 240 visiteurs ». */
export function countOf(count: number, singular: string, plural = `${singular}s`): string {
  return `${NUMBER.format(count)} ${agree(count, singular, plural)}`;
}

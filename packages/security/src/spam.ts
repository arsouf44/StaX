/**
 * Detection de pourriel sans service tiers.
 *
 * Trois signaux additionnes : champ piege, delai de remplissage et heuristiques
 * de contenu. Le score sert a classer, jamais a rejeter silencieusement — une
 * soumission suspecte arrive dans l'onglet « Indesirables », ou le client peut
 * la recuperer. Aucun message legitime n'est perdu.
 */

export interface SpamSignals {
  /** Valeur du champ piege : doit rester vide. */
  honeypot?: string | null;
  /** Temps entre l'affichage et l'envoi, en millisecondes. */
  elapsedMs?: number | null;
  /** Corps du message. */
  message?: string | null;
  email?: string | null;
  /** Nombre de soumissions recentes depuis la meme empreinte. */
  recentSubmissions?: number;
}

export interface SpamVerdict {
  /** Score entre 0 et 1. */
  score: number;
  isSpam: boolean;
  reasons: string[];
}

const SPAM_PATTERNS: ReadonlyArray<{ pattern: RegExp; weight: number; reason: string }> = [
  {
    pattern: /\b(?:viagra|cialis|casino|porn|xxx)\b/i,
    weight: 0.5,
    reason: 'vocabulaire typique de pourriel',
  },
  {
    pattern: /\b(?:seo|backlink|referencement garanti|premiere page de google)\b/i,
    weight: 0.3,
    reason: 'demarchage SEO',
  },
  {
    pattern: /\b(?:crypto|bitcoin|forex|investissement garanti)\b/i,
    weight: 0.3,
    reason: 'demarchage financier',
  },
  { pattern: /(?:https?:\/\/[^\s]+){4,}/i, weight: 0.4, reason: 'nombre excessif de liens' },
  { pattern: /<\s*a\s+href/i, weight: 0.3, reason: 'balisage HTML dans le message' },
  { pattern: /\[url[=\]]/i, weight: 0.4, reason: 'balisage BBCode' },
];

export function scoreSubmission(signals: SpamSignals): SpamVerdict {
  const reasons: string[] = [];
  let score = 0;

  // Un robot remplit tous les champs, y compris celui qui est invisible.
  if (signals.honeypot && signals.honeypot.trim().length > 0) {
    score += 0.9;
    reasons.push('champ piege rempli');
  }

  // Moins de deux secondes : aucun humain n'a lu le formulaire.
  if (typeof signals.elapsedMs === 'number' && signals.elapsedMs >= 0 && signals.elapsedMs < 2000) {
    score += 0.4;
    reasons.push('formulaire envoyé trop vite');
  }

  const message = signals.message ?? '';
  for (const rule of SPAM_PATTERNS) {
    if (rule.pattern.test(message)) {
      score += rule.weight;
      reasons.push(rule.reason);
    }
  }

  if (message.length > 0 && message.length < 12) {
    score += 0.15;
    reasons.push('message très court');
  }

  const upperRatio =
    message.length > 30 ? (message.match(/[A-Z]/g)?.length ?? 0) / message.length : 0;
  if (upperRatio > 0.6) {
    score += 0.2;
    reasons.push('message majoritairement en capitales');
  }

  if ((signals.recentSubmissions ?? 0) > 3) {
    score += 0.3;
    reasons.push('envois répétés depuis la même origine');
  }

  const email = signals.email ?? '';
  if (email && /@(?:mailinator|guerrillamail|10minutemail|yopmail)\./i.test(email)) {
    score += 0.25;
    reasons.push('adresse e-mail jetable');
  }

  const bounded = Math.min(Math.round(score * 1000) / 1000, 1);
  return { score: bounded, isSpam: bounded >= 0.7, reasons };
}

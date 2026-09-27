import { z } from 'zod';
import { cleanMessageText, cleanSingleLine } from '@stax/security';

/**
 * Texte d'un message (discussion, ticket, reponse de l'equipe).
 *
 * Nettoye AVANT d'etre mesure : un message fait de caracteres invisibles est
 * vide, et la longueur comptee est celle que l'on verra. La base applique la
 * meme regle a tout message (`app.clean_message_text`), meme ecrit via l'API.
 */
export function messageText(min: number, max: number, emptyMessage: string) {
  return z
    .string()
    .transform(cleanMessageText)
    .pipe(
      z
        .string()
        .min(min, emptyMessage)
        .max(max, `Votre message ne peut pas dépasser ${max.toLocaleString('fr-FR')} caractères.`),
    );
}

/** Ligne unique (objet d'un ticket) : memes regles, sans saut de ligne. */
export function singleLineText(min: number, max: number, label: string) {
  return z
    .string()
    .transform(cleanSingleLine)
    .pipe(
      z
        .string()
        .min(min, `${label} doit faire au moins ${min} caractères.`)
        .max(max, `${label} ne peut pas dépasser ${max} caractères.`),
    );
}

/**
 * Refus de la base traduit en phrase : plafond d'envoi atteint, message trop
 * long. Tout autre refus reste le message generique de l'appelant.
 */
export function messageRefusal(
  error: { message?: string; hint?: string } | null | undefined,
  fallback: string,
): string {
  const text = `${error?.message ?? ''} ${error?.hint ?? ''}`;
  if (text.includes('rate_limited')) {
    return 'Vous avez envoyé beaucoup de messages en peu de temps. Patientez quelques minutes : nous lisons tout.';
  }
  if (text.includes('message_too_long')) {
    return 'Votre message dépasse 5 000 caractères. Découpez-le en plusieurs messages.';
  }
  return fallback;
}

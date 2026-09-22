import 'server-only';
import { headers } from 'next/headers';
import { PostgresRateLimitStore, tryCreateServiceClient } from '@stax/database';
import { isLegalValueConfigured, legalValue, platformUrl } from '@stax/config';
import {
  enforceRateLimit,
  hashIp,
  rateLimitIdentity,
  verifyTurnstile,
  type RateLimitName,
} from '@stax/security';

/**
 * Garde commune aux actions serveur publiques.
 *
 * Next.js verifie deja l origine des actions serveur : cette garde ajoute ce
 * qu il ne fait pas — limitation de debit par empreinte d IP (jamais l IP en
 * clair), champ piege et Turnstile.
 *
 * Elle est volontairement separee de la validation Zod : la validation dit ce
 * que la donnee doit etre, la garde dit si la requete a le droit d exister.
 */

/**
 * Delai maximal accorde aux verifications d'entree.
 *
 * Le compteur de debit et la verification anti-robot sont des PROTECTIONS :
 * elles ne doivent jamais devenir le maillon qui fait attendre. Si la base ou
 * le service anti-robot ne repond pas dans ce delai, on laisse passer la
 * requete en journalisant bruyamment, plutot que d'immobiliser un worker et de
 * laisser la personne devant un bouton qui tourne.
 */
const GUARD_TIMEOUT_MS = 3_000;

/** Course entre une verification et son delai. `fallback` gagne en cas de retard. */
async function withinBudget<T>(operation: Promise<T>, fallback: T, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.error(`[stax:guard] ${label} n'a pas repondu en ${GUARD_TIMEOUT_MS} ms`);
          resolve(fallback);
        }, GUARD_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface ActionGuardInput {
  limit: RateLimitName;
  /** Valeur du champ piege : doit rester vide. */
  honeypot?: unknown;
  turnstileToken?: unknown;
  /** Identifiant stable a preferer a l IP (utilisateur connecte). */
  userId?: string | null;
}

export type ActionGuardResult =
  { ok: true; ipHash: string | null } | { ok: false; message: string };

/**
 * Message rendu quand un secret de deploiement manque.
 *
 * On ne laisse pas passer la requete et on ne fait croire a aucun succes : la
 * garde ne peut pas faire son travail, donc l'action n'a pas lieu. Mais le
 * visiteur lit une phrase, pas un numero d'incident.
 */
function configurationIncomplete(): string {
  const support = isLegalValueConfigured('SUPPORT_EMAIL')
    ? ` ou écrivez-nous à ${legalValue('SUPPORT_EMAIL')}`
    : '';
  return `Ce formulaire est momentanément indisponible. Réessayez dans quelques minutes${support}.`;
}

/** Le compteur de debit s'accommode d'une absence : voir le `catch` ci-dessous. */
function requireServiceClient() {
  const client = tryCreateServiceClient();
  if (client === null) throw new Error('cle de service indisponible');
  return client;
}

export async function guardAction(input: ActionGuardInput): Promise<ActionGuardResult> {
  // Le champ piege est invisible pour un humain : rempli, la requete vient
  // d un robot. On repond comme a une requete normale pour ne pas l informer.
  if (typeof input.honeypot === 'string' && input.honeypot.trim().length > 0) {
    return { ok: false, message: 'Votre demande n’a pas pu être traitée.' };
  }

  const store = await headers();
  const ip =
    store.get('cf-connecting-ip') ??
    store.get('x-real-ip') ??
    store.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null;

  // `hashIp` refuse de signer sans STAX_SECRET_KEY en production, et c'est la
  // bonne regle : une empreinte calculee avec une cle devinable ne protege
  // rien. Mais l'exception remontait jusqu'a `error.tsx`, et un secret de
  // deploiement absent se presentait au visiteur comme « Une erreur est
  // survenue » — sur TOUS les formulaires du site a la fois, sans que rien
  // n'indique ou etait le probleme.
  //
  // On refuse toujours l'action, on ne la laisse pas passer : c'est une panne
  // de configuration, pas une requete invalide. Mais on la nomme.
  let ipHash: string | null;
  try {
    ipHash = await hashIp(ip);
  } catch (error) {
    console.error(
      '[stax:config] STAX_SECRET_KEY absent ou trop court : aucun formulaire ne ' +
        'peut fonctionner tant que ce secret n est pas fourni',
      error,
    );
    return { ok: false, message: configurationIncomplete() };
  }

  // Le compteur est en base. S il est injoignable — base coupee, secret absent —
  // on laisse passer plutot que de bloquer tout le monde : la limitation de
  // debit protege contre l abus, elle ne doit pas devenir un point de panne.
  // L incident est journalise bruyamment.
  try {
    const decision = await withinBudget(
      enforceRateLimit(
        new PostgresRateLimitStore(requireServiceClient()),
        input.limit,
        rateLimitIdentity({ userId: input.userId ?? null, ipHash }),
      ),
      // Valeur de repli : on autorise. Un compteur muet ne doit pas bloquer.
      { allowed: true, remaining: 0, retryAfterSeconds: 0 },
      'le compteur de debit',
    );
    if (!decision.allowed) {
      return { ok: false, message: decision.error?.message ?? 'Trop de tentatives.' };
    }
  } catch (error) {
    console.error('[stax:rate-limit] compteur indisponible', error);
  }

  // A l'inverse du compteur, une verification anti-robot muette echoue en
  // SECURITE : sans reponse, on ne peut pas affirmer que la requete est
  // humaine. Le repli est donc « non verifie ».
  const turnstile = await withinBudget(
    verifyTurnstile(typeof input.turnstileToken === 'string' ? input.turnstileToken : null, ip),
    { success: false, skipped: false, errorCodes: ['timeout'] },
    'la verification anti-robot',
  );
  if (!turnstile.success) {
    return {
      ok: false,
      message: 'La vérification anti-robot a échoué. Rechargez la page et réessayez.',
    };
  }

  return { ok: true, ipHash };
}

/** Origine canonique de la plateforme, pour les liens envoyes par e-mail. */
export function absolutePlatformUrl(path: string): string {
  const base = platformUrl().replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

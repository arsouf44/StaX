/**
 * Resultat explicite plutot qu'exception, pour les frontieres applicatives
 * (actions serveur, routes API). Force le traitement de l'echec cote appelant.
 */
export type Ok<T> = { readonly ok: true; readonly data: T };
export type Err<E = AppError> = { readonly ok: false; readonly error: E };
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
export const err = <E = AppError>(error: E): Err<E> => ({ ok: false, error });

export type AppErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'feature_unavailable'
  | 'payment_required'
  | 'provider_unavailable'
  | 'internal';

export interface AppError {
  readonly code: AppErrorCode;
  /** Message destine a l'utilisateur, en francais, sans detail technique. */
  readonly message: string;
  /** Erreurs par champ, pour les formulaires. */
  readonly fields?: Record<string, string[]>;
  /** Detail interne : journalise, jamais renvoye au navigateur en production. */
  readonly cause?: unknown;
}

export function appError(
  code: AppErrorCode,
  message: string,
  extra?: Omit<AppError, 'code' | 'message'>,
): AppError {
  return { code, message, ...extra };
}

/** Code HTTP associe a une erreur applicative. */
export function httpStatusFor(code: AppErrorCode): number {
  switch (code) {
    case 'unauthenticated':
      return 401;
    case 'forbidden':
    case 'feature_unavailable':
      return 403;
    case 'not_found':
      return 404;
    case 'validation':
      return 422;
    case 'conflict':
      return 409;
    case 'rate_limited':
      return 429;
    case 'quota_exceeded':
      return 402;
    case 'payment_required':
      return 402;
    case 'provider_unavailable':
      return 503;
    case 'internal':
      return 500;
    default:
      return 500;
  }
}

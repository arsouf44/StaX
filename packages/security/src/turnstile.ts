import { hasCapability, readEnv } from '@stax/config';

/**
 * Cloudflare Turnstile.
 *
 * Utilise avec parcimonie : sur les formulaires publics a risque et apres
 * plusieurs echecs d'authentification ou d'activation. Un site vitrine ne doit
 * pas devenir penible a utiliser pour se proteger de robots que la limitation
 * de debit et le champ piege arretent deja.
 */

const VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  success: boolean;
  /** `true` quand Turnstile n'est pas configure : le flux n'est pas bloque. */
  skipped: boolean;
  errorCodes?: string[];
}

export function isTurnstileEnabled(): boolean {
  return hasCapability('turnstile');
}

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  const secret = readEnv('TURNSTILE_SECRET_KEY');
  if (!secret) {
    return { success: true, skipped: true };
  }
  if (!token) {
    return { success: false, skipped: false, errorCodes: ['missing-input-response'] };
  }

  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);

  try {
    const response = await fetch(VERIFY_ENDPOINT, { method: 'POST', body });
    if (!response.ok) {
      return { success: false, skipped: false, errorCodes: [`http-${response.status}`] };
    }
    const data = (await response.json()) as { success: boolean; 'error-codes'?: string[] };
    return {
      success: data.success === true,
      skipped: false,
      errorCodes: data['error-codes'],
    };
  } catch {
    // Turnstile injoignable : on ne bloque pas un client legitime pour autant.
    // L'incident est journalisé par l'appelant et la limitation de debit reste active.
    return { success: true, skipped: true, errorCodes: ['verification-unreachable'] };
  }
}

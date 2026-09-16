import Stripe from 'stripe';
import { assertServerOnly, hasCapability, readEnv } from '@stax/config';

/**
 * Fabrique du client Stripe.
 *
 * Deux contraintes dictent cette configuration :
 *  - le code tourne sur Cloudflare Workers, ou seul `fetch` est disponible :
 *    on impose donc le client HTTP fetch de la bibliotheque ;
 *  - aucune cle secrete ne doit jamais atteindre un bundle navigateur :
 *    le module refuse de s'initialiser cote client.
 */

let cached: Stripe | null = null;

export class StripeNotConfiguredError extends Error {
  constructor() {
    super(
      'Stripe n’est pas configure sur cet environnement. ' +
        'Renseignez STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET.',
    );
    this.name = 'StripeNotConfiguredError';
  }
}

export function isStripeConfigured(): boolean {
  return hasCapability('stripe');
}

export function getStripe(): Stripe {
  assertServerOnly('@stax/payments/stripe-client');
  if (cached) return cached;

  const secretKey = readEnv('STRIPE_SECRET_KEY');
  if (!secretKey) throw new StripeNotConfiguredError();

  cached = new Stripe(secretKey, {
    // Client HTTP compatible Workers : pas de dependance a Node http.
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: 'StaX', version: '0.1.0' },
  });
  return cached;
}

/** Fournisseur cryptographique WebCrypto, requis pour verifier les webhooks. */
export function getWebhookCryptoProvider(): Stripe.CryptoProvider {
  return Stripe.createSubtleCryptoProvider();
}

/** Test helper : force la recreation du client. */
export function resetStripeClient(): void {
  cached = null;
}

/**
 * Cle d'idempotence deterministe. Deux tentatives issues du meme evenement
 * metier produisent la meme cle : Stripe ne cree alors qu'un seul objet.
 */
export function idempotencyKey(...parts: (string | number)[]): string {
  return ['stax', ...parts].join(':').slice(0, 255);
}

export type { Stripe };

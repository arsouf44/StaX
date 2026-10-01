import { readEnv } from '@nemasus/config';
import { createServiceClient } from '@nemasus/database';
import { notifySiteActivity } from '@nemasus/emails';

/** `ctx.waitUntil` du Worker : la tâche se termine après la réponse. */
export type Defer = (promise: Promise<unknown>) => void;

/**
 * Prévient le commerçant (message, réservation) juste après avoir répondu au
 * visiteur : la réponse n'attend pas l'e-mail. Un échec n'a pas de
 * conséquence pour le visiteur ; la tâche de fond de la plateforme rattrape
 * ce qui n'a pas pu partir.
 */
export function notifyOwnerLater(siteId: string, defer?: Defer): void {
  const appUrl = readEnv('NEXT_PUBLIC_PLATFORM_URL');
  if (!appUrl || !defer) return;
  defer(
    notifySiteActivity(createServiceClient(), { appUrl, siteId, limit: 5 }).catch((error) =>
      console.error('[nemasus:site-runtime] notification du commerçant', error),
    ),
  );
}

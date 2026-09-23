import { tryCreateServiceClient } from '@stax/database';
import { verifyGitHubSignature } from '@stax/infrastructure';
import { handleGitHubEvent } from '~/lib/external-sites/github-events';

/**
 * Webhook de l'application GitHub StaX.
 *
 *  1. SIGNATURE : `X-Hub-Signature-256` verifiee sur le corps BRUT, avant
 *     toute lecture. Une livraison non signee ou mal signee est refusee (401).
 *  2. IDEMPOTENCE : l'identifiant de livraison (`X-GitHub-Delivery`) est
 *     enregistre sous contrainte d'unicite ; un rejeu n'est pas retraite.
 *  3. SOURCE DE VERITE : le webhook informe, il ne decide pas. Les etats qui
 *     comptent (commit publie, deploiement) sont relus aupres des API.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDER = 'github';
const MAX_BODY = 5_000_000;

function reply(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BODY) return reply({ error: 'Trop volumineux.' }, 413);

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY) return reply({ error: 'Trop volumineux.' }, 413);

  const valid = await verifyGitHubSignature(rawBody, request.headers.get('x-hub-signature-256'));
  if (!valid) return reply({ error: 'Signature invalide.' }, 401);

  const event = request.headers.get('x-github-event') ?? '';
  const delivery = request.headers.get('x-github-delivery') ?? '';
  if (!/^[a-z_]{1,60}$/.test(event) || !/^[0-9a-f-]{8,64}$/i.test(delivery)) {
    return reply({ error: 'En-têtes GitHub manquants.' }, 400);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return reply({ error: 'Corps illisible.' }, 400);
  }

  const db = tryCreateServiceClient();
  if (!db) return reply({ error: 'Indisponible.' }, 503);

  const action = typeof payload['action'] === 'string' ? `.${payload['action']}` : '';
  const { data: accepted, error: registerError } = await db.rpc('begin_webhook_event', {
    p_provider: PROVIDER,
    p_event_id: delivery,
    p_event_type: `${event}${action}`.slice(0, 80),
    p_account_id: null,
    p_signed_at: new Date().toISOString(),
    // Rien de sensible n'est conserve : le type d'evenement et le depot vise.
    p_payload: {
      repository: (payload['repository'] as { full_name?: string } | undefined)?.full_name ?? null,
      installation: (payload['installation'] as { id?: number } | undefined)?.id ?? null,
    },
  });
  if (registerError) return reply({ error: 'Indisponible.' }, 503);
  if (accepted !== true) return reply({ received: true, duplicate: true });

  try {
    const outcome = await handleGitHubEvent(db, event, payload);
    await db.rpc('finish_webhook_event', {
      p_provider: PROVIDER,
      p_event_id: delivery,
      p_status: 'processed',
      p_error: null,
    });
    return reply({ received: true, outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    await db.rpc('finish_webhook_event', {
      p_provider: PROVIDER,
      p_event_id: delivery,
      p_status: 'failed',
      p_error: message.slice(0, 500),
    });
    console.error('[stax:github-webhook]', event, message);
    return reply({ received: true, deferred: true });
  }
}

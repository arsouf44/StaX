import { tryCreateServiceClient, unwrapList } from '@stax/database';
import { verifyCloudflareWebhook } from '@stax/infrastructure';
import { syncHostingDeployments } from '~/lib/external-sites/publisher';
import { HOSTING_COLUMNS, type HostingRow } from '~/lib/external-sites/records';

/**
 * Notifications Cloudflare (destination webhook) : deploiement Pages ou build
 * Workers termine.
 *
 * Authentification : le secret de la destination, transmis dans l'en-tete
 * `cf-webhook-auth`, compare a temps constant. Une notification non
 * authentifiee est refusee (401) sans etre lue.
 *
 * La notification n'est qu'un signal : StaX relit les deploiements du projet
 * concerne aupres de l'API Cloudflare, qui seule fait foi. Une notification
 * forgee — meme avec le bon secret — ne peut donc pas faire passer une
 * version pour publiee.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 200_000;

function reply(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

/** Nom du projet (Pages) ou du Worker concerne, quelle que soit la forme de la notification. */
function projectNames(payload: unknown): string[] {
  const names = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 4 || value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (
        typeof child === 'string' &&
        /^(project_name|projectName|project|worker_name|script_name|script|service)$/.test(key) &&
        /^[a-z0-9][a-z0-9-]{0,62}$/.test(child)
      ) {
        names.add(child);
      } else {
        visit(child, depth + 1);
      }
    }
  };
  visit(payload, 0);
  return [...names].slice(0, 5);
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyCloudflareWebhook(request.headers.get('cf-webhook-auth'))) {
    return reply({ error: 'Non authentifié.' }, 401);
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY) return reply({ error: 'Trop volumineux.' }, 413);

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Notification de test sans corps JSON : acceptee, rien a relire.
    return reply({ received: true });
  }

  const db = tryCreateServiceClient();
  if (!db) return reply({ error: 'Indisponible.' }, 503);

  const names = projectNames(payload);
  if (names.length === 0) return reply({ received: true, projects: 0 });

  const hostings = unwrapList<HostingRow>(
    (await db
      .from('site_hosting')
      .select(HOSTING_COLUMNS)
      .in('project_name', names)
      .neq('status', 'disconnected')) as never,
  );
  let synced = 0;
  for (const hosting of hostings) {
    const outcome = await syncHostingDeployments(db, hosting).catch(() => null);
    if (outcome?.status === 'synced') synced += 1;
  }
  return reply({ received: true, projects: synced });
}

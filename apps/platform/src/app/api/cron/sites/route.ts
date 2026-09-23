import { tryCreateServiceClient } from '@stax/database';
import { verifyCronSecret } from '@stax/infrastructure';
import { runSiteOperations } from '~/lib/external-sites/operations';

/**
 * Tache de fond des sites livres : publications programmees, suivi des
 * deploiements, apercus, surveillance. Appelee toutes les 5 minutes par le
 * planificateur (Vercel Cron, ou tout ordonnanceur qui presente
 * `Authorization: Bearer <CRON_SECRET>`).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function run(request: Request): Promise<Response> {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return Response.json({ error: 'Non autorisé.' }, { status: 401 });
  }
  const db = tryCreateServiceClient();
  if (!db) return Response.json({ error: 'Indisponible.' }, { status: 503 });
  const report = await runSiteOperations(db, { budgetMs: 50_000 });
  return Response.json(report, { headers: { 'cache-control': 'no-store' } });
}

export const GET = run;
export const POST = run;

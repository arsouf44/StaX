import { tryCreateServiceClient } from '@stax/database';
import { verifyCronSecret } from '@stax/infrastructure';
import { runSiteOperations } from '~/lib/external-sites/operations';
import { retryProposalDeliveries } from '~/lib/proposals';

/**
 * Tache de fond des sites livres : publications programmees, suivi des
 * deploiements, apercus, surveillance. Appelee toutes les 5 minutes par
 * Supabase (`pg_cron` + `pg_net`, migration 0053) et une fois par jour par
 * Vercel Cron (le plan Hobby n'en permet pas davantage) ; tout ordonnanceur
 * qui presente `Authorization: Bearer <CRON_SECRET>` convient.
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
  const report = await runSiteOperations(db, { budgetMs: 45_000 });
  // Propositions payées dont la livraison automatique n'a pas encore abouti.
  const proposals = await retryProposalDeliveries(db, { limit: 5 });
  return Response.json({ ...report, proposals }, { headers: { 'cache-control': 'no-store' } });
}

export const GET = run;
export const POST = run;

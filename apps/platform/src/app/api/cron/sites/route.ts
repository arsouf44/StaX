import { platformUrl } from '@nemasus/config';
import { tryCreateServiceClient } from '@nemasus/database';
import { notifySiteActivity } from '@nemasus/emails';
import { verifyCronSecret } from '@nemasus/infrastructure';
import { runSiteOperations } from '~/lib/external-sites/operations';

/**
 * Tache de fond des sites livres : publications programmees, suivi des
 * deploiements, apercus, surveillance, notifications au commercant. Appelee toutes les 5 minutes par
 * Supabase (`pg_cron` + `pg_net`, migrations 0053 et 0057) et une fois par
 * jour par Vercel Cron (`vercel.json`) ; tout ordonnanceur qui presente
 * `Authorization: Bearer <CRON_SECRET>` convient.
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
  // Messages, réservations et commandes dont le commerçant n'a pas encore été
  // prévenu (le moteur des sites prévient aussitôt ; ceci rattrape les échecs).
  // Deux minutes de délai : l'envoi immédiat a priorité.
  const siteActivity = await notifySiteActivity(db, {
    appUrl: platformUrl(),
    limit: 25,
    minAgeSeconds: 120,
  }).catch(() => null);
  return Response.json({ ...report, siteActivity }, { headers: { 'cache-control': 'no-store' } });
}

export const GET = run;
export const POST = run;

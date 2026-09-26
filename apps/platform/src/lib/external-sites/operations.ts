import 'server-only';
import { unwrapList, unwrapMaybe, type Db } from '@stax/database';
import {
  checkSiteHealth,
  cloudflareSitesConfigured,
  githubAppConfigured,
} from '@stax/infrastructure';
import {
  expireStalePreviews,
  hostingsWithPendingWork,
  processRelease,
  syncHostingDeployments,
  type StepOutcome,
} from './publisher';
import { alertTeam } from '../team-alerts';

/**
 * Tache de fond des sites livres (`/api/cron/sites`, toutes les 5 minutes) :
 *
 *  1. publications programmees arrivees a echeance -> file d'attente ;
 *  2. versions en attente, bloquees ou en deploiement -> traitees / suivies ;
 *  3. apercus jamais construits -> expires ;
 *  4. surveillance HTTPS des sites livres ;
 *  5. etat reel de ces services dans `system_health`.
 *
 * Chaque etape est independante : l'echec de l'une n'empeche pas les autres.
 */

export interface OperationsReport {
  promoted: number;
  releases: Array<{ id: string; outcome: StepOutcome['status'] }>;
  hostingsSynced: number;
  previewsExpired: number;
  healthChecks: number;
  errors: string[];
}

async function setHealth(db: Db, key: string, status: string, detail: string) {
  await db
    .from('system_health')
    .update({ status, detail: detail.slice(0, 500), observed_at: new Date().toISOString() })
    .eq('key', key);
}

export async function runSiteOperations(
  db: Db,
  options: { budgetMs?: number } = {},
): Promise<OperationsReport> {
  const started = Date.now();
  const budget = options.budgetMs ?? 50_000;
  const report: OperationsReport = {
    promoted: 0,
    releases: [],
    hostingsSynced: 0,
    previewsExpired: 0,
    healthChecks: 0,
    errors: [],
  };
  const withinBudget = () => Date.now() - started < budget;

  // 1. Publications programmees.
  try {
    const { data, error } = await db.rpc('promote_due_site_releases');
    if (error) throw new Error(error.message);
    report.promoted = typeof data === 'number' ? data : 0;
    await setHealth(
      db,
      'scheduled_publishing',
      'healthy',
      `Dernière exécution réussie : ${report.promoted} publication(s) programmée(s) déclenchée(s).`,
    );
  } catch (error) {
    report.errors.push(`programmation : ${error instanceof Error ? error.message : 'erreur'}`);
    await setHealth(
      db,
      'scheduled_publishing',
      'failing',
      'La promotion des publications programmées a échoué.',
    );
  }

  // 2. Versions a faire avancer.
  const synced = new Set<string>();
  try {
    const due = unwrapList<{ release_id: string; site_id: string; status: string }>(
      (await db.rpc('site_releases_to_process', { p_limit: 25 })) as never,
    );
    for (const item of due) {
      if (!withinBudget()) break;
      try {
        const outcome = await processRelease(db, item.release_id);
        report.releases.push({ id: item.release_id, outcome: outcome.status });
      } catch (error) {
        report.errors.push(
          `version ${item.release_id} : ${error instanceof Error ? error.message : 'erreur'}`,
        );
      }
    }
  } catch (error) {
    report.errors.push(`versions : ${error instanceof Error ? error.message : 'erreur'}`);
  }

  // 3. Deploiements en cours (apercus compris) : relus chez Cloudflare.
  try {
    for (const hosting of await hostingsWithPendingWork(db)) {
      if (!withinBudget() || synced.has(hosting.id)) continue;
      synced.add(hosting.id);
      const outcome = await syncHostingDeployments(db, hosting);
      if (outcome.status === 'synced') report.hostingsSynced += 1;
    }
    report.previewsExpired = await expireStalePreviews(db);
    await setHealth(
      db,
      'deployment_sync',
      cloudflareSitesConfigured() ? 'healthy' : 'not_configured',
      cloudflareSitesConfigured()
        ? `Dernier suivi : ${report.hostingsSynced} projet(s) relu(s) chez Cloudflare.`
        : 'CLOUDFLARE_SITES_API_TOKEN absent : les déploiements ne peuvent pas être confirmés.',
    );
  } catch (error) {
    report.errors.push(`deploiements : ${error instanceof Error ? error.message : 'erreur'}`);
    await setHealth(db, 'deployment_sync', 'failing', 'Le suivi des déploiements a échoué.');
  }

  // 4. Surveillance des sites livres.
  try {
    const due = unwrapList<{ site_id: string; url: string | null }>(
      (await db.rpc('sites_due_for_health_check', { p_limit: 40 })) as never,
    );
    let failures = 0;
    for (const site of due) {
      if (!withinBudget() || !site.url) continue;
      const health = await checkSiteHealth(site.url);
      if (!health.ok) {
        failures += 1;
        // Alerte à l'équipe au PASSAGE en panne, pas à chaque vérification.
        const previous = unwrapMaybe<{ ok: boolean }>(
          (await db
            .from('site_health_checks')
            .select('ok')
            .eq('site_id', site.site_id)
            .order('checked_at', { ascending: false })
            .limit(1)
            .maybeSingle()) as never,
        );
        if (!previous || previous.ok) {
          await alertTeam({
            subject: `Site injoignable — ${site.url}`,
            heading: 'Un site livré ne répond plus',
            lines: [
              ['Adresse', site.url],
              ['Réponse', health.status ? `HTTP ${health.status}` : (health.error ?? 'aucune')],
            ],
            path: `/admin/sites/${site.site_id}`,
            actionLabel: 'Ouvrir la fiche du site',
          });
        }
      }
      await db.rpc('record_site_health', {
        p_site: site.site_id,
        p_url: site.url,
        p_ok: health.ok,
        p_status_code: health.status,
        p_response_ms: health.responseMs,
        p_error: health.error,
      });
      report.healthChecks += 1;
    }
    await setHealth(
      db,
      'site_monitoring',
      failures > 0 ? 'degraded' : 'healthy',
      `${report.healthChecks} site(s) vérifié(s) à la dernière exécution, ${failures} injoignable(s).`,
    );
  } catch (error) {
    report.errors.push(`surveillance : ${error instanceof Error ? error.message : 'erreur'}`);
    await setHealth(db, 'site_monitoring', 'failing', 'La surveillance des sites a échoué.');
  }

  await setHealth(
    db,
    'github_app',
    githubAppConfigured() ? 'healthy' : 'not_configured',
    githubAppConfigured()
      ? 'Application GitHub configurée (clé privée présente côté serveur).'
      : 'GITHUB_APP_ID ou GITHUB_APP_PRIVATE_KEY absent : aucune publication possible.',
  );
  await setHealth(
    db,
    'cloudflare_sites',
    cloudflareSitesConfigured() ? 'healthy' : 'not_configured',
    cloudflareSitesConfigured()
      ? 'Jeton Cloudflare des sites présent côté serveur.'
      : 'Aucun jeton Cloudflare : les déploiements ne peuvent pas être suivis.',
  );

  return report;
}

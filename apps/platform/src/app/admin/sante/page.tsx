import Link from 'next/link';
import type { Metadata } from 'next';
import {
  coreConfigurationProblems,
  legalStatus,
  missingCapabilities,
  type CapabilityKey,
} from '@nemasus/config';
import { unwrapList } from '@nemasus/database';
import {
  Alert,
  Icon,
  Panel,
  StatusPill,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@nemasus/ui';
import type { StatusTone } from '@nemasus/ui';
import { PageHeader } from '~/components/app/page-header';
import { getAdminContext } from '~/lib/admin';

export const metadata: Metadata = { title: 'État des services' };

/**
 * Etat reel des services.
 *
 * Cet ecran ne doit JAMAIS afficher « tout va bien » par defaut. Une sonde qui
 * n'a jamais tourne vaut « inconnu », pas « operationnel » : un tableau de bord
 * qui ment sur la sante d'un systeme est pire que pas de tableau de bord.
 */

const HEALTH_VIEW: Record<string, { label: string; tone: StatusTone }> = {
  healthy: { label: 'Opérationnel', tone: 'success' },
  degraded: { label: 'Dégradé', tone: 'warning' },
  failing: { label: 'En panne', tone: 'danger' },
  not_configured: { label: 'Non configuré', tone: 'neutral' },
  unknown: { label: 'Inconnu', tone: 'neutral' },
};

const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  stripe: 'Paiements Stripe (clé secrète et secret de webhook)',
  stripe_connect: 'Stripe Connect (encaissement sur les sites clients)',
  cloudflare_domains: 'Rattachement automatique des domaines (API Cloudflare)',
  turnstile: 'Vérification anti-robot Turnstile',
  email: 'Envoi d’e-mails transactionnels',
  github_app: 'Application GitHub (publication dans le dépôt de chaque site)',
  cloudflare_sites: 'API Cloudflare des sites (suivi réel des déploiements)',
  cron: 'Tâches de fond planifiées (CRON_SECRET)',
};

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

export default async function AdminHealthPage() {
  const { db } = await getAdminContext();

  const probes = unwrapList<{
    key: string;
    label: string;
    status: string;
    detail: string | null;
    observed_at: string | null;
  }>(
    (await db
      .from('system_health')
      .select('key, label, status, detail, observed_at')
      .order('key', { ascending: true })) as never,
  );

  const missing = missingCapabilities();
  const legal = legalStatus();
  const configuration = coreConfigurationProblems();

  const recentWebhooks = unwrapList<{ status: string }>(
    (await db
      .from('webhook_events')
      .select('status')
      .order('received_at', { ascending: false })
      .limit(100)) as never,
  );
  const failedWebhooks = recentWebhooks.filter((row) => row.status === 'failed').length;

  // Taches planifiees par la base : actives, dernier passage, secrets Vault
  // presents (jamais leur valeur). `null` si la fonction n'existe pas encore.
  const schedulerResult = await db.rpc('scheduler_overview');
  const scheduler = (schedulerResult.error ? null : schedulerResult.data) as {
    jobs: Array<{
      name: string;
      schedule: string;
      active: boolean;
      lastStatus: string | null;
      lastRunAt: string | null;
      lastMessage: string | null;
    }>;
    vault: { platformUrl: boolean; cronSecret: boolean };
    vaultAvailable: boolean;
    cronAvailable: boolean;
  } | null;
  const vaultMissing =
    scheduler?.vaultAvailable === true &&
    (!scheduler.vault.platformUrl || !scheduler.vault.cronSecret);

  return (
    <>
      <PageHeader
        title="État des services"
        description="Ce que la plateforme sait réellement de son propre fonctionnement. Une sonde qui n’a jamais tourné affiche « inconnu », jamais « opérationnel »."
      />

      <div className="space-y-8">
        {configuration.length > 0 ? (
          <Alert tone="danger" live="alert" title="Configuration du déploiement incomplète">
            <p>
              Ces variables se renseignent dans les réglages du déploiement (variables
              d’environnement), puis un redéploiement les prend en compte.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {configuration.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        {!legal.configured ? (
          <Alert tone="danger" live="alert" title="Informations légales incomplètes">
            {legal.missingRequired.length > 0 ? (
              <p>
                Manquantes : {legal.missingRequired.join(', ')}. Les pages légales publiques restent
                incomplètes, avec un avertissement, tant qu’elles ne sont pas renseignées dans les
                variables du déploiement.
              </p>
            ) : null}
            {legal.identityProblems.map((problem) => (
              <p key={problem.field}>{problem.message}</p>
            ))}
          </Alert>
        ) : (
          <Alert tone="success" live="status" title="Identité commerciale vérifiée">
            SIREN, SIRET et numéro de TVA sont renseignés et leurs clés de contrôle sont correctes.
            Les textes juridiques restent à faire valider par un professionnel du droit.
          </Alert>
        )}

        <section aria-labelledby="capacites" className="space-y-3">
          <h2 id="capacites" className="text-base font-medium">
            Services externes configurés
          </h2>
          {missing.length === 0 ? (
            <Panel level={1} padding="lg">
              <p className="text-sm text-[var(--foreground-muted)]">
                Tous les services externes sont configurés.
              </p>
            </Panel>
          ) : (
            <Panel level={1} padding="lg">
              <p className="text-sm text-[var(--foreground-muted)]">
                Ces services ne sont pas configurés. Les fonctionnalités correspondantes se
                dégradent proprement plutôt que d’échouer, mais elles ne sont pas disponibles.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {missing.map((capability) => (
                  <li key={capability} className="flex items-start gap-2">
                    <span className="mt-0.5 text-[var(--warning)]" aria-hidden="true">
                      <Icon name="alert-triangle" size={16} />
                    </span>
                    <span className="text-[var(--foreground-muted)]">
                      {CAPABILITY_LABELS[capability] ?? capability}
                    </span>
                  </li>
                ))}
              </ul>
              {missing.includes('github_app') || missing.includes('cloudflare_sites') ? (
                <p className="mt-4 text-sm">
                  <Link href="/admin/integrations" className="underline underline-offset-4">
                    Configurer GitHub et Cloudflare
                  </Link>{' '}
                  — l’application GitHub se crée en un clic.
                </p>
              ) : null}
            </Panel>
          )}
        </section>

        <section aria-labelledby="sondes" className="space-y-3">
          <h2 id="sondes" className="text-base font-medium">
            Sondes internes
          </h2>
          <TableWrapper label="Sondes internes">
            <Table>
              <THead>
                <TR>
                  <TH scope="col">Service</TH>
                  <TH scope="col">État</TH>
                  <TH scope="col">Dernière observation</TH>
                  <TH scope="col">Détail</TH>
                </TR>
              </THead>
              <TBody>
                {probes.map((probe) => {
                  const view = HEALTH_VIEW[probe.status] ?? HEALTH_VIEW.unknown;
                  return (
                    <TR key={probe.key}>
                      <TD>{probe.label}</TD>
                      <TD>
                        <StatusPill tone={view?.tone ?? 'neutral'}>
                          {view?.label ?? probe.status}
                        </StatusPill>
                      </TD>
                      <TD className="text-[var(--foreground-muted)]">
                        {probe.observed_at ? (
                          <time dateTime={probe.observed_at}>
                            {DATE_TIME.format(new Date(probe.observed_at))}
                          </time>
                        ) : (
                          'jamais'
                        )}
                      </TD>
                      <TD className="text-[var(--foreground-muted)]">{probe.detail ?? '—'}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        </section>

        {scheduler?.cronAvailable ? (
          <section aria-labelledby="planification" className="space-y-3">
            <h2 id="planification" className="text-base font-medium">
              Tâches planifiées par la base
            </h2>
            {vaultMissing ? (
              <Alert tone="warning" title="La tâche de fond toutes les 5 minutes ne part pas">
                <p>
                  Publications programmées, suivi des déploiements, livraisons automatiques après
                  paiement et surveillance des sites ne tournent qu’une fois par jour (tâche de
                  secours de l’hébergeur). Pour la cadence de 5 minutes, dans Supabase → SQL Editor,
                  une seule fois, avec l’adresse de la plateforme et la valeur exacte de{' '}
                  <code>CRON_SECRET</code> :
                </p>
                <pre className="mt-2 overflow-x-auto rounded-[var(--radius-sm)] bg-[var(--surface-hover)] p-3 text-2xs">
                  {`select vault.create_secret('https://votre-domaine', 'nemasus_platform_url');
select vault.create_secret('<valeur de CRON_SECRET>', 'nemasus_cron_secret');`}
                </pre>
                <p className="mt-2">
                  Manquant :{' '}
                  {[
                    scheduler.vault.platformUrl ? null : 'nemasus_platform_url',
                    scheduler.vault.cronSecret ? null : 'nemasus_cron_secret',
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  .
                </p>
              </Alert>
            ) : null}
            <TableWrapper label="Tâches planifiées par la base">
              <Table>
                <THead>
                  <TR>
                    <TH scope="col">Tâche</TH>
                    <TH scope="col">Cadence</TH>
                    <TH scope="col">Dernier passage</TH>
                    <TH scope="col">Résultat</TH>
                  </TR>
                </THead>
                <TBody>
                  {scheduler.jobs.map((job) => (
                    <TR key={job.name}>
                      <TD className="font-mono text-xs">{job.name}</TD>
                      <TD className="font-mono text-xs">
                        {job.active ? job.schedule : 'désactivée'}
                      </TD>
                      <TD className="text-[var(--foreground-muted)]">
                        {job.lastRunAt ? DATE_TIME.format(new Date(job.lastRunAt)) : 'jamais'}
                      </TD>
                      <TD>
                        {job.lastStatus === 'succeeded' ? (
                          <StatusPill tone="success">Réussi</StatusPill>
                        ) : job.lastStatus === 'failed' ? (
                          <StatusPill tone="danger">{job.lastMessage ?? 'Échec'}</StatusPill>
                        ) : (
                          <StatusPill tone="neutral">{job.lastStatus ?? '—'}</StatusPill>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </section>
        ) : null}

        <section aria-labelledby="webhooks" className="space-y-3">
          <h2 id="webhooks" className="text-base font-medium">
            Webhooks Stripe
          </h2>
          <Panel level={failedWebhooks > 0 ? 2 : 1} padding="lg">
            {recentWebhooks.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                Aucun événement reçu pour le moment. C’est normal avant la première vente.
              </p>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)]">
                {failedWebhooks === 0
                  ? `Les ${recentWebhooks.length} derniers événements ont été traités sans erreur.`
                  : `${failedWebhooks} événement${failedWebhooks > 1 ? 's' : ''} en échec sur les ${recentWebhooks.length} derniers. Un paiement peut ne pas avoir été appliqué.`}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
              La vérité d’un paiement vient de ces événements signés, jamais d’un retour de
              navigateur. Un webhook en échec doit être rejoué depuis le tableau de bord Stripe.
            </p>
          </Panel>
        </section>

        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Sauvegardes</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
            L’offre gratuite de Supabase ne sauvegarde pas la base. Une tâche GitHub Actions (
            <code>.github/workflows/backup.yml</code>) en exporte chaque nuit les données, chiffrées
            en AES-256, conservées 30 jours, et inscrit son résultat dans la sonde « Sauvegardes de
            la base » ci-dessus. Sans les secrets <code>SUPABASE_DB_URL</code> et{' '}
            <code>BACKUP_PASSPHRASE</code> du dépôt, elle échoue et le dit.
          </p>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Procédure de restauration : <code>docs/backup-recovery.md</code>.
          </p>
        </Panel>
      </div>
    </>
  );
}

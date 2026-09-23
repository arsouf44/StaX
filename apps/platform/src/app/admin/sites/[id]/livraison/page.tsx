import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasPlatformRole } from '@stax/auth';
import { unwrapList, unwrapMaybe } from '@stax/database';
import {
  cloudflareSitesConfigured,
  defaultCloudflareAccountId,
  githubAppConfigured,
  githubAppInstallUrl,
} from '@stax/infrastructure';
import { CONTRACT_VERSION, MANIFEST_SCHEMA_URL } from '@stax/site-contract';
import { formatMoney } from '@stax/payments';
import { Alert, Badge, DescriptionList, Panel, StatusPill, type StatusTone } from '@stax/ui';
import { requireAdminRole } from '~/lib/admin';
import {
  HOSTING_COLUMNS,
  MANIFEST_COLUMNS,
  REPOSITORY_COLUMNS,
  type HostingRow,
  type ManifestRow,
  type RepositoryRow,
} from '~/lib/external-sites/records';
import {
  initializeContentAction,
  refreshDeploymentsAction,
  refreshRepositoryAction,
  retryDeploymentAction,
  retryMaintenanceAction,
  runChecksAction,
  syncDomainsAction,
  syncInstallationsAction,
} from './actions';
import {
  ActionButton,
  AddDomainForm,
  AttestForm,
  ConnectHostingForm,
  ConnectRepositoryForm,
  DeliverForm,
  DisconnectButton,
  ImportManifestButton,
  PhaseForm,
} from './controls';

export const metadata: Metadata = { title: 'Infrastructure & livraison' };
export const dynamic = 'force-dynamic';

/**
 * Projet > Infrastructure & livraison.
 *
 * Le site de chaque client est concu et developpe en dehors de StaX, dans son
 * propre depot GitHub, et deploye par son propre projet Cloudflare. Cette page
 * est l'endroit ou l'equipe :
 *   1. rattache le depot et le projet (verifies aupres des API, jamais saisis) ;
 *   2. importe le contrat d'edition (`stax.manifest.json`) et le contenu initial ;
 *   3. rattache et verifie le domaine ;
 *   4. deroule la checklist de livraison (controles reels + attestations) ;
 *   5. livre le site au client — ce qui ouvre son editeur et demarre la
 *      maintenance mensuelle.
 *
 * Lecture avec le jeton de la personne : les policies decident. Aucun jeton
 * GitHub ou Cloudflare n'est lu ni affiche ici : il n'en existe aucun en base.
 */

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

function when(value: string | null | undefined): string {
  return value ? DATE_TIME.format(new Date(value)) : '—';
}

function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : '—';
}

const DEPLOYMENT_TONES: Record<string, { tone: StatusTone; label: string }> = {
  queued: { tone: 'neutral', label: 'En file' },
  building: { tone: 'accent', label: 'Build en cours' },
  deploying: { tone: 'accent', label: 'Déploiement' },
  success: { tone: 'success', label: 'Réussi' },
  failure: { tone: 'danger', label: 'Échec' },
  canceled: { tone: 'warning', label: 'Annulé' },
  skipped: { tone: 'warning', label: 'Ignoré' },
};

const RELEASE_TONES: Record<string, { tone: StatusTone; label: string }> = {
  scheduled: { tone: 'info', label: 'Programmée' },
  queued: { tone: 'neutral', label: 'En attente' },
  committing: { tone: 'accent', label: 'Écriture GitHub' },
  deploying: { tone: 'accent', label: 'Déploiement Cloudflare' },
  published: { tone: 'success', label: 'En ligne' },
  superseded: { tone: 'neutral', label: 'Remplacée' },
  failed: { tone: 'danger', label: 'Échec' },
  cancelled: { tone: 'neutral', label: 'Annulée' },
};

const UNKNOWN_TONE = { tone: 'neutral' as StatusTone, label: 'Inconnu' };

function deploymentTone(status: string) {
  return DEPLOYMENT_TONES[status] ?? UNKNOWN_TONE;
}

function releaseTone(status: string) {
  return RELEASE_TONES[status] ?? UNKNOWN_TONE;
}

function syncTone(status: string) {
  return SYNC_LABELS[status] ?? { tone: 'neutral' as StatusTone, label: 'Non vérifié' };
}

const CHECK_TONES: Record<string, StatusTone> = {
  passed: 'success',
  failed: 'danger',
  pending: 'neutral',
};

const SYNC_LABELS: Record<string, { tone: StatusTone; label: string }> = {
  in_sync: { tone: 'success', label: 'À jour' },
  developer_changes: { tone: 'warning', label: 'Commits hors StaX' },
  error: { tone: 'danger', label: 'Erreur' },
  unknown: { tone: 'neutral', label: 'Non vérifié' },
};

interface ReadinessCheck {
  key: string;
  label: string;
  status: 'passed' | 'failed' | 'pending';
  method: 'automatic' | 'manual' | 'computed';
  stale?: boolean;
  evidence?: Record<string, unknown>;
  note?: string | null;
  checkedAt?: string | null;
}

/** Ordre et libelles de la checklist demandee pour chaque livraison. */
const CHECK_ORDER = [
  'deployed',
  'domain',
  'https',
  'manifest',
  'forms',
  'responsive',
  'seo',
  'client_account',
  'plan',
  'repository',
  'hosting',
  'editor',
];

function evidenceSummary(check: ReadinessCheck): string | null {
  const evidence = check.evidence ?? {};
  if (check.method === 'manual') return check.note ?? null;
  if (check.key === 'plan') {
    const problems = (evidence['problems'] as string[] | undefined) ?? [];
    return problems.length ? problems.join(' · ') : null;
  }
  if (check.key === 'seo') {
    const problems = (evidence['problems'] as string[] | undefined) ?? [];
    return problems.length
      ? problems.join(' · ')
      : ((evidence['title'] as string | undefined) ?? null);
  }
  if (check.key === 'domain')
    return (
      (evidence['problem'] as string | undefined) ??
      (evidence['hostname'] as string | undefined) ??
      null
    );
  if (check.key === 'https') {
    const redirect = evidence['httpRedirectsToHttps'];
    return redirect === false
      ? 'http:// ne redirige pas vers https://'
      : ((evidence['error'] as string | undefined) ?? null);
  }
  if (check.key === 'deployed') {
    const production = evidence['production'] as
      { error?: string | null; status?: number | null } | undefined;
    return production?.error ?? (production?.status ? `HTTP ${production.status}` : null);
  }
  if (check.key === 'manifest') {
    const commit = evidence['commit'] as string | undefined;
    return commit ? `commit ${commit.slice(0, 7)}` : null;
  }
  if (check.key === 'client_account') return `${String(evidence['clients'] ?? 0)} compte(s)`;
  return null;
}

export default async function InfrastructurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, session } = await requireAdminRole('support');
  const canAdmin = hasPlatformRole(session.profile, 'platform_admin');
  const canBuild = hasPlatformRole(session.profile, 'designer');

  const site = unwrapMaybe<{
    id: string;
    name: string;
    status: string;
    architecture: string;
    plan_slug: string | null;
    organization_id: string;
    delivered_at: string | null;
    production_release_id: string | null;
    organizations: { name: string } | null;
  }>(
    (await db
      .from('sites')
      .select(
        'id, name, status, architecture, plan_slug, organization_id, delivered_at, ' +
          'production_release_id, organizations ( name )',
      )
      .eq('id', id)
      .maybeSingle()) as never,
  );
  if (!site) notFound();

  const [
    repository,
    hosting,
    installations,
    manifests,
    deployments,
    releases,
    domains,
    readinessResult,
    project,
    order,
    members,
  ] = await Promise.all([
    unwrapMaybe<RepositoryRow>(
      (await db
        .from('site_repositories')
        .select(REPOSITORY_COLUMNS)
        .eq('site_id', site.id)
        .neq('status', 'disconnected')
        .maybeSingle()) as never,
    ),
    unwrapMaybe<HostingRow>(
      (await db
        .from('site_hosting')
        .select(HOSTING_COLUMNS)
        .eq('site_id', site.id)
        .neq('status', 'disconnected')
        .maybeSingle()) as never,
    ),
    unwrapList<{ installation_id: number; account_login: string; suspended_at: string | null }>(
      (await db
        .from('github_installations')
        .select('installation_id, account_login, suspended_at')
        .is('removed_at', null)
        .order('account_login')) as never,
    ),
    unwrapList<ManifestRow>(
      (await db
        .from('site_manifests')
        .select(MANIFEST_COLUMNS)
        .eq('site_id', site.id)
        .order('imported_at', { ascending: false })
        .limit(5)) as never,
    ),
    unwrapList<{
      id: string;
      environment: string;
      status: string;
      commit_sha: string | null;
      branch: string | null;
      url: string | null;
      trigger: string;
      error_message: string | null;
      created_at: string;
      finished_at: string | null;
      provider_deployment_id: string | null;
    }>(
      (await db
        .from('site_deployments')
        .select(
          'id, environment, status, commit_sha, branch, url, trigger, error_message, created_at, ' +
            'finished_at, provider_deployment_id',
        )
        .eq('site_id', site.id)
        .order('created_at', { ascending: false })
        .limit(10)) as never,
    ),
    unwrapList<{
      id: string;
      version_number: number;
      kind: string;
      status: string;
      commit_sha: string | null;
      commit_url: string | null;
      created_at: string;
      published_at: string | null;
      error_stage: string | null;
      error_message: string | null;
      actor_kind: string;
    }>(
      (await db
        .from('site_releases')
        .select(
          'id, version_number, kind, status, commit_sha, commit_url, created_at, published_at, ' +
            'error_stage, error_message, actor_kind',
        )
        .eq('site_id', site.id)
        .order('version_number', { ascending: false })
        .limit(8)) as never,
    ),
    unwrapList<{
      id: string;
      hostname: string;
      status: string;
      is_primary: boolean;
      ssl_status: string | null;
      https_ok: boolean | null;
      dns_target: string | null;
      last_error: string | null;
      served_by: string;
    }>(
      (await db
        .from('site_domains')
        .select(
          'id, hostname, status, is_primary, ssl_status, https_ok, dns_target, last_error, served_by',
        )
        .eq('site_id', site.id)
        .neq('status', 'detached')
        .order('is_primary', { ascending: false })) as never,
    ),
    db.rpc('delivery_readiness', { p_site: site.id }),
    unwrapMaybe<{ status: string; due_at: string | null }>(
      (await db
        .from('projects')
        .select('status, due_at')
        .eq('site_id', site.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()) as never,
    ),
    unwrapMaybe<{
      reference: string;
      status: string;
      maintenance_status: string;
      maintenance_started_at: string | null;
      maintenance_price_cents: number;
      billing_interval: string;
    }>(
      (await db
        .from('orders')
        .select(
          'reference, status, maintenance_status, maintenance_started_at, maintenance_price_cents, billing_interval',
        )
        .eq('site_id', site.id)
        .in('status', ['paid', 'partially_refunded', 'internal'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()) as never,
    ),
    unwrapList<{
      role: string;
      profiles: { email: string; platform_role: string | null } | null;
    }>(
      (await db
        .from('organization_members')
        .select('role, profiles!organization_members_user_id_fkey ( email, platform_role )')
        .eq('organization_id', site.organization_id)) as never,
    ),
  ]);

  const readiness = (readinessResult.data ?? { ready: false, checks: [] }) as {
    ready: boolean;
    checks: ReadinessCheck[];
  };
  const checks = [...readiness.checks].sort(
    (a, b) => CHECK_ORDER.indexOf(a.key) - CHECK_ORDER.indexOf(b.key),
  );
  const activeManifest = manifests.find((manifest) => manifest.is_active) ?? null;
  const lastManifest = manifests[0] ?? null;
  const productionDeployments = deployments.filter(
    (deployment) => deployment.environment === 'production',
  );
  const latestProduction = productionDeployments[0] ?? null;
  const clients = members.filter((member) => member.profiles && !member.profiles.platform_role);
  const delivered = site.delivered_at !== null;
  const primaryDomain = domains.find((domain) => domain.is_primary) ?? null;
  const summary = (activeManifest?.summary ?? {}) as Record<string, unknown>;

  if (site.architecture !== 'external_repository') {
    return (
      <div className="space-y-6">
        <Breadcrumbs site={site} />
        <Alert tone="info" title="Site historique">
          Ce site est servi par l’ancien moteur de rendu de StaX. Il n’a ni dépôt GitHub ni projet
          Cloudflare propres ; sa gestion reste sur sa fiche.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs site={site} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-medium tracking-[-0.02em]">Infrastructure & livraison</h1>
          {delivered ? (
            <StatusPill tone="success">Livré le {when(site.delivered_at)}</StatusPill>
          ) : readiness.ready ? (
            <StatusPill tone="accent">Prêt à livrer</StatusPill>
          ) : (
            <StatusPill tone="warning">En préparation</StatusPill>
          )}
        </div>
        <p className="mt-1.5 max-w-3xl text-sm text-[var(--foreground-muted)]">
          Le site de {site.organizations?.name ?? 'ce client'} est développé dans son propre dépôt,
          déployé par son propre projet Cloudflare, puis rattaché à StaX. Le client en prend la main
          à la livraison : StaX devient alors le panneau de gestion de son site.
        </p>
      </div>

      {!githubAppConfigured() || !cloudflareSitesConfigured() ? (
        <Alert tone="warning" title="Intégrations à configurer">
          {!githubAppConfigured()
            ? 'Application GitHub absente (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_WEBHOOK_SECRET). '
            : ''}
          {!cloudflareSitesConfigured()
            ? 'Jeton Cloudflare absent (CLOUDFLARE_SITES_API_TOKEN). '
            : ''}
          Sans elles, rien n’est simulé : les rattachements, vérifications et publications sont
          refusés.
        </Alert>
      ) : null}

      {/* Etape du projet, visible par le client */}
      {!delivered && canBuild ? (
        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Étape du projet</h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Étape actuelle : <strong>{project?.status ?? 'aucun projet'}</strong>. Le client suit
            cette étape dans son espace.
          </p>
          <div className="mt-4">
            <PhaseForm siteId={site.id} current={project?.status ?? null} />
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        {/* GitHub */}
        <Panel level={1} padding="lg" data-testid="panel-github">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">GitHub</h2>
            {repository ? (
              <StatusPill tone={repository.status === 'connected' ? 'success' : 'danger'}>
                {repository.status === 'connected' ? 'Connecté' : 'Erreur'}
              </StatusPill>
            ) : (
              <StatusPill tone="neutral">Non rattaché</StatusPill>
            )}
          </div>
          {repository ? (
            <>
              <DescriptionList
                className="mt-3"
                items={[
                  {
                    term: 'Dépôt',
                    description: (
                      <a
                        href={repository.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono underline underline-offset-4"
                      >
                        {repository.full_name}
                      </a>
                    ),
                  },
                  {
                    term: 'ID du dépôt',
                    description: <span className="font-mono">{repository.repository_id}</span>,
                  },
                  { term: 'Owner', description: repository.owner_login },
                  {
                    term: 'Branche de production',
                    description: <span className="font-mono">{repository.production_branch}</span>,
                  },
                  {
                    term: 'Branche d’aperçu',
                    description: <span className="font-mono">{repository.preview_branch}</span>,
                  },
                  {
                    term: 'Contrat d’édition',
                    description: <span className="font-mono">{repository.manifest_path}</span>,
                  },
                  {
                    term: 'Dernier commit',
                    description: repository.head_commit_sha ? (
                      <a
                        href={`${repository.html_url}/commit/${repository.head_commit_sha}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono underline underline-offset-4"
                      >
                        {shortSha(repository.head_commit_sha)}
                      </a>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    term: 'Commit de livraison',
                    description: (
                      <span className="font-mono">{shortSha(repository.delivery_commit_sha)}</span>
                    ),
                  },
                  {
                    term: 'Dernière publication StaX',
                    description: (
                      <span className="font-mono">{shortSha(repository.last_stax_commit_sha)}</span>
                    ),
                  },
                  {
                    term: 'Synchronisation',
                    description: (
                      <StatusPill tone={syncTone(repository.sync_status).tone}>
                        {syncTone(repository.sync_status).label}
                      </StatusPill>
                    ),
                  },
                  { term: 'Relu le', description: when(repository.last_synced_at) },
                ]}
              />
              {repository.last_error ? (
                <Alert tone="danger" className="mt-3">
                  {repository.last_error}
                </Alert>
              ) : null}
              {repository.sync_status === 'developer_changes' ? (
                <Alert tone="warning" className="mt-3">
                  Des commits ont été poussés hors de StaX depuis la dernière publication. Si le
                  contrat d’édition a changé, réimportez le manifeste avant la prochaine
                  publication.
                </Alert>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton action={refreshRepositoryAction} payload={{ siteId: site.id }}>
                  Relire le dépôt
                </ActionButton>
                {canAdmin ? <DisconnectButton siteId={site.id} target="repository" /> : null}
              </div>
            </>
          ) : canAdmin ? (
            <div className="mt-4 space-y-4">
              <ConnectRepositoryForm
                siteId={site.id}
                installations={installations
                  .filter((installation) => !installation.suspended_at)
                  .map((installation) => ({
                    id: installation.installation_id,
                    account: installation.account_login,
                  }))}
                currentBranch={null}
              />
              <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                <ActionButton
                  action={syncInstallationsAction}
                  payload={{ siteId: site.id }}
                  variant="ghost"
                >
                  Synchroniser les installations
                </ActionButton>
                {githubAppInstallUrl() ? (
                  <a
                    href={githubAppInstallUrl() ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    Installer l’application GitHub StaX
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">Aucun dépôt rattaché.</p>
          )}
        </Panel>

        {/* Cloudflare */}
        <Panel level={1} padding="lg" data-testid="panel-cloudflare">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Cloudflare</h2>
            {hosting ? (
              <StatusPill tone={hosting.status === 'connected' ? 'success' : 'danger'}>
                {hosting.status === 'connected' ? 'Connecté' : 'Erreur'}
              </StatusPill>
            ) : (
              <StatusPill tone="neutral">Non rattaché</StatusPill>
            )}
          </div>
          {hosting ? (
            <>
              <DescriptionList
                className="mt-3"
                items={[
                  {
                    term: 'Type',
                    description:
                      hosting.provider === 'cloudflare_pages'
                        ? 'Cloudflare Pages'
                        : 'Cloudflare Worker',
                  },
                  {
                    term: 'Projet',
                    description: <span className="font-mono">{hosting.project_name}</span>,
                  },
                  {
                    term: 'ID du projet',
                    description: <span className="font-mono">{hosting.project_id ?? '—'}</span>,
                  },
                  {
                    term: 'Compte',
                    description: <span className="font-mono">{hosting.account_id}</span>,
                  },
                  {
                    term: 'URL de production',
                    description: (
                      <a
                        href={hosting.production_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4"
                      >
                        {hosting.production_url}
                      </a>
                    ),
                  },
                  {
                    term: 'Dernier déploiement',
                    description: latestProduction ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <StatusPill tone={deploymentTone(latestProduction.status).tone}>
                          {deploymentTone(latestProduction.status).label}
                        </StatusPill>
                        <span className="text-xs text-[var(--muted)]">
                          {when(latestProduction.finished_at ?? latestProduction.created_at)} ·
                          commit {shortSha(latestProduction.commit_sha)}
                        </span>
                      </span>
                    ) : (
                      'Aucun'
                    ),
                  },
                  { term: 'Relu le', description: when(hosting.last_synced_at) },
                ]}
              />
              {hosting.last_error ? (
                <Alert tone="danger" className="mt-3">
                  {hosting.last_error}
                </Alert>
              ) : null}
              {deployments.length > 0 ? (
                <ul className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)] text-sm">
                  {deployments.slice(0, 6).map((deployment) => {
                    const tone = deploymentTone(deployment.status);
                    return (
                      <li
                        key={deployment.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <StatusPill tone={tone.tone}>{tone.label}</StatusPill>
                          <Badge>
                            {deployment.environment === 'production' ? 'Production' : 'Aperçu'}
                          </Badge>
                          <span className="font-mono text-xs">
                            {shortSha(deployment.commit_sha)}
                          </span>
                          <span className="text-xs text-[var(--muted)]">
                            {when(deployment.created_at)}
                          </span>
                        </span>
                        {canAdmin &&
                        ['failure', 'canceled', 'skipped'].includes(deployment.status) ? (
                          <ActionButton
                            action={retryDeploymentAction}
                            payload={{ siteId: site.id, deploymentId: deployment.id }}
                            variant="ghost"
                          >
                            Relancer
                          </ActionButton>
                        ) : null}
                        {deployment.error_message ? (
                          <p className="w-full text-xs break-words text-[var(--danger)]">
                            {deployment.error_message}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton action={refreshDeploymentsAction} payload={{ siteId: site.id }}>
                  Relire les déploiements
                </ActionButton>
                {canAdmin ? <DisconnectButton siteId={site.id} target="hosting" /> : null}
              </div>
            </>
          ) : canAdmin ? (
            <div className="mt-4">
              <ConnectHostingForm
                siteId={site.id}
                defaultAccountId={defaultCloudflareAccountId()}
                defaultBranch={repository?.production_branch ?? null}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">Aucun projet rattaché.</p>
          )}
        </Panel>

        {/* Domaine */}
        <Panel level={1} padding="lg" data-testid="panel-domain">
          <h2 className="text-sm font-medium">Domaine</h2>
          {domains.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Aucun domaine rattaché.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--border)] border-t border-[var(--border)]">
              {domains.map((domain) => (
                <li key={domain.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono">{domain.hostname}</span>
                    <span className="flex flex-wrap gap-2">
                      {domain.is_primary ? <Badge>Principal</Badge> : <Badge>Secondaire</Badge>}
                      <StatusPill
                        tone={
                          domain.status === 'active'
                            ? 'success'
                            : domain.status === 'failed'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {domain.status === 'active'
                          ? 'Actif'
                          : domain.status === 'failed'
                            ? 'Erreur'
                            : 'En vérification'}
                      </StatusPill>
                      <StatusPill
                        tone={
                          domain.https_ok
                            ? 'success'
                            : domain.https_ok === false
                              ? 'danger'
                              : 'neutral'
                        }
                      >
                        HTTPS{' '}
                        {domain.https_ok
                          ? 'valide'
                          : domain.https_ok === false
                            ? 'en échec'
                            : 'non vérifié'}
                      </StatusPill>
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {domain.served_by === 'cloudflare_project'
                      ? `CNAME vers ${domain.dns_target ?? 'le projet Cloudflare'}`
                      : 'Servi par l’ancien moteur StaX'}
                  </p>
                  {domain.last_error ? (
                    <p className="mt-1 text-xs text-[var(--danger)]">{domain.last_error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {hosting && canAdmin ? (
            <div className="mt-4 space-y-3">
              <AddDomainForm siteId={site.id} hasPrimary={primaryDomain !== null} />
              <ActionButton action={syncDomainsAction} payload={{ siteId: site.id }}>
                Vérifier les domaines chez Cloudflare
              </ActionButton>
            </div>
          ) : null}
        </Panel>

        {/* StaX : contrat d'edition */}
        <Panel level={1} padding="lg" data-testid="panel-contract">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">StaX · contrat d’édition</h2>
            {activeManifest ? (
              <StatusPill tone="success">Manifest valide</StatusPill>
            ) : (
              <StatusPill tone="warning">Aucun manifeste actif</StatusPill>
            )}
          </div>
          <DescriptionList
            className="mt-3"
            items={[
              {
                term: 'Version de contrat',
                description: `v${activeManifest?.contract_version ?? CONTRACT_VERSION} (StaX lit la v${CONTRACT_VERSION})`,
              },
              {
                term: 'Commit du manifeste',
                description: (
                  <span className="font-mono">{shortSha(activeManifest?.commit_sha)}</span>
                ),
              },
              { term: 'Importé le', description: when(activeManifest?.imported_at) },
              {
                term: 'Zones modifiables',
                description: activeManifest
                  ? `${String(summary['pages'] ?? 0)} page(s), ${String(summary['sections'] ?? 0)} section(s), ${String(summary['fields'] ?? 0)} champ(s), ${String(summary['collections'] ?? 0)} collection(s), ${String(summary['forms'] ?? 0)} formulaire(s), ${String(summary['locales'] ?? 1)} langue(s)`
                  : '—',
              },
              {
                term: 'Éditeur compatible',
                description: site.production_release_id ? (
                  <StatusPill tone="success">Contenu initialisé</StatusPill>
                ) : (
                  <StatusPill tone="warning">Contenu initial à reprendre</StatusPill>
                ),
              },
              {
                term: 'Schéma',
                description: (
                  <a
                    href={MANIFEST_SCHEMA_URL}
                    className="underline underline-offset-4"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    stax.manifest.v1.json
                  </a>
                ),
              },
            ]}
          />
          {lastManifest && lastManifest.status === 'invalid' ? (
            <Alert
              tone="danger"
              className="mt-3"
              title={`Dernier import invalide (commit ${shortSha(lastManifest.commit_sha)})`}
            >
              <ul className="list-disc space-y-1 pl-5">
                {lastManifest.errors.slice(0, 8).map((issue) => (
                  <li key={`${issue.path}-${issue.message}`}>
                    <span className="font-mono text-xs">{issue.path || '(racine)'}</span> —{' '}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {activeManifest && activeManifest.warnings.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[var(--warning)]">
              {activeManifest.warnings.map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
          {canAdmin ? (
            <div className="mt-4 flex flex-wrap items-start gap-3">
              <ImportManifestButton siteId={site.id} disabled={!repository} />
              {activeManifest && !site.production_release_id ? (
                <ActionButton action={initializeContentAction} payload={{ siteId: site.id }}>
                  Reprendre le contenu initial
                </ActionButton>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>

      {/* Checklist */}
      <Panel level={2} padding="lg" data-testid="delivery-checklist">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Checklist de livraison</h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Les contrôles automatiques interrogent le site en ligne et gardent leur preuve 24
              heures. Les autres s’attestent, à votre nom, avec ce qui a été vérifié.
            </p>
          </div>
          {canAdmin ? (
            <ActionButton action={runChecksAction} payload={{ siteId: site.id }} variant="primary">
              Lancer les vérifications
            </ActionButton>
          ) : null}
        </div>
        <ul className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {checks.map((check) => {
            const detail = evidenceSummary(check);
            return (
              <li key={check.key} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <StatusPill tone={CHECK_TONES[check.status] ?? 'neutral'}>
                      {check.status === 'passed'
                        ? 'OK'
                        : check.status === 'failed'
                          ? 'Échec'
                          : 'À faire'}
                    </StatusPill>
                    <span className="font-medium">{check.label}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {check.method === 'manual'
                        ? 'attestation'
                        : check.method === 'automatic'
                          ? 'contrôle réel'
                          : 'calculé'}
                      {check.stale ? ' · preuve expirée, relancez' : ''}
                      {check.checkedAt ? ` · ${when(check.checkedAt)}` : ''}
                    </span>
                  </p>
                  {detail ? (
                    <p className="mt-1 text-xs break-words text-[var(--foreground-muted)]">
                      {detail}
                    </p>
                  ) : null}
                </div>
                {canAdmin && (check.key === 'forms' || check.key === 'responsive') ? (
                  <AttestForm siteId={site.id} checkKey={check.key} label={check.label} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* Livraison */}
      <Panel level={2} padding="lg" data-testid="delivery-panel">
        <h2 className="text-sm font-medium">Livraison</h2>
        {delivered ? (
          <div className="mt-3 space-y-3 text-sm">
            <p>
              Livré le <strong>{when(site.delivered_at)}</strong>. Le client modifie les zones
              prévues par le contrat d’édition, prévisualise et publie ; chaque publication crée un
              commit dans le dépôt puis un déploiement Cloudflare.
            </p>
            {order ? (
              <p className="text-[var(--foreground-muted)]">
                Maintenance (
                {formatMoney(order.maintenance_price_cents, 'EUR', { hideDecimalsWhenRound: true })}{' '}
                HT / {order.billing_interval === 'month' ? 'mois' : 'an'}) :{' '}
                <strong>
                  {order.maintenance_status === 'started'
                    ? `démarrée le ${when(order.maintenance_started_at)}`
                    : order.maintenance_status === 'failed'
                      ? 'démarrage en échec'
                      : order.maintenance_status === 'pending_delivery'
                        ? 'en attente'
                        : order.maintenance_status === 'waived'
                          ? 'non facturée (compte interne)'
                          : 'non applicable'}
                </strong>
              </p>
            ) : null}
            {canAdmin &&
            order &&
            ['failed', 'pending_delivery'].includes(order.maintenance_status) ? (
              <ActionButton action={retryMaintenanceAction} payload={{ siteId: site.id }}>
                Démarrer la maintenance
              </ActionButton>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-[var(--foreground-muted)]">
              Livrer le site ouvre l’éditeur au client (et à lui seul, avec les rôles de son
              organisation) et démarre la maintenance mensuelle. Avant, le client ne peut rien
              modifier : c’est la base de données qui l’interdit.
            </p>
            <p className="text-sm">
              Compte(s) client :{' '}
              {clients.length > 0
                ? clients.map((member) => member.profiles?.email).join(', ')
                : 'aucun pour l’instant'}
            </p>
            {canAdmin ? (
              <DeliverForm
                siteId={site.id}
                ready={readiness.ready}
                hasClient={clients.length > 0}
              />
            ) : null}
          </div>
        )}
      </Panel>

      {/* Versions */}
      <Panel level={1} padding="lg">
        <h2 className="text-sm font-medium">Versions publiées</h2>
        {releases.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Aucune version pour l’instant.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {releases.map((release) => {
              const tone = releaseTone(release.status);
              return (
                <li key={release.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Version {release.version_number}</span>
                    <StatusPill tone={tone.tone}>{tone.label}</StatusPill>
                    <Badge>
                      {release.kind === 'rollback'
                        ? 'Restauration'
                        : release.kind === 'import'
                          ? 'Mise en ligne initiale'
                          : 'Publication'}
                    </Badge>
                    {release.commit_url ? (
                      <a
                        href={release.commit_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs underline underline-offset-4"
                      >
                        {shortSha(release.commit_sha)}
                      </a>
                    ) : null}
                    <span className="text-xs text-[var(--muted)]">
                      {when(release.published_at ?? release.created_at)} ·{' '}
                      {release.actor_kind === 'member' ? 'client' : 'StaX'}
                    </span>
                  </div>
                  {release.error_message ? (
                    <p className="mt-1 text-xs text-[var(--danger)]">
                      {release.error_stage ? `[${release.error_stage}] ` : ''}
                      {release.error_message}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Breadcrumbs({ site }: { site: { id: string; name: string } }) {
  return (
    <p className="text-sm text-[var(--foreground-muted)]">
      <Link href="/admin/sites" className="underline underline-offset-4">
        Sites
      </Link>
      {' · '}
      <Link href={`/admin/sites/${site.id}`} className="underline underline-offset-4">
        {site.name}
      </Link>
      {' · Infrastructure & livraison'}
    </p>
  );
}

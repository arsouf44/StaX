import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveBusiness } from '@stax/business';
import { unwrapList, unwrapMaybe } from '@stax/database';
import { formatMoney } from '@stax/payments';
import { hasPlatformRole } from '@stax/auth';
import { Alert, Badge, DescriptionList, Panel, Stat, StatusPill, type StatusTone } from '@stax/ui';
import { requireAdminRole } from '~/lib/admin';
import { SiteAdminActions, type ActivationCodeView, type AdminVersionView } from './site-actions';

export const metadata: Metadata = { title: 'Site' };

/**
 * Fiche d'un site client.
 *
 * Elle rassemble ce qu'on a besoin de savoir quand un client appelle : ou en
 * est son site, sur quelles adresses il repond, ce qui a ete publie et quand,
 * ce qu'il paie, et ce qu'on peut faire pour lui.
 *
 * La lecture passe par le JETON de la personne : les policies
 * `app.is_platform_staff()` decident de ce qui est visible. La cle de service,
 * qui contourne tout, n'est pas utilisee.
 */

const STATUS_TONES: Record<string, { tone: StatusTone; label: string; help: string }> = {
  draft: { tone: 'neutral', label: 'Brouillon', help: 'Créé, pas encore construit.' },
  building: {
    tone: 'accent',
    label: 'En construction',
    help: 'En cours de réalisation chez nous.',
  },
  review: {
    tone: 'warning',
    label: 'En relecture client',
    help: 'Le client doit le relire et donner son accord.',
  },
  ready: {
    tone: 'accent',
    label: 'Prêt à publier',
    help: 'Validé, en attente de mise en ligne.',
  },
  live: { tone: 'success', label: 'En ligne', help: 'Accessible au public.' },
  suspended: {
    tone: 'danger',
    label: 'Suspendu',
    help: 'Inaccessible au public. Rien n’est supprimé.',
  },
  archived: { tone: 'neutral', label: 'Archivé', help: 'Hors exploitation, données conservées.' },
};

const DOMAIN_TONES: Record<string, StatusTone> = {
  active: 'success',
  pending: 'warning',
  verifying: 'warning',
  failed: 'danger',
  expired: 'danger',
};

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

function when(value: string | null | undefined, formatter = DATE_TIME): string {
  return value ? formatter.format(new Date(value)) : 'Jamais';
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, session } = await requireAdminRole('support');

  const site = unwrapMaybe<{
    id: string;
    name: string;
    slug: string;
    status: string;
    plan_slug: string | null;
    business_type_slug: string | null;
    is_demo: boolean;
    timezone: string;
    created_at: string;
    first_published_at: string | null;
    last_published_at: string | null;
    suspended_at: string | null;
    archived_at: string | null;
    published_version_id: string | null;
    organization_id: string;
    organizations: { name: string; slug: string } | null;
  }>(
    (await db
      .from('sites')
      .select(
        'id, name, slug, status, plan_slug, business_type_slug, is_demo, timezone, created_at, ' +
          'first_published_at, last_published_at, suspended_at, archived_at, ' +
          'published_version_id, organization_id, organizations ( name, slug )',
      )
      .eq('id', id)
      .maybeSingle()) as never,
  );

  // Un site inexistant et un site hors de portee donnent la meme reponse : la
  // RLS a deja filtre, on ne confirme rien de plus.
  if (!site) notFound();

  const [domains, versions, codes, project, subscription, counters] = await Promise.all([
    unwrapList<{
      id: string;
      hostname: string;
      status: string;
      kind: string;
      is_primary: boolean;
      ssl_status: string | null;
      last_error: string | null;
    }>(
      (await db
        .from('site_domains')
        .select('id, hostname, status, kind, is_primary, ssl_status, last_error')
        .eq('site_id', site.id)
        .order('is_primary', { ascending: false })) as never,
    ),
    unwrapList<{
      id: string;
      version_number: number;
      label: string | null;
      published_at: string | null;
    }>(
      (await db
        .from('site_versions')
        .select('id, version_number, label, published_at')
        .eq('site_id', site.id)
        .not('published_at', 'is', null)
        .order('version_number', { ascending: false })
        .limit(15)) as never,
    ),
    unwrapList<{
      id: string;
      code_hint: string;
      email_constraint: string | null;
      granted_role: string;
      expires_at: string;
      used_at: string | null;
      revoked_at: string | null;
    }>(
      (await db
        .from('activation_codes')
        .select('id, code_hint, email_constraint, granted_role, expires_at, used_at, revoked_at')
        .eq('site_id', site.id)
        .order('created_at', { ascending: false })
        .limit(10)) as never,
    ),
    unwrapMaybe<{ status: string; go_live_at: string | null; delivery_due_at: string | null }>(
      (await db
        .from('projects')
        .select('status, go_live_at, delivery_due_at')
        .eq('site_id', site.id)
        .maybeSingle()) as never,
    ),
    unwrapMaybe<{
      status: string;
      maintenance_price_cents: number;
      billing_interval: string;
      current_period_end: string | null;
    }>(
      (await db
        .from('subscriptions')
        .select('status, maintenance_price_cents, billing_interval, current_period_end')
        .eq('site_id', site.id)
        .maybeSingle()) as never,
    ),
    Promise.all([
      db.from('site_pages').select('id', { count: 'exact', head: true }).eq('site_id', site.id),
      db
        .from('form_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .eq('status', 'unread'),
      db
        .from('shop_orders')
        .select('id', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .eq('status', 'paid'),
    ]),
  ]);

  const [pageCount, unreadCount, paidOrders] = counters;
  const state = STATUS_TONES[site.status] ?? {
    tone: 'neutral' as StatusTone,
    label: site.status,
    help: '',
  };
  const business = resolveBusiness(site.business_type_slug);
  const canAct = hasPlatformRole(session.profile, 'platform_admin');

  const versionViews: AdminVersionView[] = versions.flatMap((row) =>
    row.published_at
      ? [
          {
            id: row.id,
            number: row.version_number,
            label: row.label,
            publishedLabel: DATE_TIME.format(new Date(row.published_at)),
            isCurrent: row.id === site.published_version_id,
          },
        ]
      : [],
  );

  // L'expiration se juge a l'heure du SERVEUR : l'horloge d'un poste peut etre
  // fausse, et un code presente comme actif alors qu'il ne l'est plus ferait
  // perdre un appel au client.
  const now = new Date();
  const codeViews: ActivationCodeView[] = codes.map((row) => ({
    id: row.id,
    hint: row.code_hint,
    email: row.email_constraint,
    role: row.granted_role,
    expiresLabel: DATE.format(new Date(row.expires_at)),
    state: row.used_at
      ? 'used'
      : row.revoked_at
        ? 'revoked'
        : new Date(row.expires_at) < now
          ? 'expired'
          : 'active',
  }));

  const primary = domains.find((domain) => domain.is_primary && domain.status === 'active');

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-[var(--foreground-muted)]">
          <Link href="/admin/sites" className="underline underline-offset-4">
            Sites
          </Link>
          {site.organizations ? (
            <>
              {' · '}
              <Link
                href={`/admin/organisations?q=${encodeURIComponent(site.organizations.name)}`}
                className="underline underline-offset-4"
              >
                {site.organizations.name}
              </Link>
            </>
          ) : null}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-medium tracking-[-0.02em]">{site.name}</h1>
          <StatusPill tone={state.tone}>{state.label}</StatusPill>
          {site.is_demo ? <Badge>Démonstration</Badge> : null}
        </div>
        <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">{state.help}</p>
      </div>

      {site.status === 'suspended' ? (
        <Alert tone="warning" live="status" title="Site suspendu">
          Suspendu {when(site.suspended_at)}. Le contenu, les commandes et les messages sont intacts
          : une réactivation le remet en ligne tel quel.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pages" value={String(pageCount?.count ?? 0)} />
        <Stat label="Messages non lus" value={String(unreadCount?.count ?? 0)} />
        <Stat label="Commandes payées" value={String(paidOrders?.count ?? 0)} />
        <Stat
          label="Maintenance"
          value={
            subscription
              ? formatMoney(subscription.maintenance_price_cents, 'EUR', {
                  hideDecimalsWhenRound: true,
                })
              : '—'
          }
          hint={
            subscription
              ? `${subscription.status} · ${subscription.billing_interval === 'month' ? 'par mois' : 'par an'}`
              : 'Aucun contrat de maintenance'
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Fiche</h2>
          <DescriptionList
            className="mt-3"
            items={[
              { term: 'Offre', description: site.plan_slug ?? 'Non définie' },
              { term: 'Métier', description: business.name },
              { term: 'Identifiant interne', description: site.slug },
              { term: 'Fuseau horaire', description: site.timezone },
              { term: 'Créé le', description: when(site.created_at, DATE) },
              { term: 'Première mise en ligne', description: when(site.first_published_at) },
              { term: 'Dernière publication', description: when(site.last_published_at) },
              {
                term: 'Projet',
                description: project
                  ? `${project.status}${project.delivery_due_at ? ` · livraison prévue ${DATE.format(new Date(project.delivery_due_at))}` : ''}`
                  : 'Aucun projet de suivi',
              },
              {
                term: 'Adresse publique',
                description: primary ? (
                  <a
                    href={`https://${primary.hostname}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    {primary.hostname}
                  </a>
                ) : (
                  'Aucune adresse active'
                ),
              },
            ]}
          />
        </Panel>

        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Noms de domaine</h2>
          {domains.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Aucun domaine rattaché.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--border)] border-t border-[var(--border)]">
              {domains.map((domain) => (
                <li key={domain.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm">{domain.hostname}</span>
                    <StatusPill tone={DOMAIN_TONES[domain.status] ?? 'neutral'}>
                      {domain.status}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {domain.kind}
                    {domain.is_primary ? ' · principal' : ''}
                    {domain.ssl_status ? ` · TLS ${domain.ssl_status}` : ''}
                  </p>
                  {domain.last_error ? (
                    <p className="mt-1 text-xs text-[var(--danger)]">{domain.last_error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <SiteAdminActions
        siteId={site.id}
        siteName={site.name}
        status={site.status}
        canAct={canAct}
        versions={versionViews}
        codes={codeViews}
      />
    </div>
  );
}

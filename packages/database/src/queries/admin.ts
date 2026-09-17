import type { Cents, UUID } from '@stax/types';
import { type Db, unwrapList } from '../client';

/**
 * Requetes du back-office.
 *
 * Elles s executent avec le JWT du membre de l equipe : la RLS accorde une
 * lecture transverse au personnel plateforme, mais les ecritures restent
 * limitees aux roles habilites. Le service role n est PAS utilise ici.
 */

export interface AdminOverview {
  mrrCents: Cents;
  activeSubscriptions: number;
  revenueLast30dCents: Cents;
  ordersToProcess: number;
  paidOrdersLast30d: number;
  clients: number;
  liveSites: number;
  sitesInProgress: number;
  sitesAwaitingReview: number;
  domainsPending: number;
  domainsFailed: number;
  failedPayments: number;
  openRefundRequests: number;
  openQuotes: number;
  urgentTickets: number;
  atRiskSubscriptions: number;
}

async function countOf(
  db: Db,
  table: string,
  build: (q: ReturnType<Db['from']>) => unknown,
): Promise<number> {
  const query = db.from(table).select('id', { count: 'exact', head: true });
  const result = (await build(query as never)) as { count: number | null; error: unknown };
  return result.count ?? 0;
}

export async function loadAdminOverview(db: Db): Promise<AdminOverview> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [subscriptions, payments] = await Promise.all([
    unwrapList<{ monthly_price_cents: number; status: string }>(
      (await db
        .from('subscriptions')
        .select('monthly_price_cents, status')
        .in('status', ['active', 'trialing', 'past_due', 'cancel_at_period_end'])) as never,
    ),
    unwrapList<{ amount_cents: number; amount_refunded_cents: number }>(
      (await db
        .from('payments')
        .select('amount_cents, amount_refunded_cents')
        .eq('scope', 'platform')
        .eq('status', 'succeeded')
        .gte('created_at', since)) as never,
    ),
  ]);

  // Revenu recurrent mensuel : seuls les contrats reellement facturables.
  const billable = subscriptions.filter(
    (s) => s.status === 'active' || s.status === 'cancel_at_period_end',
  );
  const mrrCents = billable.reduce((total, s) => total + s.monthly_price_cents, 0);
  const revenueLast30dCents = payments.reduce(
    (total, p) => total + p.amount_cents - p.amount_refunded_cents,
    0,
  );

  const [
    ordersToProcess,
    paidOrdersLast30d,
    clients,
    liveSites,
    sitesInProgress,
    sitesAwaitingReview,
    domainsPending,
    domainsFailed,
    failedPayments,
    openRefundRequests,
    openQuotes,
    urgentTickets,
    atRiskSubscriptions,
  ] = await Promise.all([
    countOf(db, 'projects', (q) =>
      (q as never as { in: (c: string, v: string[]) => unknown }).in('status', [
        'ordered',
        'questionnaire_pending',
        'assets_pending',
      ]),
    ),
    countOf(db, 'orders', (q) =>
      (q as never as { eq: (c: string, v: string) => { gte: (c: string, v: string) => unknown } })
        .eq('status', 'paid')
        .gte('created_at', since),
    ),
    countOf(db, 'organizations', (q) =>
      (q as never as { eq: (c: string, v: unknown) => unknown }).eq('is_demo', false),
    ),
    countOf(db, 'sites', (q) =>
      (q as never as { eq: (c: string, v: string) => unknown }).eq('status', 'live'),
    ),
    countOf(db, 'sites', (q) =>
      (q as never as { in: (c: string, v: string[]) => unknown }).in('status', [
        'draft',
        'building',
      ]),
    ),
    countOf(db, 'sites', (q) =>
      (q as never as { in: (c: string, v: string[]) => unknown }).in('status', ['review', 'ready']),
    ),
    countOf(db, 'site_domains', (q) =>
      (q as never as { in: (c: string, v: string[]) => unknown }).in('status', [
        'pending',
        'verifying',
      ]),
    ),
    countOf(db, 'site_domains', (q) =>
      (q as never as { in: (c: string, v: string[]) => unknown }).in('status', [
        'failed',
        'expired',
      ]),
    ),
    countOf(db, 'payments', (q) =>
      (q as never as { eq: (c: string, v: string) => { gte: (c: string, v: string) => unknown } })
        .eq('status', 'failed')
        .gte('created_at', since),
    ),
    countOf(db, 'refund_requests', (q) =>
      (q as never as { in: (c: string, v: string[]) => unknown }).in('status', [
        'requested',
        'under_review',
        'approved',
        'processing',
      ]),
    ),
    countOf(db, 'quotes', (q) =>
      (q as never as { in: (c: string, v: string[]) => unknown }).in('status', [
        'draft',
        'sent',
        'viewed',
      ]),
    ),
    countOf(db, 'support_tickets', (q) =>
      (
        q as never as {
          in: (c: string, v: string[]) => { in: (c: string, v: string[]) => unknown };
        }
      )
        .in('priority', ['high', 'urgent'])
        .in('status', ['open', 'waiting_support']),
    ),
    countOf(db, 'subscriptions', (q) =>
      (q as never as { in: (c: string, v: string[]) => unknown }).in('status', [
        'past_due',
        'unpaid',
      ]),
    ),
  ]);

  return {
    mrrCents,
    activeSubscriptions: billable.length,
    revenueLast30dCents,
    ordersToProcess,
    paidOrdersLast30d,
    clients,
    liveSites,
    sitesInProgress,
    sitesAwaitingReview,
    domainsPending,
    domainsFailed,
    failedPayments,
    openRefundRequests,
    openQuotes,
    urgentTickets,
    atRiskSubscriptions,
  };
}

export interface AdminSearchResult {
  kind: 'organization' | 'site' | 'order' | 'domain' | 'user' | 'quote';
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

/**
 * Recherche globale de l administration.
 * Les motifs sont echappes avant d etre passes a `ilike` pour qu un `%` saisi
 * par l operateur reste un caractere litteral.
 */
export async function adminSearch(db: Db, rawQuery: string): Promise<AdminSearchResult[]> {
  const term = rawQuery.trim();
  if (term.length < 2) return [];
  const pattern = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

  const [orgs, sites, orders, domains, users, quotes] = await Promise.all([
    unwrapList<{ id: string; name: string; slug: string }>(
      (await db
        .from('organizations')
        .select('id, name, slug')
        .ilike('name', pattern)
        .limit(5)) as never,
    ),
    unwrapList<{ id: string; name: string; slug: string; status: string }>(
      (await db
        .from('sites')
        .select('id, name, slug, status')
        .ilike('name', pattern)
        .limit(5)) as never,
    ),
    unwrapList<{ id: string; reference: string; status: string; total_cents: number }>(
      (await db
        .from('orders')
        .select('id, reference, status, total_cents')
        .ilike('reference', pattern)
        .limit(5)) as never,
    ),
    unwrapList<{ id: string; hostname: string; site_id: string; status: string }>(
      (await db
        .from('site_domains')
        .select('id, hostname, site_id, status')
        .ilike('hostname', pattern)
        .limit(5)) as never,
    ),
    unwrapList<{ id: string; email: string; full_name: string | null }>(
      (await db
        .from('profiles')
        .select('id, email, full_name')
        .ilike('email', pattern)
        .limit(5)) as never,
    ),
    unwrapList<{ id: string; reference: string; contact_name: string; status: string }>(
      (await db
        .from('quotes')
        .select('id, reference, contact_name, status')
        .or(`reference.ilike.${pattern},contact_email.ilike.${pattern}`)
        .limit(5)) as never,
    ),
  ]);

  return [
    ...orgs.map((o) => ({
      kind: 'organization' as const,
      id: o.id,
      title: o.name,
      subtitle: o.slug,
      href: `/admin/clients/${o.id}`,
    })),
    ...sites.map((s) => ({
      kind: 'site' as const,
      id: s.id,
      title: s.name,
      subtitle: s.status,
      href: `/admin/sites/${s.id}`,
    })),
    ...orders.map((o) => ({
      kind: 'order' as const,
      id: o.id,
      title: o.reference,
      subtitle: o.status,
      href: `/admin/commandes/${o.id}`,
    })),
    ...domains.map((d) => ({
      kind: 'domain' as const,
      id: d.id,
      title: d.hostname,
      subtitle: d.status,
      href: `/admin/domaines?q=${encodeURIComponent(d.hostname)}`,
    })),
    ...users.map((u) => ({
      kind: 'user' as const,
      id: u.id,
      title: u.full_name ?? u.email,
      subtitle: u.email,
      href: `/admin/utilisateurs/${u.id}`,
    })),
    ...quotes.map((q) => ({
      kind: 'quote' as const,
      id: q.id,
      title: q.reference,
      subtitle: q.contact_name,
      href: `/admin/devis/${q.id}`,
    })),
  ];
}

export interface SystemHealthView {
  key: string;
  label: string;
  status: 'unknown' | 'healthy' | 'degraded' | 'failing' | 'not_configured';
  detail: string | null;
  observedAt: string | null;
}

export async function loadSystemHealth(db: Db): Promise<SystemHealthView[]> {
  const rows = unwrapList<{
    key: string;
    label: string;
    status: SystemHealthView['status'];
    detail: string | null;
    observed_at: string | null;
  }>((await db.from('system_health').select('*').order('key')) as never);

  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    status: row.status,
    detail: row.detail,
    observedAt: row.observed_at,
  }));
}

export async function listAuditLog(
  db: Db,
  options: { organizationId?: UUID; limit?: number } = {},
) {
  let query = db
    .from('audit_logs')
    .select(
      'id, actor_email, actor_type, action, target_type, target_id, metadata_safe, created_at, organization_id, site_id',
    )
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 50);

  if (options.organizationId) query = query.eq('organization_id', options.organizationId);

  return unwrapList<{
    id: string;
    actor_email: string | null;
    actor_type: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    metadata_safe: Record<string, unknown>;
    created_at: string;
    organization_id: string | null;
    site_id: string | null;
  }>((await query) as never);
}

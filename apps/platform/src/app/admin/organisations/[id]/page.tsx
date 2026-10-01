import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ROLE_LABELS, statusLabel, type StatusLabel } from '@nemasus/business';
import { unwrapList, unwrapMaybe } from '@nemasus/database';
import { formatMaintenance, formatMoney, ORDER_STATUS_LABELS } from '@nemasus/payments';
import {
  Alert,
  Badge,
  DescriptionList,
  Panel,
  Stat,
  StatusPill,
  type StatusTone,
} from '@nemasus/ui';
import { requireAdminRole } from '~/lib/admin';
import { auditActionLabel } from '~/lib/audit-labels';
import {
  INVOICE_STATUSES,
  PROJECT_STATUSES,
  SITE_STATUSES,
  SUBSCRIPTION_STATUSES,
  TICKET_STATUSES,
} from '~/lib/admin-views';

export const metadata: Metadata = { title: 'Organisation' };

/**
 * Fiche d'une organisation cliente.
 *
 * Tout ce qu'il faut avoir sous les yeux quand un client appelle : qui il est,
 * qui a accès à son espace, ses sites, ce qu'il a commandé et ce qu'il paie,
 * ses demandes en cours et les dernières actions tracées.
 *
 * Lecture avec le JETON de la personne : les policies `app.is_platform_staff()`
 * décident de ce qui remonte. Une section que la base ne laisse pas lire reste
 * simplement vide.
 */

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });
const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

const ORDER_TONES: Record<string, StatusTone> = {
  draft: 'neutral',
  checkout_pending: 'info',
  paid: 'success',
  cancelled: 'neutral',
  refunded: 'warning',
  partially_refunded: 'warning',
};

function Pill({ table, value }: { table: Record<string, StatusLabel>; value: string }) {
  const entry = statusLabel(table, value);
  return <StatusPill tone={entry.tone as StatusTone}>{entry.label}</StatusPill>;
}

function Section({
  title,
  count,
  action,
  empty,
  children,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Panel level={1} padding="lg">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          {title}
          <span className="ml-2 text-[var(--muted)] tabular-nums">{count}</span>
        </h2>
        {action}
      </div>
      {count === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border)]">{children}</ul>
      )}
    </Panel>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
      {children}
    </li>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db } = await requireAdminRole('support');

  const organization = unwrapMaybe<{
    id: string;
    name: string;
    slug: string;
    legal_name: string | null;
    siret: string | null;
    vat_number: string | null;
    address_line1: string | null;
    address_line2: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
    website: string | null;
    billing_email: string | null;
    stripe_customer_id: string | null;
    status: string;
    is_demo: boolean;
    suspended_at: string | null;
    suspension_reason: string | null;
    account_type: string;
    created_at: string;
  }>(
    (await db
      .from('organizations')
      .select(
        'id, name, slug, legal_name, siret, vat_number, address_line1, address_line2, postal_code, ' +
          'city, country, phone, website, billing_email, stripe_customer_id, status, is_demo, ' +
          'suspended_at, suspension_reason, account_type, created_at',
      )
      .eq('id', id)
      .maybeSingle()) as never,
  );
  // Inexistante ou hors de portée : même réponse, la RLS a déjà filtré.
  if (!organization) notFound();

  const [members, sites, orders, subscriptions, invoices, projects, tickets, journal] =
    await Promise.all([
      db
        .from('organization_members')
        .select(
          'user_id, role, created_at, profiles!organization_members_user_id_fkey ( email, first_name, last_name, platform_role, last_seen_at, disabled_at )',
        )
        .eq('organization_id', id)
        .order('created_at'),
      db
        .from('sites')
        .select('id, name, status, is_demo, delivered_at, last_published_at, created_at')
        .eq('organization_id', id)
        .order('created_at', { ascending: false }),
      db
        .from('orders')
        .select('id, reference, status, plan_slug, total_cents, currency, created_at, paid_at')
        .eq('organization_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
      db
        .from('subscriptions')
        .select(
          'id, status, maintenance_price_cents, billing_interval, current_period_end, cancel_at_period_end, sites ( name )',
        )
        .eq('organization_id', id)
        .order('created_at', { ascending: false }),
      db
        .from('sales_invoices')
        .select('id, number, status, total_cents, issued_at, paid_at')
        .eq('organization_id', id)
        .order('issued_at', { ascending: false })
        .limit(10),
      db
        .from('projects')
        .select('id, reference, title, status, due_at, site_id')
        .eq('organization_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
      db
        .from('support_tickets')
        .select('id, reference, subject, status, created_at')
        .eq('organization_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
      db
        .from('audit_logs')
        .select('id, action, actor_email, actor_type, impersonated_by, created_at')
        .eq('organization_id', id)
        .order('created_at', { ascending: false })
        .limit(15),
    ]);

  const memberRows = unwrapList<{
    user_id: string;
    role: string;
    created_at: string;
    profiles: {
      email: string;
      first_name: string | null;
      last_name: string | null;
      platform_role: string | null;
      last_seen_at: string | null;
      disabled_at: string | null;
    } | null;
  }>(members as never);
  const siteRows = unwrapList<{
    id: string;
    name: string;
    status: string;
    is_demo: boolean;
    delivered_at: string | null;
    last_published_at: string | null;
    created_at: string;
  }>(sites as never);
  const orderRows = unwrapList<{
    id: string;
    reference: string;
    status: string;
    plan_slug: string | null;
    total_cents: number;
    currency: string;
    created_at: string;
    paid_at: string | null;
  }>(orders as never);
  const subscriptionRows = unwrapList<{
    id: string;
    status: string;
    maintenance_price_cents: number;
    billing_interval: 'month' | 'year';
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    sites: { name: string } | null;
  }>(subscriptions as never);
  const invoiceRows = unwrapList<{
    id: string;
    number: string;
    status: string;
    total_cents: number;
    issued_at: string | null;
    paid_at: string | null;
  }>(invoices as never);
  const projectRows = unwrapList<{
    id: string;
    reference: string;
    title: string;
    status: string;
    due_at: string | null;
    site_id: string | null;
  }>(projects as never);
  const ticketRows = unwrapList<{
    id: string;
    reference: string;
    subject: string;
    status: string;
    created_at: string;
  }>(tickets as never);
  const journalRows = unwrapList<{
    id: string;
    action: string;
    actor_email: string | null;
    actor_type: string;
    impersonated_by: string | null;
    created_at: string;
  }>(journal as never);

  const paidTotal = orderRows
    .filter((order) => order.status === 'paid')
    .reduce((sum, order) => sum + order.total_cents, 0);
  const activeSubscription = subscriptionRows.find((row) =>
    ['active', 'trialing', 'past_due', 'cancel_at_period_end'].includes(row.status),
  );
  const openTickets = ticketRows.filter((row) => !['resolved', 'closed'].includes(row.status));
  const address = [
    organization.address_line1,
    organization.address_line2,
    [organization.postal_code, organization.city].filter(Boolean).join(' '),
    organization.country && organization.country !== 'FR' ? organization.country : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-[var(--foreground-muted)]">
          <Link href="/admin/organisations" className="underline underline-offset-4">
            Organisations
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="title-page break-words">{organization.name}</h1>
          <StatusPill tone={organization.status === 'active' ? 'success' : 'warning'}>
            {organization.status === 'active'
              ? 'Active'
              : organization.status === 'suspended'
                ? 'Suspendue'
                : organization.status}
          </StatusPill>
          {organization.is_demo ? <Badge>Démonstration</Badge> : null}
          {organization.account_type === 'internal' ? <Badge>Compte interne</Badge> : null}
        </div>
        <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
          Cliente depuis le {DATE.format(new Date(organization.created_at))}.
        </p>
      </div>

      {organization.suspended_at ? (
        <Alert tone="warning" live="status" title="Organisation suspendue">
          Depuis le {DATE.format(new Date(organization.suspended_at))}
          {organization.suspension_reason ? ` : ${organization.suspension_reason}` : '.'}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sites" value={String(siteRows.length)} />
        <Stat
          label="Encaissé (commandes)"
          value={formatMoney(paidTotal, 'EUR', { hideDecimalsWhenRound: true })}
        />
        <Stat
          label="Maintenance"
          value={
            activeSubscription
              ? formatMaintenance(
                  activeSubscription.maintenance_price_cents,
                  'EUR',
                  activeSubscription.billing_interval,
                )
              : '—'
          }
          hint={
            activeSubscription
              ? statusLabel(SUBSCRIPTION_STATUSES, activeSubscription.status).label
              : 'Aucun contrat en cours'
          }
        />
        <Stat label="Demandes ouvertes" value={String(openTickets.length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Identité</h2>
          <DescriptionList
            className="mt-3"
            items={[
              { term: 'Raison sociale', description: organization.legal_name ?? '—' },
              { term: 'SIRET', description: organization.siret ?? '—' },
              { term: 'TVA intracommunautaire', description: organization.vat_number ?? '—' },
              { term: 'Adresse', description: address || '—' },
              {
                term: 'Téléphone',
                description: organization.phone ? (
                  <a href={`tel:${organization.phone}`} className="underline underline-offset-4">
                    {organization.phone}
                  </a>
                ) : (
                  '—'
                ),
              },
              {
                term: 'E-mail de facturation',
                description: organization.billing_email ? (
                  <a
                    href={`mailto:${organization.billing_email}`}
                    className="break-all underline underline-offset-4"
                  >
                    {organization.billing_email}
                  </a>
                ) : (
                  '—'
                ),
              },
              { term: 'Site web déclaré', description: organization.website ?? '—' },
              {
                term: 'Client Stripe',
                description: organization.stripe_customer_id ? 'Rattaché' : 'Pas encore',
              },
              { term: 'Identifiant interne', description: organization.slug },
            ]}
          />
        </Panel>

        <Section
          title="Personnes ayant accès"
          count={memberRows.length}
          empty="Personne n’a encore accès à cet espace."
          action={
            <Link href="/admin/assistance" className="text-xs underline underline-offset-4">
              Ouvrir un accès d’assistance
            </Link>
          }
        >
          {memberRows.map((member) => {
            const profile = member.profiles;
            const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
            return (
              <Row key={member.user_id}>
                <span className="min-w-0">
                  <span className="block font-medium">{name || profile?.email || '—'}</span>
                  {name && profile?.email ? (
                    <a
                      href={`mailto:${profile.email}`}
                      className="block text-xs break-all text-[var(--muted)] underline-offset-4 hover:underline"
                    >
                      {profile.email}
                    </a>
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  {profile?.platform_role ? <Badge>Équipe Nemasus</Badge> : null}
                  {profile?.disabled_at ? <StatusPill tone="danger">Désactivé</StatusPill> : null}
                  <span>{ROLE_LABELS[member.role as keyof typeof ROLE_LABELS] ?? member.role}</span>
                  <span>
                    {profile?.last_seen_at
                      ? `vu le ${DATE_TIME.format(new Date(profile.last_seen_at))}`
                      : 'jamais connecté'}
                  </span>
                </span>
              </Row>
            );
          })}
        </Section>
      </div>

      <Section title="Sites" count={siteRows.length} empty="Aucun site pour cette organisation.">
        {siteRows.map((site) => (
          <Row key={site.id}>
            <Link
              href={`/admin/sites/${site.id}`}
              className="min-w-0 font-medium break-words underline-offset-4 hover:underline"
            >
              {site.name}
            </Link>
            <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              <Pill table={SITE_STATUSES} value={site.status} />
              {site.is_demo ? <Badge>Démonstration</Badge> : null}
              <span>
                {site.delivered_at
                  ? `livré le ${DATE.format(new Date(site.delivered_at))}`
                  : 'pas encore livré'}
              </span>
            </span>
          </Row>
        ))}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Section
          title="Projets"
          count={projectRows.length}
          empty="Aucun projet de réalisation."
          action={
            <Link href="/admin/production" className="text-xs underline underline-offset-4">
              Tableau de production
            </Link>
          }
        >
          {projectRows.map((project) => (
            <Row key={project.id}>
              <span className="min-w-0">
                <span className="block font-medium break-words">{project.title}</span>
                <span className="block font-mono text-xs text-[var(--muted)]">
                  {project.reference}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <Pill table={PROJECT_STATUSES} value={project.status} />
                {project.due_at ? (
                  <span>prévu le {DATE.format(new Date(project.due_at))}</span>
                ) : null}
                {project.site_id ? (
                  <Link
                    href={`/admin/sites/${project.site_id}/livraison`}
                    className="underline underline-offset-4"
                  >
                    Livraison
                  </Link>
                ) : null}
              </span>
            </Row>
          ))}
        </Section>

        <Section title="Demandes d’aide" count={ticketRows.length} empty="Aucune demande d’aide.">
          {ticketRows.map((ticket) => (
            <Row key={ticket.id}>
              <Link
                href={`/admin/support/${ticket.id}`}
                className="min-w-0 font-medium break-words underline-offset-4 hover:underline"
              >
                {ticket.subject}
              </Link>
              <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <Pill table={TICKET_STATUSES} value={ticket.status} />
                <span>{DATE.format(new Date(ticket.created_at))}</span>
              </span>
            </Row>
          ))}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Section title="Commandes" count={orderRows.length} empty="Aucune commande.">
          {orderRows.map((order) => (
            <Row key={order.id}>
              <span className="min-w-0">
                <span className="block font-mono text-xs">{order.reference}</span>
                <span className="block text-xs text-[var(--muted)]">
                  {DATE.format(new Date(order.paid_at ?? order.created_at))}
                  {order.plan_slug ? ` · ${order.plan_slug}` : ''}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <StatusPill tone={ORDER_TONES[order.status] ?? 'neutral'}>
                  {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ??
                    order.status}
                </StatusPill>
                <span className="font-medium tabular-nums">
                  {formatMoney(order.total_cents, 'EUR', {
                    hideDecimalsWhenRound: true,
                  })}
                </span>
              </span>
            </Row>
          ))}
        </Section>

        <Section
          title="Maintenance et factures"
          count={subscriptionRows.length + invoiceRows.length}
          empty="Aucun contrat de maintenance ni facture."
        >
          {subscriptionRows.map((subscription) => (
            <Row key={subscription.id}>
              <span className="min-w-0">
                <span className="block font-medium">
                  Maintenance{subscription.sites ? ` · ${subscription.sites.name}` : ''}
                </span>
                <span className="block text-xs text-[var(--muted)]">
                  {formatMaintenance(
                    subscription.maintenance_price_cents,
                    'EUR',
                    subscription.billing_interval,
                  )}
                  {subscription.current_period_end
                    ? ` · ${subscription.cancel_at_period_end ? 'fin' : 'échéance'} le ${DATE.format(new Date(subscription.current_period_end))}`
                    : ''}
                </span>
              </span>
              <Pill table={SUBSCRIPTION_STATUSES} value={subscription.status} />
            </Row>
          ))}
          {invoiceRows.map((invoice) => (
            <Row key={invoice.id}>
              <span className="min-w-0">
                <span className="block font-mono text-xs">Facture {invoice.number}</span>
                <span className="block text-xs text-[var(--muted)]">
                  {invoice.issued_at ? `émise le ${DATE.format(new Date(invoice.issued_at))}` : ''}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <Pill table={INVOICE_STATUSES} value={invoice.status} />
                <span className="font-medium tabular-nums">
                  {formatMoney(invoice.total_cents, 'EUR', { hideDecimalsWhenRound: true })}
                </span>
              </span>
            </Row>
          ))}
        </Section>
      </div>

      <Section
        title="Dernières actions tracées"
        count={journalRows.length}
        empty="Aucune action tracée pour cette organisation."
      >
        {journalRows.map((entry) => (
          <Row key={entry.id}>
            <span className="min-w-0" title={entry.action}>
              {auditActionLabel(entry.action)}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              {entry.impersonated_by ? <Badge>Assistance</Badge> : null}
              <span className="break-all">
                {entry.actor_email ?? (entry.actor_type === 'system' ? 'Système' : '—')}
              </span>
              <time dateTime={entry.created_at}>
                {DATE_TIME.format(new Date(entry.created_at))}
              </time>
            </span>
          </Row>
        ))}
      </Section>
    </div>
  );
}

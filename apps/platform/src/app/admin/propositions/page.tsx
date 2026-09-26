import type { Metadata } from 'next';
import Link from 'next/link';
import { unwrapList } from '@stax/database';
import { formatMaintenance, formatMoney } from '@stax/payments';
import { Panel, StatusPill, type StatusTone } from '@stax/ui';
import { requireAdminRole } from '~/lib/admin';
import { ProposalForm, type ProposalPlanChoice, type ProposalSiteChoice } from './proposal-form';
import { ProposalRowActions } from './proposal-row-actions';

export const metadata: Metadata = { title: 'Propositions' };
export const dynamic = 'force-dynamic';

/**
 * Vente par téléphone : suivi des propositions envoyées aux prospects.
 *
 * Une ligne = un prospect. L'état est lu en base : envoyée, compte créé,
 * payée, livrée, expirée, retirée. Relancer et retirer se font d'ici.
 */

interface ProposalRow {
  id: string;
  reference: string;
  site_id: string;
  company_name: string;
  prospect_email: string;
  prospect_name: string | null;
  prospect_phone: string | null;
  plan_name: string;
  setup_price_cents: number;
  total_cents: number;
  maintenance_price_cents: number;
  billing_interval: string;
  status: string;
  expires_at: string;
  sent_at: string;
  send_count: number;
  email_status: string | null;
  claimed_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  delivery_error: string | null;
  withdrawn_at: string | null;
  internal_notes: string | null;
  attempt_count: number;
  sites: { name: string } | null;
}

const DATE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeZone: 'Europe/Paris',
});

function displayStatus(row: ProposalRow, now: number): { label: string; tone: StatusTone } {
  const expired = new Date(row.expires_at).getTime() <= now;
  switch (row.status) {
    case 'withdrawn':
      return { label: 'Retirée', tone: 'neutral' };
    case 'delivered':
      return { label: 'Payée · site livré', tone: 'success' };
    case 'paid':
      return { label: 'Payée · livraison à terminer', tone: 'warning' };
    case 'claimed':
      return expired
        ? { label: 'Expirée (compte créé)', tone: 'danger' }
        : { label: 'Compte créé · paiement attendu', tone: 'accent' };
    default:
      return expired ? { label: 'Expirée', tone: 'danger' } : { label: 'Envoyée', tone: 'info' };
  }
}

const FILTERS = [
  { value: 'en-cours', label: 'En cours' },
  { value: 'payees', label: 'Payées' },
  { value: 'expirees', label: 'Expirées' },
  { value: 'toutes', label: 'Toutes' },
] as const;

export default async function AdminProposalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await requireAdminRole('platform_admin');
  const params = await searchParams;
  const filter = typeof params.filtre === 'string' ? params.filtre : 'en-cours';
  const preselected = typeof params.site === 'string' ? params.site : null;

  const [proposals, sites, plans] = await Promise.all([
    db
      .from('site_proposals')
      .select(
        'id, reference, site_id, company_name, prospect_email, prospect_name, prospect_phone, ' +
          'plan_name, setup_price_cents, total_cents, maintenance_price_cents, billing_interval, ' +
          'status, expires_at, sent_at, send_count, email_status, claimed_at, paid_at, ' +
          'delivered_at, delivery_error, withdrawn_at, internal_notes, attempt_count, ' +
          'sites ( name )',
      )
      .order('created_at', { ascending: false })
      .limit(300),
    db
      .from('sites')
      .select('id, name')
      .eq('architecture', 'external_repository')
      .is('delivered_at', null)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(200),
    db
      .from('plans')
      .select('id, name, setup_price_cents, maintenance_price_cents, billing_interval')
      .eq('is_active', true)
      .eq('is_public', true)
      .eq('is_quote_only', false)
      .order('sort_order', { ascending: true }),
  ]);

  const rows = unwrapList<ProposalRow>(proposals as never);
  const now = new Date().getTime();
  const openSites = new Set(
    rows.filter((row) => ['sent', 'claimed', 'paid'].includes(row.status)).map((r) => r.site_id),
  );
  const siteChoices: ProposalSiteChoice[] = unwrapList<{ id: string; name: string }>(
    sites as never,
  ).filter((site) => !openSites.has(site.id));
  const planChoices: ProposalPlanChoice[] = unwrapList<{
    id: string;
    name: string;
    setup_price_cents: number;
    maintenance_price_cents: number;
    billing_interval: string;
  }>(plans as never).map((plan) => ({
    id: plan.id,
    label: `${plan.name} — ${formatMoney(plan.setup_price_cents, 'EUR', {
      hideDecimalsWhenRound: true,
    })} HT puis ${formatMaintenance(
      plan.maintenance_price_cents,
      'EUR',
      plan.billing_interval === 'year' ? 'year' : 'month',
    )} HT`,
  }));

  const visible = rows.filter((row) => {
    const expired = new Date(row.expires_at).getTime() <= now;
    if (filter === 'payees') return row.status === 'paid' || row.status === 'delivered';
    if (filter === 'expirees')
      return (row.status === 'sent' || row.status === 'claimed') && expired;
    if (filter === 'toutes') return true;
    return (
      ((row.status === 'sent' || row.status === 'claimed') && !expired) || row.status === 'paid'
    );
  });

  const counts = {
    sent: rows.filter((r) => r.status === 'sent').length,
    claimed: rows.filter((r) => r.status === 'claimed').length,
    won: rows.filter((r) => r.status === 'paid' || r.status === 'delivered').length,
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
          Vente par téléphone
        </p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.02em]">Propositions</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--foreground-muted)]">
          Après un appel concluant : le site du prospect est construit et vérifié, puis vous lui
          envoyez une proposition. Il crée son compte avec son code, voit son site, vous écrit s’il
          veut une retouche, paie — et le site lui est livré automatiquement.
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-4">
        {[
          ['1', 'Créer le site', 'Sites → Créer un site, puis Infrastructure & livraison.'],
          ['2', 'Vérifier', 'Checklist complète (le domaine peut attendre).'],
          ['3', 'Envoyer', 'Nouvelle proposition : e-mail + code, 14 jours.'],
          ['4', 'Encaisser', 'Paiement en ligne, livraison automatique.'],
        ].map(([step, title, text]) => (
          <li key={step}>
            <Panel level={1} padding="md" className="h-full">
              <p className="text-2xs text-[var(--muted)]">Étape {step}</p>
              <p className="mt-1 text-sm font-medium">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--foreground-muted)]">{text}</p>
            </Panel>
          </li>
        ))}
      </ol>

      <ProposalForm
        sites={siteChoices}
        plans={planChoices}
        defaultSiteId={
          preselected && siteChoices.some((s) => s.id === preselected) ? preselected : null
        }
        startOpen={Boolean(preselected)}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {FILTERS.map((item) => (
          <Link
            key={item.value}
            href={`/admin/propositions?filtre=${item.value}`}
            aria-current={filter === item.value ? 'page' : undefined}
            className={
              filter === item.value
                ? 'rounded-full bg-[var(--surface-elevated)] px-3 py-1.5 font-medium'
                : 'rounded-full px-3 py-1.5 text-[var(--foreground-muted)] hover:bg-[var(--surface)]'
            }
          >
            {item.label}
          </Link>
        ))}
        <span className="ml-auto text-xs text-[var(--muted)]">
          {counts.sent} envoyée(s) · {counts.claimed} compte(s) créé(s) · {counts.won} payée(s)
        </span>
      </div>

      {visible.length === 0 ? (
        <Panel level={1} padding="lg">
          <p className="text-sm text-[var(--foreground-muted)]">Aucune proposition ici.</p>
        </Panel>
      ) : (
        <ul className="space-y-3" data-testid="proposal-list">
          {visible.map((row) => {
            const state = displayStatus(row, now);
            const open = row.status === 'sent' || row.status === 'claimed';
            return (
              <li key={row.id}>
                <Panel level={2} padding="lg">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-medium">{row.company_name}</h2>
                        <StatusPill tone={state.tone}>{state.label}</StatusPill>
                      </div>
                      <p className="text-sm text-[var(--foreground-muted)]">
                        {row.prospect_name ? `${row.prospect_name} · ` : ''}
                        {row.prospect_email}
                        {row.prospect_phone ? ` · ${row.prospect_phone}` : ''}
                      </p>
                      <p className="text-sm">
                        {row.plan_name} ·{' '}
                        {formatMoney(row.setup_price_cents, 'EUR', { hideDecimalsWhenRound: true })}{' '}
                        HT
                        {row.maintenance_price_cents > 0
                          ? ` puis ${formatMaintenance(
                              row.maintenance_price_cents,
                              'EUR',
                              row.billing_interval === 'year' ? 'year' : 'month',
                            )} HT`
                          : ''}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {row.reference} · envoyée le {DATE.format(new Date(row.sent_at))}
                        {row.send_count > 1 ? ` (${row.send_count} envois)` : ''} ·{' '}
                        {open ? `expire le ${DATE.format(new Date(row.expires_at))}` : null}
                        {row.paid_at ? `payée le ${DATE.format(new Date(row.paid_at))}` : null}
                        {row.email_status === 'failed' ? ' · e-mail en échec' : ''}
                        {row.email_status === 'skipped'
                          ? ' · e-mail non envoyé (non configuré)'
                          : ''}
                        {row.attempt_count > 3 ? ` · ${row.attempt_count} saisies de code` : ''}
                      </p>
                      {row.status === 'paid' && row.delivery_error ? (
                        <p className="text-xs text-[var(--warning)]">
                          Livraison automatique en attente : {row.delivery_error}. Terminez la
                          checklist, la livraison se fera toute seule (ou livrez à la main).
                        </p>
                      ) : null}
                      {row.internal_notes ? (
                        <p className="text-xs whitespace-pre-wrap text-[var(--foreground-muted)]">
                          Note : {row.internal_notes}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Link
                        href={`/admin/sites/${row.site_id}`}
                        className="text-sm underline underline-offset-4"
                      >
                        {row.sites?.name ?? 'Voir le site'}
                      </Link>
                      {row.status === 'paid' ? (
                        <Link
                          href={`/admin/sites/${row.site_id}/livraison`}
                          className="text-sm underline underline-offset-4"
                        >
                          Checklist de livraison
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  {open ? (
                    <div className="mt-4 border-t border-[var(--border)] pt-4">
                      <ProposalRowActions
                        proposalId={row.id}
                        companyName={row.company_name}
                        canRenew={open}
                        canWithdraw={open}
                      />
                    </div>
                  ) : null}
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

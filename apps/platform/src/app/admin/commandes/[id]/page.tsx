import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveBusiness } from '@nemasus/business';
import { bankTransferDetails } from '@nemasus/config';
import { unwrapList, unwrapMaybe } from '@nemasus/database';
import { Alert, DescriptionList, Panel, StatusPill, type StatusTone } from '@nemasus/ui';
import { PageHeader } from '~/components/app/page-header';
import { getAdminContext } from '~/lib/admin';
import {
  amountInputValue,
  formatOrderAmount,
  isPast,
  SITE_ORDER_COLUMNS,
  SITE_ORDER_STATUS_LABELS,
  type SiteOrderRow,
} from '~/lib/site-orders';
import {
  CancelOrderForm,
  ConfirmPaymentForm,
  NotesForm,
  PaymentRequestForm,
  ReissueCodeForm,
  ResendPaymentButton,
  RevokeCodeButton,
} from '../order-controls';

export const metadata: Metadata = { title: 'Commande' };
export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<string, StatusTone> = {
  received: 'warning',
  payment_requested: 'info',
  paid: 'success',
  cancelled: 'neutral',
};

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const when = (iso: string | null) => (iso ? DATE_TIME.format(new Date(iso)) : '—');

const DOMAIN_LABELS: Record<string, string> = {
  customer_owned: 'Domaine existant à connecter',
  purchase: 'Domaine à acheter',
  later: 'Choisi plus tard',
};

const EMAIL_LABELS: Record<string, string> = {
  sent: 'envoyé',
  failed: 'échec',
  skipped: 'non envoyé (fournisseur non configuré)',
};

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db, role } = await getAdminContext();
  const canAdmin = role === 'platform_owner' || role === 'platform_admin';

  const order = unwrapMaybe<SiteOrderRow>(
    (await db.from('site_orders').select(SITE_ORDER_COLUMNS).eq('id', id).maybeSingle()) as never,
  );
  if (!order) notFound();

  const [codes, preparedSites] = await Promise.all([
    canAdmin
      ? unwrapList<{
          id: string;
          code_hint: string;
          expires_at: string;
          used_at: string | null;
          revoked_at: string | null;
          attempt_count: number;
          email_status: string | null;
          created_at: string;
        }>(
          (await db
            .from('activation_codes')
            .select(
              'id, code_hint, expires_at, used_at, revoked_at, attempt_count, email_status, created_at',
            )
            .eq('site_order_id', order.id)
            .order('created_at', { ascending: false })) as never,
        )
      : [],
    order.status === 'paid' || order.status === 'cancelled'
      ? []
      : unwrapList<{ id: string; name: string; delivered_at: string | null }>(
          (await db
            .from('sites')
            .select('id, name, delivered_at')
            .is('archived_at', null)
            .is('delivered_at', null)
            .order('created_at', { ascending: false })
            .limit(50)) as never,
        ),
  ]);

  const business = order.business_type_slug ? resolveBusiness(order.business_type_slug) : null;
  const contact = [order.contact_first_name, order.contact_last_name].filter(Boolean).join(' ');
  const answers = Object.entries(order.answers ?? {}).filter(
    ([, value]) =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
  );
  const bankConfigured = bankTransferDetails() !== null;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link
          href="/admin/commandes"
          className="text-[var(--foreground-muted)] underline underline-offset-4"
        >
          ← Toutes les commandes
        </Link>
      </p>
      <PageHeader
        title={`${order.reference} — ${order.company_name}`}
        description={`Reçue le ${when(order.created_at)}${order.source === 'team' ? ', saisie par l’équipe' : ', depuis le site'}.`}
        actions={
          <StatusPill tone={STATUS_TONES[order.status] ?? 'neutral'}>
            {SITE_ORDER_STATUS_LABELS[order.status]}
          </StatusPill>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
        <div className="space-y-6">
          <Panel level={2} padding="lg">
            <h2 className="text-sm font-medium">Client</h2>
            <DescriptionList
              className="mt-4"
              columns={2}
              items={[
                { term: 'Entreprise', description: order.company_name },
                { term: 'Contact', description: contact || '—' },
                {
                  term: 'E-mail',
                  description: (
                    <a
                      href={`mailto:${order.contact_email}`}
                      className="break-all underline underline-offset-4"
                    >
                      {order.contact_email}
                    </a>
                  ),
                },
                { term: 'Téléphone', description: order.contact_phone ?? '—' },
                { term: 'Ville', description: order.city ?? '—' },
                { term: 'Métier', description: business?.name ?? '—' },
                {
                  term: 'Adresse web',
                  description: `${DOMAIN_LABELS[order.domain_handling] ?? '—'}${order.requested_domain ? ` : ${order.requested_domain}` : ''}`,
                },
                {
                  term: 'Conditions acceptées',
                  description:
                    order.source === 'team'
                      ? 'Commande saisie par l’équipe'
                      : `CGV ${order.terms_version}, le ${when(order.terms_accepted_at)}`,
                },
              ]}
            />
          </Panel>

          {order.project_description || answers.length > 0 ? (
            <Panel level={1} padding="lg">
              <h2 className="text-sm font-medium">Le projet</h2>
              {order.project_description ? (
                <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">
                  {order.project_description}
                </p>
              ) : null}
              {answers.length > 0 ? (
                <DescriptionList
                  className="mt-4"
                  items={answers.map(([key, value]) => {
                    const question = business?.onboarding.find((entry) => entry.id === key);
                    return { term: question?.label ?? key, description: String(value) };
                  })}
                />
              ) : null}
            </Panel>
          ) : null}

          {order.status === 'paid' ? (
            <Panel level={2} padding="lg">
              <h2 className="text-sm font-medium">Accès du client</h2>
              <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                Payée le {when(order.paid_at)}
                {order.paid_amount_cents !== null
                  ? ` (${formatOrderAmount(order.paid_amount_cents, order.currency)} reçus)`
                  : ''}
                . E-mail du code : {EMAIL_LABELS[order.access_email_status ?? ''] ?? '—'}.
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {order.site_id ? (
                  <Link
                    href={`/admin/sites/${order.site_id}`}
                    className="underline underline-offset-4"
                  >
                    Fiche du site
                  </Link>
                ) : null}
                {order.site_id ? (
                  <Link
                    href={`/admin/sites/${order.site_id}/livraison`}
                    className="underline underline-offset-4"
                  >
                    Infrastructure & livraison
                  </Link>
                ) : null}
                {order.organization_id ? (
                  <Link
                    href={`/admin/organisations/${order.organization_id}`}
                    className="underline underline-offset-4"
                  >
                    Organisation
                  </Link>
                ) : null}
              </div>

              {codes.length > 0 ? (
                <ul className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)]">
                  {codes.map((code) => {
                    const expired = isPast(code.expires_at);
                    const state = code.used_at
                      ? `utilisé le ${when(code.used_at)}`
                      : code.revoked_at
                        ? `désactivé le ${when(code.revoked_at)}`
                        : expired
                          ? `expiré le ${when(code.expires_at)}`
                          : `valable jusqu’au ${when(code.expires_at)}`;
                    const open = !code.used_at && !code.revoked_at && !expired;
                    return (
                      <li
                        key={code.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                      >
                        <span>
                          <span className="font-mono">••••-••••-{code.code_hint}</span>{' '}
                          <span className="text-[var(--foreground-muted)]">— {state}</span>
                          <span className="block text-xs text-[var(--muted)]">
                            Émis le {when(code.created_at)} · e-mail :{' '}
                            {EMAIL_LABELS[code.email_status ?? ''] ?? '—'} · {code.attempt_count}{' '}
                            {code.attempt_count > 1 ? 'tentatives' : 'tentative'}
                          </span>
                        </span>
                        {open && canAdmin ? (
                          <RevokeCodeButton codeId={code.id} orderId={order.id} />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {canAdmin ? (
                <div className="mt-5">
                  <ReissueCodeForm orderId={order.id} />
                </div>
              ) : null}
            </Panel>
          ) : null}

          {canAdmin ? (
            <Panel level={1} padding="lg">
              <NotesForm orderId={order.id} notes={order.internal_notes ?? ''} />
            </Panel>
          ) : null}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          {order.status === 'cancelled' ? (
            <Alert tone="info" live="status" title="Commande annulée">
              Annulée le {when(order.cancelled_at)}
              {order.cancel_reason ? ` : ${order.cancel_reason}` : ''}.
            </Alert>
          ) : null}

          {canAdmin && (order.status === 'received' || order.status === 'payment_requested') ? (
            <>
              <Panel level={3} padding="lg">
                <h2 className="text-sm font-medium">1. Modalités de paiement</h2>
                {order.status === 'payment_requested' ? (
                  <p className="mt-2 mb-4 text-sm text-[var(--foreground-muted)]">
                    Envoyées le {when(order.payment_requested_at)} pour{' '}
                    <strong>{formatOrderAmount(order.amount_cents ?? 0, order.currency)}</strong>
                    {order.payment_request_count > 1
                      ? ` (${order.payment_request_count} envois)`
                      : ''}
                    . E-mail : {EMAIL_LABELS[order.payment_email_status ?? ''] ?? '—'}.
                  </p>
                ) : (
                  <p className="mt-2 mb-4 text-sm text-[var(--foreground-muted)]">
                    Indiquez le montant convenu : le client reçoit le montant, l’IBAN et la
                    référence <strong>{order.reference}</strong> à rappeler dans son virement.
                  </p>
                )}
                {order.status === 'payment_requested' ? (
                  <div className="mb-4">
                    <ResendPaymentButton orderId={order.id} />
                  </div>
                ) : null}
                <PaymentRequestForm
                  orderId={order.id}
                  defaultAmount={amountInputValue(order.amount_cents)}
                  defaultMessage={order.payment_message ?? ''}
                  bankConfigured={bankConfigured}
                  again={order.status === 'payment_requested'}
                />
              </Panel>

              <Panel level={3} padding="lg">
                <h2 className="text-sm font-medium">2. Virement reçu</h2>
                <p className="mt-2 mb-4 text-sm text-[var(--foreground-muted)]">
                  Vérifiez sur le relevé bancaire que le virement portant la référence{' '}
                  <strong>{order.reference}</strong> est arrivé, puis confirmez : l’espace du client
                  est créé et son code d’accès personnel lui est envoyé.
                </p>
                <ConfirmPaymentForm
                  orderId={order.id}
                  defaultAmount={amountInputValue(order.amount_cents)}
                  sites={preparedSites.map((site) => ({ id: site.id, name: site.name }))}
                />
              </Panel>

              <CancelOrderForm orderId={order.id} />
            </>
          ) : null}

          {order.last_email_error ? (
            <Alert tone="warning" live="status" title="Dernier envoi en échec">
              {order.last_email_error}
            </Alert>
          ) : null}
        </aside>
      </div>
    </>
  );
}

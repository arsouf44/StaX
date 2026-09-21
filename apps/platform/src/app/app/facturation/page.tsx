import type { Metadata } from 'next';
import Link from 'next/link';
import { unwrapList } from '@stax/database';
import { formatMoney, SUBSCRIPTION_STATUS_LABELS } from '@stax/payments';
import { refundPolicyConfig } from '@stax/config';
import {
  Alert,
  EmptyState,
  Icon,
  Panel,
  PermissionDenied,
  StatusPill,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';

export const metadata: Metadata = { title: 'Facturation' };

const SUB_TONES: Record<string, StatusTone> = {
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  unpaid: 'danger',
  cancel_at_period_end: 'warning',
  canceled: 'neutral',
  paused: 'neutral',
  incomplete: 'warning',
};

/**
 * Facturation du client.
 *
 * Aucun montant n est recalcule ici : tout vient des lignes ecrites par les
 * webhooks signes. Une facture affichee est une facture reellement emise.
 */
export default async function BillingPage() {
  const { workspace, db } = await getWorkspace();

  if (!workspace.capabilities.includes('billing.view')) {
    return (
      <PermissionDenied message="Votre rôle ne donne pas accès à la facturation. Demandez à un propriétaire de votre organisation de vous l’ouvrir." />
    );
  }

  const [invoices, orders] = await Promise.all([
    db
      .from('invoices')
      .select(
        'id, number, status, amount_due_cents, amount_paid_cents, currency, issued_at, paid_at, hosted_invoice_url, invoice_pdf_url',
      )
      .eq('organization_id', workspace.organization.id)
      .order('issued_at', { ascending: false })
      .limit(60),
    db
      .from('orders')
      .select('id, reference, status, total_cents, currency, paid_at')
      .eq('organization_id', workspace.organization.id)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(20),
  ]);

  const invoiceRows = unwrapList<{
    id: string;
    number: string | null;
    status: string;
    amount_due_cents: number;
    amount_paid_cents: number;
    currency: string;
    issued_at: string | null;
    paid_at: string | null;
    hosted_invoice_url: string | null;
    invoice_pdf_url: string | null;
  }>(invoices as never);

  const orderRows = unwrapList<{
    id: string;
    reference: string;
    status: string;
    total_cents: number;
    currency: string;
    paid_at: string | null;
  }>(orders as never);

  const subscription = workspace.subscription;
  const refund = refundPolicyConfig();

  return (
    <>
      <PageHeader
        title="Facturation"
        description="Vos factures, votre abonnement de maintenance et votre historique de paiements."
      />

      <div className="space-y-8">
        <section aria-labelledby="abonnement">
          <h2 id="abonnement" className="mb-3 text-sm font-medium">
            Votre maintenance
          </h2>
          {subscription ? (
            <Panel level={2} padding="lg">
              <div className="flex flex-wrap items-center gap-3">
                <StatusPill tone={SUB_TONES[subscription.status] ?? 'neutral'}>
                  {SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status}
                </StatusPill>
                <span className="text-sm">
                  {formatMoney(subscription.maintenance_price_cents, subscription.currency, {
                    hideDecimalsWhenRound: true,
                  })}{' '}
                  / mois
                </span>
              </div>

              {subscription.current_period_end ? (
                <p className="mt-4 text-sm text-[var(--foreground-muted)]">
                  {subscription.cancel_at_period_end
                    ? 'Votre maintenance prend fin le '
                    : 'Prochaine échéance le '}
                  <time dateTime={subscription.current_period_end}>
                    {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
                      new Date(subscription.current_period_end),
                    )}
                  </time>
                  .
                </p>
              ) : null}

              <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
                Votre tarif est celui de votre commande. Une évolution de nos prix publics ne
                s’applique pas à votre contrat en cours.
              </p>

              {subscription.status === 'past_due' ? (
                <Alert tone="warning" className="mt-4" live="status" title="Paiement en attente">
                  Votre dernier prélèvement n’a pas abouti. Mettez à jour votre moyen de paiement :
                  votre site reste en ligne pendant ce temps.
                </Alert>
              ) : null}

              {subscription.cancel_at_period_end ? (
                <Alert tone="info" className="mt-4" live="status" title="Résiliation programmée">
                  Votre site restera accessible jusqu’à l’échéance, puis pendant une période de
                  continuité. Vos données ne sont pas supprimées : vous pouvez les exporter ou
                  réactiver la maintenance à tout moment.
                </Alert>
              ) : null}
            </Panel>
          ) : (
            <Panel level={1} padding="lg">
              <p className="text-sm text-[var(--foreground-muted)]">
                Aucun abonnement de maintenance actif. Il démarre automatiquement à la mise en ligne
                de votre site.
              </p>
            </Panel>
          )}
        </section>

        <section aria-labelledby="factures">
          <h2 id="factures" className="mb-3 text-sm font-medium">
            Factures
          </h2>
          {invoiceRows.length === 0 ? (
            <EmptyState
              icon={<Icon name="receipt" size={24} />}
              title="Aucune facture pour le moment"
              description="Vos factures de maintenance apparaîtront ici, et vous seront aussi envoyées par e-mail."
            />
          ) : (
            <TableWrapper label="Factures">
              <Table>
                <THead>
                  <TR>
                    <TH scope="col">Numéro</TH>
                    <TH scope="col">Montant</TH>
                    <TH scope="col">État</TH>
                    <TH scope="col">Date</TH>
                    <TH scope="col">
                      <span className="sr-only">Téléchargement</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {invoiceRows.map((invoice) => (
                    <TR key={invoice.id}>
                      <TD className="font-mono text-xs">{invoice.number ?? '—'}</TD>
                      <TD className="tabular-nums">
                        {formatMoney(invoice.amount_due_cents, invoice.currency as 'EUR')}
                      </TD>
                      <TD>
                        <StatusPill tone={invoice.status === 'paid' ? 'success' : 'warning'}>
                          {invoice.status === 'paid' ? 'Payée' : invoice.status}
                        </StatusPill>
                      </TD>
                      <TD className="text-[var(--foreground-muted)]">
                        {invoice.issued_at ? (
                          <time dateTime={invoice.issued_at}>
                            {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
                              new Date(invoice.issued_at),
                            )}
                          </time>
                        ) : (
                          '—'
                        )}
                      </TD>
                      <TD>
                        {invoice.invoice_pdf_url ? (
                          <a
                            href={invoice.invoice_pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-[var(--accent)] underline underline-offset-4"
                          >
                            PDF
                          </a>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </section>

        {orderRows.length > 0 ? (
          <section aria-labelledby="commandes">
            <h2 id="commandes" className="mb-3 text-sm font-medium">
              Vos commandes
            </h2>
            <TableWrapper label="Commandes payées">
              <Table>
                <THead>
                  <TR>
                    <TH scope="col">Référence</TH>
                    <TH scope="col">Montant</TH>
                    <TH scope="col">Payée le</TH>
                  </TR>
                </THead>
                <TBody>
                  {orderRows.map((order) => (
                    <TR key={order.id}>
                      <TD className="font-mono text-xs">{order.reference}</TD>
                      <TD className="tabular-nums">
                        {formatMoney(order.total_cents, order.currency as 'EUR')}
                      </TD>
                      <TD className="text-[var(--foreground-muted)]">
                        {order.paid_at ? (
                          <time dateTime={order.paid_at}>
                            {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
                              new Date(order.paid_at),
                            )}
                          </time>
                        ) : (
                          '—'
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </section>
        ) : null}

        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Garantie de remboursement</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
            Vous disposez de {refund.windowDays} jours après la mise en ligne de votre site pour
            demander un remboursement. Si un nom de domaine a réellement été acheté pour vous, son
            coût est déduit puisqu’il est déjà engagé ; sinon rien n’est retenu.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Cette garantie commerciale s’ajoute à vos droits légaux et ne les remplace pas. Voir la{' '}
            <Link href="/remboursements" className="underline underline-offset-4">
              politique de remboursement
            </Link>
            .
          </p>
        </Panel>
      </div>
    </>
  );
}

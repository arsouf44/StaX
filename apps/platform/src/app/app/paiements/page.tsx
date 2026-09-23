import type { Metadata } from 'next';
import { readEnv } from '@stax/config';
import { unwrapList, unwrapMaybe } from '@stax/database';
import { CONNECT_STATUS_HELP, CONNECT_STATUS_LABELS, formatMoney } from '@stax/payments';
import {
  EmptyState,
  Icon,
  PermissionDenied,
  Panel,
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
import { ModulePage } from '~/components/app/module-page';
import { getWorkspace } from '~/lib/workspace';
import { ConnectPanel, type ConnectView } from './connect-panel';

export const metadata: Metadata = { title: 'Mes paiements' };

const STATUS_TONES: Record<string, StatusTone> = {
  not_started: 'neutral',
  onboarding: 'warning',
  pending_verification: 'info',
  active: 'success',
  restricted: 'warning',
  disabled: 'danger',
};

const PAYMENT_KIND_LABELS: Record<string, string> = {
  shop_order: 'Commande',
  deposit: 'Acompte de réservation',
  donation: 'Don',
  custom: 'Paiement',
};

/**
 * Traduction des exigences Stripe.
 *
 * Stripe renvoie des identifiants techniques (`individual.verification.document`).
 * On traduit ceux que l'on connait et on laisse les autres tels quels plutot que
 * de deviner : un message invente serait pire qu'un terme technique.
 */
const REQUIREMENT_LABELS: Record<string, string> = {
  'individual.verification.document': 'Une pièce d’identité',
  'company.verification.document': 'Un document d’immatriculation',
  external_account: 'Un compte bancaire pour recevoir vos virements',
  'business_profile.url': 'L’adresse de votre site',
  'business_profile.mcc': 'Votre secteur d’activité',
  'individual.address.line1': 'Votre adresse',
  'individual.dob.day': 'Votre date de naissance',
  'tos_acceptance.date': 'L’acceptation des conditions Stripe',
};

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const { workspace, db } = await getWorkspace();
  const { stripe: outcome } = await searchParams;

  if (!workspace.capabilities.includes('billing.view')) {
    return (
      <PermissionDenied message="Votre rôle ne donne pas accès aux encaissements de votre site." />
    );
  }

  const account = unwrapMaybe<{
    status: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    requirements_due: string[] | null;
    disabled_reason: string | null;
    last_synced_at: string | null;
  }>(
    (await db
      .from('connected_accounts')
      .select(
        'status, charges_enabled, payouts_enabled, requirements_due, disabled_reason, last_synced_at',
      )
      .eq('organization_id', workspace.organization.id)
      .maybeSingle()) as never,
  );

  const status = account?.status ?? 'not_started';

  const view: ConnectView = {
    configured: Boolean(account),
    statusLabel: CONNECT_STATUS_LABELS[status as keyof typeof CONNECT_STATUS_LABELS] ?? status,
    statusTone: STATUS_TONES[status] ?? 'neutral',
    help:
      CONNECT_STATUS_HELP[status as keyof typeof CONNECT_STATUS_HELP] ??
      'Activez les paiements pour encaisser directement sur votre compte bancaire.',
    chargesEnabled: account?.charges_enabled === true,
    payoutsEnabled: account?.payouts_enabled === true,
    requirements: (account?.requirements_due ?? []).map(
      (requirement) => REQUIREMENT_LABELS[requirement] ?? requirement,
    ),
    disabledReason: account?.disabled_reason ?? null,
    lastSyncedLabel: account?.last_synced_at
      ? DATE_TIME.format(new Date(account.last_synced_at))
      : null,
    canManage: workspace.capabilities.includes('payments.connect'),
    active: status === 'active',
    oauthAvailable: Boolean(readEnv('STRIPE_CONNECT_CLIENT_ID')),
    outcome: typeof outcome === 'string' ? outcome.slice(0, 40) : null,
  };

  const payments = unwrapList<{
    id: string;
    amount_cents: number;
    amount_refunded_cents: number;
    status: string;
    kind: string;
    description: string | null;
    succeeded_at: string | null;
    created_at: string;
  }>(
    (await db
      .from('payments')
      .select(
        'id, amount_cents, amount_refunded_cents, status, kind, description, succeeded_at, created_at',
      )
      .eq('organization_id', workspace.organization.id)
      .eq('scope', 'connect')
      .order('created_at', { ascending: false })
      .limit(100)) as never,
  );

  return (
    <ModulePage
      module={['payments', 'donations']}
      feature="online_payments"
      title="Mes paiements"
      description="L’argent encaissé sur votre site va directement sur votre compte bancaire. StaX ne prélève aucune commission sur vos ventes."
    >
      <div className="space-y-8">
        <ConnectPanel view={view} />

        <section aria-labelledby="encaissements" className="space-y-4">
          <h2 id="encaissements" className="text-base font-medium">
            Encaissements reçus
          </h2>

          {payments.length === 0 ? (
            <EmptyState
              icon={<Icon name="credit-card" size={24} />}
              title="Aucun encaissement pour le moment"
              description="Les paiements reçus sur votre site apparaîtront ici. Le détail complet, y compris les virements vers votre banque, reste dans votre tableau de bord Stripe."
            />
          ) : (
            <TableWrapper label="Encaissements">
              <Table>
                <THead>
                  <TR>
                    <TH scope="col">Date</TH>
                    <TH scope="col">Origine</TH>
                    <TH scope="col">Montant</TH>
                    <TH scope="col">État</TH>
                  </TR>
                </THead>
                <TBody>
                  {payments.map((payment) => {
                    const date = payment.succeeded_at ?? payment.created_at;
                    const refunded = payment.amount_refunded_cents > 0;
                    return (
                      <TR key={payment.id}>
                        <TD className="text-[var(--foreground-muted)]">
                          <time dateTime={date}>{DATE_TIME.format(new Date(date))}</time>
                        </TD>
                        <TD>
                          {payment.description ?? PAYMENT_KIND_LABELS[payment.kind] ?? 'Paiement'}
                        </TD>
                        <TD className="tabular-nums">
                          {formatMoney(payment.amount_cents, 'EUR')}
                          {refunded ? (
                            <span className="block text-xs text-[var(--muted)]">
                              dont {formatMoney(payment.amount_refunded_cents, 'EUR')} remboursés
                            </span>
                          ) : null}
                        </TD>
                        <TD>
                          <StatusPill
                            tone={
                              payment.status === 'succeeded'
                                ? 'success'
                                : payment.status === 'failed'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {payment.status === 'succeeded'
                              ? 'Encaissé'
                              : payment.status === 'failed'
                                ? 'Échoué'
                                : 'En cours'}
                          </StatusPill>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </section>

        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Ce que StaX ne fait pas</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
            <li>
              Nous ne stockons aucun numéro de carte : la saisie se fait sur les pages sécurisées de
              Stripe, jamais sur votre site ni sur le nôtre.
            </li>
            <li>
              Nous ne prélevons aucune commission sur vos encaissements. Les frais Stripe restent
              dus à Stripe, selon leur grille tarifaire.
            </li>
            <li>
              Nous ne touchons pas à vos fonds : ils vont de Stripe à votre compte bancaire, sans
              passer par nous.
            </li>
          </ul>
        </Panel>
      </div>
    </ModulePage>
  );
}

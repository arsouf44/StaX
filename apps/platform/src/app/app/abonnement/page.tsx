import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMaintenance, SUBSCRIPTION_STATUS_LABELS } from '@stax/payments';
import { refundPolicyConfig } from '@stax/config';
import { EmptyState, Icon, Panel, PermissionDenied } from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { MAINTENANCE_EXCLUDES, MAINTENANCE_INCLUDES } from '~/content/maintenance';
import { SubscriptionPanel, type SubscriptionView } from './subscription-panel';

export const metadata: Metadata = { title: 'Maintenance' };

const TONES: Record<string, StatusTone> = {
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  unpaid: 'danger',
  canceled: 'neutral',
  paused: 'neutral',
  incomplete: 'warning',
};

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

/** Aucun abonnement Stripe encore enregistre : ce que la situation reelle permet d'annoncer. */
function emptyStateCopy(
  delivered: boolean,
  maintenanceStatus: string | null,
): { title: string; description: string } {
  if (!delivered) {
    return {
      title: 'Aucun abonnement actif',
      description:
        'Votre maintenance démarre à la livraison de votre site, une fois celui-ci en ligne. Rien n’est prélevé avant.',
    };
  }
  switch (maintenanceStatus) {
    case 'waived':
      return {
        title: 'Maintenance incluse',
        description:
          'Ce site est rattaché à un compte interne StaX : aucune maintenance n’est facturée.',
      };
    case 'not_applicable':
      return {
        title: 'Maintenance définie par votre devis',
        description: 'Les conditions de maintenance de votre projet figurent dans votre devis.',
      };
    default:
      return {
        title: 'Maintenance en cours de mise en place',
        description:
          'Votre site est livré : l’équipe StaX finalise l’abonnement mensuel, qui démarre à la date de livraison. Vous recevrez une confirmation par e-mail.',
      };
  }
}

export default async function SubscriptionPage() {
  const { workspace, db } = await getWorkspace();

  if (!workspace.capabilities.includes('billing.view')) {
    return (
      <PermissionDenied message="Votre rôle ne donne pas accès à l’abonnement de maintenance." />
    );
  }

  const subscription = workspace.subscription;
  const refund = refundPolicyConfig();
  const site = workspace.currentSite;
  const order =
    !subscription && site?.deliveredAt
      ? await db
          .from('orders')
          .select('maintenance_status')
          .eq('site_id', site.id)
          .in('status', ['paid', 'partially_refunded', 'internal'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : null;
  const empty = emptyStateCopy(
    Boolean(site?.deliveredAt),
    (order?.data as { maintenance_status: string } | null)?.maintenance_status ?? null,
  );

  const view: SubscriptionView | null = subscription
    ? {
        id: subscription.id,
        statusLabel: SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status,
        statusTone: TONES[subscription.status] ?? 'neutral',
        priceLabel: formatMaintenance(
          subscription.maintenance_price_cents,
          subscription.currency,
          subscription.billing_interval,
        ),
        periodEndLabel: subscription.current_period_end
          ? DATE.format(new Date(subscription.current_period_end))
          : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        isPastDue: subscription.status === 'past_due' || subscription.status === 'unpaid',
        canManage: workspace.capabilities.includes('billing.manage'),
      }
    : null;

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Ce que couvre votre maintenance mensuelle, et comment la gérer."
      />

      {view ? (
        <SubscriptionPanel subscription={view} />
      ) : (
        <EmptyState
          icon={<Icon name="shield-check" size={24} />}
          title={empty.title}
          description={empty.description}
        />
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Ce que couvre la maintenance</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
            {MAINTENANCE_INCLUDES.map((item) => (
              <li key={item}>{item}.</li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
            Ne sont pas inclus, et font l’objet d’un devis distinct :{' '}
            {MAINTENANCE_EXCLUDES.map((item) => item.toLowerCase()).join(' ; ')}.
          </p>
        </Panel>

        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Votre tarif est figé</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
            Le prix de votre maintenance est celui de votre commande. Si nos tarifs publics
            augmentent, votre contrat en cours n’est pas affecté.
          </p>

          <h2 className="mt-6 text-sm font-medium">Garantie de remboursement</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
            Vous disposez de {refund.windowDays} jours après la livraison de votre site pour
            demander un remboursement. Si un nom de domaine a réellement été acheté pour vous, son
            coût est déduit puisqu’il est déjà engagé ; sinon rien n’est retenu.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
            Cette garantie commerciale s’ajoute à vos droits légaux et ne les remplace pas. Voir la{' '}
            <Link href="/remboursements" className="underline underline-offset-4">
              politique de remboursement
            </Link>{' '}
            et vos{' '}
            <Link href="/app/facturation" className="underline underline-offset-4">
              factures
            </Link>
            .
          </p>
        </Panel>
      </div>
    </>
  );
}

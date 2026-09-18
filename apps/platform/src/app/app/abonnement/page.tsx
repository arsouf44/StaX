import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMonthly, SUBSCRIPTION_STATUS_LABELS } from '@stax/payments';
import { refundPolicyConfig } from '@stax/config';
import { EmptyState, Icon, Panel, PermissionDenied } from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
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

export default async function SubscriptionPage() {
  const { workspace } = await getWorkspace();

  if (!workspace.capabilities.includes('billing.view')) {
    return (
      <PermissionDenied message="Votre rôle ne donne pas accès à l’abonnement de maintenance." />
    );
  }

  const subscription = workspace.subscription;
  const refund = refundPolicyConfig();

  const view: SubscriptionView | null = subscription
    ? {
        id: subscription.id,
        statusLabel: SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status,
        statusTone: TONES[subscription.status] ?? 'neutral',
        priceLabel: formatMonthly(subscription.monthly_price_cents, 'EUR'),
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
        description="Ce que couvre votre abonnement mensuel, et comment le gérer."
      />

      {view ? (
        <SubscriptionPanel subscription={view} />
      ) : (
        <EmptyState
          icon={<Icon name="shield-check" size={24} />}
          title="Aucun abonnement actif"
          description="Votre maintenance démarre automatiquement à la mise en ligne de votre site. Vous ne payez rien avant."
        />
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Ce que couvre la maintenance</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
            <li>Hébergement, nom de domaine rattaché et certificat HTTPS renouvelé.</li>
            <li>
              Mises à jour techniques et correctifs de sécurité, sans intervention de votre part.
            </li>
            <li>Sauvegardes régulières et restauration en cas de problème.</li>
            <li>Surveillance de la disponibilité de votre site.</li>
            <li>Assistance par e-mail pour l’usage de votre espace.</li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
            Les refontes, nouvelles pages sur mesure et développements spécifiques ne sont pas
            inclus : ils font l’objet d’un devis distinct.
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
            Vous disposez de {refund.windowDays} jours après la mise en ligne de votre site pour
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

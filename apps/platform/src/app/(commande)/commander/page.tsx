import type { Metadata } from 'next';
import { formatMaintenance, formatMoney } from '@stax/payments';
import { Alert, ButtonLink, Panel } from '@stax/ui';
import { OrderSteps } from '~/components/order/order-steps';
import { deliveryWeeksLabel, getPlans } from '~/lib/catalog';
import { readOrderDraft } from '~/lib/order-draft';
import { PlanChoice } from './plan-choice';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Commander votre site',
  description: 'Choisissez votre offre et lancez la création de votre site professionnel.',
  robots: { index: false, follow: true },
};

export default async function OrderPlanPage() {
  const [plans, draft] = await Promise.all([getPlans(), readOrderDraft()]);
  const purchasable = plans.filter((plan) => !plan.isQuoteOnly);

  return (
    <>
      <OrderSteps current="/commander" />

      <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-3xl">
        Choisissez votre offre
      </h1>
      <p className="mt-3 max-w-2xl text-[var(--foreground-muted)]">
        Chaque offre comprend la conception et le développement de votre site par notre équipe et sa
        mise en ligne sur votre domaine. Vous ne payez maintenant que la création : la maintenance
        mensuelle commence à la livraison, et vous modifiez ensuite vos contenus depuis StaX.
      </p>

      {purchasable.length === 0 ? (
        <Alert tone="warning" className="mt-8" live="status" title="Catalogue indisponible">
          Les offres ne peuvent pas être affichées pour le moment. Réessayez dans quelques instants
          ou{' '}
          <a href="/contact" className="underline underline-offset-4">
            écrivez-nous
          </a>
          .
        </Alert>
      ) : (
        <PlanChoice
          plans={purchasable.map((plan) => ({
            slug: plan.slug,
            name: plan.name,
            tagline: plan.tagline,
            badge: plan.badge,
            signature: plan.highlight === 'signature',
            deliveryLabel: deliveryWeeksLabel(plan.deliveryWeeks),
            setupPrice: formatMoney(plan.setupPriceCents, plan.currency, {
              hideDecimalsWhenRound: true,
            }),
            // La periodicite vient du CONTRAT, jamais d'un libelle en dur :
            // afficher « / mois » sur une maintenance annuelle annoncerait un
            // prix douze fois trop eleve, au moment de la decision d'achat.
            maintenancePrice: formatMaintenance(
              plan.maintenancePriceCents,
              plan.currency,
              plan.billingInterval,
            ),
            // Ce que l'offre comprend, lu dans `plan_inclusions` : la base
            // refuse une inclusion adossee a un droit que l'offre n'accorde pas.
            features: plan.inclusions
              .filter((inclusion) => inclusion.highlight)
              .slice(0, 6)
              .map((inclusion) => inclusion.label),
          }))}
          selected={draft.planSlug ?? null}
        />
      )}

      <Panel level={1} padding="lg" className="mt-10">
        <h2 className="text-sm font-medium">Un projet particulier ?</h2>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">
          Fonctionnalité spécifique, intégration avec un logiciel que vous utilisez déjà, refonte
          complète : nous établissons un devis après un échange.
        </p>
        <ButtonLink href="/devis" variant="secondary" size="sm" className="mt-4">
          Demander un devis
        </ButtonLink>
      </Panel>
    </>
  );
}

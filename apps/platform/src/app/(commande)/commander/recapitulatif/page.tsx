import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { resolveBusiness } from '@stax/business';
import {
  formatMaintenance,
  formatMoney,
  grossFromNet,
  maintenanceTrialDays,
  vatFromNet,
} from '@stax/payments';
import { refundPolicyConfig, sitesDomain } from '@stax/config';
import { Alert, ButtonLink, Panel } from '@stax/ui';
import { OrderSteps } from '~/components/order/order-steps';
import { getPlans } from '~/lib/catalog';
import { readOrderDraft } from '~/lib/order-draft';
import { getSession } from '~/lib/session';
import { TERMS_VERSION } from '~/content/legal';
import { CheckoutForm, InternalOrderForm } from './checkout-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Récapitulatif',
  robots: { index: false, follow: false },
};

const DOMAIN_LABELS: Record<string, string> = {
  customer_owned: 'Vous connectez votre nom de domaine actuel',
  stax_purchase: 'Nous achetons le nom de domaine pour vous',
  subdomain_only: 'Adresse temporaire, domaine choisi plus tard',
  none: 'À définir ensemble',
};

/**
 * Ce qui se passe apres la commande. StaX concoit et construit le site, de
 * zero, sur plusieurs semaines ; le client le decouvre quand il lui est
 * confie. Rien ici ne promet un site disponible le jour meme.
 */
function nextSteps(trialDays: number): string[] {
  return [
    'Votre espace client s’ouvre dès le paiement : vous y suivez l’avancement de votre projet et échangez avec l’équipe.',
    'L’équipe StaX conçoit et construit votre site de A à Z, à partir de vos informations. Comptez quelques semaines.',
    'Quand il est prêt, nous vous le confions : il apparaît dans votre espace, vous le relisez et demandez vos corrections.',
    'Nous le mettons en ligne avec votre accord. Votre première année de maintenance commence ' +
      `à la mise en ligne, et au plus tard ${trialDays} jours après la commande.`,
  ];
}

const INTERNAL_NEXT_STEPS = [
  'La commande est enregistrée sans paiement et l’espace client s’ouvre : il affiche le suivi du projet, comme pour un client.',
  'L’équipe StaX conçoit et construit le site de A à Z depuis l’administration.',
  'Le site n’apparaît dans l’espace client que lorsque l’administration le lui confie.',
  'L’équipe StaX garde la main sur le site en permanence, avant comme après.',
];

export default async function OrderSummaryPage() {
  const draft = await readOrderDraft();
  if (!draft.planSlug) redirect('/commander');
  if (!draft.businessTypeSlug) redirect('/commander/metier');
  if (!draft.organizationName) redirect('/commander/informations');
  if (!draft.domainHandling) redirect('/commander/adresse');

  const [plans, session] = await Promise.all([getPlans(), getSession()]);
  const plan = plans.find((entry) => entry.slug === draft.planSlug);
  if (!plan) redirect('/commander');

  const business = resolveBusiness(draft.businessTypeSlug);
  const refund = refundPolicyConfig();

  // Affichage seulement : c est `create_internal_order` qui verifie, en base,
  // que le compte est bien un compte interne exonere.
  const internal =
    session.profile?.account_type === 'internal' && session.profile.billing_exempt === true;

  // Montants affiches : calcules ici pour l affichage uniquement. Ceux qui
  // partent chez Stripe sont ceux que la BASE fige a la creation de la
  // commande, a partir du catalogue.
  const setupNet = plan.setupPriceCents;
  const setupVat = vatFromNet(setupNet, plan.vatRateBps);
  const setupGross = grossFromNet(setupNet, plan.vatRateBps);
  const maintenanceGross = grossFromNet(plan.maintenancePriceCents, plan.vatRateBps);

  const address =
    draft.domainHandling === 'subdomain_only'
      ? `${draft.subdomain}.${sitesDomain()}`
      : (draft.domainHostname ?? '—');

  return (
    <>
      <OrderSteps current="/commander/recapitulatif" />

      <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-3xl">Récapitulatif</h1>
      <p className="mt-3 max-w-2xl text-[var(--foreground-muted)]">
        {internal
          ? 'Vérifiez ces informations avant d’enregistrer la commande.'
          : 'Vérifiez ces informations avant de régler.'}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="space-y-6">
          <Panel level={2} padding="lg">
            <h2 className="text-sm font-medium">Votre projet</h2>
            <dl className="mt-4 divide-y divide-[var(--border)]">
              <Row label="Offre" value={plan.name} href="/commander" />
              <Row label="Métier" value={business.name} href="/commander/metier" />
              <Row
                label="Entreprise"
                value={draft.organizationName}
                href="/commander/informations"
              />
              {draft.city ? (
                <Row label="Ville" value={draft.city} href="/commander/informations" />
              ) : null}
              <Row
                label="Adresse du site"
                value={address}
                hint={DOMAIN_LABELS[draft.domainHandling] ?? ''}
                href="/commander/adresse"
              />
            </dl>
          </Panel>

          <Panel level={1} padding="lg">
            <h2 className="text-sm font-medium">
              {internal ? 'Ce qui se passe ensuite' : 'Ce qui se passe après le paiement'}
            </h2>
            <ol className="mt-4 space-y-3 text-sm text-[var(--foreground-muted)]">
              {(internal ? INTERNAL_NEXT_STEPS : nextSteps(maintenanceTrialDays())).map(
                (step, index) => (
                  <li key={step}>
                    <strong className="text-[var(--foreground)]">{index + 1}.</strong> {step}
                  </li>
                ),
              )}
            </ol>
          </Panel>
        </div>

        <aside className="lg:sticky lg:top-6">
          {internal ? (
            <Panel level={3} padding="lg">
              <p className="inline-flex rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-xs font-medium text-[var(--accent)]">
                Compte interne StaX
              </p>
              <h2 className="mt-3 text-sm font-medium">Aucun paiement</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--foreground-muted)]">Prix catalogue (HT)</dt>
                  <dd className="tabular-nums line-through">
                    {formatMoney(setupNet, plan.currency)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2 text-base font-medium">
                  <dt>À régler</dt>
                  <dd className="tabular-nums">{formatMoney(0, plan.currency)}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-[var(--foreground-muted)]">
                La commande est enregistrée comme interne : aucune facture, aucun prélèvement. Le
                site sera construit par l’équipe StaX, puis confié à ce compte depuis
                l’administration.
              </p>
              <div className="mt-6">
                <InternalOrderForm />
              </div>
            </Panel>
          ) : (
            <Panel level={3} padding="lg">
              <h2 className="text-sm font-medium">À régler aujourd’hui</h2>

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--foreground-muted)]">Création du site (HT)</dt>
                  <dd className="tabular-nums">{formatMoney(setupNet, plan.currency)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--foreground-muted)]">
                    TVA {(plan.vatRateBps / 100).toFixed(0)} %
                  </dt>
                  <dd className="tabular-nums">{formatMoney(setupVat, plan.currency)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2 text-base font-medium">
                  <dt>Total TTC</dt>
                  <dd className="tabular-nums">{formatMoney(setupGross, plan.currency)}</dd>
                </div>
              </dl>

              <p className="mt-5 border-t border-[var(--border)] pt-4 text-sm text-[var(--foreground-muted)]">
                Puis{' '}
                <strong className="text-[var(--foreground)]">
                  {formatMaintenance(maintenanceGross, plan.currency, plan.billingInterval)}
                </strong>{' '}
                de maintenance, prélevée à partir de la mise en ligne de votre site. Résiliable à
                tout moment depuis votre espace.
              </p>

              <div className="mt-6">
                {session.user ? (
                  <CheckoutForm termsVersion={TERMS_VERSION} refundWindowDays={refund.windowDays} />
                ) : (
                  <>
                    <Alert tone="info" live="status" className="mb-4">
                      Créez votre compte ou connectez-vous pour finaliser. Votre commande est
                      conservée.
                    </Alert>
                    <div className="space-y-2">
                      <ButtonLink
                        href="/inscription?suivant=%2Fcommander%2Frecapitulatif"
                        block
                        size="lg"
                      >
                        Créer mon compte
                      </ButtonLink>
                      <ButtonLink
                        href="/connexion?suivant=%2Fcommander%2Frecapitulatif"
                        variant="secondary"
                        block
                      >
                        J’ai déjà un compte
                      </ButtonLink>
                    </div>
                  </>
                )}
              </div>

              <p className="mt-5 text-xs leading-relaxed text-[var(--muted)]">
                Paiement traité par Stripe. Aucune donnée de carte ne transite par StaX ni n’est
                conservée par nos soins.{' '}
                <Link href="/remboursements" className="underline underline-offset-2">
                  Garantie de {refund.windowDays} jours
                </Link>{' '}
                après la mise en ligne.
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <dt className="text-xs text-[var(--muted)]">{label}</dt>
        <dd className="mt-0.5 text-sm">{value}</dd>
        {hint ? <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p> : null}
      </div>
      <Link
        href={href}
        className="shrink-0 text-xs text-[var(--foreground-muted)] underline underline-offset-4 hover:text-[var(--foreground)]"
      >
        Modifier
      </Link>
    </div>
  );
}

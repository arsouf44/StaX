import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { resolveBusiness } from '@stax/business';
import { formatMaintenance, formatMoney, grossFromNet, vatFromNet } from '@stax/payments';
import { refundPolicyConfig } from '@stax/config';
import { Alert, ButtonLink, Panel } from '@stax/ui';
import { OrderSteps } from '~/components/order/order-steps';
import { deliveryWeeksLabel, getPlans } from '~/lib/catalog';
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
  subdomain_only: 'Domaine choisi plus tard : adresse technique de l’hébergement en attendant',
  none: 'À définir ensemble',
};

/**
 * Ce qui se passe apres la commande. StaX concoit et developpe le site
 * individuellement, dans son propre depot, puis le met en ligne sur son
 * propre projet Cloudflare ; le client en prend la main a la livraison. Rien
 * ici ne promet un site disponible le jour meme.
 */
function nextSteps(deliveryLabel: string): string[] {
  return [
    'Votre espace client s’ouvre dès le paiement : vous y suivez chaque étape de votre projet, envoyez vos informations et vos fichiers, et échangez avec l’équipe.',
    `Nous concevons puis développons votre site pour votre entreprise — pas de modèle à personnaliser. Comptez ${deliveryLabel} à partir de la réception de tous vos éléments.`,
    'Nous le mettons en ligne sur votre domaine, en HTTPS, et vérifions tout avant de vous le livrer.',
    'À la livraison, vous gardez la main : vous modifiez vos textes, photos et informations depuis StaX. La maintenance mensuelle commence ce jour-là, pas avant.',
  ];
}

const INTERNAL_NEXT_STEPS = [
  'La commande est enregistrée sans paiement et l’espace client s’ouvre : il affiche le suivi du projet, comme pour un client.',
  'L’équipe StaX conçoit et développe le site hors de StaX, dans son propre dépôt GitHub et son propre projet Cloudflare, puis le rattache.',
  'Le site n’est modifiable depuis l’espace client que lorsque l’administration le lui livre.',
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
  const delivery = deliveryWeeksLabel(plan.deliveryWeeks);

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
      ? 'Communiquée à la mise en ligne'
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
              <Row
                label="Délai de réalisation"
                value={delivery}
                hint="À compter de la réception de tous vos éléments"
              />
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

          {plan.inclusions.length > 0 ? (
            <Panel level={1} padding="lg">
              <h2 className="text-sm font-medium">Ce que comprend l’offre {plan.name}</h2>
              <ul className="mt-4 grid gap-2 text-sm text-[var(--foreground-muted)] sm:grid-cols-2">
                {plan.inclusions.map((inclusion) => (
                  <li key={inclusion.label} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1 shrink-0 rounded-full bg-[var(--accent-text)]"
                    />
                    <span>{inclusion.label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-[var(--muted)]">
                Cette liste est enregistrée avec votre commande : elle fait foi, même si le
                catalogue évolue ensuite.
              </p>
            </Panel>
          ) : null}

          <Panel level={1} padding="lg">
            <h2 className="text-sm font-medium">
              {internal ? 'Ce qui se passe ensuite' : 'Ce qui se passe après le paiement'}
            </h2>
            <ol className="mt-4 space-y-3 text-sm text-[var(--foreground-muted)]">
              {(internal ? INTERNAL_NEXT_STEPS : nextSteps(delivery)).map((step, index) => (
                <li key={step}>
                  <strong className="text-[var(--foreground)]">{index + 1}.</strong> {step}
                </li>
              ))}
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
                de maintenance, prélevée chaque mois à partir de la <strong>livraison</strong> de
                votre site — rien avant. Votre carte est enregistrée par Stripe pour ce prélèvement.
                Résiliable depuis votre espace, dans les conditions des CGV.
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
  /** Etape ou modifier la valeur ; absente pour une valeur qui en decoule. */
  href?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <dt className="text-xs text-[var(--muted)]">{label}</dt>
        <dd className="mt-0.5 text-sm">{value}</dd>
        {hint ? <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p> : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="shrink-0 text-xs text-[var(--foreground-muted)] underline underline-offset-4 hover:text-[var(--foreground)]"
        >
          Modifier
        </Link>
      ) : null}
    </div>
  );
}

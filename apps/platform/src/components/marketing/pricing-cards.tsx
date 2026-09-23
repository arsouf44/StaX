import Link from 'next/link';
import type { PlanView } from '@stax/database';
import { computeOrderPricing, firstYearTotal, formatMoney } from '@stax/payments';
import { ButtonLink, cn } from '@stax/ui';
import { deliveryPolicyConfig } from '@stax/config';

/**
 * Cartes tarifaires.
 *
 * Les montants viennent de la table `plans` et le calcul de la TVA du meme
 * module que celui utilise au paiement. Aucun prix n est ecrit en dur ici.
 *
 * Le cout reel de la premiere annee est affiche explicitement : le client doit
 * voir ce qu il paiera sur douze mois, pas seulement le prix d appel. La
 * maintenance StaX est ANNUELLE : une seule echeance la premiere annee.
 */

interface PricingCardsProps {
  plans: PlanView[];
  /** Met en avant les fonctionnalites differenciantes plutot que la liste entiere. */
  compact?: boolean;
  className?: string;
}

/**
 * Fonctionnalites mises en avant par offre, dans l ordre de lecture.
 *
 * Cette liste doit rester le reflet exact des droits accordes dans la migration
 * de donnees de reference. Annoncer ici une fonction que l offre n ouvre pas
 * serait une pratique commerciale trompeuse, pas une maladresse de redaction.
 */
// Le delai annonce ENGAGE le vendeur (article L.216-1 du Code de la
// consommation). Il vit dans la configuration, pas dans une chaine recopiee
// qu'un changement de politique laisserait derriere lui.
const DELIVERY = deliveryPolicyConfig().label;

const HIGHLIGHTS: Record<string, string[]> = {
  essentiel: [
    `Site professionnel conçu par notre équipe, livré en ${DELIVERY}`,
    'Votre nom de domaine connecté, HTTPS automatique',
    'Hébergement, sauvegardes et surveillance inclus',
    'Formulaire de contact et boîte de réception',
    'Référencement technique complet',
    'Vous modifiez textes, photos et horaires vous-même',
    'Chaque modification est réversible',
  ],
  premium: [
    'Tout ce que comprend l’offre Essentiel',
    'Réservations et prises de rendez-vous en ligne',
    'Actualités et publication programmée',
    'Statistiques détaillées de fréquentation',
    'Modules métier avancés selon votre activité',
    'Sans encaissement en ligne — voir Ultra Premium',
  ],
  'ultra-premium': [
    'Tout ce que comprend l’offre Premium',
    'Site multilingue',
    'Boutique en ligne et encaissement sur votre propre compte',
    'Comptes clients sur votre site',
    'Design entièrement personnalisé, pas un modèle',
    'Animations et interactions travaillées',
    'Support prioritaire',
  ],
  'sur-mesure': [
    'Étude de votre besoin avec un interlocuteur dédié',
    'Application métier ou intégrations spécifiques',
    'Reprise de données et migration',
    'Volumétries importantes',
    'Engagements de service adaptés',
    'Devis détaillé, ligne par ligne',
  ],
};

export function PricingCards({ plans, compact = false, className }: PricingCardsProps) {
  if (plans.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-10 text-center">
        <p className="text-sm text-[var(--foreground-muted)]">
          Le catalogue tarifaire est momentanément indisponible.{' '}
          <Link href="/contact" className="underline underline-offset-4">
            Contactez-nous
          </Link>{' '}
          pour obtenir nos tarifs.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('grid gap-4 lg:grid-cols-4', className)}>
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} compact={compact} />
      ))}
    </div>
  );
}

/**
 * Ligne de quotas, DERIVEE du catalogue.
 *
 * « Jusqu'a 8 pages, 2 collaborateurs » etait ecrit a la main sous chaque
 * offre. Ces chiffres sont factuels et opposables : une carte qui en annonce
 * un que la base n'accorde pas est une pratique commerciale trompeuse. Ils
 * sont donc lus, jamais recopies.
 */
function quotaLine(plan: PlanView): string | null {
  const limit = (key: string) => plan.features.find((feature) => feature.key === key) ?? null;

  const parts: string[] = [];

  const pages = limit('max_pages');
  if (pages?.enabled) {
    // `enabled` avec une limite absente signifie « illimite » : c'est la
    // convention de `app.feature_limit`, et elle se lit ici a l'identique.
    parts.push(pages.limitValue === null ? 'pages illimitées' : `${pages.limitValue} pages`);
  }

  const members = limit('max_team_members');
  if (members?.enabled && members.limitValue !== null) {
    parts.push(`${members.limitValue} collaborateurs`);
  }

  const sites = limit('max_sites');
  if (sites?.enabled && sites.limitValue !== null && sites.limitValue > 1) {
    parts.push(`${sites.limitValue} sites`);
  }

  if (parts.length === 0) return null;
  return `Jusqu’à ${parts.join(', ')}`;
}

function PlanCard({ plan, compact }: { plan: PlanView; compact: boolean }) {
  const featured = Boolean(plan.badge);
  const quota = quotaLine(plan);
  const highlights = [...(HIGHLIGHTS[plan.slug] ?? []), ...(quota ? [quota] : [])];
  const visible = compact ? highlights.slice(0, 5) : highlights;

  const pricing = plan.isQuoteOnly
    ? null
    : computeOrderPricing({
        slug: plan.slug,
        setupPriceCents: plan.setupPriceCents,
        maintenancePriceCents: plan.maintenancePriceCents,
        billingInterval: plan.billingInterval,
        vatRateBps: plan.vatRateBps,
        pricesIncludeVat: plan.pricesIncludeVat,
        currency: plan.currency,
        isQuoteOnly: plan.isQuoteOnly,
      });

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-[var(--radius-xl)] p-7 transition-[border-color,transform] duration-300',
        featured
          ? 'glass-edge bg-[linear-gradient(180deg,rgb(20_124_255/0.14),transparent_45%)] ring-1 glass-2 ring-[var(--accent)]/45 lg:-translate-y-2'
          : 'border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]',
      )}
    >
      {featured ? (
        <span className="absolute -top-3 left-7 rounded-full bg-[var(--accent)] px-3 py-1 text-2xs font-medium text-white shadow-[0_8px_24px_-10px_var(--accent-glow)]">
          {plan.badge}
        </span>
      ) : null}

      <h3 className="text-xl font-semibold tracking-[-0.025em]">{plan.name}</h3>
      {plan.tagline ? (
        <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">{plan.tagline}</p>
      ) : null}

      <div className="mt-6">
        {plan.isQuoteOnly ? (
          <>
            <p className="text-4xl font-semibold tracking-[-0.04em]">Sur devis</p>
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              Chiffrage détaillé après étude de votre besoin
            </p>
          </>
        ) : (
          <>
            <p className="flex items-baseline gap-1.5">
              <span className="text-[2rem] font-semibold tracking-[-0.04em] tabular-nums xl:text-[2.25rem]">
                {formatMoney(plan.setupPriceCents)}
              </span>
              <span className="text-xs text-[var(--muted)]">HT à la commande</span>
            </p>
            <p className="mt-1.5 text-sm text-[var(--foreground-muted)] tabular-nums">
              puis{' '}
              <span className="font-medium text-[var(--foreground)]">
                {formatMoney(plan.maintenancePriceCents, plan.currency, {
                  hideDecimalsWhenRound: true,
                })}
              </span>{' '}
              par an
            </p>
            {pricing ? (
              <p className="mt-2 text-xs text-[var(--muted)] tabular-nums">
                Soit {formatMoney(pricing.totalCents)} TTC à la commande ·{' '}
                {formatMoney(
                  firstYearTotal({
                    slug: plan.slug,
                    setupPriceCents: plan.setupPriceCents,
                    maintenancePriceCents: plan.maintenancePriceCents,
                    billingInterval: plan.billingInterval,
                    vatRateBps: plan.vatRateBps,
                    pricesIncludeVat: plan.pricesIncludeVat,
                    currency: plan.currency,
                    isQuoteOnly: plan.isQuoteOnly,
                  }),
                )}{' '}
                TTC la première année
              </p>
            ) : null}
          </>
        )}
      </div>

      <ButtonLink
        href={plan.isQuoteOnly ? '/devis' : `/commander?offre=${plan.slug}`}
        variant={featured ? 'accent' : 'secondary'}
        size="pill"
        block
        className="mt-7"
      >
        {plan.isQuoteOnly ? 'Demander un devis' : 'Choisir cette offre'}
      </ButtonLink>

      <ul className="mt-6 space-y-2.5 border-t border-[var(--border)] pt-6">
        {visible.map((feature) => (
          <li key={feature} className="flex gap-2.5 text-sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className={cn(
                'mt-0.5 size-3.5 shrink-0',
                featured ? 'text-[var(--accent-text)]' : 'text-[var(--muted-strong)]',
              )}
            >
              <path d="m3 8.5 3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="leading-relaxed text-[var(--foreground-muted)]">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tableau comparatif complet, aligne sur les droits reellement appliques. */
export function PlanComparisonTable({ plans }: { plans: PlanView[] }) {
  const billable = plans.filter((plan) => !plan.isQuoteOnly);
  if (billable.length === 0) return null;

  const categories = new Map<string, Map<string, { label: string; unit: string | null }>>();
  for (const plan of billable) {
    for (const feature of plan.features) {
      if (!categories.has(feature.category)) categories.set(feature.category, new Map());
      categories
        .get(feature.category)
        ?.set(feature.key, { label: feature.label, unit: feature.unit });
    }
  }

  const CATEGORY_LABELS: Record<string, string> = {
    site: 'Votre site',
    design: 'Design',
    modules: 'Fonctionnalités métier',
    analytics: 'Statistiques',
    organisation: 'Organisation',
    support: 'Accompagnement',
    limits: 'Limites incluses',
  };

  return (
    <div
      role="region"
      aria-label="Comparaison détaillée des offres"
      tabIndex={0}
      className="relative overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <caption className="sr-only">
          Comparaison des fonctionnalités incluses dans chaque offre StaX
        </caption>
        <thead className="border-b border-[var(--border)] bg-[var(--background-subtle)]">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-[var(--muted)]">
              Fonctionnalité
            </th>
            {billable.map((plan) => (
              <th key={plan.id} scope="col" className="px-4 py-3 text-center text-xs font-medium">
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {[...categories.entries()].map(([category, features]) => (
            <>
              <tr key={category} className="bg-[var(--background-inset)]">
                <th
                  scope="colgroup"
                  colSpan={billable.length + 1}
                  className="px-4 py-2 text-left text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase"
                >
                  {CATEGORY_LABELS[category] ?? category}
                </th>
              </tr>
              {[...features.entries()].map(([key, meta]) => (
                <tr key={key}>
                  <th
                    scope="row"
                    className="px-4 py-3 text-left font-normal text-[var(--foreground-muted)]"
                  >
                    {meta.label}
                  </th>
                  {billable.map((plan) => {
                    const feature = plan.features.find((f) => f.key === key);
                    return (
                      <td key={plan.id} className="px-4 py-3 text-center">
                        <FeatureCell feature={feature} unit={meta.unit} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeatureCell({
  feature,
  unit,
}: {
  feature: { kind: 'boolean' | 'limit'; enabled: boolean; limitValue: number | null } | undefined;
  unit: string | null;
}) {
  if (!feature || !feature.enabled) {
    return (
      <>
        <span aria-hidden="true" className="text-[var(--border-strong)]">
          —
        </span>
        <span className="sr-only">Non inclus</span>
      </>
    );
  }
  if (feature.kind === 'limit') {
    return (
      <span className="tabular-nums">
        {feature.limitValue === null
          ? 'Illimité'
          : `${feature.limitValue.toLocaleString('fr-FR')}${unit ? ` ${unit}` : ''}`}
      </span>
    );
  }
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="mx-auto size-4 text-[var(--success)]"
      >
        <path d="m3 8.5 3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">Inclus</span>
    </>
  );
}

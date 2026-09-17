import Link from 'next/link';
import type { PlanView } from '@stax/database';
import { computeOrderPricing, firstYearTotal, formatMoney } from '@stax/payments';
import { ButtonLink, cn } from '@stax/ui';

/**
 * Cartes tarifaires.
 *
 * Les montants viennent de la table `plans` et le calcul de la TVA du meme
 * module que celui utilise au paiement. Aucun prix n est ecrit en dur ici.
 *
 * Le cout reel de la premiere annee est affiche explicitement : le client doit
 * voir ce qu il paiera sur douze mois, pas seulement le prix d appel.
 */

interface PricingCardsProps {
  plans: PlanView[];
  /** Met en avant les fonctionnalites differenciantes plutot que la liste entiere. */
  compact?: boolean;
  className?: string;
}

/** Fonctionnalites mises en avant par offre, dans l ordre de lecture. */
const HIGHLIGHTS: Record<string, string[]> = {
  classique: [
    'Site professionnel sur mesure, conçu par notre équipe',
    'Nom de domaine connecté et HTTPS automatique',
    'Hébergement et sauvegardes inclus',
    'Formulaire de contact et boîte de réception',
    'Référencement technique complet',
    'Éditeur de contenu : textes, photos, horaires',
    'Statistiques de fréquentation',
    'Maintenance, mises à jour et support',
  ],
  premium: [
    'Tout ce que comprend l’offre Classique',
    'Réservations ou prises de rendez-vous en ligne',
    'Paiement en ligne sur votre propre compte',
    'Modules métier avancés selon votre activité',
    'Comptes clients sur votre site',
    'Vente en ligne et catalogue produits',
    'Actualités et publication programmée',
    'Statistiques détaillées : sources et conversions',
  ],
  signature: [
    'Tout ce que comprend l’offre Premium',
    'Design entièrement personnalisé, pas un modèle',
    'Animations et interactions travaillées',
    'Architecture métier complexe',
    'Nombre de pages illimité',
    'Site multilingue',
    'Jusqu’à 3 sites et 15 collaborateurs',
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

function PlanCard({ plan, compact }: { plan: PlanView; compact: boolean }) {
  const featured = Boolean(plan.badge);
  const highlights = HIGHLIGHTS[plan.slug] ?? [];
  const visible = compact ? highlights.slice(0, 5) : highlights;

  const pricing = plan.isQuoteOnly
    ? null
    : computeOrderPricing({
        slug: plan.slug,
        setupPriceCents: plan.setupPriceCents,
        monthlyPriceCents: plan.monthlyPriceCents,
        vatRateBps: plan.vatRateBps,
        pricesIncludeVat: plan.pricesIncludeVat,
        currency: plan.currency,
        isQuoteOnly: plan.isQuoteOnly,
      });

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-[var(--radius-lg)] p-6',
        featured
          ? 'glass-edge ring-1 glass-2 ring-[var(--accent)]/30'
          : 'border border-[var(--border)] bg-[var(--surface)]',
      )}
    >
      {featured ? (
        <span className="absolute -top-2.5 left-6 rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-2xs font-medium text-white">
          {plan.badge}
        </span>
      ) : null}

      <h3 className="text-lg font-medium tracking-[-0.02em]">{plan.name}</h3>
      {plan.tagline ? (
        <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">{plan.tagline}</p>
      ) : null}

      <div className="mt-6">
        {plan.isQuoteOnly ? (
          <>
            <p className="text-3xl font-medium tracking-[-0.03em]">Sur devis</p>
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              Chiffrage détaillé après étude de votre besoin
            </p>
          </>
        ) : (
          <>
            <p className="flex items-baseline gap-1.5">
              <span className="text-3xl font-medium tracking-[-0.03em] tabular-nums">
                {formatMoney(plan.setupPriceCents)}
              </span>
              <span className="text-xs text-[var(--muted)]">HT à la commande</span>
            </p>
            <p className="mt-1.5 text-sm text-[var(--foreground-muted)] tabular-nums">
              puis{' '}
              <span className="font-medium text-[var(--foreground)]">
                {formatMoney(plan.monthlyPriceCents, plan.currency, {
                  hideDecimalsWhenRound: true,
                })}
              </span>{' '}
              par mois
            </p>
            {pricing ? (
              <p className="mt-2 text-xs text-[var(--muted)] tabular-nums">
                Soit {formatMoney(pricing.totalCents)} TTC à la commande ·{' '}
                {formatMoney(
                  firstYearTotal({
                    slug: plan.slug,
                    setupPriceCents: plan.setupPriceCents,
                    monthlyPriceCents: plan.monthlyPriceCents,
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
        variant={featured ? 'primary' : 'secondary'}
        block
        className="mt-6"
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
                featured ? 'text-[var(--accent)]' : 'text-[var(--success)]',
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
      className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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

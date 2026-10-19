import Link from 'next/link';
import { deliveryPolicyConfig, pricingPolicyConfig } from '@nemasus/config';

/**
 * Le prix, et ce qui protège le client : un seul bloc, une seule fois.
 *
 * Ces conditions étaient dispersées entre le titre de l'accueil, le parcours,
 * les réalisations et la foire aux questions — « sans engagement » ici,
 * « aucun paiement à la commande » là, le remboursement ailleurs. Répétée,
 * une garantie cesse d'être lue ; éparpillée, elle devient impossible à
 * vérifier. Elle vit donc ici, et les pages appellent ce bloc.
 *
 * Le prix de départ s'affiche AVEC son coût récurrent, jamais seul : voir
 * `pricingPolicyConfig()`, qui explique pourquoi.
 */

/** Les conditions, dans l'ordre où le client se les pose. */
function terms(): readonly string[] {
  const delivery = deliveryPolicyConfig();
  return [
    'Commander est gratuit : aucun paiement, aucun compte à créer, aucun engagement à cette étape.',
    `Nous étudions votre demande, puis nous vous adressons par écrit le montant exact et le délai de réalisation (${delivery.label} à compter de la réception de vos éléments). Vous ne payez qu’une fois d’accord.`,
    'Tant que la réalisation n’a pas commencé, vous annulez et vous êtes intégralement remboursé.',
    'Ensuite, une annulation donne lieu au remboursement des sommes versées, déduction faite du travail accompli, dont nous vous justifions le détail.',
  ];
}

/**
 * Mention courte du prix, pour le haut d'une page : le visiteur doit savoir
 * s'il est au bon endroit avant de défiler. Rien si le prix n'est pas publié.
 */
export function PriceLine({ className }: { className?: string }) {
  const pricing = pricingPolicyConfig();
  if (!pricing.published) return null;
  return <p className={className}>{pricing.sentence}</p>;
}

export function OfferTerms() {
  const pricing = pricingPolicyConfig();

  return (
    <div
      id="conditions"
      className="mt-[clamp(48px,7vh,80px)] scroll-mt-28 border-t border-[var(--border)] pt-10"
    >
      <h2 className="font-serif text-[clamp(1.5rem,2.4vw,2rem)] leading-snug text-[var(--ink)]">
        Le prix, et ce qui vous protège
      </h2>

      {pricing.published ? (
        <p className="mt-5 max-w-[60ch] text-[clamp(17px,1.7vw,20px)] leading-relaxed text-[var(--ink)]">
          <span className="font-medium">{pricing.fromLabel}</span>
          {pricing.maintenanceIncludedFirstYear ? (
            <>
              {' '}
              pour un site conçu et développé pour votre entreprise, maintenance comprise la
              première année, puis <span className="font-medium">{pricing.maintenanceLabel}</span>.
            </>
          ) : (
            <>
              {' '}
              pour un site conçu et développé pour votre entreprise, plus{' '}
              <span className="font-medium">{pricing.maintenanceLabel}</span> de maintenance.
            </>
          )}
        </p>
      ) : null}

      <p className="mt-3 max-w-[70ch] text-[14px] leading-relaxed text-[var(--muted)]">
        {pricing.published
          ? 'Le prix final dépend de ce que votre activité demande : nombre de pages, réservations, boutique, intégrations. Nous vous l’indiquons par écrit avant tout paiement.'
          : 'Chaque site est conçu sur mesure : nous étudions votre demande, puis nous vous adressons le montant par écrit avant tout paiement.'}
      </p>

      <ul className="mt-8 grid gap-x-10 gap-y-5 sm:grid-cols-2">
        {terms().map((term) => (
          <li
            key={term}
            className="relative max-w-[46ch] pl-6 text-[14.5px] leading-relaxed text-[var(--ink-2)]"
          >
            <span
              aria-hidden="true"
              className="absolute top-[0.62em] left-0 size-1.5 rounded-full bg-[var(--border-strong)]"
            />
            {term}
          </li>
        ))}
      </ul>

      <p className="mt-7 text-[13.5px] text-[var(--muted)]">
        Montants hors taxes : nos prestations sont réservées aux professionnels et aux associations.{' '}
        <Link href="/cgv#remboursement" className="underline underline-offset-4">
          Conditions d’annulation et de remboursement
        </Link>
      </p>
    </div>
  );
}

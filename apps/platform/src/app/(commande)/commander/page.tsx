import type { Metadata } from 'next';
import Link from 'next/link';
import { listBusinesses, SECTORS } from '@nemasus/business';
import { OrderSteps } from '~/components/order/order-steps';
import { readOrderDraft } from '~/lib/order-draft';
import { BusinessChoice } from './business-choice';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Commander votre site',
  description:
    'Commandez votre site professionnel : votre activité, vos coordonnées, votre adresse web. ' +
    'Paiement par virement, code d’accès personnel à réception.',
  alternates: { canonical: '/commander' },
  robots: { index: false, follow: true },
};

/**
 * Première étape de la commande : l'activité.
 *
 * Aucun choix d'offre, aucun prix : chaque site est conçu sur mesure et le
 * montant est convenu avec le client, qui le règle par virement. Le métier
 * détermine les questions posées ensuite et le vocabulaire de son espace.
 */
export default async function OrderBusinessPage() {
  const draft = await readOrderDraft();
  const businesses = listBusinesses();

  return (
    <>
      <OrderSteps current="/commander" />

      <h1 className="title-page">Quelle est votre activité ?</h1>
      <p className="mt-3 max-w-2xl text-[var(--foreground-muted)]">
        Commander ne vous engage à aucun paiement immédiat. Vous nous décrivez votre entreprise,
        nous vous envoyons les modalités de paiement par virement, puis votre code d’accès personnel
        dès réception.{' '}
        <Link href="/comment-ca-marche" className="underline underline-offset-4">
          Comment ça marche
        </Link>
      </p>

      <BusinessChoice
        sectors={SECTORS.map((sector) => ({
          id: sector.id,
          name: sector.label,
          icon: sector.icon,
          description: sector.description,
        }))}
        businesses={businesses.map((business) => ({
          id: business.id,
          sector: business.sector,
          name: business.name,
          icon: business.icon,
        }))}
        selectedSector={draft.sectorSlug ?? null}
        selectedBusiness={draft.businessTypeSlug ?? null}
      />
    </>
  );
}

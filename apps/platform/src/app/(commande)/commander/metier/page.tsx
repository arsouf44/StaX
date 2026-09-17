import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { listBusinesses, SECTORS } from '@stax/business';
import { OrderSteps } from '~/components/order/order-steps';
import { readOrderDraft } from '~/lib/order-draft';
import { BusinessChoice } from './business-choice';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Votre métier',
  robots: { index: false, follow: false },
};

export default async function OrderBusinessPage() {
  const draft = await readOrderDraft();
  // On ne saute pas d etape : sans offre choisie, il n y a rien a configurer.
  if (!draft.planSlug) redirect('/commander');

  const businesses = listBusinesses();

  return (
    <>
      <OrderSteps current="/commander/metier" />

      <h1 className="text-2xl font-medium tracking-[-0.02em] sm:text-3xl">
        Quel est votre métier ?
      </h1>
      <p className="mt-3 max-w-2xl text-[var(--foreground-muted)]">
        Ce choix détermine les pages proposées, les fonctionnalités activées et le vocabulaire de
        votre espace. Un restaurateur gère une carte, un plombier des zones d’intervention : ce
        n’est pas la même chose.
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

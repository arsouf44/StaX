import type { Metadata } from 'next';
import Link from 'next/link';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Mes disponibilités' };

/**
 * Ce que l on peut reserver, et quand.
 *
 * Les demandes recues vivent dans « Mes réservations » ; ici, on regle ce
 * que le site propose. Sans prestation ni plage, le site n affiche aucun
 * creneau : c est dit en clair, plutot que de laisser un formulaire vide.
 */
export default function Page() {
  return (
    <ModulePage
      module="booking"
      feature="bookings"
      title="Mes disponibilités"
      description="Ce que vos clients peuvent réserver en ligne, et à quels moments. Votre site ne propose que les créneaux libres."
    >
      <div className="space-y-12">
        <CollectionSection collection="booking-services" />
        <CollectionSection collection="availability" />
        <p className="text-sm text-[var(--foreground-muted)]">
          Les demandes de vos clients arrivent dans{' '}
          <Link href="/app/reservations" className="underline underline-offset-2">
            Mes réservations
          </Link>
          . Pour fermer un jour précis (congés, jour férié), déclarez une fermeture dans{' '}
          <Link href="/app/horaires" className="underline underline-offset-2">
            Mes horaires
          </Link>
          .
        </p>
      </div>
    </ModulePage>
  );
}

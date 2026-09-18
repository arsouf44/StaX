import type { Metadata } from 'next';
import { BOOKING_STATUS_LABELS, BOOKING_TRANSITIONS, statusLabel } from '@stax/business';
import { unwrapList, unwrapMaybe } from '@stax/database';
import { PermissionDenied } from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';
import { getWorkspace } from '~/lib/workspace';
import { BookingList, type BookingView } from './booking-list';

export const metadata: Metadata = { title: 'Mes réservations' };

/** Libelle du bouton, pas du statut : « Confirmer » plutot que « Confirmée ». */
const TRANSITION_LABELS: Record<
  string,
  { label: string; tone: 'primary' | 'secondary' | 'ghost' }
> = {
  confirmed: { label: 'Confirmer', tone: 'primary' },
  seated: { label: 'Le client est arrivé', tone: 'secondary' },
  completed: { label: 'Marquer comme honorée', tone: 'secondary' },
  cancelled: { label: 'Annuler', tone: 'ghost' },
  no_show: { label: 'Client absent', tone: 'ghost' },
};

export default async function BookingsPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;

  const canView = workspace.capabilities.includes('inbox.view');
  const canManage = workspace.capabilities.includes('inbox.manage');

  const rows =
    canView && site
      ? unwrapList<{
          id: string;
          reference: string;
          customer_name: string;
          customer_email: string | null;
          customer_phone: string | null;
          customer_note: string | null;
          party_size: number;
          starts_at: string;
          status: string;
          booking_services: { name: string } | null;
        }>(
          (await db
            .from('bookings')
            .select(
              'id, reference, customer_name, customer_email, customer_phone, customer_note, party_size, starts_at, status, booking_services ( name )',
            )
            .eq('organization_id', workspace.organization.id)
            .eq('site_id', site.id)
            .order('starts_at', { ascending: true })
            .limit(200)) as never,
        )
      : [];

  // Le fuseau du site fait foi pour l'affichage : une table reservee a 20 h
  // s'affiche a 20 h, quel que soit le fuseau du navigateur qui consulte. Les
  // instants restent stockes en UTC.
  const settings = site
    ? unwrapMaybe<{ timezone: string }>(
        (await db.from('sites').select('timezone').eq('id', site.id).maybeSingle()) as never,
      )
    : null;

  const dateFormat = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: settings?.timezone ?? 'Europe/Paris',
  });

  const bookings: BookingView[] = rows.map((row) => {
    const label = statusLabel(BOOKING_STATUS_LABELS, row.status);
    const transitions = canManage ? (BOOKING_TRANSITIONS[row.status] ?? []) : [];

    return {
      id: row.id,
      reference: row.reference,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      customerPhone: row.customer_phone,
      customerNote: row.customer_note,
      partySize: row.party_size,
      serviceName: row.booking_services?.name ?? null,
      startsAtIso: row.starts_at,
      startsAtLabel: dateFormat.format(new Date(row.starts_at)),
      status: row.status,
      statusLabel: label.label,
      statusTone: label.tone as StatusTone,
      actions: transitions.flatMap((status) => {
        const transition = TRANSITION_LABELS[status];
        return transition ? [{ status, ...transition }] : [];
      }),
    };
  });

  return (
    <ModulePage
      module="booking"
      feature="bookings"
      title="Mes réservations"
      description="Les demandes reçues depuis votre site, et les règles qui décident des créneaux proposés."
    >
      <div className="space-y-12">
        <section aria-labelledby="demandes" className="space-y-4">
          <div>
            <h2 id="demandes" className="text-base font-medium">
              Demandes reçues
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)]">
              Les horaires sont affichés dans le fuseau horaire de votre établissement (
              {settings?.timezone ?? 'Europe/Paris'}).
            </p>
          </div>

          {canView ? (
            <BookingList bookings={bookings} />
          ) : (
            <PermissionDenied message="Votre rôle ne donne pas accès aux demandes de réservation." />
          )}
        </section>

        <CollectionSection collection="booking-services" />
        <CollectionSection collection="availability" />
      </div>
    </ModulePage>
  );
}

'use server';

import { revalidatePath } from 'next/cache';
import { BOOKING_TRANSITIONS } from '@stax/business';
import { unwrapMaybe } from '@stax/database';
import { bookingStatusUpdateSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace } from '~/lib/workspace';

/**
 * Changement d'etat d'une reservation.
 *
 * L'etat demande doit etre une transition AUTORISEE depuis l'etat courant lu en
 * base. Un navigateur qui poste `completed` sur une reservation annulee est
 * refuse : la machine a etats n'est pas une convention d'interface, c'est une
 * regle verifiee cote serveur a chaque appel.
 */
export async function updateBookingStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = bookingStatusUpdateSchema.safeParse({
    bookingId: formData.get('bookingId'),
    status: formData.get('status'),
    internalNote: formData.get('internalNote') ?? undefined,
    cancellationReason: formData.get('cancellationReason') ?? undefined,
  });

  if (!parsed.success) {
    return { status: 'error', message: 'Cette demande n’a pas pu être traitée.' };
  }

  const { workspace, db, userId } = await getWorkspace();

  if (!workspace.capabilities.includes('inbox.manage')) {
    return {
      status: 'error',
      message: 'Votre rôle ne permet pas de gérer les réservations.',
    };
  }

  const guard = await guardAction({ limit: 'apiWrite', userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const booking = unwrapMaybe<{ id: string; status: string }>(
    (await db
      .from('bookings')
      .select('id, status')
      .eq('id', parsed.data.bookingId)
      .eq('organization_id', workspace.organization.id)
      .maybeSingle()) as never,
  );

  if (!booking) return { status: 'error', message: 'Cette réservation est introuvable.' };

  const allowed = BOOKING_TRANSITIONS[booking.status] ?? [];
  if (!allowed.includes(parsed.data.status)) {
    return {
      status: 'error',
      message:
        'Ce changement n’est pas possible depuis l’état actuel de la réservation. Rechargez la page : quelqu’un l’a peut-être déjà traitée.',
    };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.internalNote) patch.internal_note = parsed.data.internalNote;
  if (parsed.data.status === 'confirmed') patch.confirmed_at = now;
  if (parsed.data.status === 'cancelled') {
    patch.cancelled_at = now;
    if (parsed.data.cancellationReason) {
      patch.cancellation_reason = parsed.data.cancellationReason;
    }
  }

  const { error } = await db
    .from('bookings')
    .update(patch)
    .eq('id', booking.id)
    .eq('organization_id', workspace.organization.id)
    // Verrou optimiste : si l'etat a change entre la lecture et l'ecriture,
    // aucune ligne n'est touchee plutot que d'ecraser la decision d'un collegue.
    .eq('status', booking.status);

  if (error) {
    return { status: 'error', message: 'Le changement n’a pas pu être enregistré.' };
  }

  revalidatePath('/app/reservations');
  return { status: 'success', message: 'Réservation mise à jour.' };
}

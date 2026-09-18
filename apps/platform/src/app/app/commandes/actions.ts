'use server';

import { revalidatePath } from 'next/cache';
import { SHOP_ORDER_TRANSITIONS } from '@stax/business';
import { unwrapMaybe } from '@stax/database';
import { optionalText, uuidSchema } from '@stax/validation';
import { z } from 'zod';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace } from '~/lib/workspace';

/**
 * Avancement d'une commande de boutique.
 *
 * `paid` et `refunded` ne figurent dans AUCUNE transition autorisee ici : ces
 * deux etats ne peuvent venir que d'un evenement Stripe signe et verifie. Un
 * commercant ne peut pas declarer une commande payée depuis son navigateur, et
 * le navigateur d'un client encore moins.
 */

const schema = z.object({
  orderId: uuidSchema,
  status: z.enum(['preparing', 'fulfilled', 'cancelled']),
  internalNote: optionalText(1000),
});

export async function updateShopOrderStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse({
    orderId: formData.get('orderId'),
    status: formData.get('status'),
    internalNote: formData.get('internalNote') ?? undefined,
  });

  if (!parsed.success) return { status: 'error', message: 'Cette action n’est pas possible.' };

  const { workspace, db, userId } = await getWorkspace();

  if (!workspace.capabilities.includes('commerce.manage')) {
    return { status: 'error', message: 'Votre rôle ne permet pas de gérer les commandes.' };
  }

  const guard = await guardAction({ limit: 'apiWrite', userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const order = unwrapMaybe<{ id: string; status: string }>(
    (await db
      .from('shop_orders')
      .select('id, status')
      .eq('id', parsed.data.orderId)
      .eq('organization_id', workspace.organization.id)
      .maybeSingle()) as never,
  );

  if (!order) return { status: 'error', message: 'Cette commande est introuvable.' };

  const allowed = SHOP_ORDER_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(parsed.data.status)) {
    return {
      status: 'error',
      message:
        'Ce changement n’est pas possible depuis l’état actuel de la commande. Rechargez la page pour voir son état réel.',
    };
  }

  const patch: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.internalNote) patch.internal_note = parsed.data.internalNote;
  if (parsed.data.status === 'fulfilled') patch.fulfilled_at = new Date().toISOString();
  if (parsed.data.status === 'cancelled') patch.cancelled_at = new Date().toISOString();

  const { error } = await db
    .from('shop_orders')
    .update(patch)
    .eq('id', order.id)
    .eq('organization_id', workspace.organization.id)
    .eq('status', order.status);

  if (error) return { status: 'error', message: 'Le changement n’a pas pu être enregistré.' };

  revalidatePath('/app/commandes');
  return { status: 'success', message: 'Commande mise à jour.' };
}

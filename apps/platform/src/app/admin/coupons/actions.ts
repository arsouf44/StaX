'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient } from '@stax/database';
import { boundedText, optionalText, uuidSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import { requireAdminRole } from '~/lib/admin';
import type { ActionState } from '~/lib/form-state';

/**
 * Codes promotionnels.
 *
 * Un code ne fixe JAMAIS un montant : il declare une regle de remise, et c'est
 * `app.compute_order_pricing` qui recalcule le prix au moment de la commande.
 * Un code cree ici ne peut donc pas produire un montant que le catalogue
 * refuserait.
 *
 * Un code n'est pas non plus modifiable apres creation : des commandes peuvent
 * deja s'y referer, et changer la remise a posteriori rendrait leur historique
 * incoherent. On le desactive, on en cree un autre.
 */

const createSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9-]+$/, 'Lettres, chiffres et tirets uniquement.'),
    label: boundedText(3, 120, 'Le libellé'),
    kind: z.enum(['percent', 'amount']),
    value: z.coerce.number().int().min(1),
    appliesTo: z.enum(['setup', 'maintenance', 'both']),
    maxRedemptions: z.coerce.number().int().min(1).max(100_000).optional(),
    validUntil: optionalText(40),
  })
  .strict();

export async function createCouponAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = createSchema.safeParse({
    code: formData.get('code'),
    label: formData.get('label'),
    kind: formData.get('kind'),
    value: formData.get('value'),
    appliesTo: formData.get('appliesTo'),
    maxRedemptions: formData.get('maxRedemptions') || undefined,
    validUntil: formData.get('validUntil') || undefined,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Vérifiez le code, le libellé et la valeur de la remise.',
    };
  }

  // Une remise en pourcentage au-dela de 100 % n'a pas de sens : la base
  // l'accepterait comme un entier, le calcul donnerait un total negatif.
  if (parsed.data.kind === 'percent' && parsed.data.value > 100) {
    return { status: 'error', message: 'Une remise en pourcentage ne dépasse pas 100.' };
  }

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);

  const { error } = await db.from('coupons').insert({
    code: parsed.data.code.toUpperCase(),
    label: parsed.data.label,
    kind: parsed.data.kind,
    // Un pourcentage est stocke tel quel, un montant en CENTIMES : l'interface
    // demande des euros, la conversion se fait ici et nulle part ailleurs.
    value: parsed.data.kind === 'amount' ? parsed.data.value * 100 : parsed.data.value,
    applies_to: parsed.data.appliesTo,
    max_redemptions: parsed.data.maxRedemptions ?? null,
    valid_until: parsed.data.validUntil ? new Date(parsed.data.validUntil).toISOString() : null,
    is_active: true,
    created_by: session.user.id,
  });

  if (error) {
    if (error.code === '23505') {
      return { status: 'error', message: 'Ce code existe déjà. Choisissez-en un autre.' };
    }
    console.error('[stax:coupon] creation refusee', error.code, error.message);
    return { status: 'error', message: 'Ce code n’a pas pu être créé.' };
  }

  revalidatePath('/admin/coupons');
  return {
    status: 'success',
    message: `Code ${parsed.data.code.toUpperCase()} créé. La remise sera recalculée par la base à chaque commande.`,
  };
}

const deactivateSchema = z.object({ id: uuidSchema }).strict();

export async function deactivateCouponAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = deactivateSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };

  const db = createUserClient(session.user.accessToken);
  const { error } = await db.from('coupons').update({ is_active: false }).eq('id', parsed.data.id);

  if (error) return { status: 'error', message: 'Ce code n’a pas pu être désactivé.' };

  revalidatePath('/admin/coupons');
  return {
    status: 'success',
    message: 'Code désactivé. Les commandes déjà passées avec ce code gardent leur remise.',
  };
}

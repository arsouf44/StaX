'use server';

import { revalidatePath } from 'next/cache';
import { uuidSchema } from '@stax/validation';
import { z } from 'zod';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace } from '~/lib/workspace';

/**
 * Comptes clients du site : bloquer, debloquer, effacer.
 *
 * Le commercant est responsable du traitement de ces comptes. Il doit pouvoir
 * repondre seul a une demande d'effacement : la suppression passe par une
 * fonction qui verifie le droit en base et journalise l'operation, sans
 * jamais conserver l'adresse e-mail effacee.
 */

const idSchema = z.object({ customerId: uuidSchema });

async function manager() {
  const context = await getWorkspace();
  if (!context.workspace.capabilities.includes('commerce.manage')) return null;
  return context;
}

export async function toggleCustomerBlockAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = idSchema.safeParse({ customerId: formData.get('customerId') });
  const blocked = formData.get('blocked') === 'true';
  if (!parsed.success) return { status: 'error', message: 'Ce compte est introuvable.' };

  const context = await manager();
  if (!context)
    return { status: 'error', message: 'Votre rôle ne permet pas de gérer les clients.' };
  const guard = await guardAction({ limit: 'apiWrite', userId: context.userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const { error } = await context.db
    .from('site_customers')
    .update({ is_blocked: blocked })
    .eq('id', parsed.data.customerId)
    .eq('organization_id', context.workspace.organization.id);
  if (error) return { status: 'error', message: 'La modification n’a pas pu être enregistrée.' };

  revalidatePath('/app/comptes-clients');
  return {
    status: 'success',
    message: blocked
      ? 'Compte bloqué : cette personne ne peut plus se connecter à votre site.'
      : 'Compte débloqué.',
  };
}

export async function eraseCustomerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = idSchema.safeParse({ customerId: formData.get('customerId') });
  if (!parsed.success) return { status: 'error', message: 'Ce compte est introuvable.' };

  const context = await manager();
  if (!context)
    return { status: 'error', message: 'Votre rôle ne permet pas de gérer les clients.' };
  const guard = await guardAction({ limit: 'apiWrite', userId: context.userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const { data, error } = await context.db.rpc('delete_site_customer', {
    p_customer: parsed.data.customerId,
  });
  if (error || data !== true) {
    return { status: 'error', message: 'Le compte n’a pas pu être supprimé.' };
  }

  revalidatePath('/app/comptes-clients');
  return {
    status: 'success',
    message:
      'Compte supprimé définitivement. Les commandes et réservations passées restent conservées, comme la loi l’impose.',
  };
}

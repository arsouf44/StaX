'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient } from '@stax/database';
import { guardAction } from '~/lib/action-guard';
import { requireAdminRole } from '~/lib/admin';
import type { ActionState } from '~/lib/form-state';

/**
 * Activations progressives.
 *
 * A ne pas confondre avec les droits d'offre : un drapeau sert a deployer
 * progressivement une fonctionnalite, pas a la vendre. Ouvrir un drapeau
 * n'accorde jamais un droit qu'une offre ne comporte pas — c'est
 * `app.has_feature` qui tranche, et il lit le catalogue.
 */

const toggleSchema = z
  .object({ key: z.string().trim().min(1).max(60), enabled: z.boolean() })
  .strict();

export async function toggleFeatureFlagAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = toggleSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);

  const { error } = await db
    .from('feature_flags')
    .update({ enabled_globally: parsed.data.enabled })
    .eq('key', parsed.data.key);

  if (error) return { status: 'error', message: 'Ce changement a été refusé.' };

  await db.rpc('write_audit', {
    p_action: 'feature_flag.toggled',
    p_target_type: 'feature_flag',
    p_target_id: parsed.data.key,
    p_metadata: { enabled: parsed.data.enabled },
  });

  revalidatePath('/admin/feature-flags');
  return {
    status: 'success',
    message: parsed.data.enabled
      ? 'Activé pour tout le monde.'
      : 'Désactivé partout. Les droits d’offre ne sont pas affectés.',
  };
}

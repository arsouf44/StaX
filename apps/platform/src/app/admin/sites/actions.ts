'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient } from '@stax/database';
import { boundedText, optionalText, uuidSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import { requireAdminRole } from '~/lib/admin';
import type { ActionState } from '~/lib/form-state';

/**
 * Creer un site de zero depuis l'administration.
 *
 * Le site part vide : l'equipe le construit dans l'editeur, puis le confie a
 * son client (fiche du site, « Confier le site au client »). La personne qui
 * le cree devient proprietaire de l'organisation du site et en garde la main.
 *
 * Tout est fait par `app.admin_create_site`, avec le jeton de la personne : la
 * base verifie elle-meme le role.
 */

const createSchema = z
  .object({
    name: boundedText(2, 120, 'Le nom du site'),
    businessType: optionalText(60),
    planId: z.union([uuidSchema, z.literal('')]).optional(),
    city: optionalText(120),
  })
  .strict();

export async function createSiteAction(
  payload: unknown,
): Promise<ActionState & { siteId?: string }> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 'error', message: 'Indiquez le nom du site (deux caractères au moins).' };
  }

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);
  const { data, error } = await db.rpc('admin_create_site', {
    p_name: parsed.data.name,
    p_business_type: parsed.data.businessType || null,
    p_plan_id: parsed.data.planId || null,
    p_city: parsed.data.city || null,
  });

  const result = (data ?? null) as { ok?: boolean; siteId?: string } | null;
  if (error || !result?.ok || !result.siteId) {
    console.error('[stax:admin-site] creation refusee', error?.code, error?.message);
    return {
      status: 'error',
      message:
        error?.code === '42501'
          ? 'Votre rôle ne permet pas de créer un site.'
          : 'Le site n’a pas pu être créé. Rien n’a été enregistré.',
    };
  }

  revalidatePath('/admin/sites');
  return { status: 'success', message: 'Site créé.', siteId: result.siteId };
}

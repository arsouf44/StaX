'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient } from '@stax/database';
import { boundedText, fieldErrors, formDataToObject, phoneSchema } from '@stax/validation';
import { requireSession } from '~/lib/session';
import type { ActionState } from '~/lib/form-state';

/**
 * Informations personnelles.
 *
 * Liste blanche stricte : seuls le prenom, le nom, le telephone et le choix de
 * recevoir nos actualites sont modifiables ici. L adresse e-mail, le role et
 * l etat du compte n y figurent PAS — ils exigent une verification ou un droit
 * que ce formulaire n accorde pas.
 */
const profileSchema = z
  .object({
    firstName: boundedText(1, 60, 'Le prénom'),
    lastName: boundedText(1, 60, 'Le nom'),
    phone: phoneSchema.optional().or(z.literal('')),
    marketingOptIn: z.boolean().default(false),
  })
  .strict();

export async function updateProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = profileSchema.safeParse({
    ...raw,
    marketingOptIn: raw.marketingOptIn === 'on' || raw.marketingOptIn === 'true',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Certains champs doivent être corrigés.',
      errors: fieldErrors(parsed.error),
    };
  }

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  // La policy de mise a jour des profils restreint la ligne a soi-meme : un
  // identifiant d autrui ne correspondrait a rien.
  const { error } = await db
    .from('profiles')
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone: parsed.data.phone || null,
      marketing_opt_in: parsed.data.marketingOptIn,
    })
    .eq('id', session.user.id);

  if (error) {
    return { status: 'error', message: 'Vos informations n’ont pas pu être enregistrées.' };
  }

  revalidatePath('/app/compte');
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Vos informations sont à jour.' };
}

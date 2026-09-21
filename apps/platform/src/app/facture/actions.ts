'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createUserClient, unwrapMaybe } from '@stax/database';
import { hashIp } from '@stax/security';
import { boundedText } from '@stax/validation';
import { z } from 'zod';
import { TERMS_VERSION } from '~/content/legal';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { requireSession } from '~/lib/session';

/**
 * Rattachement d'une facture recue par e-mail.
 *
 * Parcours commercial : un appel, une demonstration, un accord, puis une
 * facture. Le client cree son compte et saisit ici le numero qui figure dessus.
 *
 * Ce que ce formulaire NE fait pas, volontairement :
 *
 *  - il ne fait pas confiance au numero seul. Un numero de facture est
 *    sequentiel et voyage par e-mail : il est devinable. La fonction SQL exige
 *    que l'adresse du compte soit celle a laquelle la facture a ete envoyee ;
 *  - il ne distingue jamais « numero inexistant » de « ce n'est pas votre
 *    facture ». Les deux donnent le meme message, pour qu'on ne puisse pas
 *    tester l'existence d'une vente ;
 *  - il ne marque rien comme paye. Le reglement d'une facture se constate a la
 *    banque, pas dans un navigateur.
 */

const INVOICE_NUMBER = /^[A-Za-z0-9][A-Za-z0-9-]{3,31}$/;

const schema = z.object({
  number: boundedText(4, 32, 'Le numéro de facture').regex(
    INVOICE_NUMBER,
    'Un numéro de facture ne contient que des lettres, des chiffres et des tirets.',
  ),
  organizationName: boundedText(2, 120, 'Le nom de votre entreprise'),
  acceptTerms: z.literal(true, {
    message: 'Vous devez accepter les conditions générales de vente.',
  }),
});

/** Message unique : il ne doit rien apprendre sur les factures des autres. */
const REFUSED =
  'Ce numéro de facture ne correspond à aucune facture qui vous a été adressée. ' +
  'Vérifiez le numéro, et que vous utilisez bien l’adresse e-mail sur laquelle vous l’avez reçue.';

export async function claimInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse({
    number: formData.get('number'),
    organizationName: formData.get('organizationName'),
    acceptTerms: formData.get('acceptTerms') === 'on',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Vérifiez le numéro saisi et acceptez les conditions générales de vente.',
    };
  }

  const session = await requireSession();

  // Limitation de debit serree : un numero de facture se devine, il ne doit
  // pas pouvoir se tester en masse.
  const guard = await guardAction({ limit: 'activation', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);

  const store = await headers();
  const ip =
    store.get('cf-connecting-ip') ??
    store.get('x-real-ip') ??
    store.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null;
  const ipHash = await hashIp(ip);

  // L'organisation vient de l'appartenance reelle, jamais du formulaire. Si la
  // personne n'en a pas encore, on la cree ici : c'est sa premiere.
  const membership = unwrapMaybe<{ organization_id: string }>(
    (await db
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', session.user.id)
      .in('role', ['owner', 'admin'])
      .limit(1)
      .maybeSingle()) as never,
  );

  let organizationId = membership?.organization_id ?? null;

  if (!organizationId) {
    const created = unwrapMaybe<{ id: string }>(
      (await db
        .from('organizations')
        .insert({ name: parsed.data.organizationName, created_by: session.user.id })
        .select('id')
        .single()) as never,
    );

    if (!created) {
      return {
        status: 'error',
        message: 'Votre espace n’a pas pu être créé. Réessayez dans un instant.',
      };
    }
    organizationId = created.id;
  }

  const { data, error } = await db.rpc('claim_sales_invoice', {
    p_number: parsed.data.number,
    p_organization_id: organizationId,
    p_terms_version: TERMS_VERSION,
    p_ip_hash: ipHash,
  });

  if (error) {
    console.error('[stax:invoice] rattachement impossible', error.code, error.message);
    return {
      status: 'error',
      message: 'Le rattachement n’a pas pu aboutir. Réessayez dans quelques instants.',
    };
  }

  const outcome = data as { ok?: boolean; code?: string; orderId?: string } | null;

  if (!outcome?.ok) {
    if (outcome?.code === 'cancelled') {
      return {
        status: 'error',
        message:
          'Cette facture a été annulée. Contactez-nous : nous vous en établirons une nouvelle.',
      };
    }
    if (outcome?.code === 'already_claimed') {
      return {
        status: 'error',
        message:
          'Cette facture est déjà rattachée à un espace. Si ce n’est pas le vôtre, écrivez-nous.',
      };
    }
    return { status: 'error', message: REFUSED };
  }

  redirect('/app/projet?facture=rattachee');
}

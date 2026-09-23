'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { tryCreateServiceClient, unwrapMaybe } from '@stax/database';
import { contentReportDecisionEmail, contentRestrictedEmail, sendEmail } from '@stax/emails';
import { boundedText, uuidSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import { requireAdminRole } from '~/lib/admin';
import type { ActionState } from '~/lib/form-state';

/**
 * Decision sur un signalement.
 *
 * La base refuse une decision non motivee ; ici, on transmet ce motif aux deux
 * personnes a qui il est du : l'auteur du signalement, et l'editeur du site
 * quand son contenu est restreint (DSA, articles 16.5 et 17).
 */

const decisionSchema = z
  .object({
    id: uuidSchema,
    outcome: z.enum(['reviewing', 'actioned', 'rejected']),
    decision: z.string().trim().max(4000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.outcome === 'reviewing') return;
    const parsed = boundedText(10, 4000, 'Les motifs').safeParse(value.decision ?? '');
    if (!parsed.success) {
      context.addIssue({ code: 'custom', path: ['decision'], message: 'Motivez la décision.' });
    }
  });

export async function decideContentReportAction(payload: unknown): Promise<ActionState> {
  const { session, db } = await requireAdminRole('platform_admin');

  const parsed = decisionSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      status: 'error',
      message:
        'Décrivez les motifs de la décision : ils sont communiqués à l’auteur du signalement et, ' +
        'en cas de retrait, à l’éditeur du site.',
    };
  }

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const { error } = await db.rpc('decide_content_report', {
    p_report: parsed.data.id,
    p_status: parsed.data.outcome,
    p_decision: parsed.data.decision ?? null,
  });
  if (error) return { status: 'error', message: 'Cette décision n’a pas pu être enregistrée.' };

  revalidatePath('/admin/signalements');
  if (parsed.data.outcome === 'reviewing') {
    return { status: 'success', message: 'Signalement pris en charge.' };
  }

  const report = unwrapMaybe<{
    reference: string;
    content_url: string;
    reporter_email: string | null;
    organization_id: string | null;
    decision: string;
  }>(
    (await db
      .from('content_reports')
      .select('reference, content_url, reporter_email, organization_id, decision')
      .eq('id', parsed.data.id)
      .maybeSingle()) as never,
  );
  if (!report) return { status: 'success', message: 'Décision enregistrée.' };

  const actioned = parsed.data.outcome === 'actioned';
  const service = tryCreateServiceClient();
  const failures: string[] = [];

  if (report.reporter_email) {
    try {
      await sendEmail(
        contentReportDecisionEmail({
          to: report.reporter_email,
          reference: report.reference,
          url: report.content_url,
          actioned,
          decision: report.decision,
        }),
        service ? { db: service } : {},
      );
    } catch (mailError) {
      console.error('[stax:signalements] decision non envoyee a l auteur', mailError);
      failures.push('l’auteur du signalement');
    }
  }

  if (actioned && report.organization_id && service) {
    const owner = unwrapMaybe<{ profiles: { email: string; first_name: string | null } | null }>(
      (await service
        .from('organization_members')
        .select('profiles!organization_members_user_id_fkey ( email, first_name )')
        .eq('organization_id', report.organization_id)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle()) as never,
    );
    if (owner?.profiles?.email) {
      try {
        await sendEmail(
          contentRestrictedEmail({
            to: owner.profiles.email,
            firstName: owner.profiles.first_name,
            reference: report.reference,
            url: report.content_url,
            decision: report.decision,
          }),
          { db: service, organizationId: report.organization_id },
        );
      } catch (mailError) {
        console.error('[stax:signalements] motifs non envoyes a l editeur', mailError);
        failures.push('l’éditeur du site');
      }
    }
  }

  return {
    status: 'success',
    message:
      failures.length === 0
        ? 'Décision enregistrée et communiquée.'
        : `Décision enregistrée, mais l’e-mail n’a pas pu partir vers ${failures.join(' et ')} : transmettez-la manuellement.`,
  };
}

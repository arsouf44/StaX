'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient, unwrapList, unwrapMaybe } from '@stax/database';
import { boundedText, optionalText, uuidSchema } from '@stax/validation';
import { requireAdminRole } from '~/lib/admin';
import type { ActionState } from '~/lib/form-state';

/**
 * Registre des violations de donnees.
 *
 * L'article 33.5 du RGPD impose de documenter TOUTE violation, y compris celle
 * qu'on choisit de ne pas notifier. Ce registre est la premiere piece qu'une
 * autorite de controle demande, et son absence est un manquement a elle seule.
 *
 * L'outil ne decide a la place de personne. Il fait trois choses :
 *  - il enregistre au moment ou on constate, pendant qu'on se souvient ;
 *  - il calcule l'echeance des 72 heures a compter de la DECOUVERTE ;
 *  - il refuse les demi-decisions : ne pas notifier se justifie par ecrit.
 */

const PREFIX = 'VD';

/** Reference sequentielle par annee, sans trou : le registre doit etre verifiable. */
async function nextReference(db: ReturnType<typeof createUserClient>): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `${PREFIX}-${year}-`;

  const existing = unwrapList<{ reference: string }>(
    (await db
      .from('data_breaches')
      .select('reference')
      .like('reference', `${prefix}%`)
      .order('reference', { ascending: false })
      .limit(1)) as never,
  );

  const last = existing[0]?.reference ?? '';
  const sequence = Number.parseInt(last.slice(prefix.length), 10);
  const next = Number.isFinite(sequence) ? sequence + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

const declareSchema = z.object({
  // La decouverte declenche le compte a rebours. Elle est donc saisissable —
  // une violation constatee hier ne laisse pas 72 heures de plus.
  discoveredAt: z.string().min(1),
  occurredAt: z.string().optional(),
  nature: z.enum(['confidentiality', 'integrity', 'availability', 'combined']),
  description: boundedText(20, 4000, 'La description'),
  subjectCategories: optionalText(300),
  dataCategories: optionalText(300),
  approximateSubjects: z.coerce.number().int().min(0).max(100_000_000).optional(),
  approximateRecords: z.coerce.number().int().min(0).max(100_000_000).optional(),
  likelyConsequences: optionalText(2000),
  measuresTaken: optionalText(2000),
});

function list(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 20);
}

/** Une date saisie doit etre une date, et ne peut pas etre dans le futur. */
function pastDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime() > Date.now() ? new Date().toISOString() : parsed.toISOString();
}

export async function declareBreachAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = declareSchema.safeParse({
    discoveredAt: formData.get('discoveredAt'),
    occurredAt: formData.get('occurredAt') ?? undefined,
    nature: formData.get('nature'),
    description: formData.get('description'),
    subjectCategories: formData.get('subjectCategories') ?? undefined,
    dataCategories: formData.get('dataCategories') ?? undefined,
    approximateSubjects: formData.get('approximateSubjects') || undefined,
    approximateRecords: formData.get('approximateRecords') || undefined,
    likelyConsequences: formData.get('likelyConsequences') ?? undefined,
    measuresTaken: formData.get('measuresTaken') ?? undefined,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message:
        'Indiquez au minimum la date de découverte, la nature de la violation et une ' +
        'description d’au moins vingt caractères. Une entrée vague ne protège personne.',
    };
  }

  const discoveredAt = pastDate(parsed.data.discoveredAt);
  if (!discoveredAt) {
    return { status: 'error', message: 'La date de découverte est illisible.' };
  }

  const db = createUserClient(session.user.accessToken);
  const reference = await nextReference(db);

  const { error } = await db.from('data_breaches').insert({
    reference,
    discovered_at: discoveredAt,
    occurred_at: pastDate(parsed.data.occurredAt),
    nature: parsed.data.nature,
    description: parsed.data.description,
    subject_categories: list(parsed.data.subjectCategories),
    data_categories: list(parsed.data.dataCategories),
    approximate_subjects: parsed.data.approximateSubjects ?? null,
    approximate_records: parsed.data.approximateRecords ?? null,
    likely_consequences: parsed.data.likelyConsequences ?? null,
    measures_taken: parsed.data.measuresTaken ?? null,
    created_by: session.user.id,
  });

  if (error) {
    console.error('[stax:breach] enregistrement refuse', error.code, error.message);
    return { status: 'error', message: 'Cette entrée n’a pas pu être enregistrée.' };
  }

  revalidatePath('/admin/securite/violations');
  return {
    status: 'success',
    message: `Violation ${reference} enregistrée. L’échéance des 72 heures court depuis la découverte.`,
  };
}

const assessSchema = z
  .object({
    id: uuidSchema,
    riskLevel: z.enum(['none', 'low', 'high']),
    justification: optionalText(2000),
  })
  .strict();

export async function assessBreachRiskAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = assessSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Évaluation refusée.' };

  // La base impose deja la justification ; on la redit ici pour repondre une
  // phrase utile plutot qu'une contrainte SQL.
  if (parsed.data.riskLevel === 'none' && (parsed.data.justification ?? '').trim().length < 20) {
    return {
      status: 'error',
      message:
        'Décider de ne pas notifier est défendable, mais doit être motivé par écrit : ' +
        'expliquez en quelques phrases pourquoi les droits et libertés ne sont pas menacés.',
    };
  }

  const db = createUserClient(session.user.accessToken);
  const { error } = await db
    .from('data_breaches')
    .update({
      risk_level: parsed.data.riskLevel,
      no_risk_justification:
        parsed.data.riskLevel === 'none' ? (parsed.data.justification ?? null) : null,
    })
    .eq('id', parsed.data.id);

  if (error) return { status: 'error', message: 'Cette évaluation n’a pas pu être enregistrée.' };

  revalidatePath('/admin/securite/violations');
  return { status: 'success', message: 'Évaluation enregistrée.' };
}

const notifySchema = z
  .object({
    id: uuidSchema,
    target: z.enum(['cnil', 'subjects']),
    reference: optionalText(120),
    method: optionalText(300),
    delayJustification: optionalText(2000),
  })
  .strict();

export async function recordBreachNotificationAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = notifySchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Enregistrement refusé.' };

  const db = createUserClient(session.user.accessToken);

  const breach = unwrapMaybe<{ id: string; notify_deadline_at: string }>(
    (await db
      .from('data_breaches')
      .select('id, notify_deadline_at')
      .eq('id', parsed.data.id)
      .maybeSingle()) as never,
  );
  if (!breach) return { status: 'error', message: 'Cette entrée est introuvable.' };

  const now = new Date();
  const late = new Date(breach.notify_deadline_at) < now;

  // L'article 33.1 exige de MOTIVER une notification tardive. Laisser passer
  // le retard sans explication transformerait un manquement rattrapable en
  // manquement documente.
  if (
    parsed.data.target === 'cnil' &&
    late &&
    (parsed.data.delayJustification ?? '').trim() === ''
  ) {
    return {
      status: 'error',
      message:
        'Le délai de 72 heures est dépassé : l’article 33.1 impose d’indiquer le motif du ' +
        'retard dans la notification. Renseignez-le avant d’enregistrer.',
    };
  }

  const patch =
    parsed.data.target === 'cnil'
      ? {
          cnil_notified_at: now.toISOString(),
          cnil_reference: parsed.data.reference ?? null,
          delay_justification: late ? (parsed.data.delayJustification ?? null) : null,
        }
      : {
          subjects_notified_at: now.toISOString(),
          subjects_notification_method: parsed.data.method ?? null,
        };

  const { error } = await db.from('data_breaches').update(patch).eq('id', parsed.data.id);
  if (error) {
    return {
      status: 'error',
      message:
        'Cet enregistrement a été refusé. Une notification déjà inscrite ne peut pas être ' +
        'modifiée : le registre est une pièce de preuve.',
    };
  }

  revalidatePath('/admin/securite/violations');
  return {
    status: 'success',
    message:
      parsed.data.target === 'cnil'
        ? 'Notification à la CNIL enregistrée.'
        : 'Information des personnes concernées enregistrée.',
  };
}

const closeSchema = z.object({ id: uuidSchema }).strict();

export async function closeBreachAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = closeSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Clôture refusée.' };

  const db = createUserClient(session.user.accessToken);

  const breach = unwrapMaybe<{ risk_level: string }>(
    (await db
      .from('data_breaches')
      .select('risk_level')
      .eq('id', parsed.data.id)
      .maybeSingle()) as never,
  );

  if (!breach) return { status: 'error', message: 'Cette entrée est introuvable.' };
  if (breach.risk_level === 'pending') {
    return {
      status: 'error',
      message: 'Évaluez d’abord le risque : une entrée close sans évaluation ne vaut rien.',
    };
  }

  const { error } = await db
    .from('data_breaches')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', parsed.data.id);

  if (error) return { status: 'error', message: 'Cette entrée n’a pas pu être clôturée.' };

  revalidatePath('/admin/securite/violations');
  return { status: 'success', message: 'Entrée clôturée. Elle reste consultable indéfiniment.' };
}

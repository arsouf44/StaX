'use server';

import { revalidatePath } from 'next/cache';
import { unwrapList, unwrapMaybe } from '@stax/database';
import { slugify } from '@stax/security';
import { boundedText, emailSchema, optionalText, uuidSchema } from '@stax/validation';
import { z } from 'zod';
import { guardAction } from '~/lib/action-guard';
import { buildSlug } from '~/lib/collection-io';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace, type WorkspaceContext } from '~/lib/workspace';

/**
 * Formulaires publics d'un site client.
 *
 * Un formulaire declare ce qu'il accepte. Le Worker qui recoit les soumissions
 * valide chaque valeur CONTRE cette definition : un robot qui poste un champ
 * inconnu, ou vingt fois le meme, est refuse. La definition est donc une
 * frontiere de securite autant qu'un outil de mise en page.
 *
 * Le champ piege et la limite de debit par heure ne sont pas modifiables depuis
 * cet ecran : ce sont des protections, pas des preferences.
 */

const FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'tel',
  'number',
  'date',
  'time',
  'select',
  'radio',
  'checkbox',
  'consent',
] as const;

const formSchema = z
  .object({
    name: boundedText(1, 80, 'Le nom du formulaire'),
    kind: z
      .enum(['contact', 'quote', 'reservation', 'newsletter', 'callback', 'application', 'custom'])
      .default('contact'),
    description: optionalText(400),
    successMessage: boundedText(5, 300, 'Le message de confirmation'),
    notifyEmails: z.array(emailSchema).max(5),
    requireCaptcha: z.boolean(),
    isActive: z.boolean(),
  })
  .strict();

const fieldSchema = z
  .object({
    label: boundedText(1, 80, 'Le libellé'),
    type: z.enum(FIELD_TYPES),
    placeholder: optionalText(120),
    helpText: optionalText(200),
    isRequired: z.boolean(),
    options: z.array(z.string().trim().min(1).max(80)).max(30),
  })
  .strict();

async function requireFormEditor(): Promise<WorkspaceContext | null> {
  const context = await getWorkspace();
  if (!context.workspace.capabilities.includes('content.edit')) return null;
  if (!context.workspace.currentSite) return null;
  return context;
}

/** Adresses de notification, une par ligne ou separees par des virgules. */
function readEmails(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string') return [];
  return [
    ...new Set(
      raw
        .split(/[\n,;]/)
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),
  ].slice(0, 5);
}

/** Choix d'une liste deroulante, un par ligne. */
function readOptions(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 30);
}

export async function saveFormAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireFormEditor();
  if (!context) {
    return { status: 'error', message: 'Votre rôle ne permet pas de modifier les formulaires.' };
  }

  const guard = await guardAction({ limit: 'apiWrite', userId: context.userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const parsed = formSchema.safeParse({
    name: formData.get('name'),
    kind: formData.get('kind'),
    description: formData.get('description') ?? undefined,
    successMessage: formData.get('successMessage'),
    notifyEmails: readEmails(formData.get('notifyEmails')),
    requireCaptcha: formData.get('requireCaptcha') === 'on',
    isActive: formData.get('isActive') === 'on',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message:
        'Vérifiez le nom, le message de confirmation et les adresses de notification saisies.',
    };
  }

  const site = context.workspace.currentSite;
  if (!site) return { status: 'error', message: 'Aucun site rattaché à votre compte.' };

  const row = {
    name: parsed.data.name,
    kind: parsed.data.kind,
    description: parsed.data.description ?? null,
    success_message: parsed.data.successMessage,
    notify_emails: parsed.data.notifyEmails,
    require_captcha: parsed.data.requireCaptcha,
    is_active: parsed.data.isActive,
  };

  const rawId = formData.get('formId');
  const formId = typeof rawId === 'string' && rawId.length > 0 ? rawId : null;

  if (formId) {
    if (!uuidSchema.safeParse(formId).success) {
      return { status: 'error', message: 'Ce formulaire est introuvable.' };
    }

    const { error } = await context.db
      .from('forms')
      .update(row)
      .eq('id', formId)
      .eq('organization_id', context.workspace.organization.id);

    if (error) return { status: 'error', message: 'La modification n’a pas pu être enregistrée.' };

    revalidatePath('/app/forms');
    return { status: 'success', message: 'Formulaire mis à jour.' };
  }

  const existing = unwrapList<{ slug: string }>(
    (await context.db.from('forms').select('slug').eq('site_id', site.id).limit(500)) as never,
  );

  const { error } = await context.db.from('forms').insert({
    ...row,
    site_id: site.id,
    organization_id: context.workspace.organization.id,
    slug: buildSlug(parsed.data.name, new Set(existing.map((entry) => entry.slug)), 48),
  });

  if (error) return { status: 'error', message: 'Le formulaire n’a pas pu être créé.' };

  revalidatePath('/app/forms');
  return { status: 'success', message: 'Formulaire créé.' };
}

/** Verifie que le formulaire vise appartient bien a l'organisation lue en session. */
async function ownedForm(context: WorkspaceContext, formId: string) {
  return unwrapMaybe<{ id: string }>(
    (await context.db
      .from('forms')
      .select('id')
      .eq('id', formId)
      .eq('organization_id', context.workspace.organization.id)
      .maybeSingle()) as never,
  );
}

export async function saveFormFieldAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireFormEditor();
  if (!context) {
    return { status: 'error', message: 'Votre rôle ne permet pas de modifier les formulaires.' };
  }

  const formId = formData.get('formId');
  if (typeof formId !== 'string' || !uuidSchema.safeParse(formId).success) {
    return { status: 'error', message: 'Ce formulaire est introuvable.' };
  }

  const guard = await guardAction({ limit: 'apiWrite', userId: context.userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const parsed = fieldSchema.safeParse({
    label: formData.get('label'),
    type: formData.get('type'),
    placeholder: formData.get('placeholder') ?? undefined,
    helpText: formData.get('helpText') ?? undefined,
    isRequired: formData.get('isRequired') === 'on',
    options: readOptions(formData.get('options')),
  });

  if (!parsed.success) {
    return { status: 'error', message: 'Donnez un libellé au champ et choisissez son type.' };
  }

  if (
    (parsed.data.type === 'select' || parsed.data.type === 'radio') &&
    parsed.data.options.length < 2
  ) {
    return {
      status: 'error',
      message: 'Une liste de choix demande au moins deux réponses possibles, une par ligne.',
    };
  }

  const form = await ownedForm(context, formId);
  if (!form) return { status: 'error', message: 'Ce formulaire est introuvable.' };

  const existing = unwrapList<{ id: string; name: string; sort_order: number }>(
    (await context.db
      .from('form_fields')
      .select('id, name, sort_order')
      .eq('form_id', form.id)
      .order('sort_order', { ascending: true })) as never,
  );

  const fieldId = formData.get('fieldId');
  const editing = typeof fieldId === 'string' && uuidSchema.safeParse(fieldId).success;

  if (!editing && existing.length >= 30) {
    return {
      status: 'error',
      message: 'Un formulaire long décourage : trente champs est déjà un maximum.',
    };
  }

  const row = {
    label: parsed.data.label,
    type: parsed.data.type,
    placeholder: parsed.data.placeholder ?? null,
    help_text: parsed.data.helpText ?? null,
    is_required: parsed.data.isRequired,
    options: parsed.data.options.map((label) => ({ value: slugify(label, 40), label })),
  };

  if (editing) {
    // Le nom technique du champ n'est PAS renomme : il identifie la donnee dans
    // toutes les soumissions deja recues.
    const { error } = await context.db
      .from('form_fields')
      .update(row)
      .eq('id', fieldId as string)
      .eq('form_id', form.id);

    if (error) return { status: 'error', message: 'Le champ n’a pas pu être enregistré.' };

    revalidatePath('/app/forms');
    return { status: 'success', message: 'Champ mis à jour.' };
  }

  const taken = new Set(existing.map((entry) => entry.name));
  const base =
    slugify(parsed.data.label, 30)
      .replace(/-/g, '_')
      .replace(/^[^a-z]+/, '') || 'champ';
  let name = base;
  for (let index = 2; taken.has(name); index += 1) name = `${base}_${index}`;

  const highest = existing.at(-1)?.sort_order ?? 0;

  const { error } = await context.db.from('form_fields').insert({
    ...row,
    form_id: form.id,
    name,
    sort_order: highest + 10,
  });

  if (error) return { status: 'error', message: 'Le champ n’a pas pu être ajouté.' };

  revalidatePath('/app/forms');
  return { status: 'success', message: 'Champ ajouté.' };
}

export async function deleteFormFieldAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireFormEditor();
  if (!context) {
    return { status: 'error', message: 'Votre rôle ne permet pas de modifier les formulaires.' };
  }

  const parsed = z
    .object({ formId: uuidSchema, fieldId: uuidSchema })
    .safeParse({ formId: formData.get('formId'), fieldId: formData.get('fieldId') });

  if (!parsed.success) return { status: 'error', message: 'Ce champ est introuvable.' };

  const form = await ownedForm(context, parsed.data.formId);
  if (!form) return { status: 'error', message: 'Ce formulaire est introuvable.' };

  const { error } = await context.db
    .from('form_fields')
    .delete()
    .eq('id', parsed.data.fieldId)
    .eq('form_id', form.id);

  if (error) return { status: 'error', message: 'Le champ n’a pas pu être supprimé.' };

  revalidatePath('/app/forms');
  return {
    status: 'success',
    message: 'Champ supprimé. Les réponses déjà reçues restent consultables.',
  };
}

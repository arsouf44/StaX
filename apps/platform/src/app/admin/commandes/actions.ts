'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { unwrapMaybe, type Db } from '@nemasus/database';
import { bankTransferDetails } from '@nemasus/config';
import { uuidSchema } from '@nemasus/validation';
import { guardAction } from '~/lib/action-guard';
import { requireAdminRole } from '~/lib/admin';
import type { ActionState } from '~/lib/form-state';
import {
  ACCESS_CODE_VALID_DAYS,
  accessCodeHint,
  accessCodeUrl,
  generateAccessCode,
  hashAccessCode,
  parseAmountToCents,
  sendAccessCodeEmail,
  sendPaymentInstructionsEmail,
  SITE_ORDER_COLUMNS,
  type SiteOrderRow,
} from '~/lib/site-orders';

/**
 * Administration des commandes réglées par virement.
 *
 * Tout passe par le jeton de la personne de l'équipe : la base vérifie le
 * rôle (`is_platform_admin`) dans chaque fonction. Le code d'accès en clair
 * n'existe que dans la réponse de l'action qui le crée : il part par e-mail,
 * et n'est affiché à l'équipe que si l'e-mail n'a pas pu partir.
 */

export interface OrderActionState extends ActionState {
  /** Code en clair, affiché une seule fois quand l'e-mail n'est pas parti. */
  code?: string;
  accessUrl?: string;
  /**
   * Page à recharger une fois le code transmis. Tant qu'un code est affiché,
   * la page n'est PAS revalidée : le formulaire qui le porte disparaîtrait
   * avec la mise à jour (commande payée), et le code avec lui.
   */
  continueHref?: string;
}

async function adminDb(): Promise<{ db: Db; userId: string } | { error: OrderActionState }> {
  const { session, db } = await requireAdminRole('platform_admin');
  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { error: { status: 'error', message: guard.message } };
  return { db, userId: session.user.id };
}

async function loadOrder(db: Db, orderId: string): Promise<SiteOrderRow | null> {
  return unwrapMaybe<SiteOrderRow>(
    (await db
      .from('site_orders')
      .select(SITE_ORDER_COLUMNS)
      .eq('id', orderId)
      .maybeSingle()) as never,
  );
}

function refresh(orderId: string) {
  revalidatePath('/admin/commandes');
  revalidatePath(`/admin/commandes/${orderId}`);
}

const ERRORS: Record<string, string> = {
  not_found: 'Cette commande est introuvable.',
  invalid_amount: 'Indiquez un montant valide, en euros (par exemple 1 250 ou 1 250,50).',
  not_payable: 'Cette commande n’attend plus de paiement.',
  already_paid: 'Le paiement de cette commande est déjà confirmé.',
  cancelled: 'Cette commande est annulée.',
  not_paid: 'Le paiement de cette commande n’est pas encore confirmé.',
  not_cancellable: 'Une commande réglée ne s’annule pas ici.',
  staff_email:
    'L’adresse de la commande est celle d’un compte de l’équipe Nemasus : un code d’accès ne peut pas ouvrir un compte de l’équipe.',
  site_not_found: 'Le site choisi est introuvable.',
  site_archived: 'Le site choisi est archivé.',
  site_has_client: 'Le site choisi est déjà rattaché à un client.',
  site_already_ordered: 'Le site choisi est déjà rattaché à une autre commande payée.',
  invalid_email: 'Adresse e-mail invalide.',
  company_required: 'Indiquez le nom de l’entreprise.',
};

function emailOutcomeMessage(result: { ok: boolean; skipped: boolean; error?: string }): string {
  if (result.ok && !result.skipped) return 'E-mail envoyé au client.';
  if (result.skipped) {
    return 'Aucun fournisseur d’e-mails n’est configuré (RESEND_API_KEY) : rien n’est parti.';
  }
  return `L’e-mail n’a pas pu partir${result.error ? ` (${result.error.slice(0, 160)})` : ''}.`;
}

/* -------------------------------------------------------------------------- */
/*  Modalités de paiement                                                      */
/* -------------------------------------------------------------------------- */

const paymentSchema = z.object({
  orderId: uuidSchema,
  amount: z.string().trim().min(1).max(20),
  message: z.string().trim().max(2000).optional(),
});

export async function requestPaymentAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const parsed = paymentSchema.safeParse({
    orderId: formData.get('orderId'),
    amount: formData.get('amount') ?? '',
    message: formData.get('message') ?? undefined,
  });
  if (!parsed.success) return { status: 'error', message: ERRORS['invalid_amount'] };
  const cents = parseAmountToCents(parsed.data.amount);
  if (cents === null) return { status: 'error', message: ERRORS['invalid_amount'] };

  if (!bankTransferDetails()) {
    return {
      status: 'error',
      message:
        'Les coordonnées bancaires ne sont pas configurées (BANK_TRANSFER_HOLDER et BANK_TRANSFER_IBAN) : les modalités ne peuvent pas partir.',
    };
  }

  const access = await adminDb();
  if ('error' in access) return access.error;

  const { data, error } = await access.db.rpc('request_site_order_payment', {
    p_order: parsed.data.orderId,
    p_amount_cents: cents,
    p_message: parsed.data.message || null,
  });
  const result = (data ?? {}) as { ok?: boolean; code?: string };
  if (error || !result.ok) {
    if (error) console.error('[nemasus:orders] modalites', error.code, error.message);
    return { status: 'error', message: ERRORS[result.code ?? ''] ?? 'La demande a été refusée.' };
  }

  const order = await loadOrder(access.db, parsed.data.orderId);
  if (!order) return { status: 'error', message: ERRORS['not_found'] };
  const sent = await sendPaymentInstructionsEmail(access.db, order, {
    reminder: order.payment_request_count > 1,
  });
  refresh(order.id);
  return {
    status: sent.ok && !sent.skipped ? 'success' : 'error',
    message: `Modalités de paiement enregistrées. ${emailOutcomeMessage(sent)}`,
  };
}

const orderOnly = z.object({ orderId: uuidSchema }).strict();

export async function resendPaymentAction(payload: unknown): Promise<OrderActionState> {
  const parsed = orderOnly.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await adminDb();
  if ('error' in access) return access.error;
  const order = await loadOrder(access.db, parsed.data.orderId);
  if (!order) return { status: 'error', message: ERRORS['not_found'] };
  if (order.status !== 'payment_requested') {
    return { status: 'error', message: ERRORS['not_payable'] };
  }
  const sent = await sendPaymentInstructionsEmail(access.db, order, { reminder: true });
  refresh(order.id);
  return {
    status: sent.ok && !sent.skipped ? 'success' : 'error',
    message: sent.missingBankDetails
      ? 'Les coordonnées bancaires ne sont pas configurées : rien n’est parti.'
      : `Rappel des modalités : ${emailOutcomeMessage(sent).toLowerCase()}`,
  };
}

/* -------------------------------------------------------------------------- */
/*  Virement reçu : espace créé, code émis et envoyé                           */
/* -------------------------------------------------------------------------- */

const confirmSchema = z.object({
  orderId: uuidSchema,
  amount: z.string().trim().min(1).max(20),
  validDays: z.coerce.number().int().min(1).max(90).default(ACCESS_CODE_VALID_DAYS),
  siteId: z.union([uuidSchema, z.literal('')]).optional(),
  confirmReceived: z.literal('on'),
});

export async function confirmPaymentAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const parsed = confirmSchema.safeParse({
    orderId: formData.get('orderId'),
    amount: formData.get('amount') ?? '',
    validDays: formData.get('validDays') ?? ACCESS_CODE_VALID_DAYS,
    siteId: formData.get('siteId') ?? '',
    confirmReceived: formData.get('confirmReceived') ?? '',
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message:
        'Indiquez le montant reçu et cochez la confirmation : le virement doit être réellement arrivé sur le compte.',
    };
  }
  const cents = parseAmountToCents(parsed.data.amount);
  if (cents === null) return { status: 'error', message: ERRORS['invalid_amount'] };

  const access = await adminDb();
  if ('error' in access) return access.error;

  const code = generateAccessCode();
  const { data, error } = await access.db.rpc('confirm_site_order_payment', {
    p_order: parsed.data.orderId,
    p_amount_cents: cents,
    p_code_hash: await hashAccessCode(code),
    p_code_hint: accessCodeHint(code),
    p_valid_days: parsed.data.validDays,
    p_site: parsed.data.siteId || null,
  });
  const result = (data ?? {}) as {
    ok?: boolean;
    code?: string;
    codeId?: string;
    expiresAt?: string;
  };
  if (error || !result.ok || !result.codeId || !result.expiresAt) {
    if (error) console.error('[nemasus:orders] paiement', error.code, error.message);
    return {
      status: 'error',
      message: ERRORS[result.code ?? ''] ?? 'La confirmation a été refusée. Rien n’a été créé.',
    };
  }

  const order = await loadOrder(access.db, parsed.data.orderId);
  if (!order) return { status: 'error', message: ERRORS['not_found'] };
  const sent = await sendAccessCodeEmail(access.db, order, {
    id: result.codeId,
    value: code,
    expiresAt: result.expiresAt,
  });
  const delivered = sent.ok && !sent.skipped;
  if (delivered) {
    refresh(order.id);
    revalidatePath('/admin/sites');
  }
  return {
    status: delivered ? 'success' : 'error',
    message: delivered
      ? 'Paiement confirmé : l’espace du client est créé et son code d’accès lui a été envoyé.'
      : `Paiement confirmé et espace créé. ${emailOutcomeMessage(sent)} Transmettez le code ci-dessous au client : il ne sera plus affiché.`,
    ...(delivered
      ? {}
      : { code, accessUrl: accessCodeUrl(code), continueHref: `/admin/commandes/${order.id}` }),
  };
}

const reissueSchema = z.object({
  orderId: uuidSchema,
  validDays: z.coerce.number().int().min(1).max(90).default(ACCESS_CODE_VALID_DAYS),
});

export async function reissueCodeAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const parsed = reissueSchema.safeParse({
    orderId: formData.get('orderId'),
    validDays: formData.get('validDays') ?? ACCESS_CODE_VALID_DAYS,
  });
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await adminDb();
  if ('error' in access) return access.error;

  const code = generateAccessCode();
  const { data, error } = await access.db.rpc('issue_site_order_code', {
    p_order: parsed.data.orderId,
    p_code_hash: await hashAccessCode(code),
    p_code_hint: accessCodeHint(code),
    p_valid_days: parsed.data.validDays,
  });
  const result = (data ?? {}) as {
    ok?: boolean;
    code?: string;
    codeId?: string;
    expiresAt?: string;
  };
  if (error || !result.ok || !result.codeId || !result.expiresAt) {
    return {
      status: 'error',
      message: ERRORS[result.code ?? ''] ?? 'Le code n’a pas pu être émis.',
    };
  }

  const order = await loadOrder(access.db, parsed.data.orderId);
  if (!order) return { status: 'error', message: ERRORS['not_found'] };
  const sent = await sendAccessCodeEmail(access.db, order, {
    id: result.codeId,
    value: code,
    expiresAt: result.expiresAt,
  });
  const delivered = sent.ok && !sent.skipped;
  if (delivered) refresh(order.id);
  return {
    status: delivered ? 'success' : 'error',
    message: delivered
      ? 'Nouveau code envoyé. Les codes précédents encore ouverts sont désactivés.'
      : `Nouveau code émis (les précédents sont désactivés). ${emailOutcomeMessage(sent)} Transmettez-le au client : il ne sera plus affiché.`,
    ...(delivered
      ? {}
      : { code, accessUrl: accessCodeUrl(code), continueHref: `/admin/commandes/${order.id}` }),
  };
}

const revokeSchema = z.object({ codeId: uuidSchema, orderId: uuidSchema }).strict();

export async function revokeAccessCodeAction(payload: unknown): Promise<OrderActionState> {
  const parsed = revokeSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await adminDb();
  if ('error' in access) return access.error;
  const { data, error } = await access.db.rpc('revoke_access_code', { p_code: parsed.data.codeId });
  const result = (data ?? {}) as { ok?: boolean; code?: string };
  refresh(parsed.data.orderId);
  if (error || !result.ok) {
    return {
      status: 'error',
      message:
        result.code === 'already_used'
          ? 'Ce code a déjà servi : il ne peut plus être désactivé.'
          : 'Le code n’a pas pu être désactivé.',
    };
  }
  return { status: 'success', message: 'Code désactivé : il ne peut plus être utilisé.' };
}

/* -------------------------------------------------------------------------- */
/*  Annulation, notes, commande saisie par l'équipe                            */
/* -------------------------------------------------------------------------- */

const cancelSchema = z.object({
  orderId: uuidSchema,
  reason: z.string().trim().max(500).optional(),
});

export async function cancelOrderAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const parsed = cancelSchema.safeParse({
    orderId: formData.get('orderId'),
    reason: formData.get('reason') ?? undefined,
  });
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };
  const access = await adminDb();
  if ('error' in access) return access.error;
  const { data, error } = await access.db.rpc('cancel_site_order', {
    p_order: parsed.data.orderId,
    p_reason: parsed.data.reason || null,
  });
  const result = (data ?? {}) as { ok?: boolean; code?: string };
  refresh(parsed.data.orderId);
  if (error || !result.ok) {
    return { status: 'error', message: ERRORS[result.code ?? ''] ?? 'Annulation refusée.' };
  }
  return { status: 'success', message: 'Commande annulée. Rien n’a été effacé.' };
}

const notesSchema = z.object({ orderId: uuidSchema, notes: z.string().max(4000) });

export async function saveNotesAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const parsed = notesSchema.safeParse({
    orderId: formData.get('orderId'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return { status: 'error', message: 'Notes trop longues.' };
  const access = await adminDb();
  if ('error' in access) return access.error;
  const { error } = await access.db.rpc('update_site_order_notes', {
    p_order: parsed.data.orderId,
    p_notes: parsed.data.notes,
  });
  refresh(parsed.data.orderId);
  return error
    ? { status: 'error', message: 'Les notes n’ont pas pu être enregistrées.' }
    : { status: 'success', message: 'Notes enregistrées.' };
}

const createSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  city: z.string().trim().max(120).optional(),
  businessType: z.string().trim().max(60).optional(),
  description: z.string().trim().max(4000).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
});

/** Commande saisie par l'équipe après un appel : même parcours qu'en ligne. */
export async function createOrderAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : undefined;
  };
  const parsed = createSchema.safeParse({
    companyName: field('companyName') ?? '',
    firstName: field('firstName'),
    lastName: field('lastName'),
    email: field('email') ?? '',
    phone: field('phone'),
    city: field('city'),
    businessType: field('businessType'),
    description: field('description'),
    internalNotes: field('internalNotes'),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Indiquez au moins le nom de l’entreprise et une adresse e-mail valide.',
    };
  }
  const access = await adminDb();
  if ('error' in access) return access.error;
  const { data, error } = await access.db.rpc('admin_create_site_order', {
    p_company: parsed.data.companyName,
    p_first_name: parsed.data.firstName || null,
    p_last_name: parsed.data.lastName || null,
    p_email: parsed.data.email.toLowerCase(),
    p_phone: parsed.data.phone || null,
    p_city: parsed.data.city || null,
    p_business_type: parsed.data.businessType || null,
    p_description: parsed.data.description || null,
    p_internal_notes: parsed.data.internalNotes || null,
  });
  const result = (data ?? {}) as { ok?: boolean; code?: string; orderId?: string };
  if (error || !result.ok || !result.orderId) {
    return { status: 'error', message: ERRORS[result.code ?? ''] ?? 'La commande a été refusée.' };
  }
  revalidatePath('/admin/commandes');
  redirect(`/admin/commandes/${result.orderId}`);
}

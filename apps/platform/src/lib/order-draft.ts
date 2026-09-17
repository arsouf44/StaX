import 'server-only';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { hmacHex, timingSafeEqual } from '@stax/security';

/**
 * Brouillon de commande.
 *
 * Les trois premieres etapes du parcours d achat n exigent AUCUN compte : on
 * ne demande a quelqu un de s inscrire qu au moment ou cela devient
 * necessaire, c est-a-dire au paiement.
 *
 * Le brouillon vit donc dans un cookie signe, pas en base. Deux consequences
 * importantes :
 *
 *  - il ne contient QUE des choix (offre, metier, reponses) — jamais un prix.
 *    Le prix est recalcule cote serveur a partir du catalogue au moment de
 *    creer la commande. Modifier le cookie ne change donc pas ce qui est
 *    facture ;
 *  - la signature empeche de fabriquer un brouillon pointant vers une offre
 *    inexistante ou un contenu hors bornes.
 */

const COOKIE_NAME = '__stax_order';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export const orderDraftSchema = z
  .object({
    planSlug: z.string().max(40).optional(),
    sectorSlug: z.string().max(60).optional(),
    businessTypeSlug: z.string().max(60).optional(),
    organizationName: z.string().max(120).optional(),
    contactEmail: z.string().max(200).optional(),
    contactPhone: z.string().max(40).optional(),
    city: z.string().max(120).optional(),
    domainHandling: z
      .enum(['none', 'customer_owned', 'stax_purchase', 'subdomain_only'])
      .optional(),
    domainHostname: z.string().max(253).optional(),
    subdomain: z.string().max(63).optional(),
    couponCode: z.string().max(40).optional(),
    customerNotes: z.string().max(2000).optional(),
    answers: z
      .record(z.string().max(60), z.union([z.string().max(2000), z.number(), z.boolean()]))
      .default({}),
  })
  .strict();

export type OrderDraft = z.infer<typeof orderDraftSchema>;

export const EMPTY_DRAFT: OrderDraft = { answers: {} };

function encode(draft: OrderDraft): string {
  // `encodeURIComponent` avant `btoa` : les reponses peuvent contenir des
  // accents, que btoa refuse tels quels.
  return btoa(encodeURIComponent(JSON.stringify(draft)));
}

function decode(value: string): unknown {
  return JSON.parse(decodeURIComponent(atob(value)));
}

export async function readOrderDraft(): Promise<OrderDraft> {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME)?.value;
  if (!cookie) return EMPTY_DRAFT;

  const separator = cookie.lastIndexOf('.');
  if (separator === -1) return EMPTY_DRAFT;

  const body = cookie.slice(0, separator);
  const signature = cookie.slice(separator + 1);

  let expected: string;
  try {
    expected = await hmacHex(body, 'order-draft');
  } catch {
    return EMPTY_DRAFT;
  }
  if (!timingSafeEqual(signature, expected)) return EMPTY_DRAFT;

  const parsed = orderDraftSchema.safeParse(safeDecode(body));
  return parsed.success ? parsed.data : EMPTY_DRAFT;
}

function safeDecode(body: string): unknown {
  try {
    return decode(body);
  } catch {
    return null;
  }
}

export async function writeOrderDraft(patch: Partial<OrderDraft>): Promise<OrderDraft> {
  const current = await readOrderDraft();
  const next = orderDraftSchema.parse({
    ...current,
    ...patch,
    answers: { ...current.answers, ...(patch.answers ?? {}) },
  });

  const body = encode(next);
  const signature = await hmacHex(body, 'order-draft');
  const store = await cookies();
  store.set(COOKIE_NAME, `${body}.${signature}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
  return next;
}

export async function clearOrderDraft(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Etapes du parcours, dans l ordre. Sert au fil d Ariane et aux redirections. */
export const ORDER_STEPS = [
  { path: '/commander', label: 'Votre offre' },
  { path: '/commander/metier', label: 'Votre métier' },
  { path: '/commander/informations', label: 'Vos informations' },
  { path: '/commander/adresse', label: 'Votre adresse' },
  { path: '/commander/recapitulatif', label: 'Récapitulatif' },
] as const;

/**
 * Premiere etape non renseignee.
 * Permet de renvoyer quelqu un exactement la ou il s est arrete, plutot que de
 * le laisser sur une page incomplete.
 */
export function firstIncompleteStep(draft: OrderDraft): string {
  if (!draft.planSlug) return '/commander';
  if (!draft.businessTypeSlug || !draft.sectorSlug) return '/commander/metier';
  if (!draft.organizationName) return '/commander/informations';
  if (!draft.domainHandling) return '/commander/adresse';
  return '/commander/recapitulatif';
}

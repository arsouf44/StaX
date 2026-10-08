import 'server-only';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { hmacHex, timingSafeEqual } from '@nemasus/security';

/**
 * Brouillon de commande.
 *
 * Le parcours de commande n exige AUCUN compte : le compte du client est
 * ouvert plus tard, avec le code d acces personnel qu il recoit une fois son
 * virement arrive.
 *
 * Le brouillon vit donc dans un cookie signe, pas en base :
 *
 *  - il ne contient QUE des choix et des coordonnees — aucun prix : il n y a
 *    pas de grille tarifaire, le montant est convenu ensuite avec le client ;
 *  - la signature empeche de fabriquer un brouillon hors bornes.
 */

const COOKIE_NAME = '__nemasus_order';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export const orderDraftSchema = z
  .object({
    sectorSlug: z.string().max(60).optional(),
    businessTypeSlug: z.string().max(60).optional(),
    organizationName: z.string().max(120).optional(),
    contactFirstName: z.string().max(80).optional(),
    contactLastName: z.string().max(80).optional(),
    contactEmail: z.string().max(200).optional(),
    contactPhone: z.string().max(40).optional(),
    city: z.string().max(120).optional(),
    domainHandling: z.enum(['customer_owned', 'purchase', 'later']).optional(),
    domainHostname: z.string().max(253).optional(),
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
  { path: '/commander', label: 'Votre activité' },
  { path: '/commander/informations', label: 'Vos coordonnées' },
  { path: '/commander/adresse', label: 'Votre adresse web' },
  { path: '/commander/recapitulatif', label: 'Envoi' },
] as const;

/**
 * Premiere etape non renseignee.
 * Permet de renvoyer quelqu un exactement la ou il s est arrete, plutot que de
 * le laisser sur une page incomplete.
 */
export function firstIncompleteStep(draft: OrderDraft): string {
  if (!draft.businessTypeSlug || !draft.sectorSlug) return '/commander';
  if (!draft.organizationName || !draft.contactEmail) return '/commander/informations';
  if (!draft.domainHandling) return '/commander/adresse';
  return '/commander/recapitulatif';
}

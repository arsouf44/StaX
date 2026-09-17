import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly, publicEnv, readEnv, serverEnv } from '@stax/config';

/**
 * Clients Supabase.
 *
 * Trois clients, trois niveaux de confiance :
 *
 *  1. `createAnonClient()` — cle publique, RLS active, aucune session.
 *     Lecture du catalogue public (offres, secteurs, metiers).
 *
 *  2. `createUserClient(accessToken)` — cle publique + JWT de l utilisateur.
 *     TOUTE la RLS s applique. C est le client utilise par l espace client et
 *     par l administration : meme un defaut applicatif ne peut pas franchir
 *     l isolation des tenants.
 *
 *  3. `createServiceClient()` — cle de service, RLS CONTOURNEE.
 *     Reserve aux webhooks, au runtime des sites publics et aux scripts
 *     d exploitation. Ce module refuse de s initialiser cote navigateur, et
 *     la cle n est jamais prefixee NEXT_PUBLIC_.
 */

export type Db = SupabaseClient;

const NO_PERSIST = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export function createAnonClient(): Db {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = publicEnv();
  return createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    ...NO_PERSIST,
    global: { headers: { 'x-stax-client': 'anon' } },
  });
}

/**
 * Client agissant AU NOM de l utilisateur. Le JWT voyage dans l en-tete
 * Authorization ; PostgREST positionne alors `role = authenticated` et les
 * claims, ce qui active toutes les policies.
 */
export function createUserClient(accessToken: string): Db {
  assertServerOnly('@stax/database/client#createUserClient');
  const url = readEnv('SUPABASE_URL') ?? publicEnv().NEXT_PUBLIC_SUPABASE_URL;
  const key = readEnv('SUPABASE_ANON_KEY') ?? publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(url, key, {
    ...NO_PERSIST,
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-stax-client': 'user',
      },
    },
  });
}

let serviceClient: Db | null = null;

/**
 * Client de service. Contourne la RLS : chaque appelant doit donc verifier
 * lui-meme les droits. A n utiliser que lorsque la requete n a pas d
 * utilisateur (webhook Stripe, rendu d un site public, tache planifiee).
 */
export function createServiceClient(): Db {
  assertServerOnly('@stax/database/client#createServiceClient');
  if (serviceClient) return serviceClient;
  const env = serverEnv();
  serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    ...NO_PERSIST,
    global: { headers: { 'x-stax-client': 'service' } },
  });
  return serviceClient;
}

export function resetServiceClient(): void {
  serviceClient = null;
}

/** Erreur de base normalisee, sans fuite de detail technique cote client. */
export class DatabaseError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly details?: string | null,
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export interface PostgrestLikeError {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** Traduit une erreur PostgREST en message francais actionnable. */
export function translateDatabaseError(error: PostgrestLikeError): DatabaseError {
  const code = error.code ?? null;
  switch (code) {
    case '42501':
      return new DatabaseError(
        "Vous n'avez pas les droits necessaires pour cette action.",
        code,
        error.details,
      );
    case '23505':
      return new DatabaseError('Cette valeur existe deja.', code, error.details);
    case '23503':
      return new DatabaseError(
        'Cet element est lie a d autres donnees et ne peut pas etre supprime.',
        code,
        error.details,
      );
    case '23514':
      return new DatabaseError(
        error.hint ?? 'Cette operation n est pas autorisee dans l etat actuel.',
        code,
        error.details,
      );
    case 'PGRST116':
      return new DatabaseError('Element introuvable.', code, error.details);
    case 'P0002':
      return new DatabaseError('Element introuvable.', code, error.details);
    default:
      return new DatabaseError(
        'Une erreur est survenue lors de l enregistrement. Reessayez dans un instant.',
        code,
        error.details,
      );
  }
}

export function unwrap<T>(result: { data: T | null; error: PostgrestLikeError | null }): T {
  if (result.error) throw translateDatabaseError(result.error);
  if (result.data === null) {
    throw new DatabaseError('Element introuvable.', 'PGRST116');
  }
  return result.data;
}

export function unwrapMaybe<T>(result: {
  data: T | null;
  error: PostgrestLikeError | null;
}): T | null {
  if (result.error) {
    // PGRST116 signale simplement « aucune ligne » avec .single() : ce n est
    // pas une erreur lorsqu on interroge une ressource optionnelle.
    if (result.error.code === 'PGRST116') return null;
    throw translateDatabaseError(result.error);
  }
  return result.data;
}

export function unwrapList<T>(result: { data: T[] | null; error: PostgrestLikeError | null }): T[] {
  if (result.error) throw translateDatabaseError(result.error);
  return result.data ?? [];
}

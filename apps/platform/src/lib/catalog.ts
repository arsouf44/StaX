import { cache } from 'react';
import {
  createAnonClient,
  listPublicPlans,
  listSectorsWithCounts,
  listBusinessTypes,
} from '@stax/database';
import type { BusinessTypeView, PlanView, SectorView } from '@stax/database';

/**
 * Acces au catalogue public.
 *
 * `cache()` deduplique les appels a l interieur d un meme rendu : une page qui
 * affiche les offres dans deux sections ne fait qu une requete.
 *
 * Toutes ces lectures sont tolerantes a la panne : si la base est
 * indisponible, la page marketing s affiche avec une section vide plutot que
 * de renvoyer une erreur 500 a un visiteur.
 */

export const getPlans = cache(async (): Promise<PlanView[]> => {
  try {
    return await listPublicPlans(createAnonClient());
  } catch {
    return [];
  }
});

export const listSectorsSafe = cache(async (): Promise<SectorView[]> => {
  try {
    return await listSectorsWithCounts(createAnonClient());
  } catch {
    return [];
  }
});

export const getBusinessTypes = cache(async (sectorSlug?: string): Promise<BusinessTypeView[]> => {
  try {
    return await listBusinessTypes(createAnonClient(), sectorSlug);
  } catch {
    return [];
  }
});

export const getPlanBySlugSafe = cache(async (slug: string): Promise<PlanView | null> => {
  const plans = await getPlans();
  return plans.find((plan) => plan.slug === slug) ?? null;
});

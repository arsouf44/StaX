import { cache } from 'react';
import {
  createAnonClient,
  listPublicPlans,
  listSectorsWithCounts,
  listBusinessTypes,
  listSubprocessors,
} from '@stax/database';
import type { BusinessTypeView, PlanView, SectorView, SubprocessorView } from '@stax/database';
import { formatMoney } from '@stax/payments';

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

/**
 * Sous-traitants publies sur /sous-traitants.
 *
 * `null` signifie « liste non consultable pour le moment » et non « aucun
 * sous-traitant » : la page affiche alors un message explicite plutot qu un
 * tableau vide qui laisserait croire que nous n en avons aucun.
 */
export const getSubprocessors = cache(async (): Promise<SubprocessorView[] | null> => {
  try {
    return await listSubprocessors(createAnonClient());
  } catch {
    return null;
  }
});

/**
 * « À partir de 300 € HT puis 22 € HT par an ».
 *
 * Ce libelle etait recopie a la main sur quatre pages. Un prix ecrit en dur
 * dans une page vitrine ne se met pas a jour tout seul : il devient faux le
 * jour ou le catalogue change, et il est faux SUR LA PAGE QUI SERT A VENDRE.
 *
 * Renvoie `null` si le catalogue est injoignable : mieux vaut ne rien annoncer
 * qu annoncer un prix perime.
 */
export const entryPriceLabel = cache(async (): Promise<string | null> => {
  const plans = await getPlans();
  const purchasable = plans
    .filter((plan) => !plan.isQuoteOnly)
    .sort((a, b) => a.setupPriceCents - b.setupPriceCents);

  const cheapest = purchasable[0];
  if (!cheapest) return null;

  const setup = formatMoney(cheapest.setupPriceCents, cheapest.currency, {
    hideDecimalsWhenRound: true,
  });
  const maintenance = formatMoney(cheapest.maintenancePriceCents, cheapest.currency, {
    hideDecimalsWhenRound: true,
  });
  const period = cheapest.billingInterval === 'month' ? 'par mois' : 'par an';

  return `À partir de ${setup} HT puis ${maintenance} HT ${period}`;
});

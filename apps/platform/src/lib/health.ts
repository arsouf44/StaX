import { cache } from 'react';
import { createAnonClient, loadSystemHealth, type SystemHealthView } from '@stax/database';

/**
 * Indicateurs de santé publiés sur /status.
 *
 * Aucun état n'est simulé : un composant dont la sonde n'a jamais tourné reste
 * « non mesuré ». Si la base elle-même est injoignable, on l'affiche — c'est
 * précisément l'information utile à ce moment-là.
 */
export const loadPublicHealth = cache(async (): Promise<SystemHealthView[]> => {
  try {
    const rows = await loadSystemHealth(createAnonClient());
    if (rows.length > 0) {
      return [
        {
          key: 'application',
          label: 'Application',
          status: 'healthy',
          detail: 'Cette page a été générée par l’application.',
          observedAt: new Date().toISOString(),
        },
        ...rows,
      ];
    }
  } catch {
    // On tombe volontairement sur l'état ci-dessous.
  }

  return [
    {
      key: 'application',
      label: 'Application',
      status: 'healthy',
      detail: 'Cette page a été générée par l’application.',
      observedAt: new Date().toISOString(),
    },
    {
      key: 'database',
      label: 'Base de données',
      status: 'unknown',
      detail: 'État indisponible : la table de santé n’a pas pu être consultée.',
      observedAt: null,
    },
  ];
});

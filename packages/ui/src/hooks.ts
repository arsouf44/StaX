'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Abonnements a l'etat du navigateur.
 *
 * `useSyncExternalStore` plutot qu'un `useState` + `useEffect` : le rendu
 * serveur recoit une valeur explicite, la valeur client est lue au premier
 * rendu, et aucun ecriture d'etat n'a lieu dans un effet — ce qui evite les
 * rendus en cascade et le scintillement.
 */

const EMPTY = () => () => {};

/** L'utilisateur demande-t-il moins d'animations ? */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)', false);
}

/** L'appareil dispose-t-il d'un vrai curseur ? */
export function useHasFinePointer(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)', false);
}

export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return serverValue;
    return window.matchMedia(query).matches;
  }, [query, serverValue]);

  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue);
}

/**
 * `true` une fois le composant monte cote client.
 * Utile pour n'afficher qu'apres hydratation ce qui depend du navigateur.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    EMPTY,
    () => true,
    () => false,
  );
}

/** Le document a-t-il defile au-dela d'un seuil ? */
export function useScrolledPast(threshold = 12): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('scroll', onChange, { passive: true });
    return () => window.removeEventListener('scroll', onChange);
  }, []);

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.scrollY > threshold;
  }, [threshold]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Valeur de stockage local, lue de maniere sure.
 * Renvoie `null` quand le stockage est indisponible (navigation privee,
 * cookies bloques) : l'interface doit rester fonctionnelle dans ce cas.
 */
export function useLocalStorageValue(key: string): string | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined') return () => {};
      const handler = (event: StorageEvent) => {
        if (event.key === key || event.key === null) onChange();
      };
      window.addEventListener('storage', handler);
      window.addEventListener('stax:storage', onChange);
      return () => {
        window.removeEventListener('storage', handler);
        window.removeEventListener('stax:storage', onChange);
      };
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** Ecrit dans le stockage local et notifie les abonnes du meme onglet. */
export function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Stockage refuse : le choix ne vaut que pour cette session.
  }
  window.dispatchEvent(new Event('stax:storage'));
}

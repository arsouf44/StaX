'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, cn, useIsHydrated, useLocalStorageValue, writeLocalStorage } from '@stax/ui';

/**
 * Bandeau cookies.
 *
 * Sobre et honnete : la mesure d audience de StaX ne depose aucun cookie et
 * ne conserve aucune adresse IP, donc le bandeau ne bloque pas la navigation
 * et ne reclame rien d inutile. Il permet de refuser aussi facilement que
 * d accepter — exigence de la CNIL — et le choix est enregistre avec sa
 * version, pour rester opposable.
 */

const STORAGE_KEY = 'stax-cookie-consent';
const POLICY_VERSION = '2026-01';

interface StoredConsent {
  analytics: boolean;
  marketing: boolean;
  version: string;
  at: string;
}

function parseConsent(raw: string | null): StoredConsent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredConsent;
    return parsed.version === POLICY_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export function CookieBanner() {
  const [details, setDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  // Le choix enregistre est lu directement depuis le stockage : le bandeau
  // disparait des qu'un choix valide existe, sans etat duplique.
  const stored = parseConsent(useLocalStorageValue(STORAGE_KEY));
  const hydrated = useIsHydrated();

  const save = (choice: { analytics: boolean; marketing: boolean }) => {
    writeLocalStorage(
      STORAGE_KEY,
      JSON.stringify({ ...choice, version: POLICY_VERSION, at: new Date().toISOString() }),
    );
  };

  // Rien n'est affiche avant hydratation : le serveur ne connait pas le choix
  // du visiteur, et un bandeau qui apparait puis disparait serait genant.
  if (!hydrated || stored) return null;

  return (
    <div
      role="dialog"
      aria-label="Préférences de confidentialité"
      aria-modal="false"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
    >
      <div className="glass-edge mx-auto max-w-3xl rounded-[var(--radius-lg)] p-4 glass-3 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Votre vie privée</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--foreground-muted)] max-sm:line-clamp-3">
              Nos cookies strictement nécessaires assurent le fonctionnement du site et de votre
              espace. Notre mesure d’audience ne dépose aucun cookie et ne conserve aucune adresse
              IP&nbsp;: elle est activée par défaut et vous pouvez la refuser ici.{' '}
              <Link href="/cookies" className="underline underline-offset-4">
                En savoir plus
              </Link>
              .
            </p>

            {details ? (
              <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
                <CategoryRow
                  title="Strictement nécessaires"
                  description="Session, sécurité, préférences d’affichage. Indispensables : ils ne dépendent pas du consentement."
                  locked
                  checked
                />
                <CategoryRow
                  title="Mesure d’audience"
                  description="Comptage anonyme des pages vues, sans cookie ni adresse IP conservée."
                  checked={analytics}
                  onChange={setAnalytics}
                />
                <CategoryRow
                  title="Marketing"
                  description="Non utilisé aujourd’hui. Aucune donnée n’est transmise à des régies publicitaires."
                  locked
                  checked={false}
                />
              </div>
            ) : null}
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-44 sm:grid-cols-1">
            <Button size="sm" onClick={() => save({ analytics: true, marketing: false })}>
              Tout accepter
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => save({ analytics: false, marketing: false })}
            >
              Tout refuser
            </Button>
            {details ? (
              <Button
                size="sm"
                variant="ghost"
                className="col-span-2 sm:col-span-1"
                onClick={() => save({ analytics, marketing: false })}
              >
                Enregistrer mes choix
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="col-span-2 sm:col-span-1"
                onClick={() => setDetails(true)}
              >
                Personnaliser
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryRow({
  title,
  description,
  checked,
  locked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{description}</p>
      </div>
      <label
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
          checked ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-strong)]',
          locked && 'opacity-50',
        )}
      >
        <span className="sr-only">{title}</span>
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={(event) => onChange?.(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            'ml-0.5 size-3.5 rounded-full transition-transform',
            checked ? 'translate-x-4 bg-white' : 'bg-[var(--muted)]',
          )}
        />
      </label>
    </div>
  );
}

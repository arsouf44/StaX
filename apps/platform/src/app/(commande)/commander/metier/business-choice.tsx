'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Icon, cn } from '@stax/ui';
import { IDLE_STATE as STEP_IDLE } from '~/lib/form-state';
import { chooseBusinessAction, type StepState } from '../actions';

interface SectorOption {
  id: string;
  name: string;
  icon: string;
  description: string;
}

interface BusinessOption {
  id: string;
  sector: string;
  name: string;
  icon: string;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} disabled={disabled} loadingLabel="Chargement">
      Continuer
    </Button>
  );
}

/**
 * Choix en deux temps : secteur, puis metier.
 *
 * Le second niveau est filtre a partir du premier cote navigateur pour le
 * confort, mais la coherence du couple est REVERIFIEE cote serveur : un
 * formulaire modifie ne peut pas activer les modules d un autre secteur.
 */
export function BusinessChoice({
  sectors,
  businesses,
  selectedSector,
  selectedBusiness,
}: {
  sectors: SectorOption[];
  businesses: BusinessOption[];
  selectedSector: string | null;
  selectedBusiness: string | null;
}) {
  const [sector, setSector] = useState<string | null>(selectedSector);
  const [business, setBusiness] = useState<string | null>(selectedBusiness);
  const [state, action] = useActionState<StepState, FormData>(chooseBusinessAction, STEP_IDLE);

  const options = useMemo(
    () => businesses.filter((entry) => entry.sector === sector),
    [businesses, sector],
  );

  const chooseSector = (id: string) => {
    setSector(id);
    // Changer de secteur invalide le metier precedemment choisi.
    setBusiness((current) =>
      businesses.some((entry) => entry.id === current && entry.sector === id) ? current : null,
    );
  };

  return (
    <form action={action} className="mt-8">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert" className="mb-6">
          {state.message}
        </Alert>
      ) : null}

      <input type="hidden" name="sectorSlug" value={sector ?? ''} />
      <input type="hidden" name="businessTypeSlug" value={business ?? ''} />

      <fieldset>
        <legend className="text-sm font-medium">Votre secteur</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sectors.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => chooseSector(entry.id)}
              aria-pressed={sector === entry.id}
              className={cn(
                'flex items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-left transition-colors',
                sector === entry.id
                  ? 'border-[var(--accent)] bg-[var(--surface-elevated)]'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)]',
              )}
            >
              <Icon name={entry.icon} size={18} className="mt-0.5 text-[var(--muted)]" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{entry.name}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[var(--foreground-muted)]">
                  {entry.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {sector ? (
        <fieldset className="mt-8">
          <legend className="text-sm font-medium">Votre métier</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {options.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setBusiness(entry.id)}
                aria-pressed={business === entry.id}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors',
                  business === entry.id
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
                    : 'border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)]',
                )}
              >
                <Icon name={entry.icon} size={14} />
                {entry.name}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Vous ne trouvez pas exactement votre métier ? Choisissez le plus proche : nous
            adapterons le site avec vous.
          </p>
        </fieldset>
      ) : null}

      <div className="mt-8">
        <SubmitButton disabled={!sector || !business} />
      </div>
    </form>
  );
}

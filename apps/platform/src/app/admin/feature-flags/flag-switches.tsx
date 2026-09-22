'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Panel, Switch, useToast } from '@stax/ui';
import { toggleFeatureFlagAction } from './actions';

/**
 * Bascule des activations progressives.
 *
 * Le libelle rappelle a chaque fois la distinction qui compte : un drapeau
 * deploie, il ne vend pas. Ouvrir un drapeau n'accorde aucun droit qu'une
 * offre ne comporte pas.
 */

export interface FlagView {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
}

export function FlagSwitches({ flags }: { flags: FlagView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  if (flags.length === 0) return null;

  return (
    <Panel level={1} padding="lg">
      <h2 className="text-sm font-medium">Activer ou désactiver</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
        Un drapeau sert à déployer progressivement, pas à vendre. Les droits d’offre restent décidés
        par le catalogue : ouvrir un drapeau ne donne accès à rien qu’une offre ne comporte pas.
      </p>

      <ul className="mt-5 space-y-4">
        {flags.map((flag) => (
          <li key={flag.key}>
            <Switch
              checked={flag.enabled}
              disabled={pending}
              label={flag.label}
              description={flag.description ?? flag.key}
              onChange={(event) => {
                const enabled = event.target.checked;
                startTransition(() => {
                  void toggleFeatureFlagAction({ key: flag.key, enabled }).then((result) => {
                    if (result.status === 'error') toast.error(result.message ?? 'Refusé.');
                    else if (result.message) toast.success(result.message);
                    router.refresh();
                  });
                });
              }}
            />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

'use client';

import { useTransition } from 'react';
import { Button, ButtonLink } from '@stax/ui';
import { signOutAction } from '~/app/app/actions';

/**
 * La sortie de la page d accueil d un compte sans site.
 *
 * Cette page n avait AUCUNE issue : pas de navigation, pas de deconnexion, et
 * trois boutons qui n allaient que plus loin dans des tunnels. Une personne
 * qui y arrivait par erreur — ou qui changeait d avis — y restait enfermee.
 *
 * Toute page ou l on peut atterrir doit offrir au moins deux choses : revenir
 * au site, et fermer sa session.
 */
export function ExitBar({ canReachAdmin }: { canReachAdmin: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ButtonLink href="/" variant="ghost" size="sm">
        Retour au site
      </ButtonLink>

      {canReachAdmin ? (
        <ButtonLink href="/admin" variant="ghost" size="sm">
          Administration
        </ButtonLink>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          startTransition(() => {
            void signOutAction();
          });
        }}
      >
        {pending ? 'Déconnexion…' : 'Se déconnecter'}
      </Button>
    </div>
  );
}

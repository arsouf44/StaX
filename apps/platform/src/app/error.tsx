'use client';

import { useEffect } from 'react';
import { Button, ButtonLink, Container } from '@stax/ui';

/**
 * Erreur inattendue.
 *
 * Aucun detail technique n est montre : il serait au mieux inutile pour la
 * personne, au pire une aide pour quelqu un de mal intentionne. Le
 * `digest` permet en revanche a notre support de retrouver l incident exact
 * dans les journaux.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[stax:error]', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center">
      <Container size="default">
        <div className="max-w-xl">
          <p className="text-2xs font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
            Une erreur est survenue
          </p>
          <h1 className="mt-4 text-3xl font-medium tracking-[-0.03em]">
            Cette page n’a pas pu s’afficher
          </h1>
          <p className="mt-4 leading-relaxed text-[var(--foreground-muted)]">
            L’incident a été signalé automatiquement. Vos données ne sont pas affectées : rien n’est
            perdu et aucune action n’a été enregistrée à moitié.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={reset}>Réessayer</Button>
            <ButtonLink href="/" variant="secondary">
              Retour à l’accueil
            </ButtonLink>
            <ButtonLink href="/contact" variant="ghost">
              Nous signaler le problème
            </ButtonLink>
          </div>

          {error.digest ? (
            <p className="mt-8 text-xs text-[var(--muted)]">
              Référence de l’incident :{' '}
              <code className="rounded bg-[var(--background-inset)] px-1.5 py-0.5 font-mono">
                {error.digest}
              </code>
              <br />
              Communiquez-la à notre support : elle nous permet de retrouver exactement ce qui s’est
              passé.
            </p>
          ) : null}
        </div>
      </Container>
    </div>
  );
}

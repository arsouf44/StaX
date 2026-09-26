'use client';

import Link from 'next/link';
import { Button, Icon, Panel, useLocalStorageValue, writeLocalStorage } from '@stax/ui';

/**
 * « Vos premiers pas » : trois gestes, dans l'ordre où on les fait vraiment.
 *
 * Affiché aux premières visites après la livraison, masquable d'un clic (le
 * choix est retenu sur cet appareil : c'est une commodité, pas une donnée).
 */
export function FirstSteps({
  siteUrl,
  storageKey,
}: {
  siteUrl: string | null;
  /** Une clé par site : masquer le guide d'un site ne masque pas celui d'un autre. */
  storageKey: string;
}) {
  const hidden = useLocalStorageValue(storageKey) === 'hidden';
  if (hidden) return null;

  const steps = [
    {
      icon: 'eye',
      title: 'Regardez votre site',
      text: 'Il est en ligne. Ouvrez-le comme le feront vos clients.',
      href: siteUrl,
      external: true,
      cta: 'Voir mon site',
    },
    {
      icon: 'pencil',
      title: 'Changez un texte ou une photo',
      text: 'Cliquez sur ce que vous voulez changer, modifiez-le, puis « Publier ». Rien ne change en ligne tant que vous n’avez pas publié.',
      href: '/app/editeur',
      external: false,
      cta: 'Modifier mon site',
    },
    {
      icon: 'message-circle',
      title: 'Une question ? Écrivez-nous',
      text: 'Nouvelle page, nom de domaine, doute : l’équipe qui a créé votre site vous répond.',
      href: '/app/discussion',
      external: false,
      cta: 'Écrire à l’équipe',
    },
  ];

  return (
    <Panel level={1} padding="lg" data-testid="first-steps">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Vos premiers pas</h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Trois gestes suffisent pour faire vivre votre site. Vous ne pouvez rien casser : chaque
            version reste restaurable.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => writeLocalStorage(storageKey, 'hidden')}>
          Masquer
        </Button>
      </div>
      <ol className="mt-5 grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col rounded-[var(--radius-md)] border border-[var(--border)] p-4"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <span
                aria-hidden
                className="grid size-6 place-items-center rounded-full bg-[var(--accent)]/12 text-xs text-[var(--accent)]"
              >
                {index + 1}
              </span>
              {step.title}
            </span>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--foreground-muted)]">
              {step.text}
            </p>
            {step.href ? (
              step.external ? (
                <a
                  href={step.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
                >
                  <Icon name={step.icon} size={14} />
                  {step.cta}
                </a>
              ) : (
                <Link
                  href={step.href}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
                >
                  <Icon name={step.icon} size={14} />
                  {step.cta}
                </Link>
              )
            ) : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

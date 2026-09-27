import type { ReactNode } from 'react';
import { Panel } from '@stax/ui';

/**
 * Cadre commun aux formulaires d authentification.
 * Largeur bornee a 26 rem : au-dela, l œil perd la colonne de saisie.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[28rem]">
      <Panel level={2} padding="lg" className="glass-sheen">
        <p className="kicker relative">Espace StaX</p>
        <h1 className="display-panel relative mt-3">{title}</h1>
        {description ? (
          <p className="relative mt-3.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
            {description}
          </p>
        ) : null}
        <div className="relative mt-7">{children}</div>
      </Panel>
      {footer ? (
        <p className="mt-6 text-center text-sm text-[var(--foreground-muted)]">{footer}</p>
      ) : null}
    </div>
  );
}

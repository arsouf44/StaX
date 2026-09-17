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
    <div className="mx-auto w-full max-w-[26rem]">
      <Panel level={2} padding="lg" className="halo">
        <h1 className="text-2xl font-medium tracking-[-0.02em]">{title}</h1>
        {description ? (
          <p className="mt-2.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
            {description}
          </p>
        ) : null}
        <div className="mt-7">{children}</div>
      </Panel>
      {footer ? (
        <p className="mt-6 text-center text-sm text-[var(--foreground-muted)]">{footer}</p>
      ) : null}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ConfirmDialog, Icon, Panel, StatusPill, useToast } from '@stax/ui';
import { rollbackSiteAction } from './actions';

/**
 * Historique des publications.
 *
 * Chaque publication fige un instantane complet du site. Remettre une version
 * en ligne la republie immediatement sous un nouveau numero — c est ce que
 * fait reellement `app.rollback_site`, et le texte affiche ici le dit sans
 * l adoucir : promettre « rien ne change en ligne » serait faux, et un client
 * qui decouvre le contraire apres coup ne fait plus confiance a l outil.
 *
 * Le brouillon, lui, n est pas touche : les modifications en cours dans
 * l editeur restent la ou elles sont.
 */

export interface SiteVersionView {
  id: string;
  number: number;
  label: string | null;
  publishedAtIso: string;
  publishedAtLabel: string;
  authorName: string | null;
  isCurrent: boolean;
}

export function VersionHistory({
  siteId,
  versions,
  canPublish,
}: {
  siteId: string;
  versions: SiteVersionView[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<SiteVersionView | null>(null);

  if (versions.length === 0) {
    return (
      <Panel level={1} padding="lg">
        <h2 className="text-sm font-medium">Historique des publications</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
          Votre site n’a pas encore été publié. Dès la première publication, chaque version sera
          conservée ici et vous pourrez revenir en arrière.
        </p>
      </Panel>
    );
  }

  return (
    <Panel level={1} padding="lg">
      <h2 className="text-sm font-medium">Historique des publications</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
        Chaque publication est conservée. Vous pouvez remettre n’importe laquelle en ligne
        immédiatement. Votre brouillon — ce que vous voyez dans l’éditeur — n’est pas modifié.
      </p>

      <ul className="mt-5 divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {versions.map((version) => (
          <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Version {version.number}</span>
                {version.isCurrent ? <StatusPill tone="success">En ligne</StatusPill> : null}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                <time dateTime={version.publishedAtIso}>{version.publishedAtLabel}</time>
                {version.authorName ? ` · ${version.authorName}` : ''}
                {version.label ? ` · ${version.label}` : ''}
              </p>
            </div>

            {canPublish && !version.isCurrent ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setTarget(version)}
              >
                <Icon name="history" size={14} aria-hidden="true" />
                Remettre en ligne
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {!canPublish ? (
        <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
          Revenir à une version précédente est réservé aux personnes qui peuvent publier.
        </p>
      ) : null}

      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title={`Remettre la version ${target?.number ?? ''} en ligne ?`}
        description={
          'Vos visiteurs verront cette version immédiatement. Votre brouillon n’est pas modifié : ' +
          'vos modifications en cours restent dans l’éditeur, et publier les remettra en ligne. ' +
          'Cette opération est elle-même enregistrée dans l’historique, donc annulable.'
        }
        confirmLabel="Remettre cette version en ligne"
        loading={pending}
        onConfirm={() => {
          if (!target) return;
          startTransition(() => {
            void rollbackSiteAction({ siteId, versionId: target.id }).then((result) => {
              if (result.status === 'error') toast.error(result.message ?? 'Restauration refusée.');
              else if (result.message) toast.success(result.message);
              setTarget(null);
              router.refresh();
            });
          });
        }}
      />
    </Panel>
  );
}

'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  Button,
  ConfirmDialog,
  Dialog,
  Icon,
  Sheet,
  Spinner,
  StatusPill,
  useToast,
} from '@stax/ui';
import {
  compareAction,
  loadHistoryAction,
  republishVersionAction,
  restoreToDraftAction,
} from './actions';
import type { HistoryChange, HistoryEntry, PublishOutcome } from './types';

/**
 * Historique des versions.
 *
 * Chaque ligne dit QUAND, QUI et QUOI, avec des mots simples :
 * « Aujourd’hui 18:42 — Vous — Publication ». L equipe StaX apparait comme
 * telle : le client sait toujours qui a touche a son site.
 *
 * Quatre actions, et aucune ne detruit rien :
 *  - Voir : ouvre la version dans un nouvel onglet ;
 *  - Comparer : liste ce qui differe de votre brouillon actuel ;
 *  - Restaurer : remet cette version dans le BROUILLON (le site en ligne ne
 *    change pas ; le brouillon actuel est d abord sauvegarde) ;
 *  - Republier : remet cette version EN LIGNE, sous un nouveau numero.
 */

const AUTHOR_TONE = {
  you: 'neutral',
  member: 'neutral',
  stax: 'info',
  system: 'neutral',
} as const;

export function HistoryPanel({
  open,
  onClose,
  siteId,
  canPublish,
  onRestored,
  onRepublished,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  canPublish: boolean;
  onRestored: () => void;
  onRepublished: (outcome: PublishOutcome) => void;
}) {
  const toast = useToast();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [comparing, setComparing] = useState<{
    entry: HistoryEntry;
    changes: HistoryChange[] | null;
  } | null>(null);
  const [restoring, setRestoring] = useState<HistoryEntry | null>(null);
  const [republishing, setRepublishing] = useState<HistoryEntry | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    setEntries(null);
    void loadHistoryAction({ siteId }).then((result) => {
      if (result.status === 'success') setEntries(result.entries);
      else setEntries([]);
    });
  }, [siteId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const compare = (entry: HistoryEntry) => {
    setComparing({ entry, changes: null });
    void compareAction({ siteId, kind: entry.kind, id: entry.id }).then((result) => {
      setComparing({ entry, changes: result.status === 'success' ? result.changes : [] });
    });
  };

  const view = (entry: HistoryEntry) => {
    const params = new URLSearchParams({ [entry.kind]: entry.id });
    window.open(`/app/editeur/apercu?${params.toString()}`, '_blank', 'noopener');
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Historique des versions" side="right">
        <div className="space-y-4" data-testid="history-panel">
          <p className="text-sm text-[var(--foreground-muted)]">
            Chaque publication et chaque enregistrement automatique est conservé. Revenir en arrière
            ne supprime jamais les versions suivantes.
          </p>
          {entries === null ? (
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Spinner /> Chargement…
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">
              Aucune version pour l’instant. Votre première publication apparaîtra ici.
            </p>
          ) : (
            <ol className="space-y-2">
              {entries.map((entry) => (
                <li
                  key={`${entry.kind}-${entry.id}`}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] p-3"
                  data-testid="history-entry"
                  data-kind={entry.kind}
                  data-number={entry.number ?? ''}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{entry.atLabel}</p>
                    <span className="text-sm text-[var(--foreground-muted)]">— {entry.author}</span>
                    {entry.isLive ? <StatusPill tone="success">En ligne</StatusPill> : null}
                    {entry.authorKind === 'stax' ? (
                      <StatusPill tone={AUTHOR_TONE.stax}>Équipe StaX</StatusPill>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm">{entry.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" onClick={() => view(entry)}>
                      <Icon name="eye" size={14} aria-hidden="true" />
                      Voir
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => compare(entry)}>
                      <Icon name="compare" size={14} aria-hidden="true" />
                      Comparer
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRestoring(entry)}>
                      <Icon name="rotate-ccw" size={14} aria-hidden="true" />
                      Restaurer
                    </Button>
                    {entry.kind === 'version' && canPublish && !entry.isLive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRepublishing(entry)}
                        data-testid="republish-version"
                      >
                        <Icon name="rocket" size={14} aria-hidden="true" />
                        Republier cette version
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Sheet>

      <Dialog
        open={comparing !== null}
        onClose={() => setComparing(null)}
        size="lg"
        title={comparing ? `Comparer avec votre brouillon` : ''}
        description={
          comparing
            ? `Ce qui a changé entre « ${comparing.entry.title} » (${comparing.entry.atLabel}) et votre brouillon actuel.`
            : undefined
        }
      >
        {comparing?.changes === null ? (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <Spinner /> Comparaison…
          </div>
        ) : comparing && comparing.changes && comparing.changes.length === 0 ? (
          <p className="text-sm">
            Aucune différence : votre brouillon est identique à cette version.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm" data-testid="compare-list">
            {comparing?.changes?.map((change, index) => (
              <li key={index} className="flex gap-2">
                <span className="text-[var(--muted)]">•</span>
                <span>
                  {change.page ? <strong>{change.page} : </strong> : null}
                  {change.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      <ConfirmDialog
        open={restoring !== null}
        onClose={() => setRestoring(null)}
        loading={pending}
        title="Restaurer cette version dans votre brouillon ?"
        description="Votre brouillon reprendra le contenu de cette version. Votre site en ligne ne change pas tant que vous ne publiez pas. Votre brouillon actuel est sauvegardé dans l’historique : vous pourrez y revenir."
        confirmLabel="Restaurer dans mon brouillon"
        onConfirm={() => {
          const entry = restoring;
          if (!entry) return;
          startTransition(() => {
            void restoreToDraftAction({ siteId, kind: entry.kind, id: entry.id }).then((result) => {
              setRestoring(null);
              if (result.status === 'error') toast.error(result.message);
              else {
                toast.success(result.message ?? 'Version restaurée.');
                onRestored();
                load();
              }
            });
          });
        }}
      />

      <ConfirmDialog
        open={republishing !== null}
        onClose={() => setRepublishing(null)}
        loading={pending}
        title="Remettre cette version en ligne ?"
        description="Vos visiteurs verront immédiatement cette version. Elle est publiée sous un nouveau numéro : la version actuelle reste dans l’historique et vous pourrez y revenir. Votre brouillon n’est pas modifié."
        confirmLabel="Republier cette version"
        onConfirm={() => {
          const entry = republishing;
          if (!entry) return;
          startTransition(() => {
            void republishVersionAction({ siteId, versionId: entry.id }).then((result) => {
              setRepublishing(null);
              if (result.status === 'error') toast.error(result.message);
              else {
                toast.success(result.message ?? 'Version remise en ligne.');
                onRepublished(result.outcome);
                load();
              }
            });
          });
        }}
      />
    </>
  );
}

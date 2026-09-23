'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Panel,
  StatusPill,
  useToast,
  type StatusTone,
} from '@stax/ui';
import { cancelScheduledReleaseAction, restoreReleaseAction } from '../../editeur/contract/actions';
import type { ReleaseView } from '../../editeur/contract/types';

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

const STATUS: Record<string, { tone: StatusTone; label: string }> = {
  scheduled: { tone: 'info', label: 'Programmée' },
  queued: { tone: 'neutral', label: 'En attente' },
  committing: { tone: 'accent', label: 'Enregistrement' },
  deploying: { tone: 'accent', label: 'Mise en ligne en cours' },
  published: { tone: 'success', label: 'En ligne' },
  superseded: { tone: 'neutral', label: 'Remplacée' },
  failed: { tone: 'danger', label: 'Non publiée' },
  cancelled: { tone: 'neutral', label: 'Annulée' },
};

const DEPLOYMENT: Record<string, string> = {
  success: 'Déploiement Cloudflare réussi',
  failure: 'Déploiement Cloudflare en échec',
  canceled: 'Déploiement Cloudflare annulé',
  skipped: 'Déploiement Cloudflare ignoré',
  queued: 'Déploiement Cloudflare en file',
  building: 'Déploiement Cloudflare en cours',
  deploying: 'Déploiement Cloudflare en cours',
};

function kindLabel(release: ReleaseView): string {
  if (release.kind === 'import') return 'Mise en ligne initiale';
  if (release.kind === 'rollback') {
    return release.sourceVersion
      ? `Restauration de la version ${release.sourceVersion}`
      : 'Restauration';
  }
  return 'Publication';
}

export function VersionList({
  releases,
  canPublish,
}: {
  releases: ReleaseView[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    release: ReleaseView;
    mode: 'restore' | 'republish';
  } | null>(null);
  const busy = releases.some((release) =>
    ['queued', 'committing', 'deploying'].includes(release.status),
  );

  return (
    <div className="space-y-4">
      {error ? (
        <Alert tone="danger" live="alert">
          {error}
        </Alert>
      ) : null}
      <ul className="space-y-3">
        {releases.map((release) => {
          const status = STATUS[release.status] ?? {
            tone: 'neutral' as StatusTone,
            label: release.status,
          };
          const date = release.publishedAt ?? release.scheduledFor ?? release.createdAt;
          return (
            <li key={release.id}>
              <Panel level={1} padding="md" data-testid="release-row">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-medium">Version {release.version}</span>
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      <Badge>{kindLabel(release)}</Badge>
                    </p>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {release.status === 'scheduled'
                        ? 'Programmée pour le '
                        : release.publishedAt
                          ? 'Publiée le '
                          : 'Demandée le '}
                      {DATE_TIME.format(new Date(date))}
                      {release.author ? ` — par ${release.author}` : ''}
                    </p>
                    {release.note ? <p className="text-sm">« {release.note} »</p> : null}
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                      {release.commit ? (
                        <span>
                          Commit <span className="font-mono">{release.commit.slice(0, 7)}</span>
                        </span>
                      ) : null}
                      {release.deploymentStatus ? (
                        <span>
                          {DEPLOYMENT[release.deploymentStatus] ?? release.deploymentStatus}
                        </span>
                      ) : null}
                    </p>
                    {release.status === 'failed' && release.error ? (
                      <p className="text-xs text-[var(--danger)]">{release.error}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {release.deploymentUrl && release.deploymentStatus === 'success' ? (
                      <a
                        href={release.deploymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-3 text-sm hover:bg-[var(--surface-hover)]"
                      >
                        Voir
                      </a>
                    ) : null}
                    {canPublish && release.status === 'superseded' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setConfirm({ release, mode: 'restore' })}
                      >
                        Restaurer
                      </Button>
                    ) : null}
                    {canPublish && release.status === 'published' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setConfirm({ release, mode: 'republish' })}
                      >
                        Republier
                      </Button>
                    ) : null}
                    {canPublish && release.status === 'scheduled' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={pending}
                        onClick={() =>
                          startTransition(() => {
                            void cancelScheduledReleaseAction({ releaseId: release.id }).then(
                              (result) => {
                                if (result.status === 'error') setError(result.message);
                                else toast.success(result.message ?? 'Annulée.');
                                router.refresh();
                              },
                            );
                          })
                        }
                      >
                        Annuler la programmation
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Panel>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm?.mode === 'republish'
            ? `Republier la version ${confirm.release.version} ?`
            : `Restaurer la version ${confirm?.release.version ?? ''} ?`
        }
        description={
          confirm?.mode === 'republish'
            ? 'La version en ligne est déployée de nouveau, à l’identique. Utile si votre site ne s’affiche pas correctement.'
            : 'Cette version redevient celle de votre site : elle est redéployée comme une nouvelle version. Votre brouillon en cours n’est pas modifié, et l’historique reste complet.'
        }
        confirmLabel={confirm?.mode === 'republish' ? 'Republier' : 'Restaurer'}
        loading={pending}
        onConfirm={() => {
          if (!confirm) return;
          startTransition(() => {
            void restoreReleaseAction({ sourceReleaseId: confirm.release.id }).then((result) => {
              setConfirm(null);
              if (result.status === 'error') setError(result.message);
              else toast.success(result.message ?? 'Lancé.');
              router.refresh();
            });
          });
        }}
      />
    </div>
  );
}

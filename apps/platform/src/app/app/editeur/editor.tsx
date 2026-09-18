'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Alert, Button, ConfirmDialog, Icon, Panel, StatusPill, cn, useToast } from '@stax/ui';
import type { ActionState } from '~/lib/form-state';
import type { EditorBlock, EditorPage } from './page';
import { BlockForm } from './block-form';
import { publishSiteAction, reorderBlocksAction, toggleBlockVisibilityAction } from './actions';

/**
 * Editeur.
 *
 * Trois colonnes sur grand ecran, empilees sur telephone : la liste des
 * sections, le formulaire de la section choisie, et les actions. Le
 * reordonnancement se fait par des boutons « monter / descendre » plutot que
 * par glisser-deposer : c est utilisable au clavier, sur un ecran tactile, et
 * par quelqu un qui n a pas la main sure.
 */
export function Editor({
  siteId,
  siteName,
  canPublish,
  isLive,
  previewHost,
  lastEditedAt,
  pages,
  page,
}: {
  siteId: string;
  siteName: string;
  canPublish: boolean;
  isLive: boolean;
  previewHost: string | null;
  lastEditedAt: string | null;
  pages: Array<{ id: string; path: string; title: string }>;
  page: EditorPage;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(page.blocks[0]?.id ?? null);
  const [order, setOrder] = useState<string[]>(page.blocks.map((block) => block.id));
  const [confirmPublish, setConfirmPublish] = useState(false);

  const blocks = order
    .map((id) => page.blocks.find((block) => block.id === id))
    .filter((block): block is EditorBlock => block !== undefined);

  const active = blocks.find((block) => block.id === selected) ?? blocks[0] ?? null;

  const announce = (result: ActionState) => {
    if (result.status === 'error') toast.error(result.message ?? 'Action refusée.');
    else if (result.message) toast.success(result.message);
  };

  const move = (blockId: string, direction: -1 | 1) => {
    const index = order.indexOf(blockId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= order.length) return;

    const next = [...order];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    setOrder(next);

    startTransition(() => {
      void reorderBlocksAction({ pageId: page.id, order: next }).then((result) => {
        announce(result);
        // L ordre affiche est optimiste ; si le serveur refuse, on reprend
        // l etat reel plutot que de laisser une illusion.
        if (result.status === 'error') router.refresh();
      });
    });
  };

  const toggle = (block: EditorBlock) => {
    startTransition(() => {
      void toggleBlockVisibilityAction({ blockId: block.id, visible: !block.visible }).then(
        (result) => {
          announce(result);
          router.refresh();
        },
      );
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium tracking-[-0.02em]">Modifier mon site</h1>
          <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
            {siteName} — vos changements sont enregistrés immédiatement, mais ne sont visibles du
            public qu’après publication.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {previewHost ? (
            <a
              href={`https://${previewHost}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            >
              <Icon name="globe" size={14} />
              Voir en ligne
            </a>
          ) : null}
          {canPublish ? (
            <Button loading={pending} onClick={() => setConfirmPublish(true)}>
              {isLive ? 'Publier mes modifications' : 'Publier mon site'}
            </Button>
          ) : null}
        </div>
      </div>

      {!canPublish ? (
        <Alert tone="info" live="status">
          Vous pouvez modifier le contenu. La publication est réservée aux administrateurs de votre
          organisation : prévenez-les quand vos changements sont prêts.
        </Alert>
      ) : null}

      {pages.length > 1 ? (
        <nav aria-label="Pages du site">
          <ul className="flex flex-wrap gap-1.5">
            {pages.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/app/editeur?page=${entry.id}`}
                  aria-current={entry.id === page.id ? 'page' : undefined}
                  className={cn(
                    'inline-flex rounded-full border px-3 py-1.5 text-sm transition-colors',
                    entry.id === page.id
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
                      : 'border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]',
                  )}
                >
                  {entry.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr] lg:items-start">
        <Panel level={1} padding="sm" className="lg:sticky lg:top-24">
          <p className="px-2 py-1.5 text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
            Sections de la page
          </p>
          <ul className="mt-1 space-y-1">
            {blocks.map((block, index) => (
              <li key={block.id}>
                <div
                  className={cn(
                    'flex items-center gap-1 rounded-[var(--radius-md)] border px-2 py-1.5 transition-colors',
                    block.id === active?.id
                      ? 'border-[var(--accent)] bg-[var(--surface-elevated)]'
                      : 'border-transparent hover:bg-[var(--surface)]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(block.id)}
                    aria-current={block.id === active?.id ? 'true' : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                  >
                    <Icon name={block.icon} size={14} className="text-[var(--muted)]" />
                    <span className={cn('truncate', !block.visible && 'line-through opacity-50')}>
                      {block.label}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => move(block.id, -1)}
                    disabled={index === 0 || pending}
                    aria-label={`Monter la section ${block.label}`}
                    className="rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
                  >
                    <Icon name="align-left" size={12} className="-rotate-90" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(block.id, 1)}
                    disabled={index === blocks.length - 1 || pending}
                    aria-label={`Descendre la section ${block.label}`}
                    className="rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
                  >
                    <Icon name="align-left" size={12} className="rotate-90" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {lastEditedAt ? (
            <p className="mt-3 px-2 text-2xs text-[var(--muted)]">
              Dernière modification :{' '}
              <time dateTime={lastEditedAt}>
                {new Intl.DateTimeFormat('fr-FR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(lastEditedAt))}
              </time>
            </p>
          ) : null}
        </Panel>

        <div className="min-w-0">
          {active ? (
            <Panel level={2} padding="lg">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-medium">{active.label}</h2>
                  <p className="mt-1 max-w-xl text-sm text-[var(--foreground-muted)]">
                    {active.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={active.visible ? 'success' : 'neutral'}>
                    {active.visible ? 'Affichée' : 'Masquée'}
                  </StatusPill>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => toggle(active)}
                  >
                    {active.visible ? 'Masquer' : 'Afficher'}
                  </Button>
                </div>
              </div>

              <div className="mt-6">
                {active.fields.length === 0 ? (
                  <p className="text-sm text-[var(--foreground-muted)]">
                    Cette section affiche automatiquement vos données (carte, prestations,
                    horaires…). Modifiez-les depuis leur propre page : elles se mettent à jour ici
                    toutes seules.
                  </p>
                ) : (
                  <BlockForm key={active.id} block={active} />
                )}
              </div>
            </Panel>
          ) : (
            <Panel level={1} padding="lg">
              <p className="text-sm text-[var(--foreground-muted)]">
                Cette page n’a pas encore de section.
              </p>
            </Panel>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title={isLive ? 'Publier vos modifications ?' : 'Publier votre site ?'}
        description={
          isLive
            ? 'Vos visiteurs verront immédiatement la nouvelle version. Vous pourrez revenir à la version précédente en un clic.'
            : 'Votre site deviendra accessible au public. Vous pourrez continuer à le modifier ensuite.'
        }
        confirmLabel="Publier"
        loading={pending}
        onConfirm={() => {
          startTransition(() => {
            void publishSiteAction({ siteId }).then((result) => {
              announce(result);
              setConfirmPublish(false);
              router.refresh();
            });
          });
        }}
      />
    </div>
  );
}

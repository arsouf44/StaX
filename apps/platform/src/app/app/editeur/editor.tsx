'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { Alert, Button, ConfirmDialog, Icon, Panel, StatusPill, cn, useToast } from '@stax/ui';
import type { ActionState } from '~/lib/form-state';
import type { EditorBlock, EditorPage } from './page';
import { BlockForm } from './block-form';
import { BlockPicker, type BlockChoice } from './block-picker';
import { VersionHistory, type SiteVersionView } from './version-history';
import {
  addBlockAction,
  deleteBlockAction,
  duplicateBlockAction,
  publishSiteAction,
  reorderBlocksAction,
  toggleBlockVisibilityAction,
} from './actions';

/**
 * Editeur.
 *
 * Deux colonnes sur grand ecran, empilees sur telephone : la liste des
 * sections, et le formulaire de la section choisie. L apercu vient ensuite,
 * dans la largeur, avec un choix de format.
 *
 * Le reordonnancement existe sous DEUX formes, et c est delibere : le
 * glisser-deposer pour qui le prefere, les boutons « monter / descendre » pour
 * qui navigue au clavier, utilise un ecran tactile, ou n a pas la main sure.
 * Le glisser-deposer seul exclurait une partie des gens.
 *
 * Tout ce qui est modifie ici reste dans le BROUILLON. Le site en ligne ne
 * change qu a la publication, et l interface le rappelle a chaque etape plutot
 * que de laisser planer un doute.
 */

type Viewport = 'desktop' | 'tablet' | 'mobile';

/**
 * Largeurs d apercu.
 *
 * Elles correspondent a des appareils reels et courants, pas a des paliers
 * ronds : 390 px est la largeur d un telephone recent, 834 px celle d une
 * tablette en portrait.
 */
const VIEWPORTS: Array<{ id: Viewport; label: string; width: string; icon: string }> = [
  { id: 'desktop', label: 'Ordinateur', width: '100%', icon: 'monitor' },
  { id: 'tablet', label: 'Tablette', width: '834px', icon: 'tablet' },
  { id: 'mobile', label: 'Téléphone', width: '390px', icon: 'smartphone' },
];

export function Editor({
  siteId,
  siteName,
  canPublish,
  isLive,
  previewHost,
  lastEditedAt,
  pages,
  page,
  choices,
  versions,
}: {
  siteId: string;
  siteName: string;
  canPublish: boolean;
  isLive: boolean;
  previewHost: string | null;
  lastEditedAt: string | null;
  pages: Array<{ id: string; path: string; title: string }>;
  page: EditorPage;
  choices: BlockChoice[];
  versions: SiteVersionView[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(page.blocks[0]?.id ?? null);
  const [order, setOrder] = useState<string[]>(page.blocks.map((block) => block.id));
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<EditorBlock | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  // Change a chaque modification pour forcer l iframe a recharger : sans cela,
  // l apercu montrerait l etat d avant la derniere sauvegarde.
  const [previewKey, setPreviewKey] = useState(0);

  const blocks = order
    .map((id) => page.blocks.find((block) => block.id === id))
    .filter((block): block is EditorBlock => block !== undefined);

  const active = blocks.find((block) => block.id === selected) ?? blocks[0] ?? null;

  const announce = useCallback(
    (result: ActionState) => {
      if (result.status === 'error') toast.error(result.message ?? 'Action refusée.');
      else if (result.message) toast.success(result.message);
    },
    [toast],
  );

  const refresh = useCallback(() => {
    setPreviewKey((value) => value + 1);
    router.refresh();
  }, [router]);

  /** Enregistre un ordre deja applique a l affichage. */
  const persistOrder = useCallback(
    (next: string[]) => {
      setOrder(next);
      startTransition(() => {
        void reorderBlocksAction({ pageId: page.id, order: next }).then((result) => {
          announce(result);
          // L ordre affiche est optimiste ; si le serveur refuse, on reprend
          // l etat reel plutot que de laisser une illusion.
          if (result.status === 'error') router.refresh();
          else setPreviewKey((value) => value + 1);
        });
      });
    },
    [announce, page.id, router],
  );

  const move = (blockId: string, direction: -1 | 1) => {
    const index = order.indexOf(blockId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= order.length) return;

    const next = [...order];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    persistOrder(next);
  };

  /** Depose la section tiree juste avant celle qui recoit le lacher. */
  const dropOn = (targetId: string) => {
    if (!dragged || dragged === targetId) return;
    const from = order.indexOf(dragged);
    const to = order.indexOf(targetId);
    setDragged(null);
    if (from === -1 || to === -1) return;

    const next = [...order];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    persistOrder(next);
  };

  const toggle = (block: EditorBlock) => {
    startTransition(() => {
      void toggleBlockVisibilityAction({ blockId: block.id, visible: !block.visible }).then(
        (result) => {
          announce(result);
          refresh();
        },
      );
    });
  };

  const add = (type: string) => {
    startTransition(() => {
      void addBlockAction({ pageId: page.id, type }).then((result) => {
        announce(result);
        refresh();
      });
    });
  };

  const duplicate = (block: EditorBlock) => {
    startTransition(() => {
      void duplicateBlockAction({ blockId: block.id }).then((result) => {
        announce(result);
        refresh();
      });
    });
  };

  const remove = (block: EditorBlock) => {
    startTransition(() => {
      void deleteBlockAction({ blockId: block.id }).then((result) => {
        announce(result);
        setConfirmDelete(null);
        if (result.status === 'success') setSelected(null);
        refresh();
      });
    });
  };

  const viewportWidth = VIEWPORTS.find((entry) => entry.id === viewport)?.width ?? '100%';

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
              <li
                key={block.id}
                draggable={!pending}
                onDragStart={() => setDragged(block.id)}
                onDragEnd={() => setDragged(null)}
                onDragOver={(event) => {
                  if (dragged && dragged !== block.id) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dropOn(block.id);
                }}
                className={cn(dragged === block.id && 'opacity-40')}
              >
                <div
                  className={cn(
                    'flex items-center gap-1 rounded-[var(--radius-md)] border px-2 py-1.5 transition-colors',
                    block.id === active?.id
                      ? 'border-[var(--accent)] bg-[var(--surface-elevated)]'
                      : 'border-transparent hover:bg-[var(--surface)]',
                  )}
                >
                  <span
                    aria-hidden="true"
                    title="Glisser pour déplacer"
                    className="cursor-grab text-[var(--muted)] active:cursor-grabbing"
                  >
                    <Icon name="grip-vertical" size={12} />
                  </span>

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

          {blocks.length === 0 ? (
            <p className="px-2 py-3 text-sm text-[var(--foreground-muted)]">
              Cette page est vide. Ajoutez une première section.
            </p>
          ) : null}

          <div className="mt-3 px-1">
            <BlockPicker choices={choices} pending={pending} onPick={add} />
          </div>

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
                <div className="flex flex-wrap items-center gap-2">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => duplicate(active)}
                  >
                    <Icon name="copy" size={14} aria-hidden="true" />
                    Dupliquer
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[var(--danger)] hover:text-[var(--danger)]"
                    disabled={pending}
                    onClick={() => setConfirmDelete(active)}
                  >
                    <Icon name="trash-2" size={14} aria-hidden="true" />
                    Supprimer
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
                  <BlockForm key={active.id} block={active} onSaved={refresh} />
                )}
              </div>
            </Panel>
          ) : (
            <Panel level={1} padding="lg">
              <p className="text-sm text-[var(--foreground-muted)]">
                Cette page n’a pas encore de section. Utilisez « Ajouter une section » pour
                commencer.
              </p>
            </Panel>
          )}
        </div>
      </div>

      <section aria-labelledby="apercu">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="apercu" className="text-sm font-medium">
            Aperçu de votre brouillon
          </h2>
          <div
            role="group"
            aria-label="Format de l’aperçu"
            className="inline-flex rounded-[var(--radius-md)] border border-[var(--border)] p-0.5"
          >
            {VIEWPORTS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setViewport(entry.id)}
                aria-pressed={viewport === entry.id}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs transition-colors',
                  viewport === entry.id
                    ? 'bg-[var(--surface-elevated)] text-[var(--foreground)]'
                    : 'text-[var(--muted)] hover:text-[var(--foreground)]',
                )}
              >
                <Icon name={entry.icon} size={14} aria-hidden="true" />
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <Panel level={1} padding="sm">
          <div className="flex justify-center overflow-x-auto">
            <iframe
              // `key` force un rechargement complet apres chaque modification.
              key={`${page.id}-${previewKey}`}
              src={`/app/editeur/apercu?page=${encodeURIComponent(page.id)}&v=${previewKey}`}
              title={`Aperçu de ${page.title}`}
              // Bac a sable strict : le contenu vient du client et ne doit
              // jamais pouvoir atteindre la session de la plateforme. Sans
              // `allow-same-origin`, l iframe recoit une origine opaque.
              sandbox="allow-scripts"
              loading="lazy"
              className="h-[36rem] rounded-[var(--radius-md)] border border-[var(--border)] bg-white"
              style={{ width: viewportWidth, maxWidth: '100%' }}
            />
          </div>
          <p className="mt-2 px-1 text-2xs text-[var(--muted)]">
            Aperçu privé du brouillon. Les formulaires et les paiements y sont désactivés : rien de
            ce qui est saisi ici n’est enregistré.
          </p>
        </Panel>
      </section>

      <VersionHistory siteId={siteId} versions={versions} canPublish={canPublish} />

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
              refresh();
            });
          });
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Supprimer la section « ${confirmDelete?.label ?? ''} » ?`}
        description="Son contenu sera perdu. Votre site en ligne ne change pas tant que vous n’avez pas republié — et une version précédente reste toujours restaurable depuis l’historique."
        confirmLabel="Supprimer la section"
        tone="danger"
        loading={pending}
        onConfirm={() => {
          if (confirmDelete) remove(confirmDelete);
        }}
      />
    </div>
  );
}

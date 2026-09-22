'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ConfirmDialog, Icon, cn, useToast } from '@stax/ui';
import {
  commitPageAction,
  purgeTrashItemAction,
  redoAction,
  reloadPageAction,
  undoAction,
} from './actions';
import type { FieldContext } from './field-editors';
import { HistoryPanel } from './history-panel';
import { PreviewFrame, type PreviewSelection, type Viewport } from './preview-frame';
import { PropertiesPanel } from './properties-panel';
import { PublishDialog } from './publish-dialog';
import { SectionLibrary } from './section-library';
import type {
  BlockMeta,
  CommitPayload,
  EditorBlock,
  EditorPageRef,
  EditorStatus,
  PublishOutcome,
  TrashedBlock,
} from './types';

/**
 * Editeur visuel.
 *
 *   ┌──────────────┬───────────────────────────┬────────────────┐
 *   │ Structure    │  Aperçu reel du site      │  Propriétés    │
 *   │ (sections,   │  (clic = sélection)       │  (contenu,     │
 *   │ ajout,       │                           │  apparence)    │
 *   │ corbeille)   │                           │                │
 *   └──────────────┴───────────────────────────┴────────────────┘
 *
 * ENREGISTREMENT : chaque changement est envoye au serveur (tout de suite pour
 * une action, 0,8 s apres la derniere frappe pour un texte). Les envois sont
 * mis en file : ils partent dans l ordre, jamais en parallele, et chacun porte
 * l etat complet de la page — un envoi perdu ne laisse pas de demi-etat.
 *
 * ANNULER / RETABLIR : c est la BASE qui tient l historique. Annuler marche
 * donc apres un rechargement, sur un autre appareil, et meme pour une action
 * faite par quelqu un d autre.
 */

type SaveState = 'saved' | 'saving' | 'pending' | 'error';

const TEXT_DELAY_MS = 800;

function newId(): string {
  return crypto.randomUUID();
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function VisualEditor({
  siteId,
  siteName,
  canPublish,
  canManageMedia,
  isLive,
  liveUrl,
  liveHost,
  hasUnpublishedChanges,
  pages,
  page,
  initialBlocks,
  initialTrash,
  initialStatus,
  metas,
  staffMode,
}: {
  siteId: string;
  siteName: string;
  viewerId: string;
  canPublish: boolean;
  canManageMedia: boolean;
  isLive: boolean;
  liveUrl: string | null;
  liveHost: string | null;
  hasUnpublishedChanges: boolean;
  pages: EditorPageRef[];
  page: EditorPageRef;
  initialBlocks: EditorBlock[];
  initialTrash: TrashedBlock[];
  initialStatus: EditorStatus;
  metas: Record<string, BlockMeta>;
  staffMode: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [blocks, setBlocks] = useState<EditorBlock[]>(initialBlocks);
  const [trash, setTrash] = useState<TrashedBlock[]>(initialTrash);
  const [status, setStatus] = useState<EditorStatus>(initialStatus);
  const [selectedId, setSelectedId] = useState<string | null>(initialBlocks[0]?.id ?? null);
  const [focus, setFocus] = useState<FieldContext['focus']>(null);
  const [tab, setTab] = useState<'content' | 'style'>('content');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [previewVersion, setPreviewVersion] = useState(0);
  const [unpublished, setUnpublished] = useState(hasUnpublishedChanges);
  const [live, setLive] = useState(isLive);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<EditorBlock | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashedBlock | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<'structure' | 'preview' | 'properties'>('preview');

  // References : la file d envoi lit toujours l etat le plus recent.
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const seqRef = useRef(initialStatus.seq);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    action: CommitPayload['action'];
    label: string;
    blockId: string | null;
  } | null>(null);
  const inflightRef = useRef(0);

  // Changement de page : l etat vient du serveur.
  useEffect(() => {
    setBlocks(initialBlocks);
    setTrash(initialTrash);
    setStatus(initialStatus);
    seqRef.current = initialStatus.seq;
    setSelectedId(initialBlocks[0]?.id ?? null);
    setPreviewVersion((value) => value + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  const reload = useCallback(async () => {
    const result = await reloadPageAction({ pageId: page.id });
    if (result.status !== 'success') return;
    setBlocks(result.blocks);
    setTrash(result.trash);
    setStatus(result.editor);
    seqRef.current = result.editor.seq;
    setPreviewVersion((value) => value + 1);
  }, [page.id]);

  const send = useCallback(
    async (action: CommitPayload['action'], label: string, blockId: string | null) => {
      inflightRef.current += 1;
      setSaveState('saving');
      const result = await commitPageAction({
        pageId: page.id,
        baseSeq: seqRef.current,
        action,
        label,
        blockId,
        blocks: blocksRef.current,
      });
      inflightRef.current -= 1;

      if (result.status === 'error') {
        setSaveState('error');
        toast.error(result.message);
        await reload();
        setSaveState('saved');
        return;
      }

      seqRef.current = result.editor.seq;
      setStatus(result.editor);
      setUnpublished(true);
      if (inflightRef.current === 0 && !pendingRef.current) {
        // Rien d autre en cours : on reprend la forme canonique du serveur
        // (adresses des photos reconstruites cote serveur, par exemple).
        setBlocks(result.blocks);
        setSaveState('saved');
      }
      setPreviewVersion((value) => value + 1);
      if (action === 'block.delete' || action === 'block.restore') {
        const refreshed = await reloadPageAction({ pageId: page.id });
        if (refreshed.status === 'success') setTrash(refreshed.trash);
      }
    },
    [page.id, reload, toast],
  );

  const enqueue = useCallback(
    (action: CommitPayload['action'], label: string, blockId: string | null) => {
      queueRef.current = queueRef.current.then(() => send(action, label, blockId));
      return queueRef.current;
    },
    [send],
  );

  /** Envoie tout ce qui attend (frappe en cours), puis attend la fin de la file. */
  const flush = useCallback(async () => {
    const pending = pendingRef.current;
    if (pending) {
      clearTimeout(pending.timer);
      pendingRef.current = null;
      void enqueue(pending.action, pending.label, pending.blockId);
    }
    await queueRef.current;
  }, [enqueue]);

  /** Applique un nouvel etat et l enregistre. */
  const apply = useCallback(
    (
      next: EditorBlock[],
      action: CommitPayload['action'],
      label: string,
      blockId: string | null,
      debounce = false,
    ) => {
      setBlocks(next);
      blocksRef.current = next;
      const pending = pendingRef.current;

      if (debounce) {
        if (pending && (pending.blockId !== blockId || pending.action !== action)) {
          clearTimeout(pending.timer);
          pendingRef.current = null;
          void enqueue(pending.action, pending.label, pending.blockId);
        } else if (pending) {
          clearTimeout(pending.timer);
        }
        setSaveState('pending');
        const timer = setTimeout(() => {
          pendingRef.current = null;
          void enqueue(action, label, blockId);
        }, TEXT_DELAY_MS);
        pendingRef.current = { timer, action, label, blockId };
        return;
      }

      if (pending) {
        clearTimeout(pending.timer);
        pendingRef.current = null;
      }
      void enqueue(action, label, blockId);
    },
    [enqueue],
  );

  // Fermeture de l onglet avec une frappe non envoyee : on previent.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingRef.current || inflightRef.current > 0) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  /* --- Operations ------------------------------------------------------- */

  const selectedIndex = blocks.findIndex((block) => block.id === selectedId);
  const selected = selectedIndex >= 0 ? blocks[selectedIndex] : null;
  const selectedMeta = selected ? metas[selected.type] : undefined;

  const updateProps = (name: string, value: unknown, fieldLabel: string) => {
    if (!selected) return;
    const next = blocks.map((block) =>
      block.id === selected.id ? { ...block, props: { ...block.props, [name]: value } } : block,
    );
    const isStyle = selectedMeta?.styleFields.some((field) => field.name === name) ?? false;
    apply(
      next,
      isStyle ? 'block.style' : 'block.edit',
      `${fieldLabel} modifié (${selectedMeta?.label ?? 'section'})`,
      selected.id,
      !isStyle,
    );
  };

  const updateSettings = (patch: Record<string, unknown>) => {
    if (!selected) return;
    const next = blocks.map((block) =>
      block.id === selected.id ? { ...block, settings: { ...block.settings, ...patch } } : block,
    );
    apply(
      next,
      'block.style',
      `Apparence modifiée (${selectedMeta?.label ?? 'section'})`,
      selected.id,
    );
  };

  const move = (blockId: string, direction: -1 | 1) => {
    const index = blocks.findIndex((block) => block.id === blockId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    apply(next, 'block.move', `Section « ${metas[moved.type]?.label ?? ''} » déplacée`, blockId);
  };

  const dropOn = (targetId: string) => {
    if (!dragged || dragged === targetId) return;
    const from = blocks.findIndex((block) => block.id === dragged);
    const to = blocks.findIndex((block) => block.id === targetId);
    setDragged(null);
    if (from < 0 || to < 0) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    apply(next, 'block.move', `Section « ${metas[moved.type]?.label ?? ''} » déplacée`, moved.id);
  };

  const add = (type: string) => {
    const meta = metas[type];
    if (!meta) return;
    const block: EditorBlock = {
      id: newId(),
      type,
      version: meta.defaults.version,
      props: structuredClone(meta.defaults.props),
      settings: structuredClone(meta.defaults.settings),
      visible: true,
    };
    const position = selectedIndex >= 0 ? selectedIndex + 1 : blocks.length;
    const next = [...blocks];
    next.splice(position, 0, block);
    setLibraryOpen(false);
    setSelectedId(block.id);
    setTab('content');
    setMobilePane('properties');
    apply(next, 'block.add', `Section « ${meta.label} » ajoutée`, block.id);
    toast.success(`Section « ${meta.label} » ajoutée. Personnalisez-la à droite.`);
  };

  const duplicate = (source: EditorBlock) => {
    const copy: EditorBlock = { ...structuredClone(source), id: newId() };
    const index = blocks.findIndex((block) => block.id === source.id);
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    setSelectedId(copy.id);
    apply(
      next,
      'block.duplicate',
      `Section « ${metas[source.type]?.label ?? ''} » dupliquée`,
      copy.id,
    );
  };

  const toggle = (target: EditorBlock) => {
    const next = blocks.map((block) =>
      block.id === target.id ? { ...block, visible: !block.visible } : block,
    );
    const label = metas[target.type]?.label ?? 'section';
    apply(
      next,
      target.visible ? 'block.hide' : 'block.show',
      `Section « ${label} » ${target.visible ? 'masquée' : 'affichée'}`,
      target.id,
    );
  };

  const remove = (target: EditorBlock) => {
    const index = blocks.findIndex((block) => block.id === target.id);
    const next = blocks.filter((block) => block.id !== target.id);
    const label = metas[target.type]?.label ?? 'section';
    setConfirmDelete(null);
    setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? null);
    setTrash((current) => [
      {
        id: target.id,
        type: target.type,
        label,
        deletedAtLabel: 'à l’instant',
        sortOrder: (index + 1) * 10,
        version: target.version,
        props: target.props,
        settings: target.settings,
      },
      ...current,
    ]);
    apply(next, 'block.delete', `Section « ${label} » supprimée`, target.id);
    toast.success(`Section « ${label} » placée dans la corbeille. Vous pouvez la restaurer.`);
  };

  const restore = (item: TrashedBlock) => {
    const position = Math.min(Math.max(Math.round(item.sortOrder / 10) - 1, 0), blocks.length);
    const next = [...blocks];
    next.splice(position, 0, {
      id: item.id,
      type: item.type,
      version: item.version,
      props: item.props,
      settings: item.settings,
      visible: true,
    });
    setTrash((current) => current.filter((entry) => entry.id !== item.id));
    setSelectedId(item.id);
    apply(next, 'block.restore', `Section « ${item.label} » restaurée`, item.id);
    toast.success(`Section « ${item.label} » restaurée.`);
  };

  const purge = (item: TrashedBlock) => {
    setPurgeTarget(null);
    void purgeTrashItemAction({ kind: 'block', id: item.id }).then((result) => {
      if (result.status === 'error') toast.error(result.message);
      else {
        setTrash((current) => current.filter((entry) => entry.id !== item.id));
        toast.success('Section supprimée définitivement.');
      }
    });
  };

  const replay = useCallback(
    async (kind: 'undo' | 'redo') => {
      await flush();
      setSaveState('saving');
      const result =
        kind === 'undo'
          ? await undoAction({ pageId: page.id })
          : await redoAction({ pageId: page.id });
      setSaveState('saved');
      if (result.status === 'error') {
        toast.error(result.message);
        return;
      }
      setBlocks(result.blocks);
      setStatus(result.editor);
      seqRef.current = result.editor.seq;
      setUnpublished(true);
      setPreviewVersion((value) => value + 1);
      if (result.message) toast.info(result.message);
      const refreshed = await reloadPageAction({ pageId: page.id });
      if (refreshed.status === 'success') setTrash(refreshed.trash);
      if (!result.blocks.some((block) => block.id === selectedId)) {
        setSelectedId(result.blocks[0]?.id ?? null);
      }
    },
    [flush, page.id, selectedId, toast],
  );

  // Raccourcis : Ctrl/Cmd+Z et Ctrl/Cmd+Maj+Z (ou Ctrl+Y). Dans un champ de
  // texte, on laisse le navigateur annuler la frappe elle-meme.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        void replay('undo');
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        void replay('redo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [replay]);

  const onPreviewSelect = useCallback(
    (selection: PreviewSelection) => {
      setSelectedId(selection.blockId);
      setMobilePane('properties');
      const target = blocksRef.current.find((block) => block.id === selection.blockId);
      const meta = target ? metas[target.type] : undefined;
      if (selection.field && meta) {
        const inContent = meta.fields.some((field) => field.name === selection.field);
        const inStyle = meta.styleFields.some((field) => field.name === selection.field);
        // `media` designe le premier champ image de la section.
        const mediaField =
          selection.field === 'media'
            ? (meta.fields.find((field) => field.kind === 'media' || field.name === 'items')
                ?.name ?? null)
            : null;
        const name = mediaField ?? (inContent || inStyle ? selection.field : null);
        if (name) {
          setTab(inStyle ? 'style' : 'content');
          setFocus({ name, index: selection.index, nonce: Date.now() });
          return;
        }
      }
      setFocus(null);
    },
    [metas],
  );

  const presentTypes = useMemo(() => new Set(blocks.map((block) => block.type)), [blocks]);
  const fieldContext: FieldContext = { pages, canManageMedia, focus };

  const saveLabel =
    saveState === 'saving'
      ? 'Enregistrement…'
      : saveState === 'pending'
        ? 'Modification en cours…'
        : saveState === 'error'
          ? 'Non enregistré'
          : 'Enregistré';

  /* --- Rendu ------------------------------------------------------------ */

  const structure = (
    <div className="flex h-full flex-col" data-testid="structure-panel">
      <div className="border-b border-[var(--border)] p-3">
        <label
          className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase"
          htmlFor="page-select"
        >
          Page
        </label>
        <select
          id="page-select"
          className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
          value={page.id}
          onChange={async (event) => {
            await flush();
            router.push(`/app/editeur?page=${event.target.value}`);
          }}
        >
          {pages.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title}
            </option>
          ))}
        </select>
        <Link
          href="/app/site/pages"
          className="mt-1.5 inline-block text-xs text-[var(--foreground-muted)] underline underline-offset-4"
        >
          Ajouter ou gérer les pages
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <p className="px-2 py-1.5 text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
          Sections de la page
        </p>
        {blocks.length === 0 ? (
          <p className="px-2 py-3 text-sm text-[var(--foreground-muted)]">
            Cette page est vide. Cliquez sur « Ajouter une section » pour commencer.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="section-list">
            {blocks.map((block, index) => {
              const meta = metas[block.type];
              return (
                <li
                  key={block.id}
                  draggable
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
                  data-testid="section-item"
                  data-block-id={block.id}
                  data-block-type={block.type}
                >
                  <div
                    className={cn(
                      'group flex items-center gap-1 rounded-[var(--radius-md)] border px-1.5 py-1',
                      block.id === selectedId
                        ? 'border-[var(--accent)] bg-[var(--surface-elevated)]'
                        : 'border-transparent hover:bg-[var(--surface)]',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="cursor-grab text-[var(--muted)]"
                      title="Glisser pour déplacer"
                    >
                      <Icon name="grip-vertical" size={12} />
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(block.id);
                        setFocus(null);
                        setMobilePane('properties');
                      }}
                      aria-current={block.id === selectedId ? 'true' : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm"
                    >
                      <Icon
                        name={meta?.icon ?? 'layout-grid'}
                        size={14}
                        className="text-[var(--muted)]"
                      />
                      <span className={cn('truncate', !block.visible && 'line-through opacity-50')}>
                        {meta?.label ?? 'Section'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(block)}
                      aria-label={`${block.visible ? 'Masquer' : 'Afficher'} la section ${meta?.label ?? ''}`}
                      className="rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      <Icon name={block.visible ? 'eye' : 'eye-off'} size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(block.id, -1)}
                      disabled={index === 0}
                      aria-label={`Monter la section ${meta?.label ?? ''}`}
                      className="rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
                    >
                      <Icon name="arrow-up" size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(block.id, 1)}
                      disabled={index === blocks.length - 1}
                      aria-label={`Descendre la section ${meta?.label ?? ''}`}
                      className="rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
                    >
                      <Icon name="arrow-down" size={13} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 px-1">
          <Button
            block
            variant="secondary"
            onClick={() => setLibraryOpen(true)}
            data-testid="open-section-library"
          >
            <Icon name="plus" size={14} aria-hidden="true" />
            Ajouter une section
          </Button>
        </div>

        <details
          className="mt-5 px-1"
          data-testid="trash"
          open={trash.length > 0 ? undefined : false}
        >
          <summary className="cursor-pointer px-1 text-sm text-[var(--foreground-muted)]">
            <Icon name="trash-2" size={13} className="mr-1 inline" aria-hidden="true" />
            Corbeille ({trash.length})
          </summary>
          {trash.length === 0 ? (
            <p className="px-1 py-2 text-xs text-[var(--muted)]">
              Les sections supprimées arrivent ici. Vous pourrez les restaurer.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {trash.map((item) => (
                <li
                  key={item.id}
                  className="rounded-[var(--radius-sm)] border border-[var(--border)] p-2 text-sm"
                  data-testid="trash-item"
                >
                  <p className="truncate font-medium">{item.label}</p>
                  <p className="text-2xs text-[var(--muted)]">Supprimée {item.deletedAtLabel}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Button variant="secondary" size="sm" onClick={() => restore(item)}>
                      <Icon name="archive-restore" size={13} aria-hidden="true" />
                      Restaurer
                    </Button>
                    {canPublish ? (
                      <Button variant="ghost" size="sm" onClick={() => setPurgeTarget(item)}>
                        Supprimer définitivement
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>
    </div>
  );

  const properties =
    selected && selectedMeta ? (
      <PropertiesPanel
        block={selected}
        meta={selectedMeta}
        index={selectedIndex}
        total={blocks.length}
        tab={tab}
        onTab={setTab}
        context={fieldContext}
        onProps={updateProps}
        onSettings={updateSettings}
        onMove={(direction) => move(selected.id, direction)}
        onDuplicate={() => duplicate(selected)}
        onToggle={() => toggle(selected)}
        onDelete={() => setConfirmDelete(selected)}
      />
    ) : (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Icon name="mouse-pointer-click" size={28} className="text-[var(--muted)]" />
        <p className="text-sm font-medium">Cliquez sur un élément de votre site</p>
        <p className="text-sm text-[var(--foreground-muted)]">
          Un titre, une photo, un bouton : ses réglages s’affichent ici. Vous pouvez aussi choisir
          une section dans la liste de gauche.
        </p>
      </div>
    );

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--background)]"
      data-testid="visual-editor"
    >
      {staffMode ? (
        <div className="bg-[var(--warning)] px-4 py-1.5 text-center text-xs font-medium text-[#1a1200]">
          Vous intervenez sur le site d’un client en tant qu’équipe StaX. Chaque modification est
          tracée et visible par le client dans son historique.
        </div>
      ) : null}

      {/* Barre du haut ------------------------------------------------------ */}
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          onClick={async (event) => {
            if (pendingRef.current || inflightRef.current > 0) {
              event.preventDefault();
              await flush();
              router.push('/app');
            }
          }}
        >
          <Icon name="arrow-left" size={14} aria-hidden="true" />
          Mon espace
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{siteName}</p>
          <p
            className="truncate text-2xs text-[var(--muted)]"
            data-testid="save-state"
            data-state={saveState}
          >
            {saveLabel} · {unpublished ? 'modifications non publiées' : 'à jour en ligne'}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={!status.canUndo}
            onClick={() => void replay('undo')}
            title={status.undoLabel ? `Annuler : ${status.undoLabel}` : 'Rien à annuler'}
            data-testid="undo"
          >
            <Icon name="undo" size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Annuler</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!status.canRedo}
            onClick={() => void replay('redo')}
            title={status.redoLabel ? `Rétablir : ${status.redoLabel}` : 'Rien à rétablir'}
            data-testid="redo"
          >
            <Icon name="redo" size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Rétablir</span>
          </Button>

          <div
            role="group"
            aria-label="Format de l’aperçu"
            className="mx-1 hidden rounded-[var(--radius-md)] border border-[var(--border)] p-0.5 md:inline-flex"
          >
            {(
              [
                ['desktop', 'monitor', 'Ordinateur'],
                ['tablet', 'tablet', 'Tablette'],
                ['mobile', 'smartphone', 'Téléphone'],
              ] as const
            ).map(([value, icon, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={viewport === value}
                aria-label={`Aperçu ${label.toLowerCase()}`}
                title={label}
                onClick={() => setViewport(value)}
                className={cn(
                  'rounded-[var(--radius-sm)] px-2 py-1.5',
                  viewport === value
                    ? 'bg-[var(--surface-elevated)] text-[var(--foreground)]'
                    : 'text-[var(--muted)]',
                )}
              >
                <Icon name={icon} size={14} />
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            data-testid="open-history"
          >
            <Icon name="history" size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Historique</span>
          </Button>
          {liveUrl && live ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-sm text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              title={liveHost ?? undefined}
            >
              <Icon name="globe" size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Voir mon site</span>
            </a>
          ) : null}
          {canPublish ? (
            <Button size="sm" onClick={() => setPublishOpen(true)} data-testid="open-publish">
              <Icon name="rocket" size={14} aria-hidden="true" />
              {live ? 'Publier les modifications' : 'Mettre en ligne'}
            </Button>
          ) : null}
        </div>
      </header>

      {!canPublish ? (
        <p className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs text-[var(--foreground-muted)]">
          Vous pouvez tout modifier. La publication est réservée aux administrateurs de votre
          organisation : prévenez-les quand vos changements sont prêts.
        </p>
      ) : null}

      {/* Trois zones ---------------------------------------------------------- */}
      <div className="relative flex min-h-0 flex-1">
        <aside
          className={cn(
            'w-full shrink-0 border-r border-[var(--border)] bg-[var(--surface)] lg:block lg:w-72',
            mobilePane === 'structure' ? 'block' : 'hidden',
          )}
        >
          {structure}
        </aside>

        <main
          className={cn('min-w-0 flex-1 lg:block', mobilePane === 'preview' ? 'block' : 'hidden')}
          aria-label="Aperçu de votre site"
        >
          <PreviewFrame
            pageId={page.id}
            version={previewVersion}
            viewport={viewport}
            selectedId={selectedId}
            onSelect={onPreviewSelect}
            title={`Aperçu de la page ${page.title}`}
          />
        </main>

        <aside
          className={cn(
            'w-full shrink-0 border-l border-[var(--border)] bg-[var(--surface)] lg:block lg:w-[22rem]',
            mobilePane === 'properties' ? 'block' : 'hidden',
          )}
        >
          {properties}
        </aside>
      </div>

      {/* Navigation telephone ---------------------------------------------------- */}
      <nav
        className="flex border-t border-[var(--border)] lg:hidden"
        aria-label="Zones de l’éditeur"
      >
        {(
          [
            ['structure', 'Sections', 'layout-grid'],
            ['preview', 'Aperçu', 'eye'],
            ['properties', 'Modifier', 'pencil'],
          ] as const
        ).map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMobilePane(value)}
            aria-pressed={mobilePane === value}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs',
              mobilePane === value ? 'text-[var(--foreground)]' : 'text-[var(--muted)]',
            )}
          >
            <Icon name={icon} size={16} />
            {label}
          </button>
        ))}
      </nav>

      <SectionLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        metas={metas}
        presentTypes={presentTypes}
        onPick={add}
      />

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        siteId={siteId}
        canPublish={canPublish}
        onRestored={() => {
          setHistoryOpen(false);
          setUnpublished(true);
          router.refresh();
          void reload();
        }}
        onRepublished={() => {
          setLive(true);
          setPreviewVersion((value) => value + 1);
        }}
      />

      <PublishDialog
        open={publishOpen}
        siteId={siteId}
        isLive={live}
        flush={flush}
        onClose={() => setPublishOpen(false)}
        onPublished={(_outcome: PublishOutcome) => {
          setUnpublished(false);
          setLive(true);
          router.refresh();
        }}
        onFix={(pageId, blockId) => {
          setPublishOpen(false);
          if (pageId && pageId !== page.id) {
            router.push(`/app/editeur?page=${pageId}`);
            return;
          }
          if (blockId) {
            setSelectedId(blockId);
            setMobilePane('properties');
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Supprimer la section « ${confirmDelete ? (metas[confirmDelete.type]?.label ?? '') : ''} » ?`}
        description="Elle part dans la corbeille, en bas de la liste des sections : vous pourrez la restaurer à tout moment. Votre site en ligne ne change pas tant que vous ne publiez pas."
        confirmLabel="Mettre à la corbeille"
        tone="danger"
        onConfirm={() => {
          if (confirmDelete) remove(confirmDelete);
        }}
      />

      <ConfirmDialog
        open={purgeTarget !== null}
        onClose={() => setPurgeTarget(null)}
        title="Supprimer définitivement cette section ?"
        description="Elle ne pourra plus être restaurée depuis la corbeille. Les versions déjà publiées qui la contiennent restent dans l’historique."
        confirmLabel="Supprimer définitivement"
        tone="danger"
        confirmationText="SUPPRIMER"
        onConfirm={() => {
          if (purgeTarget) purge(purgeTarget);
        }}
      />
    </div>
  );
}

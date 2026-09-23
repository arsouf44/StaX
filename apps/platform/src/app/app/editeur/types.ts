import type { EditorField, HistoryChange, PublicationReport } from '@stax/site-engine';

/**
 * Types partages entre la page serveur, les actions et les composants de
 * l editeur. Aucun de ces objets ne contient de secret : ils circulent vers le
 * navigateur tels quels.
 */

export interface EditorBlock {
  id: string;
  type: string;
  version: number;
  props: Record<string, unknown>;
  settings: Record<string, unknown>;
  visible: boolean;
}

/** Etat d annulation d une page, tel que renvoye par la base. */
export interface EditorStatus {
  seq: number;
  canUndo: boolean;
  undoLabel: string | null;
  canRedo: boolean;
  redoLabel: string | null;
}

/** Ce que l editeur sait d un type de section. */
export interface BlockMeta {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: string;
  singleton: boolean;
  /** Champs de contenu (onglet « Contenu »). */
  fields: EditorField[];
  /** Variantes visuelles (onglet « Apparence »). */
  styleFields: EditorField[];
  /** Section alimentee par une donnee metier : ou la modifier. */
  dataLink: { label: string; href: string } | null;
  /** Proposable a l ajout (module actif, offre). */
  available: boolean;
  /** Recommandee pour le metier du site. */
  recommended: boolean;
  /** Contenu initial d une nouvelle section, pris au registre. */
  defaults: { version: number; props: Record<string, unknown>; settings: Record<string, unknown> };
}

export interface TrashedBlock {
  id: string;
  type: string;
  label: string;
  deletedAtLabel: string;
  sortOrder: number;
  version: number;
  props: Record<string, unknown>;
  settings: Record<string, unknown>;
}

export interface EditorPageRef {
  id: string;
  title: string;
  path: string;
  isHome: boolean;
}

export interface MediaItem {
  id: string;
  url: string;
  alt: string;
  fileName: string;
}

export type AuthorKind = 'you' | 'member' | 'stax' | 'system';

export interface HistoryEntry {
  kind: 'version' | 'checkpoint';
  id: string;
  number: number | null;
  title: string;
  atIso: string;
  atLabel: string;
  author: string;
  authorKind: AuthorKind;
  isLive: boolean;
}

export type EditorResult<T extends object = object> =
  | ({ status: 'success'; message?: string } & T)
  | { status: 'error'; message: string; conflict?: boolean; report?: PublicationReport };

export interface CommitPayload {
  pageId: string;
  baseSeq: number;
  action:
    | 'block.edit'
    | 'block.style'
    | 'block.add'
    | 'block.duplicate'
    | 'block.move'
    | 'block.hide'
    | 'block.show'
    | 'block.delete'
    | 'block.restore';
  label: string;
  blockId: string | null;
  blocks: EditorBlock[];
}

export interface PublishOutcome {
  versionNumber: number;
  liveUrl: string | null;
  cacheCleared: boolean;
}

export type { HistoryChange, PublicationReport };

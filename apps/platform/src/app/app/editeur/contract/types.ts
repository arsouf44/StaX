import type { ContentDocument, SiteManifest } from '@stax/site-contract';

/**
 * Donnees de l'editeur d'un site independant, telles qu'elles partent vers le
 * navigateur. Rien d'autre que le contrat d'edition, le brouillon et des
 * etats lisibles : aucun identifiant d'infrastructure sensible, aucun jeton.
 */

export type ReleaseState =
  | 'scheduled'
  | 'queued'
  | 'committing'
  | 'deploying'
  | 'published'
  | 'superseded'
  | 'failed'
  | 'cancelled';

export interface ReleaseView {
  id: string;
  version: number;
  kind: 'import' | 'publish' | 'rollback';
  status: ReleaseState;
  createdAt: string;
  publishedAt: string | null;
  scheduledFor: string | null;
  author: string | null;
  note: string | null;
  commit: string | null;
  commitUrl: string | null;
  deploymentStatus: string | null;
  deploymentUrl: string | null;
  error: string | null;
  sourceVersion: number | null;
}

export interface PreviewView {
  id: string;
  status: string;
  url: string | null;
  revision: number | null;
  error: string | null;
  createdAt: string;
}

export interface ContractEditorData {
  siteId: string;
  siteName: string;
  manifest: SiteManifest;
  content: ContentDocument;
  revision: number;
  draftUpdatedAt: string | null;
  draftUpdatedBy: string | null;
  /** Adresse du site en ligne (domaine principal, sinon adresse Cloudflare). */
  liveUrl: string | null;
  /**
   * Adresse du projet Cloudflare du site (`*.pages.dev`, `*.workers.dev`) :
   * c'est elle que l'editeur encadre, la politique de securite de l'editeur
   * n'autorisant que ces origines. `null` si le projet n'en expose pas.
   */
  frameUrl: string | null;
  /** Dernier apercu construit (build Cloudflare du brouillon). */
  preview: PreviewView | null;
  production: ReleaseView | null;
  inFlight: ReleaseView | null;
  scheduled: ReleaseView | null;
  /** Photos de la mediatheque utilisees par le brouillon : identifiant -> adresse. */
  mediaUrls: Record<string, string>;
  canPublish: boolean;
  canSchedule: boolean;
  canManageMedia: boolean;
  /** Le brouillon differe-t-il de la version en ligne ? */
  hasUnpublishedChanges: boolean;
}

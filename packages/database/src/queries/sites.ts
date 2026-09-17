import type { PageBlockRow, SitePage, SiteVersion, UUID } from '@stax/types';
import { type Db, unwrap, unwrapList, unwrapMaybe } from '../client.js';

/**
 * Lecture et ecriture du contenu d un site (brouillon).
 *
 * Toutes ces fonctions passent par un client porteur du JWT de l utilisateur :
 * la RLS s applique integralement. Aucune ne prend d identifiant
 * d organisation depuis le navigateur — l appartenance est deduite du site.
 */

export interface PageWithBlocks {
  page: SitePage;
  blocks: PageBlockRow[];
}

export async function listPages(db: Db, siteId: UUID): Promise<SitePage[]> {
  return unwrapList<SitePage>(
    (await db
      .from('site_pages')
      .select('*')
      .eq('site_id', siteId)
      .order('sort_order', { ascending: true })) as never,
  );
}

export async function getPageWithBlocks(
  db: Db,
  siteId: UUID,
  pageId: UUID,
): Promise<PageWithBlocks | null> {
  const page = unwrapMaybe<SitePage>(
    (await db
      .from('site_pages')
      .select('*')
      .eq('id', pageId)
      .eq('site_id', siteId)
      .single()) as never,
  );
  if (!page) return null;

  const blocks = unwrapList<PageBlockRow>(
    (await db
      .from('page_blocks')
      .select('*')
      .eq('page_id', pageId)
      .order('sort_order', { ascending: true })) as never,
  );
  return { page, blocks };
}

export async function createPage(
  db: Db,
  siteId: UUID,
  input: {
    title: string;
    path: string;
    kind: string;
    showInNav: boolean;
    sortOrder?: number;
  },
): Promise<SitePage> {
  return unwrap<SitePage>(
    (await db
      .from('site_pages')
      .insert({
        site_id: siteId,
        title: input.title,
        path: input.path,
        kind: input.kind,
        is_visible_in_nav: input.showInNav,
        sort_order: input.sortOrder ?? 500,
      })
      .select()
      .single()) as never,
  );
}

/**
 * Mise a jour d une page. Les colonnes autorisees sont enumerees
 * explicitement : aucun objet brut n atteint la base (affectation de masse).
 */
export async function updatePage(
  db: Db,
  siteId: UUID,
  pageId: UUID,
  input: Partial<{
    title: string;
    path: string;
    seoTitle: string | null;
    seoDescription: string | null;
    robotsIndexable: boolean;
    showInNav: boolean;
    isPublished: boolean;
    sortOrder: number;
  }>,
): Promise<SitePage> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.path !== undefined) patch.path = input.path;
  if (input.seoTitle !== undefined) patch.seo_title = input.seoTitle;
  if (input.seoDescription !== undefined) patch.seo_description = input.seoDescription;
  if (input.robotsIndexable !== undefined) patch.robots_indexable = input.robotsIndexable;
  if (input.showInNav !== undefined) patch.is_visible_in_nav = input.showInNav;
  if (input.isPublished !== undefined) patch.is_published = input.isPublished;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  return unwrap<SitePage>(
    (await db
      .from('site_pages')
      .update(patch)
      .eq('id', pageId)
      .eq('site_id', siteId)
      .select()
      .single()) as never,
  );
}

export async function deletePage(db: Db, siteId: UUID, pageId: UUID): Promise<void> {
  const { error } = await db.from('site_pages').delete().eq('id', pageId).eq('site_id', siteId);
  if (error) throw error;
}

export async function insertBlock(
  db: Db,
  params: {
    siteId: UUID;
    pageId: UUID;
    type: string;
    version: number;
    props: Record<string, unknown>;
    settings: Record<string, unknown>;
    sortOrder: number;
  },
): Promise<PageBlockRow> {
  return unwrap<PageBlockRow>(
    (await db
      .from('page_blocks')
      .insert({
        site_id: params.siteId,
        page_id: params.pageId,
        type: params.type,
        version: params.version,
        props: params.props,
        settings: params.settings,
        sort_order: params.sortOrder,
      })
      .select()
      .single()) as never,
  );
}

export async function updateBlock(
  db: Db,
  siteId: UUID,
  blockId: UUID,
  input: Partial<{
    props: Record<string, unknown>;
    settings: Record<string, unknown>;
    isVisible: boolean;
    sortOrder: number;
  }>,
): Promise<PageBlockRow> {
  const patch: Record<string, unknown> = {};
  if (input.props !== undefined) patch.props = input.props;
  if (input.settings !== undefined) patch.settings = input.settings;
  if (input.isVisible !== undefined) patch.is_visible = input.isVisible;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  return unwrap<PageBlockRow>(
    (await db
      .from('page_blocks')
      .update(patch)
      .eq('id', blockId)
      .eq('site_id', siteId)
      .select()
      .single()) as never,
  );
}

export async function deleteBlock(db: Db, siteId: UUID, blockId: UUID): Promise<void> {
  const { error } = await db.from('page_blocks').delete().eq('id', blockId).eq('site_id', siteId);
  if (error) throw error;
}

/**
 * Reordonne les blocs d une page. Le classement est reecrit intégralement pour
 * eviter toute collision de rang lors d un glisser-deposer.
 */
export async function reorderBlocks(
  db: Db,
  siteId: UUID,
  pageId: UUID,
  orderedIds: readonly UUID[],
): Promise<void> {
  const updates = orderedIds.map((id, index) =>
    db
      .from('page_blocks')
      .update({ sort_order: (index + 1) * 10 })
      .eq('id', id)
      .eq('page_id', pageId)
      .eq('site_id', siteId),
  );
  const results = await Promise.all(updates);
  const failure = results.find((result) => result.error);
  if (failure?.error) throw failure.error;
}

export async function listVersions(db: Db, siteId: UUID, limit = 30): Promise<SiteVersion[]> {
  return unwrapList<SiteVersion>(
    (await db
      .from('site_versions')
      .select('id, site_id, version_number, label, content_hash, published_at, published_by, scheduled_for, created_by, created_at')
      .eq('site_id', siteId)
      .order('version_number', { ascending: false })
      .limit(limit)) as never,
  );
}

/** Publication : delegue a la fonction SQL, qui verifie les droits et fige un snapshot. */
export async function publishSite(db: Db, siteId: UUID, label?: string): Promise<UUID> {
  const { data, error } = await db.rpc('publish_site', {
    p_site: siteId,
    p_label: label ?? null,
  });
  if (error) throw error;
  return data as UUID;
}

export async function rollbackSite(db: Db, siteId: UUID, versionId: UUID): Promise<UUID> {
  const { data, error } = await db.rpc('rollback_site', {
    p_site: siteId,
    p_version_id: versionId,
  });
  if (error) throw error;
  return data as UUID;
}

/** Le brouillon differe-t-il de la version en ligne ? */
export async function hasUnpublishedChanges(db: Db, siteId: UUID): Promise<boolean> {
  const site = unwrapMaybe<{ last_published_at: string | null; updated_at: string }>(
    (await db
      .from('sites')
      .select('last_published_at, updated_at')
      .eq('id', siteId)
      .single()) as never,
  );
  if (!site || !site.last_published_at) return true;

  const published = new Date(site.last_published_at).getTime();
  const [pages, blocks] = await Promise.all([
    db
      .from('site_pages')
      .select('updated_at')
      .eq('site_id', siteId)
      .gt('updated_at', site.last_published_at)
      .limit(1),
    db
      .from('page_blocks')
      .select('updated_at')
      .eq('site_id', siteId)
      .gt('updated_at', site.last_published_at)
      .limit(1),
  ]);

  return (
    new Date(site.updated_at).getTime() > published ||
    (pages.data?.length ?? 0) > 0 ||
    (blocks.data?.length ?? 0) > 0
  );
}

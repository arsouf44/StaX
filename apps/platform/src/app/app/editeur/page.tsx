import type { Metadata } from 'next';
import { publicSiteUrl } from '@stax/config';
import { unwrapList, unwrapMaybe } from '@stax/database';
import { Alert, ButtonLink, EmptyState, Icon, PermissionDenied } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { blockMetas, loadEditorStatus, loadPageBlocks, loadPageTrash } from './data';
import { PrepareSiteButton } from './prepare-site';
import type { EditorPageRef } from './types';
import { VisualEditor } from './visual-editor';

export const metadata: Metadata = { title: 'Modifier mon site' };

/**
 * Editeur visuel.
 *
 * Trois zones : a gauche la structure de la page (sections, ajout, corbeille),
 * au centre l apercu reel du site — rendu par le meme moteur que le site
 * public —, a droite les proprietes de l element choisi. Un clic dans
 * l apercu selectionne la section et le champ correspondant.
 *
 * Tout se modifie dans le BROUILLON, enregistre automatiquement. Le site en
 * ligne ne change qu au clic sur « Publier », apres verification.
 */
export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { workspace, db, userId } = await getWorkspace();

  if (!workspace.capabilities.includes('content.edit')) {
    return (
      <PermissionDenied message="Votre rôle permet de consulter le site, pas de le modifier. Demandez à un administrateur de votre organisation de vous ouvrir ce droit." />
    );
  }

  const site = workspace.currentSite;
  if (!site) {
    return (
      <>
        <PageHeader title="Modifier mon site" />
        <EmptyState
          icon={<Icon name="pencil-ruler" size={24} />}
          title="Aucun site à modifier"
          description="Votre site apparaîtra ici dès sa création."
          action={<ButtonLink href="/commander">Commander mon site</ButtonLink>}
        />
      </>
    );
  }

  const pages = unwrapList<{ id: string; path: string; title: string; kind: string }>(
    (await db
      .from('site_pages')
      .select('id, path, title, kind')
      .eq('site_id', site.id)
      .is('deleted_at', null)
      .order('sort_order')) as never,
  );

  if (pages.length === 0) {
    return (
      <>
        <PageHeader title="Modifier mon site" />
        <Alert tone="info" live="status" title="Ce site n’a pas encore de pages">
          Partez d’une page d’accueil vierge pour construire le site de zéro — les pages légales
          obligatoires sont ajoutées d’office et se remplissent d’après « Mon entreprise ». Ou
          partez du modèle du métier : des pages et des textes d’exemple, à remplacer.
        </Alert>
        <div className="mt-6">
          <PrepareSiteButton />
        </div>
      </>
    );
  }

  const requested = typeof params.page === 'string' ? params.page : null;
  const current = pages.find((page) => page.id === requested) ?? pages[0];
  if (!current) return null;

  const [blocks, trash, status, siteRow] = await Promise.all([
    loadPageBlocks(db, current.id),
    loadPageTrash(db, current.id),
    loadEditorStatus(db, current.id),
    unwrapMaybe<{ draft_updated_at: string | null; last_published_at: string | null }>(
      (await db
        .from('sites')
        .select('draft_updated_at, last_published_at')
        .eq('id', site.id)
        .maybeSingle()) as never,
    ),
  ]);

  const pageRefs: EditorPageRef[] = pages.map((page) => ({
    id: page.id,
    title: page.title,
    path: page.path,
    isHome: page.path === '/',
  }));
  const currentRef: EditorPageRef = pageRefs.find((page) => page.id === current.id) ?? {
    id: current.id,
    title: current.title,
    path: current.path,
    isHome: current.path === '/',
  };

  const hasUnpublishedChanges = Boolean(
    siteRow?.draft_updated_at &&
    (!siteRow.last_published_at || siteRow.draft_updated_at > siteRow.last_published_at),
  );

  const liveHost =
    site.domains.find((domain) => domain.is_primary && domain.status === 'active')?.hostname ??
    site.domains.find((domain) => domain.status === 'active')?.hostname ??
    null;

  return (
    <VisualEditor
      siteId={site.id}
      siteName={site.name}
      viewerId={userId}
      canPublish={workspace.capabilities.includes('content.publish')}
      canManageMedia={workspace.capabilities.includes('media.manage')}
      isLive={site.status === 'live' && site.publishedVersionId !== null}
      liveUrl={liveHost ? publicSiteUrl(liveHost) : null}
      liveHost={liveHost}
      hasUnpublishedChanges={hasUnpublishedChanges}
      pages={pageRefs}
      page={currentRef}
      initialBlocks={blocks}
      initialTrash={trash}
      initialStatus={status}
      metas={blockMetas(site.enabledModules, site.businessTypeSlug)}
      staffMode={workspace.staffMode ?? false}
    />
  );
}

import type { Metadata } from 'next';
import { unwrapList, unwrapMaybe } from '@stax/database';
import { editorFieldsFor, getBlockDefinition } from '@stax/site-engine';
import { Alert, ButtonLink, EmptyState, Icon, PermissionDenied } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { Editor } from './editor';

export const metadata: Metadata = { title: 'Modifier mon site' };

export interface EditorBlock {
  id: string;
  type: string;
  label: string;
  description: string;
  icon: string;
  visible: boolean;
  props: Record<string, unknown>;
  fields: ReturnType<typeof editorFieldsFor>;
}

export interface EditorPage {
  id: string;
  path: string;
  title: string;
  blocks: EditorBlock[];
}

/**
 * Editeur de contenu.
 *
 * Le client modifie ce qui EST : chaque section correspond a un bloc reel de
 * sa page, et chaque champ a une propriete de son schema. Il n existe pas de
 * champ decoratif qui n irait nulle part.
 *
 * Les champs sont derives des schemas : l editeur ne peut pas proposer une
 * saisie que l enregistrement refuserait.
 */
export default async function EditorPage_({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { workspace, db } = await getWorkspace();

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

  const pages = unwrapList<{ id: string; path: string; title: string; sort_order: number }>(
    (await db
      .from('site_pages')
      .select('id, path, title, sort_order')
      .eq('site_id', site.id)
      .order('sort_order')) as never,
  );

  if (pages.length === 0) {
    return (
      <>
        <PageHeader title="Modifier mon site" />
        <Alert tone="info" live="status" title="Votre site est en cours de préparation">
          Nous construisons vos pages à partir des informations que vous nous avez transmises. Vous
          pourrez les modifier ici dès qu’elles seront prêtes.
        </Alert>
      </>
    );
  }

  const requested = typeof params.page === 'string' ? params.page : null;
  const current = pages.find((page) => page.id === requested) ?? pages[0];
  if (!current) return null;

  const blocks = unwrapList<{
    id: string;
    type: string;
    props: Record<string, unknown>;
    is_visible: boolean;
    sort_order: number;
  }>(
    (await db
      .from('page_blocks')
      .select('id, type, props, is_visible, sort_order')
      .eq('page_id', current.id)
      .order('sort_order')) as never,
  );

  const draftChanged = unwrapMaybe<{ updated_at: string }>(
    (await db.from('sites').select('updated_at').eq('id', site.id).maybeSingle()) as never,
  );

  const editorPage: EditorPage = {
    id: current.id,
    path: current.path,
    title: current.title,
    blocks: blocks
      .map((block) => {
        const definition = getBlockDefinition(block.type);
        if (!definition) return null;
        return {
          id: block.id,
          type: block.type,
          label: definition.label,
          description: definition.description,
          icon: definition.icon,
          visible: block.is_visible,
          props: block.props ?? {},
          fields: editorFieldsFor(block.type),
        } satisfies EditorBlock;
      })
      .filter((block): block is EditorBlock => block !== null),
  };

  return (
    <Editor
      siteId={site.id}
      siteName={site.name}
      canPublish={workspace.capabilities.includes('content.publish')}
      isLive={site.status === 'live'}
      previewHost={site.primaryHostname}
      lastEditedAt={draftChanged?.updated_at ?? null}
      pages={pages.map((page) => ({ id: page.id, path: page.path, title: page.title }))}
      page={editorPage}
    />
  );
}

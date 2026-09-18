import type { Metadata } from 'next';
import { unwrapList } from '@stax/database';
import { Panel } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { PageManager, type PageRow } from './page-manager';

export const metadata: Metadata = { title: 'Pages' };

const KIND_LABELS: Record<string, string> = {
  home: 'Accueil',
  standard: '',
  contact: 'Contact',
  legal: 'Page légale',
  menu: 'Carte',
  services: 'Prestations',
  products: 'Boutique',
  booking: 'Réservation',
  gallery: 'Galerie',
  team: 'Équipe',
  blog: 'Actualités',
  listing: 'Liste',
};

export default async function SitePagesPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;
  const canEdit = workspace.capabilities.includes('content.edit');

  if (!site) {
    return (
      <>
        <PageHeader title="Pages" description="Les pages qui composent votre site." />
        <Panel level={1} padding="lg">
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
            Votre site n’est pas encore créé. Ses pages apparaîtront ici dès sa mise en place.
          </p>
        </Panel>
      </>
    );
  }

  const rows = unwrapList<{
    id: string;
    title: string;
    path: string;
    kind: string;
    is_published: boolean;
    is_visible_in_nav: boolean;
    robots_indexable: boolean;
    seo_title: string | null;
    seo_description: string | null;
    page_blocks: Array<{ count: number }> | null;
  }>(
    (await db
      .from('site_pages')
      .select(
        'id, title, path, kind, is_published, is_visible_in_nav, robots_indexable, seo_title, seo_description, page_blocks ( count )',
      )
      .eq('site_id', site.id)
      .order('sort_order', { ascending: true })
      .limit(200)) as never,
  );

  const pages: PageRow[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    path: row.path,
    kindLabel: KIND_LABELS[row.kind] ?? '',
    isHome: row.kind === 'home',
    isPublished: row.is_published,
    showInNav: row.is_visible_in_nav,
    indexable: row.robots_indexable,
    seoTitle: row.seo_title ?? '',
    seoDescription: row.seo_description ?? '',
    blockCount: row.page_blocks?.[0]?.count ?? 0,
  }));

  return (
    <>
      <PageHeader
        title="Pages"
        description="Les pages qui composent votre site, leur adresse et leur visibilité."
      />
      <PageManager pages={pages} canEdit={canEdit} />
    </>
  );
}

import type { Metadata } from 'next';
import { EmptyState, Icon, Panel } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { requireCurrentSite } from '~/lib/workspace';
import { loadReleaseViews } from '../../editeur/contract/data';
import { VersionList } from './version-list';

export const metadata: Metadata = { title: 'Versions publiées' };

/**
 * Historique des versions d'un site livre.
 *
 * Chaque version correspond a un commit reel dans le depot du site et a un
 * deploiement Cloudflare : elle se consulte (l'adresse de son deploiement
 * montre exactement cette version), se restaure ou se republie. Restaurer ne
 * « rembobine » rien en base : l'ancienne version est redeployee comme une
 * nouvelle, et l'historique reste complet.
 */
export default async function VersionsPage() {
  const { db, site, workspace } = await requireCurrentSite();
  if (site.architecture !== 'external_repository') {
    return (
      <>
        <PageHeader title="Versions publiées" />
        <Panel level={1} padding="lg">
          <p className="text-sm text-[var(--foreground-muted)]">
            L’historique de ce site se consulte depuis l’éditeur, onglet « Historique ».
          </p>
        </Panel>
      </>
    );
  }

  const releases = await loadReleaseViews(db, site.id, 60);
  const canPublish =
    workspace.capabilities.includes('content.publish') && site.deliveredAt !== null;

  return (
    <>
      <PageHeader
        title="Versions publiées"
        description="Chaque publication est une version datée, liée à une mise à jour réelle de votre site. Vous pouvez la consulter, la restaurer ou la republier."
      />
      {releases.length === 0 ? (
        <EmptyState
          icon={<Icon name="history" size={24} />}
          title="Aucune version pour l’instant"
          description="La première version apparaîtra ici lors de la mise en ligne de votre site."
        />
      ) : (
        <VersionList releases={releases} canPublish={canPublish} />
      )}
    </>
  );
}

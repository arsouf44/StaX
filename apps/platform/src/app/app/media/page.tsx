import type { Metadata } from 'next';
import { featureAccess, loadFeatureSnapshot, mediaPublicUrl, unwrapList } from '@stax/database';
import { PermissionDenied } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { MediaLibrary, type MediaItem } from './media-library';

export const metadata: Metadata = { title: 'Photos & fichiers' };

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

/** Taille lisible : « 480 Ko », « 2,4 Mo ». */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toLocaleString('fr-FR')} Mo`;
}

export default async function MediaPage() {
  const { workspace, db } = await getWorkspace();

  if (
    !workspace.capabilities.includes('media.manage') &&
    !workspace.capabilities.includes('content.view')
  ) {
    return <PermissionDenied message="Votre rôle ne donne pas accès aux fichiers de votre site." />;
  }

  const rows = unwrapList<{
    id: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    width: number | null;
    height: number | null;
    alt_text: string | null;
    caption: string | null;
    storage_bucket: string;
    storage_path: string;
    is_public: boolean;
    created_at: string;
    deleted_at: string | null;
  }>(
    (await db
      .from('media')
      .select(
        'id, file_name, mime_type, size_bytes, width, height, alt_text, caption, storage_bucket, storage_path, is_public, created_at, deleted_at',
      )
      .eq('organization_id', workspace.organization.id)
      .order('created_at', { ascending: false })
      .limit(300)) as never,
  );

  const items: MediaItem[] = rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    // Un media prive n'a pas d'URL publique : il faudrait une URL signee.
    url: row.is_public ? mediaPublicUrl(row.storage_bucket, row.storage_path) : null,
    mimeType: row.mime_type,
    isImage: row.mime_type.startsWith('image/'),
    sizeLabel: formatSize(row.size_bytes),
    dimensionsLabel: row.width && row.height ? `${row.width} × ${row.height}` : null,
    altText: row.alt_text ?? '',
    caption: row.caption ?? '',
    addedLabel: DATE.format(new Date(row.created_at)),
    trashedLabel: row.deleted_at ? DATE.format(new Date(row.deleted_at)) : null,
  }));

  const access = featureAccess(await loadFeatureSnapshot(db, workspace.organization.id));
  const totalBytes = rows.reduce((sum, row) => sum + row.size_bytes, 0);

  return (
    <>
      <PageHeader
        title="Photos & fichiers"
        description="Vos images, documents et vidéos. Ils sont réutilisables partout dans l’éditeur, sans avoir à les renvoyer."
      />

      <MediaLibrary
        items={items}
        quota={{
          usedMb: Math.round(totalBytes / (1024 * 1024)),
          limitMb: access.limit('max_media_mb'),
        }}
        canManage={workspace.capabilities.includes('media.manage')}
        canPurge={workspace.capabilities.includes('content.publish')}
      />
    </>
  );
}

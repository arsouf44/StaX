import type { Metadata } from 'next';
import { readEnv } from '@nemasus/config';
import { Panel } from '@nemasus/ui';
import { LegalDocumentView } from '~/components/legal/legal-document-view';
import { getLegalDocument } from '~/content/legal';
import { ContentReportForm } from './report-form';
import { pageMetadata } from '~/lib/seo';

/**
 * Mecanisme de notification des contenus illicites (DSA, article 16).
 * Le formulaire est place en tete : c'est ce que vient chercher la personne.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const document = getLegalDocument('signaler-un-contenu');
  return pageMetadata({
    path: '/signaler-un-contenu',
    title: document.title,
    description: document.description,
    // Texte date et versionne : l'Open Graph l'annonce comme un article,
    // avec la date reelle de sa derniere revision.
    type: 'article',
    modified: document.updatedAt,
  });
}

export default function ContentReportPage() {
  return (
    <LegalDocumentView
      document={getLegalDocument('signaler-un-contenu')}
      lead={
        <Panel level={1} padding="lg">
          <h2 className="text-lg font-medium tracking-[-0.01em]">Faire un signalement</h2>
          <div className="mt-6">
            <ContentReportForm
              turnstileSiteKey={readEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ?? null}
            />
          </div>
        </Panel>
      }
    />
  );
}

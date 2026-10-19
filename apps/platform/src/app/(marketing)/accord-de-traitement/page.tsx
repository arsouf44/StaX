import type { Metadata } from 'next';
import { LegalDocumentView } from '~/components/legal/legal-document-view';
import { getLegalDocument } from '~/content/legal';
import { pageMetadata } from '~/lib/seo';

/** Rendu dynamique : l'identite de l'editeur vient des secrets de deploiement. */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const document = getLegalDocument('accord-de-traitement');
  return pageMetadata({
    path: '/accord-de-traitement',
    title: document.title,
    description: document.description,
    // Texte date et versionne : l'Open Graph l'annonce comme un article,
    // avec la date reelle de sa derniere revision.
    type: 'article',
    modified: document.updatedAt,
  });
}

export default function DataProcessingAgreementPage() {
  return <LegalDocumentView document={getLegalDocument('accord-de-traitement')} />;
}

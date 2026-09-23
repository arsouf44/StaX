import type { Metadata } from 'next';
import { LegalDocumentView } from '~/components/legal/legal-document-view';
import { getLegalDocument } from '~/content/legal';

/** Rendu dynamique : l'identite de l'editeur vient des secrets de deploiement. */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const document = getLegalDocument('accord-de-traitement');
  return {
    title: document.title,
    description: document.description,
    alternates: { canonical: '/accord-de-traitement' },
    robots: { index: true, follow: true },
  };
}

export default function DataProcessingAgreementPage() {
  return <LegalDocumentView document={getLegalDocument('accord-de-traitement')} />;
}

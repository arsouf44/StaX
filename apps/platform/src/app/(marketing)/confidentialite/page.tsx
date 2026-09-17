import type { Metadata } from 'next';
import { LegalDocumentView } from '~/components/legal/legal-document-view';
import { getLegalDocument } from '~/content/legal';

/**
 * Rendu dynamique volontaire : l'identite de l'editeur provient des secrets de
 * deploiement, pas du build. Prerendre cette page figerait les marqueurs
 * « [A CONFIGURER — …] » dans le HTML publie.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const document = getLegalDocument('confidentialite');
  return {
    title: document.title,
    description: document.description,
    alternates: { canonical: '/confidentialite' },
    robots: { index: true, follow: true },
  };
}

export default function PrivacyPolicyPage() {
  return <LegalDocumentView document={getLegalDocument('confidentialite')} />;
}

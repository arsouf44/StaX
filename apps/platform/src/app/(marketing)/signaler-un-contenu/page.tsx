import type { Metadata } from 'next';
import { readEnv } from '@stax/config';
import { Panel } from '@stax/ui';
import { LegalDocumentView } from '~/components/legal/legal-document-view';
import { getLegalDocument } from '~/content/legal';
import { ContentReportForm } from './report-form';

/**
 * Mecanisme de notification des contenus illicites (DSA, article 16).
 * Le formulaire est place en tete : c'est ce que vient chercher la personne.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const document = getLegalDocument('signaler-un-contenu');
  return {
    title: document.title,
    description: document.description,
    alternates: { canonical: '/signaler-un-contenu' },
    robots: { index: true, follow: true },
  };
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

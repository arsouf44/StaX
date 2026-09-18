import type { Metadata } from 'next';
import Link from 'next/link';
import { Panel } from '@stax/ui';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Mes prospects' };

export default function ContactsPage() {
  return (
    <ModulePage
      module={['quotes', 'contact']}
      title="Mes prospects"
      description="Toutes les personnes qui vous ont contacté, au même endroit. Un suivi simple : nouveau, contacté, intéressé, client."
    >
      <div className="space-y-8">
        <CollectionSection collection="contacts" />

        <Panel level={1} padding="lg">
          <h2 className="text-sm font-medium">Ces données vous appartiennent</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
            Vous êtes responsable de traitement pour ces contacts : vous décidez de ce que vous en
            faites, et vous devez pouvoir répondre à une demande d’accès ou de suppression. StaX les
            héberge pour vous et vous permet de les exporter à tout moment.
          </p>
          <p className="mt-3 text-sm">
            <Link href="/app/donnees" className="text-[var(--accent)] underline underline-offset-4">
              Exporter ou supprimer des données
            </Link>
          </p>
          <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
            Une prospection commerciale par e-mail suppose un consentement ou un intérêt légitime
            démontrable. En cas de doute sur votre situation, faites vérifier votre pratique.
          </p>
        </Panel>
      </div>
    </ModulePage>
  );
}

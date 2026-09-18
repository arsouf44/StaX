import type { Metadata } from 'next';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Mes horaires' };

export default function Page() {
  return (
    <ModulePage
      module="opening-hours"
      feature={null}
      title="Mes horaires"
      description="Vos horaires habituels et vos fermetures exceptionnelles. C’est l’information la plus recherchée sur un site local."
    >
      <div className="space-y-12">
        <CollectionSection collection="opening-hours" />
        <CollectionSection collection="closures" />
      </div>
    </ModulePage>
  );
}

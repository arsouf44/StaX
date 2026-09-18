import type { Metadata } from 'next';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Mes hébergements' };

export default function Page() {
  return (
    <ModulePage
      module="rooms"
      feature={null}
      title="Mes hébergements"
      description="Vos chambres, gîtes ou emplacements, avec leur capacité et leur tarif de base."
    >
      <div className="space-y-12">
        <CollectionSection collection="rooms" />
      </div>
    </ModulePage>
  );
}

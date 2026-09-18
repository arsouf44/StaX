import type { Metadata } from 'next';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Mes biens' };

export default function Page() {
  return (
    <ModulePage
      module="properties"
      feature={null}
      title="Mes biens"
      description="Vos annonces immobilières. Les diagnostics énergétiques sont obligatoires dans toute annonce en France."
    >
      <div className="space-y-12">
        <CollectionSection collection="properties" />
      </div>
    </ModulePage>
  );
}

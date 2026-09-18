import type { Metadata } from 'next';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Mes zones d’intervention' };

export default function Page() {
  return (
    <ModulePage
      module="service-area"
      feature={null}
      title="Mes zones d’intervention"
      description="Les communes que vous desservez. Elles nourrissent votre référencement local et vous évitent des appels hors zone."
    >
      <div className="space-y-12">
        <CollectionSection collection="service-areas" />
      </div>
    </ModulePage>
  );
}

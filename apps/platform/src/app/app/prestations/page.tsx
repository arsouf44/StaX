import type { Metadata } from 'next';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Mes prestations' };

export default function Page() {
  return (
    <ModulePage
      module="services"
      feature={null}
      title="Mes prestations"
      description="Ce que vous proposez, avec des prix clairs. C’est la rubrique la plus consultée d’un site d’artisan ou de praticien."
    >
      <div className="space-y-12">
        <CollectionSection collection="services" />
      </div>
    </ModulePage>
  );
}

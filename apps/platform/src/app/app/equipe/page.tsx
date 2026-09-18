import type { Metadata } from 'next';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Mon équipe' };

export default function Page() {
  return (
    <ModulePage
      module="team"
      feature={null}
      title="Mon équipe"
      description="Les personnes qui font votre entreprise. Des visages et des prénoms rassurent plus qu’un long texte."
    >
      <div className="space-y-12">
        <CollectionSection collection="team" />
      </div>
    </ModulePage>
  );
}

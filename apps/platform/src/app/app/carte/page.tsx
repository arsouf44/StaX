import type { Metadata } from 'next';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Ma carte' };

export default function Page() {
  return (
    <ModulePage
      module="restaurant-menu"
      feature={null}
      title="Ma carte"
      description="Vos sections, vos plats, vos prix et vos allergènes. Chaque modification est visible sur votre site dès que vous l’enregistrez."
    >
      <div className="space-y-12">
        <CollectionSection collection="menu-categories" />
        <CollectionSection collection="menu-items" />
      </div>
    </ModulePage>
  );
}

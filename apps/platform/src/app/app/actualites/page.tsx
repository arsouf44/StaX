import type { Metadata } from 'next';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Mes actualités' };

export default function Page() {
  return (
    <ModulePage
      module="blog"
      feature="blog"
      title="Mes actualités"
      description="Vos publications. Tant qu’un article n’a pas de date de publication, il reste invisible pour vos visiteurs."
    >
      <div className="space-y-12">
        <CollectionSection collection="articles" />
      </div>
    </ModulePage>
  );
}

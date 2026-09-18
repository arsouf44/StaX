import type { Metadata } from 'next';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Les avis de mes clients' };

export default function Page() {
  return (
    <ModulePage
      module="testimonials"
      feature={null}
      title="Les avis de mes clients"
      description="Les retours que vous avez réellement reçus. Publier un avis inventé est une pratique commerciale trompeuse, sanctionnée par la loi."
    >
      <div className="space-y-12">
        <CollectionSection collection="testimonials" />
      </div>
    </ModulePage>
  );
}

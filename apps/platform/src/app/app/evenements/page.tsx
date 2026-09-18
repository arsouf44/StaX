import type { Metadata } from 'next';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Mes événements' };

export default function Page() {
  return (
    <ModulePage
      module="events"
      feature={null}
      title="Mes événements"
      description="Vos prochaines dates. Un site qui annonce des rendez-vous donne envie de revenir."
    >
      <div className="space-y-12">
        <CollectionSection collection="events" />
      </div>
    </ModulePage>
  );
}

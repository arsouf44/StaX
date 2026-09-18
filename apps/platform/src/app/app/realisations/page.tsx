import type { Metadata } from 'next';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Mes réalisations' };

export default function Page() {
  return (
    <ModulePage
      module="portfolio"
      feature={null}
      title="Mes réalisations"
      description="Vos chantiers et projets terminés. La preuve par l’exemple convainc davantage qu’un argumentaire."
    >
      <div className="space-y-12">
        <CollectionSection collection="portfolio" />
      </div>
    </ModulePage>
  );
}

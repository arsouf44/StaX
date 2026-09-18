import type { Metadata } from 'next';
import { CollectionSection } from '~/components/app/collection-section';
import { ModulePage } from '~/components/app/module-page';

export const metadata: Metadata = { title: 'Ma boutique' };

export default function Page() {
  return (
    <ModulePage
      module="products"
      feature="ecommerce"
      title="Ma boutique"
      description="Votre catalogue et son classement. Les prix sont enregistrés au centime près, sans arrondi intermédiaire."
    >
      <div className="space-y-12">
        <CollectionSection collection="product-categories" />
        <CollectionSection collection="products" />
      </div>
    </ModulePage>
  );
}

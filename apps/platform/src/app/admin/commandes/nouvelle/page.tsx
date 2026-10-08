import type { Metadata } from 'next';
import Link from 'next/link';
import { listBusinesses } from '@nemasus/business';
import { Panel } from '@nemasus/ui';
import { PageHeader } from '~/components/app/page-header';
import { requireAdminRole } from '~/lib/admin';
import { CreateOrderForm } from '../order-controls';

export const metadata: Metadata = { title: 'Saisir une commande' };

/** Commande conclue par téléphone : même parcours que depuis le site. */
export default async function NewOrderPage() {
  await requireAdminRole('platform_admin');
  return (
    <>
      <p className="mb-3 text-sm">
        <Link
          href="/admin/commandes"
          className="text-[var(--foreground-muted)] underline underline-offset-4"
        >
          ← Toutes les commandes
        </Link>
      </p>
      <PageHeader
        title="Saisir une commande"
        description="Après un appel concluant : enregistrez la commande, puis envoyez les modalités de paiement par virement. Le code d’accès partira à réception du virement."
      />
      <Panel level={2} padding="lg" className="max-w-3xl">
        <CreateOrderForm
          businesses={listBusinesses().map((business) => ({
            id: business.id,
            name: business.name,
            sector: business.sector,
          }))}
        />
      </Panel>
    </>
  );
}

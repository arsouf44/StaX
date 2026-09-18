import type { Metadata } from 'next';
import {
  FULFILLMENT_LABELS,
  SHOP_ORDER_STATUS_LABELS,
  SHOP_ORDER_TRANSITIONS,
  statusLabel,
} from '@stax/business';
import { unwrapList } from '@stax/database';
import { formatMoney } from '@stax/payments';
import { PermissionDenied } from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { ModulePage } from '~/components/app/module-page';
import { getWorkspace } from '~/lib/workspace';
import { OrderList, type ShopOrderView } from './order-list';

export const metadata: Metadata = { title: 'Mes commandes' };

const TRANSITION_LABELS: Record<string, string> = {
  preparing: 'Je prépare la commande',
  fulfilled: 'Commande remise ou expédiée',
  cancelled: 'Annuler',
};

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

interface AddressShape {
  line1?: unknown;
  line2?: unknown;
  postalCode?: unknown;
  city?: unknown;
  country?: unknown;
}

/** Adresse lisible, sans faire confiance a la forme du JSON stocke. */
function formatAddress(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const address = value as AddressShape;
  const parts = [address.line1, address.line2, address.postalCode, address.city, address.country]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());
  return parts.length > 0 ? parts.join(', ') : null;
}

export default async function ShopOrdersPage() {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;

  const canView = workspace.capabilities.includes('commerce.view');
  const canManage = workspace.capabilities.includes('commerce.manage');

  const rows =
    canView && site
      ? unwrapList<{
          id: string;
          reference: string;
          status: string;
          total_cents: number;
          currency: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string | null;
          customer_note: string | null;
          fulfillment_method: string;
          shipping_address: unknown;
          created_at: string;
          paid_at: string | null;
          shop_order_items: Array<{
            id: string;
            name: string;
            quantity: number;
            total_cents: number;
          }> | null;
        }>(
          (await db
            .from('shop_orders')
            .select(
              'id, reference, status, total_cents, currency, customer_name, customer_email, customer_phone, customer_note, fulfillment_method, shipping_address, created_at, paid_at, shop_order_items ( id, name, quantity, total_cents )',
            )
            .eq('organization_id', workspace.organization.id)
            .eq('site_id', site.id)
            .order('created_at', { ascending: false })
            .limit(150)) as never,
        )
      : [];

  const orders: ShopOrderView[] = rows.map((row) => {
    const label = statusLabel(SHOP_ORDER_STATUS_LABELS, row.status);
    const transitions = canManage ? (SHOP_ORDER_TRANSITIONS[row.status] ?? []) : [];
    // La plateforme n'encaisse qu'en euros : la colonne existe pour l'avenir,
    // mais afficher une autre devise serait mentir sur ce qui a ete debite.
    const currency = 'EUR';

    return {
      id: row.id,
      reference: row.reference,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      customerPhone: row.customer_phone,
      customerNote: row.customer_note,
      totalLabel: formatMoney(row.total_cents, currency),
      fulfillmentLabel: FULFILLMENT_LABELS[row.fulfillment_method] ?? row.fulfillment_method,
      shippingLine: formatAddress(row.shipping_address),
      createdAtIso: row.created_at,
      createdAtLabel: DATE_TIME.format(new Date(row.created_at)),
      paidAtLabel: row.paid_at ? DATE.format(new Date(row.paid_at)) : null,
      statusLabel: label.label,
      statusHelp: label.help,
      statusTone: label.tone as StatusTone,
      items: (row.shop_order_items ?? []).map((item) => ({
        id: item.id,
        label: item.name,
        quantity: item.quantity,
        totalLabel: formatMoney(item.total_cents, currency),
      })),
      actions: transitions.flatMap((status) => {
        const text = TRANSITION_LABELS[status];
        return text ? [{ status, label: text }] : [];
      }),
    };
  });

  return (
    <ModulePage
      module="orders"
      feature="ecommerce"
      title="Mes commandes"
      description="Les commandes passées sur votre boutique. Le statut « payée » vient de Stripe : il n’est jamais déclaré depuis cet écran."
    >
      {canView ? (
        <OrderList orders={orders} />
      ) : (
        <PermissionDenied message="Votre rôle ne donne pas accès aux commandes de la boutique." />
      )}
    </ModulePage>
  );
}

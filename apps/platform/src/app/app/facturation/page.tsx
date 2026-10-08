import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, Icon, Panel, PermissionDenied, DescriptionList } from '@nemasus/ui';
import { PageHeader } from '~/components/app/page-header';
import { formatOrderAmount, formatOrderDate } from '~/lib/site-orders';
import { getWorkspace } from '~/lib/workspace';

export const metadata: Metadata = { title: 'Ma commande' };

const DOMAIN_LABELS: Record<string, string> = {
  customer_owned: 'Votre nom de domaine actuel, connecté à votre site',
  purchase: 'Un nom de domaine acheté pour vous, après accord',
  later: 'À choisir plus tard : adresse technique en attendant',
};

/**
 * La commande du client, telle qu'enregistrée par l'équipe à réception de son
 * virement. Lue par `site_order_for_organization`, réservée aux membres de
 * l'organisation : jamais les notes internes de l'équipe.
 */
export default async function OrderPage() {
  const { workspace, db } = await getWorkspace();

  if (!workspace.capabilities.includes('billing.view')) {
    return (
      <PermissionDenied message="Votre rôle ne donne pas accès à la commande de l’entreprise. Demandez à un propriétaire de votre organisation." />
    );
  }

  const { data } = await db.rpc('site_order_for_organization', {
    p_org: workspace.organization.id,
  });
  const order = (data ?? null) as {
    reference: string;
    paidAt: string | null;
    paidAmountCents: number | null;
    currency: string;
    createdAt: string;
    description: string | null;
    domainHandling: string;
    requestedDomain: string | null;
  } | null;

  return (
    <>
      <PageHeader
        title="Ma commande"
        description="Votre commande et son règlement par virement. Pour une facture, une question sur un paiement ou une nouvelle demande, écrivez-nous."
      />

      {order ? (
        <div className="space-y-6">
          <Panel level={2} padding="lg">
            <DescriptionList
              columns={2}
              items={[
                {
                  term: 'Référence',
                  description: <span className="font-mono">{order.reference}</span>,
                },
                { term: 'Commandée le', description: formatOrderDate(order.createdAt) },
                {
                  term: 'Règlement',
                  description: order.paidAt
                    ? `Virement reçu le ${formatOrderDate(order.paidAt)}${
                        order.paidAmountCents
                          ? ` (${formatOrderAmount(order.paidAmountCents, order.currency)})`
                          : ''
                      }`
                    : 'En attente',
                },
                {
                  term: 'Adresse du site',
                  description: `${DOMAIN_LABELS[order.domainHandling] ?? '—'}${
                    order.requestedDomain ? ` : ${order.requestedDomain}` : ''
                  }`,
                },
              ]}
            />
            {order.description ? (
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <p className="text-xs text-[var(--muted)]">
                  Votre projet, tel que décrit à la commande
                </p>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">
                  {order.description}
                </p>
              </div>
            ) : null}
          </Panel>

          <Panel level={1} padding="lg">
            <h2 className="text-sm font-medium">Une question ?</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
              Facture, justificatif de paiement, évolution de votre site : écrivez-nous en rappelant
              la référence <span className="font-mono">{order.reference}</span>.
            </p>
            <Link
              href="/app/support"
              className="mt-3 inline-block text-sm underline underline-offset-4"
            >
              Écrire à l’équipe
            </Link>
          </Panel>
        </div>
      ) : (
        <EmptyState
          icon={<Icon name="receipt" size={24} />}
          title="Aucune commande rattachée à cet espace"
          description="Si votre espace a été ouvert par l’équipe Nemasus sans commande en ligne, votre règlement a été convenu directement avec nous."
        />
      )}
    </>
  );
}
